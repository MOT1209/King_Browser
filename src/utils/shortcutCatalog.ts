/**
 * The customizable keyboard shortcuts: which actions exist, how they are
 * grouped in Settings > Shortcuts, and their default bindings per platform.
 *
 * Labels live in the locale files under `shortcuts.actions.<id>` and
 * `shortcuts.groups.<group>`. Fixed secondary keys (F5, F12, Alt+Left/Right,
 * Ctrl+1..9) stay hardcoded in App.tsx and are listed in `FIXED_SHORTCUTS`
 * so the settings page can show them read-only.
 */
import { sameBinding, type ShortcutBindingLike } from './keyboardShortcuts';

export type ShortcutGroup = 'tabs' | 'navigation' | 'page' | 'panels' | 'agent';

export interface ShortcutAction {
  id: string;
  group: ShortcutGroup;
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = ['tabs', 'navigation', 'page', 'panels', 'agent'];

export const SHORTCUT_ACTIONS: ShortcutAction[] = [
  { id: 'newTab', group: 'tabs' },
  { id: 'closeTab', group: 'tabs' },
  { id: 'reopenTab', group: 'tabs' },
  { id: 'newIncognito', group: 'tabs' },
  { id: 'nextTab', group: 'tabs' },
  { id: 'prevTab', group: 'tabs' },
  { id: 'omnibox', group: 'navigation' },
  { id: 'focusAddress', group: 'navigation' },
  { id: 'goBack', group: 'navigation' },
  { id: 'goForward', group: 'navigation' },
  { id: 'reload', group: 'navigation' },
  { id: 'bookmark', group: 'navigation' },
  { id: 'history', group: 'navigation' },
  { id: 'downloads', group: 'navigation' },
  { id: 'findInPage', group: 'page' },
  { id: 'zoomIn', group: 'page' },
  { id: 'zoomOut', group: 'page' },
  { id: 'resetZoom', group: 'page' },
  { id: 'print', group: 'page' },
  { id: 'screenshot', group: 'page' },
  { id: 'devtools', group: 'page' },
  { id: 'toggleSidebar', group: 'panels' },
  { id: 'toggleAiPanel', group: 'panels' },
  { id: 'toggleAgentPanel', group: 'agent' },
  { id: 'toggleAgentPill', group: 'agent' },
  { id: 'agentStopNow', group: 'agent' },
];

export function buildDefaultShortcuts(isMac: boolean): Record<string, Required<ShortcutBindingLike>> {
  const b = (key: string, opts: { shift?: boolean; meta?: boolean; alt?: boolean } = {}) => ({
    key,
    shift: !!opts.shift,
    meta: opts.meta ?? true,
    alt: !!opts.alt,
  });
  return {
    newTab: b('t'),
    closeTab: b('w'),
    reopenTab: b('t', { shift: true }),
    newIncognito: b('n', { shift: true }),
    // Cmd+Tab is the macOS app switcher, so macOS uses Cmd+Option+arrows
    // (Ctrl+Tab keeps working there as a fixed key).
    nextTab: isMac ? b('arrowright', { alt: true }) : b('tab'),
    prevTab: isMac ? b('arrowleft', { alt: true }) : b('tab', { shift: true }),
    omnibox: b('k'),
    focusAddress: b('l'),
    goBack: b('['),
    goForward: b(']'),
    reload: b('r'),
    bookmark: b('d'),
    history: b(isMac ? 'y' : 'h'),
    downloads: b('j', { shift: isMac }),
    findInPage: b('f'),
    zoomIn: b('='),
    zoomOut: b('-'),
    resetZoom: b('0'),
    print: b('p'),
    screenshot: b('s', { shift: true }),
    devtools: isMac ? b('i', { alt: true }) : b('i', { shift: true }),
    toggleSidebar: b('s'),
    toggleAiPanel: b('i'),
    toggleAgentPanel: b('.', { shift: true }),
    toggleAgentPill: b('m', { shift: true }),
    // Not Ctrl+Shift+Esc: Windows reserves it for Task Manager.
    agentStopNow: b('x', { shift: true }),
  };
}

/**
 * Keys that always work in addition to the configurable ones, as separate key
 * labels. `mod` prefixes the primary modifier (Cmd on macOS, Ctrl elsewhere).
 * Shown read-only in Settings > Shortcuts and in the F1 help.
 */
export const FIXED_SHORTCUTS: Array<{ id: string; keys: string[]; mod?: boolean }> = [
  { id: 'newWindow', keys: ['N'], mod: true },
  { id: 'reload', keys: ['F5'] },
  { id: 'forceReload', keys: ['Shift', 'R'], mod: true },
  { id: 'zoomIn', keys: ['+'], mod: true },
  { id: 'devtools', keys: ['F12'] },
  { id: 'toggleSidebar', keys: ['B'], mod: true },
  { id: 'goBack', keys: ['Alt', 'Left'] },
  { id: 'goForward', keys: ['Alt', 'Right'] },
  { id: 'switchTab', keys: ['1-9'], mod: true },
  { id: 'settings', keys: [','], mod: true },
  { id: 'help', keys: ['F1'] },
  { id: 'shortcutsHelp', keys: ['/'], mod: true },
];

export function fixedShortcutParts(entry: { keys: string[]; mod?: boolean }, isMac: boolean): string[] {
  return entry.mod ? [isMac ? 'Cmd' : 'Ctrl', ...entry.keys] : entry.keys;
}

/**
 * The configurable bindings the user changed from their defaults. Sent to the
 * main process so the application menu follows them; unchanged actions keep
 * the menu's own defaults.
 */
export function customizedBindings(
  shortcuts: Partial<Record<string, ShortcutBindingLike>> | undefined,
  isMac: boolean
): Record<string, Required<ShortcutBindingLike>> {
  const defaults = buildDefaultShortcuts(isMac);
  const result: Record<string, Required<ShortcutBindingLike>> = {};
  if (!shortcuts) return result;
  for (const { id } of SHORTCUT_ACTIONS) {
    const binding = shortcuts[id];
    if (binding && !sameBinding(binding, defaults[id])) {
      result[id] = { key: binding.key.toLowerCase(), shift: !!binding.shift, meta: !!binding.meta, alt: !!binding.alt };
    }
  }
  return result;
}

/**
 * Combinations a custom binding may not take: editing keys every page relies
 * on, and the fixed browser keys above. Returns the id of the owner, or null.
 */
export function reservedOwner(binding: ShortcutBindingLike, isMac: boolean): string | null {
  const key = binding.key.toLowerCase();
  const plain = !binding.alt;
  const mod = !!binding.meta;
  if (mod && plain && !binding.shift) {
    const editing: Record<string, string> = { c: 'copy', v: 'paste', x: 'cut', a: 'selectAll', z: 'undo', n: 'newWindow', ',': 'settings', '/': 'shortcutsHelp', '+': 'zoomIn' };
    if (editing[key]) return editing[key];
    if (/^[1-9]$/.test(key)) return 'switchTab';
    if (key === 'q' && isMac) return 'quit';
  }
  if (mod && plain && binding.shift && key === 'z') return 'redo';
  if (mod && plain && binding.shift && key === 'r') return 'forceReload';
  if (!mod && !binding.shift && !binding.alt && (key === 'f1' || key === 'f5' || key === 'f12')) {
    return key === 'f1' ? 'help' : key === 'f5' ? 'reload' : 'devtools';
  }
  if (!mod && binding.alt && !binding.shift && (key === 'arrowleft' || key === 'arrowright')) {
    return key === 'arrowleft' ? 'goBack' : 'goForward';
  }
  return null;
}
