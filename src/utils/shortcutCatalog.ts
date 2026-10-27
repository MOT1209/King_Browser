/**
 * The customizable keyboard shortcuts: which actions exist, how they are
 * grouped in Settings > Shortcuts, and their default bindings per platform.
 *
 * Labels live in the locale files under `shortcuts.actions.<id>` and
 * `shortcuts.groups.<group>`. Fixed secondary keys (F5, F12, Alt+Left/Right,
 * Ctrl+1..9) stay hardcoded in App.tsx and are listed in `FIXED_SHORTCUTS`
 * so the settings page can show them read-only.
 */
import type { ShortcutBindingLike } from './keyboardShortcuts';

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
 * Keys that always work in addition to the configurable ones. `mod` marks
 * entries that need the primary modifier (Cmd on macOS, Ctrl elsewhere).
 */
export const FIXED_SHORTCUTS: Array<{ id: string; keys: string; mod?: boolean }> = [
  { id: 'reload', keys: 'F5' },
  { id: 'zoomIn', keys: '+', mod: true },
  { id: 'devtools', keys: 'F12' },
  { id: 'toggleSidebar', keys: 'B', mod: true },
  { id: 'goBack', keys: 'Alt+Left' },
  { id: 'goForward', keys: 'Alt+Right' },
  { id: 'switchTab', keys: '1-9', mod: true },
  { id: 'help', keys: 'F1' },
  { id: 'shortcutsHelp', keys: '/', mod: true },
];
