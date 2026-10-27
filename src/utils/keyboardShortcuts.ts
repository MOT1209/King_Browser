export interface KeyEventLike {
  key: string;
  code?: string;
  shiftKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  isComposing?: boolean;
  nativeEvent?: { isComposing?: boolean };
}

export interface ShortcutBindingLike {
  key: string;
  shift?: boolean;
  meta?: boolean;
  alt?: boolean;
}

const PUNCTUATION_CODES: Record<string, string> = {
  Period: '.',
  Comma: ',',
  Slash: '/',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  Backslash: '\\',
};

/** The US-layout character of the physical key, when there is one. */
function keyFromCode(code: string | undefined): string | null {
  if (!code) return null;
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1].toLowerCase();
  const digit = /^Digit([0-9])$/.exec(code);
  if (digit) return digit[1];
  return PUNCTUATION_CODES[code] ?? null;
}

/**
 * The key a shortcut should see for this event. Two cases fall back to the
 * physical key: a non-Latin layout (Ctrl+T on an Arabic keyboard reports 'ف'),
 * and Shift turning punctuation into another character (Shift+. reports '>').
 * Latin layouts otherwise keep event.key, so AZERTY Ctrl+Z stays Z.
 */
export function shortcutKey(event: KeyEventLike): string {
  const key = event.key.toLowerCase();
  const fromCode = keyFromCode(event.code);
  if (!fromCode) return key;
  if (key.length === 1 && key.charCodeAt(0) > 0x7f) return fromCode;
  if (event.shiftKey && !/^[a-z0-9]$/.test(fromCode) && key.length === 1 && !/[a-z0-9]/.test(key)) return fromCode;
  return key;
}

/**
 * Evaluates whether a keyboard event matches a specific shortcut binding.
 * Honors platform modifier conventions:
 * - On macOS: primary modifier is Meta (Cmd).
 * - On Windows/Linux: primary modifier is Ctrl.
 * A binding without `alt` requires Alt to be up, so bindings saved before
 * Alt support keep matching exactly as before.
 */
export function matchesShortcut(
  binding: ShortcutBindingLike | undefined,
  event: KeyEventLike,
  isMac = true
): boolean {
  if (!binding) return false;

  // Guard against active IME composition (e.g. CJK, dead keys, accent sequences)
  if (event.isComposing || event.nativeEvent?.isComposing) return false;

  // On Windows/Linux, the AltGr key triggers both ctrlKey: true and altKey: true simultaneously.
  // Example: AltGr + Q (produces '@' on Turkish layout) or AltGr + 4 (produces '₺').
  // Never treat AltGr combinations as pure Ctrl shortcuts.
  if (!isMac && event.ctrlKey && event.altKey) {
    return false;
  }

  const key = shortcutKey(event);
  const shift = !!event.shiftKey;
  const meta = isMac ? !!event.metaKey : !!event.ctrlKey;
  const alt = !!event.altKey;

  return key === binding.key.toLowerCase() &&
         shift === !!binding.shift &&
         meta === !!binding.meta &&
         alt === !!binding.alt;
}

/**
 * Resolves an action identifier from a dictionary of shortcut bindings.
 */
export function resolveActionFromShortcuts<T extends string>(
  shortcuts: Partial<Record<T, ShortcutBindingLike>> | undefined,
  event: KeyEventLike,
  isMac = true
): T | null {
  if (!shortcuts) return null;
  for (const [action, binding] of Object.entries(shortcuts) as [T, ShortcutBindingLike][]) {
    if (matchesShortcut(binding, event, isMac)) {
      return action;
    }
  }
  return null;
}

const MODIFIER_KEYS = new Set(['control', 'shift', 'alt', 'meta', 'altgraph', 'os', 'capslock']);

/**
 * Turns a key press recorded in the shortcut editor into a binding.
 * Returns null while only modifiers are held, for AltGr chords, and for a
 * bare key without Ctrl/Cmd or Alt (that would fire while typing), except
 * function keys F1-F12.
 */
export function eventToBinding(event: KeyEventLike, isMac = true): ShortcutBindingLike | null {
  if (event.isComposing || event.nativeEvent?.isComposing) return null;
  const key = shortcutKey(event);
  if (!key || MODIFIER_KEYS.has(key)) return null;
  if (!isMac && event.ctrlKey && event.altKey) return null;

  const meta = isMac ? !!event.metaKey : !!event.ctrlKey;
  const alt = !!event.altKey;
  const isFunctionKey = /^f([1-9]|1[0-2])$/.test(key);
  if (!meta && !alt && !isFunctionKey) return null;

  return { key, shift: !!event.shiftKey, meta, alt };
}

const KEY_LABELS: Record<string, string> = {
  ' ': 'Space',
  arrowleft: 'Left',
  arrowright: 'Right',
  arrowup: 'Up',
  arrowdown: 'Down',
  escape: 'Esc',
  enter: 'Enter',
  tab: 'Tab',
  backspace: 'Backspace',
  delete: 'Delete',
};

/** Human label for a binding, using the platform's modifier names. */
export function formatBinding(binding: ShortcutBindingLike | undefined, isMac = true): string {
  if (!binding || !binding.key) return '';
  const parts: string[] = [];
  if (binding.meta) parts.push(isMac ? 'Cmd' : 'Ctrl');
  if (binding.alt) parts.push(isMac ? 'Option' : 'Alt');
  if (binding.shift) parts.push('Shift');
  const key = binding.key.toLowerCase();
  parts.push(KEY_LABELS[key] ?? (key.length === 1 ? key.toUpperCase() : key.charAt(0).toUpperCase() + key.slice(1)));
  return parts.join('+');
}

export function sameBinding(a: ShortcutBindingLike | undefined, b: ShortcutBindingLike | undefined): boolean {
  if (!a || !b) return false;
  return a.key.toLowerCase() === b.key.toLowerCase() &&
         !!a.shift === !!b.shift &&
         !!a.meta === !!b.meta &&
         !!a.alt === !!b.alt;
}

/**
 * Returns the first action other than `exceptAction` that already uses
 * `binding`, so the editor can refuse a duplicate instead of letting one
 * action silently shadow another.
 */
export function findConflict(
  shortcuts: Partial<Record<string, ShortcutBindingLike>> | undefined,
  binding: ShortcutBindingLike,
  exceptAction: string
): string | null {
  if (!shortcuts) return null;
  for (const [action, existing] of Object.entries(shortcuts)) {
    if (action !== exceptAction && sameBinding(existing, binding)) return action;
  }
  return null;
}
