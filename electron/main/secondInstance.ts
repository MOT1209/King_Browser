/**
 * What a second launch does to the running King Browser.
 *
 * The single-instance lock makes every new launch (Start menu, shortcut,
 * taskbar, a link opened from another app) quit at once and hand its command
 * line to the process that already runs. That process must then show the user
 * a window. Focusing an existing window is not enough: when the window was
 * closed but the process stayed alive, a focus-only handler swallowed every
 * later launch and the app appeared impossible to open.
 *
 * Exported separately from main.ts because main.ts boots Electron on import and
 * therefore cannot be exercised by the test suite.
 */

export type SecondInstanceAction = 'focus' | 'restore-focus' | 'create' | 'ignore';

export interface SecondInstanceState {
  /** A main window exists and is not destroyed. */
  hasLiveWindow: boolean;
  isMinimized: boolean;
  /** app.isReady(): before that, startup creates the window itself. */
  appReady: boolean;
  /** The app is shutting down; a window must not be resurrected. */
  quitting: boolean;
}

export function decideSecondInstance(state: SecondInstanceState): SecondInstanceAction {
  if (state.hasLiveWindow) return state.isMinimized ? 'restore-focus' : 'focus';
  if (!state.appReady || state.quitting) return 'ignore';
  return 'create';
}
