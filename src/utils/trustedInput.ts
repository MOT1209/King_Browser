/**
 * Native input for agent actions.
 *
 * Agent clicks, keys and scrolls go through the webview's own input pipeline
 * (`sendInputEvent`, `insertText`) instead of DOM tricks such as `el.value =`
 * or `new KeyboardEvent()`. Pages cannot tell those native events from a
 * person's, so React inputs, contenteditable editors and the browser's own
 * Enter handling behave exactly as they do for the human. This is about
 * compatibility, not about hiding the agent: nothing here touches the
 * fingerprint or bot-detection signals.
 *
 * Dependency-free and pure (apart from building page script text), so the key
 * parsing and the locate script can be tested in plain Node.
 */

export type InputModifier = 'shift' | 'control' | 'alt' | 'meta';

export interface KeyCombo {
  /** Electron accelerator key name or a single character. */
  keyCode: string;
  modifiers: InputModifier[];
}

export interface KeyInputEvent {
  type: 'keyDown' | 'char' | 'keyUp';
  keyCode: string;
  modifiers: InputModifier[];
}

const NAMED_KEYS: Record<string, string> = {
  enter: 'Enter', return: 'Enter', tab: 'Tab', escape: 'Escape', esc: 'Escape',
  backspace: 'Backspace', delete: 'Delete', del: 'Delete', insert: 'Insert',
  space: 'Space', spacebar: 'Space',
  arrowup: 'Up', up: 'Up', arrowdown: 'Down', down: 'Down',
  arrowleft: 'Left', left: 'Left', arrowright: 'Right', right: 'Right',
  home: 'Home', end: 'End', pageup: 'PageUp', pagedown: 'PageDown', plus: 'Plus'
};

const MODIFIER_NAMES: Record<string, InputModifier> = {
  shift: 'shift', control: 'control', ctrl: 'control',
  alt: 'alt', option: 'alt', meta: 'meta', cmd: 'meta', command: 'meta', super: 'meta'
};

// Keys whose char event inserts text or makes the browser act (Enter's char is
// what triggers implicit form submission).
const CHAR_KEYS = new Set(['Enter', 'Space', 'Plus']);

function resolveKey(name: string): string | null {
  const named = NAMED_KEYS[name.toLowerCase()];
  if (named) return named;
  const fn = /^f([1-9]|1[0-9]|2[0-4])$/i.exec(name);
  if (fn) return `F${fn[1]}`;
  return Array.from(name).length === 1 ? name : null;
}

/**
 * Parses "Enter", "ArrowDown", "a", "Ctrl+Shift+K" or "Control++". Returns
 * null for anything it does not recognise, so a typo never becomes a
 * different key.
 */
export function parseKeyCombo(input: unknown): KeyCombo | null {
  if (typeof input !== 'string') return null;
  const value = input.trim();
  if (!value || value.length > 40) return null;

  let parts: string[];
  let keyName: string;
  if (value === '+' || value.endsWith('++')) {
    keyName = 'Plus';
    parts = value === '+' ? [] : value.slice(0, -2).split('+');
  } else {
    parts = value.split('+');
    keyName = parts.pop() ?? '';
  }
  if (!keyName) return null;

  const keyCode = resolveKey(keyName);
  if (!keyCode) return null;

  const modifiers: InputModifier[] = [];
  for (const part of parts) {
    const modifier = MODIFIER_NAMES[part.trim().toLowerCase()];
    if (!modifier) return null;
    if (!modifiers.includes(modifier)) modifiers.push(modifier);
  }
  return { keyCode, modifiers };
}

/** Cmd+A on macOS, Ctrl+A elsewhere. `platform` is navigator.platform. */
export function selectAllCombo(platform: string): KeyCombo {
  return { keyCode: 'a', modifiers: [/mac/i.test(platform) ? 'meta' : 'control'] };
}

/** keyDown, an optional char, keyUp - the order a real key press produces. */
export function keyEventSequence(combo: KeyCombo): KeyInputEvent[] {
  const { keyCode, modifiers } = combo;
  const shortcut = modifiers.includes('control') || modifiers.includes('meta') || modifiers.includes('alt');
  const typesChar = !shortcut && (CHAR_KEYS.has(keyCode) || Array.from(keyCode).length === 1);
  const events: KeyInputEvent[] = [{ type: 'keyDown', keyCode, modifiers }];
  if (typesChar) events.push({ type: 'char', keyCode, modifiers });
  events.push({ type: 'keyUp', keyCode, modifiers });
  return events;
}

