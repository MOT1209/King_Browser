import { app, type BrowserWindow, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

export function createTrustedSenderPolicy(getMainWindow: () => BrowserWindow | null) {
  // Safely send IPC to the main window; accessing .webContents on a destroyed window throws.
  function sendToMainWindow(channel: string, payload?: unknown) {
    const mainWindow = getMainWindow();
    try {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
    } catch (e) { /* window gone */ }
  }

  // Security: Validate that IPC messages originate strictly from our trusted main UI window and main frame
  function isTrustedSender(event: IpcMainInvokeEvent | IpcMainEvent): boolean {
    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    if (event.sender.id !== mainWindow.webContents.id) return false;
    // Electron supplies senderFrame for renderer IPC. Treat a missing frame as
    // untrusted instead of accepting an ambiguous sender context.
    if (!event.senderFrame || !mainWindow.webContents.mainFrame || event.senderFrame !== mainWindow.webContents.mainFrame) {
      return false;
    }
    const frameUrl = event.senderFrame.url;
    if (!frameUrl || !isTrustedAppOrigin(frameUrl)) {
      return false;
    }
    return true;
  }

  // Security: Validate dev server and app internal page origins strictly
  function isTrustedAppOrigin(urlStr: string): boolean {
    if (!urlStr || typeof urlStr !== 'string') return false;
    try {
      const parsed = new URL(urlStr);
      // Internal tab URLs are rendered by the trusted React shell, not loaded by
      // the privileged main window. Never treat arbitrary king:/devtools: URLs as
      // an app origin; doing so would let a crafted URL inherit app privileges.
      if (parsed.protocol === 'king:') {
        const allowedHost = ['newtab', 'settings', 'history', 'downloads', 'changelog', 'whats-new'].includes(parsed.hostname);
        const allowedSettingsHash = parsed.hostname === 'settings' &&
          (!parsed.hash || ['#extensions', '#mcp'].includes(parsed.hash));
        return allowedHost && !parsed.pathname && !parsed.search &&
          !parsed.username && !parsed.password &&
          (parsed.hostname !== 'settings' ? !parsed.hash : allowedSettingsHash);
      }
      if (parsed.protocol === 'devtools:') return false;
      // Security: The Vite dev server is only trusted in unpackaged dev builds.
      if (!app.isPackaged && parsed.origin === 'http://localhost:5173') return true;
      if (parsed.protocol === 'file:') {
        const allowedPath = path.resolve(path.join(__dirname, '../dist/index.html'));
        try {
          const navPath = fileURLToPath(urlStr);
          const resolvedNav = path.resolve(navPath);
          return process.platform === 'win32'
            ? resolvedNav.toLowerCase() === allowedPath.toLowerCase()
            : resolvedNav === allowedPath;
        } catch {
          return false;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  return { sendToMainWindow, isTrustedSender, isTrustedAppOrigin };
}
