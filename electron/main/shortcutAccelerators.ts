/**
 * Menu accelerators that follow Settings > Shortcuts.
 *
 * The application menu used fixed accelerators, so a rebound action still
 * fired on its old keys from the menu (which also handles keys while a web
 * page has focus). The renderer now reports the bindings the user changed;
 * this module validates them and turns them into Electron accelerators.
 *
 * Fail closed: anything malformed, unknown, or colliding with a menu key that
 * is not configurable falls back to the default accelerator for that item.
 * Dependency-free so it can be unit-tested in plain Node.
 */

export interface ShortcutBinding {
  key: string;
  shift: boolean;
  meta: boolean;
  alt: boolean;
}

/** Configurable menu items and their default accelerators. */
export const DEFAULT_MENU_ACCELERATORS: Record<string, string> = {
  newTab: 'CmdOrCtrl+T',
  newIncognito: 'Shift+CmdOrCtrl+N',
  focusAddress: 'CmdOrCtrl+L',
  closeTab: 'CmdOrCtrl+W',
  reopenTab: 'Shift+CmdOrCtrl+T',
  print: 'CmdOrCtrl+P',
  findInPage: 'CmdOrCtrl+F',
  reload: 'CmdOrCtrl+R',
  resetZoom: 'CmdOrCtrl+0',
  zoomIn: 'CmdOrCtrl+Plus',
  zoomOut: 'CmdOrCtrl+-',
  goBack: 'CmdOrCtrl+[',
  goForward: 'CmdOrCtrl+]',
  history: 'CmdOrCtrl+Y',
  downloads: 'Shift+CmdOrCtrl+J',
  bookmark: 'CmdOrCtrl+D',
};

/** Menu accelerators that are not configurable; a custom binding may not take them. */
export const RESERVED_MENU_ACCELERATORS: readonly string[] = [
  'CmdOrCtrl+,',
  'CmdOrCtrl+N',
  'Shift+CmdOrCtrl+R',
  'Shift+CmdOrCtrl+B',
  'F1',
  'CmdOrCtrl+/',
  'CmdOrCtrl+C',
  'CmdOrCtrl+V',
  'CmdOrCtrl+X',
  'CmdOrCtrl+A',
  'CmdOrCtrl+Z',
  'Shift+CmdOrCtrl+Z',
  'CmdOrCtrl+Q',
];

const NAMED_KEYS: Record<string, string> = {
  tab: 'Tab',
  escape: 'Esc',
  enter: 'Enter',
  backspace: 'Backspace',
  delete: 'Delete',
  ' ': 'Space',
  arrowleft: 'Left',
  arrowright: 'Right',
  arrowup: 'Up',
  arrowdown: 'Down',
  '+': 'Plus',
};

const KEY_PATTERN = /^(?:[a-z0-9]|f(?:[1-9]|1[0-2])|[,./;'`\\[\]\-=+ ]|tab|escape|enter|backspace|delete|arrowleft|arrowright|arrowup|arrowdown)$/;

function sanitizeBinding(raw: unknown): ShortcutBinding | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.key !== 'string') return null;
  const key = value.key.toLowerCase();
  if (!KEY_PATTERN.test(key)) return null;
  return { key, shift: value.shift === true, meta: value.meta === true, alt: value.alt === true };
}

/** Keeps only valid bindings for configurable menu items. */
export function sanitizeMenuBindings(raw: unknown): Record<string, ShortcutBinding> {
  const result: Record<string, ShortcutBinding> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;
  for (const id of Object.keys(DEFAULT_MENU_ACCELERATORS)) {
    const binding = sanitizeBinding((raw as Record<string, unknown>)[id]);
    if (binding) result[id] = binding;
  }
  return result;
}

/** Electron accelerator for a binding, or null when it is not a safe shortcut. */
export function bindingToAccelerator(binding: ShortcutBinding): string | null {
  const isFunctionKey = /^f([1-9]|1[0-2])$/.test(binding.key);
  if (!binding.meta && !binding.alt && !isFunctionKey) return null;
  const parts: string[] = [];
  if (binding.shift) parts.push('Shift');
  if (binding.alt) parts.push('Alt');
  if (binding.meta) parts.push('CmdOrCtrl');
  parts.push(NAMED_KEYS[binding.key] ?? binding.key.toUpperCase());
  return parts.join('+');
}

/**
 * The accelerator for each configurable menu item: the user's binding when it
 * is valid and free, otherwise its default if still free, otherwise none (an
 * empty string). Two menu items never share an accelerator.
 */
export function resolveMenuAccelerators(customBindings: Record<string, ShortcutBinding>): Record<string, string> {
  const resolved: Record<string, string> = { ...DEFAULT_MENU_ACCELERATORS };
  const taken = new Set<string>(RESERVED_MENU_ACCELERATORS);
  const customIds = Object.keys(customBindings).filter(id => id in DEFAULT_MENU_ACCELERATORS);
  // Defaults of items the user did not change keep their keys.
  for (const id of Object.keys(DEFAULT_MENU_ACCELERATORS)) {
    if (!customIds.includes(id)) taken.add(DEFAULT_MENU_ACCELERATORS[id]);
  }
  for (const id of customIds) {
    const accelerator = bindingToAccelerator(customBindings[id]);
    if (accelerator && !taken.has(accelerator)) {
      resolved[id] = accelerator;
      taken.add(accelerator);
    } else {
      // Invalid or taken: keep the default if it is still free, else no key.
      const fallback = DEFAULT_MENU_ACCELERATORS[id];
      resolved[id] = taken.has(fallback) ? '' : fallback;
      if (resolved[id]) taken.add(resolved[id]);
    }
  }
  return resolved;
}