/**
 * Wheel deltas for a scroll direction. Chromium scrolls down for a negative
 * deltaY. top/bottom are not wheel gestures and return null.
 */
export function wheelDelta(direction: string, amount: unknown): { deltaX: number; deltaY: number } | null {
  const clean = Math.min(10000, Math.max(0, Math.abs(Number(amount) || 500)));
  switch (direction) {
    case 'down': return { deltaX: 0, deltaY: -clean };
    case 'up': return { deltaX: 0, deltaY: clean };
    case 'right': return { deltaX: -clean, deltaY: 0 };
    case 'left': return { deltaX: clean, deltaY: 0 };
    default: return null;
  }
}

export interface ClickOptions { button: 'left' | 'right'; clickCount: 1 | 2 }
export interface MouseInputEvent { type: 'mouseMove' | 'mouseDown' | 'mouseUp'; x: number; y: number; button?: 'left' | 'right'; clickCount?: number }

/**
 * Validates browser_click's optional `button` and `doubleClick`. Anything else
 * is an error rather than a silent left click, so a typo cannot act differently
 * from what the agent asked for. A double right click is not offered.
 */
export function parseClickOptions(args: Record<string, unknown>): ClickOptions | { error: string } {
  const button = args.button === undefined || args.button === null ? 'left' : args.button;
  if (button !== 'left' && button !== 'right') return { error: "Invalid 'button': use \"left\" or \"right\"." };
  const dbl = args.doubleClick === undefined || args.doubleClick === null ? false : args.doubleClick;
  if (typeof dbl !== 'boolean') return { error: "Invalid 'doubleClick': use true or false." };
  if (dbl && button === 'right') return { error: 'A double right click is not supported.' };
  return { button, clickCount: dbl ? 2 : 1 };
}

/** Native mouse events for a click at a point: move, then one press/release pair per click, counted from 1. */
export function clickEventSequence(x: number, y: number, options: ClickOptions): MouseInputEvent[] {
  const events: MouseInputEvent[] = [{ type: 'mouseMove', x, y }];
  for (let count = 1; count <= options.clickCount; count++) {
    events.push({ type: 'mouseDown', x, y, button: options.button, clickCount: count });
    events.push({ type: 'mouseUp', x, y, button: options.button, clickCount: count });
  }
  return events;
}

export interface LocateResult {
  found: boolean;
  /** Centre in CSS pixels of the page viewport. */
  x?: number;
  y?: number;
  inView?: boolean;
  /** True when the element (or a child) is what a click at the centre reaches. */
  hit?: boolean;
  /** Short description of what covers the centre, when not hit. */
  covering?: string;
  error?: string;
}

/**
 * Page script that scrolls the element into view and hit-tests its centre.
 * A person can only click what is on top, so callers use `hit` to decide
 * between a native click and an error naming the cover.
 */
export function buildLocateScript(selector: string): string {
  return `
    (() => {
      try {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return { found: false };
        // A styled checkbox or radio is often hidden behind its label; a
        // person clicks the label, so aim there when the control has no size.
        let target = el;
        const own = el.getBoundingClientRect();
        if ((own.width === 0 || own.height === 0) && el.labels && el.labels.length) target = el.labels[0];
        if (typeof target.scrollIntoView === 'function') target.scrollIntoView({ block: 'center', inline: 'center' });
        const rect = target.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const inView = rect.width > 0 && rect.height > 0 && x >= 0 && y >= 0 && x < window.innerWidth && y < window.innerHeight;
        const top = inView && typeof document.elementFromPoint === 'function' ? document.elementFromPoint(x, y) : null;
        const label = top && typeof top.closest === 'function' ? top.closest('label') : null;
        const hit = !!top && (top === target || target.contains(top) || top === el || (!!label && label.control === el));
        let covering = '';
        if (top && !hit) {
          const id = top.id ? '#' + top.id : '';
          const cls = typeof top.className === 'string' && top.className.trim() ? '.' + top.className.trim().split(/\\s+/).slice(0, 2).join('.') : '';
          const text = (top.innerText || top.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 40);
          covering = top.tagName.toLowerCase() + id + cls + (text ? ' "' + text + '"' : '');
        }
        return { found: true, x, y, inView, hit, covering };
      } catch (err) {
        return { found: false, error: String(err) };
      }
    })()
  `;
}
