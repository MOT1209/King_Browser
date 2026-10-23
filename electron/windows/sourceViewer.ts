import { BrowserWindow } from 'electron';
import { Agent as HttpAgent } from 'http';
import { Agent as HttpsAgent } from 'https';

export interface SourceViewerDependencies {
  getMainWindow: () => BrowserWindow | null;
  validatePreviewUrl: (url: string) => Promise<{ error: string } | { url: URL; pinnedIp: string }>;
  fetch: typeof globalThis.fetch;
  getStandardUserAgent: () => string;
  readResponseTextWithLimit: (response: any, maxBytes: number) => Promise<string>;
}

export async function openPageSourceViewer(
  currentUrl: string,
  wc: any,
  dependencies: SourceViewerDependencies
): Promise<BrowserWindow | null> {
  if (!currentUrl || typeof currentUrl !== 'string') return null;

  let isInternalPage = false;
  let isViewSource = false;
  try {
    const parsed = new URL(currentUrl);
    isInternalPage = parsed.protocol.startsWith('king');
    isViewSource = parsed.protocol === 'view-source:';
  } catch {
    isInternalPage = currentUrl.toLowerCase().startsWith('king');
    isViewSource = currentUrl.toLowerCase().startsWith('view-source:');
  }
  if (isInternalPage || isViewSource) return null;

  let htmlSource = '';
  if (wc && !wc.isDestroyed() && typeof wc.executeJavaScript === 'function') {
    try {
      htmlSource = await wc.executeJavaScript('document.documentElement.outerHTML');
    } catch {}
  }

  if (!htmlSource && (currentUrl.startsWith('http://') || currentUrl.startsWith('https://'))) {
    try {
      const validated = await dependencies.validatePreviewUrl(currentUrl);
      if (!('error' in validated)) {
        const { url, pinnedIp } = validated;
        const agentOptions = {
          lookup: (_hostname: string, _opts: any, callback: any) => {
            callback(null, pinnedIp, pinnedIp.includes(':') ? 6 : 4);
          }
        };
        const agent = url.protocol === 'https:'
          ? new HttpsAgent(agentOptions)
          : new HttpAgent(agentOptions);
        const response = await dependencies.fetch(currentUrl, {
          agent,
          signal: AbortSignal.timeout(8000),
          headers: { 'User-Agent': dependencies.getStandardUserAgent() }
        } as any);
        htmlSource = await dependencies.readResponseTextWithLimit(response, 8 * 1024 * 1024);
      }
    } catch {}
  }

  const mainWindow = dependencies.getMainWindow();
  const sourceWindow = new BrowserWindow({
    title: `Source: ${currentUrl}`,
    width: 1000,
    height: 700,
    parent: mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    }
  });

  sourceWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  sourceWindow.webContents.on('will-navigate', (navigationEvent) => navigationEvent.preventDefault());

  try {
    if (!sourceWindow.isDestroyed()) {
      await sourceWindow.loadURL('about:blank');
      if (!sourceWindow.isDestroyed()) {
        await sourceWindow.webContents.executeJavaScript(`
          document.title = ${JSON.stringify(`Source: ${currentUrl}`)};
          document.body.style.cssText = 'margin:0;padding:16px;background:#0f172a;color:#e2e8f0;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:13px;line-height:1.5;overflow-x:auto;';
          const pre = document.createElement('pre');
          pre.style.cssText = 'margin:0;white-space:pre-wrap;word-break:break-all;';
          pre.textContent = ${JSON.stringify(htmlSource || '<!-- No source available -->')};
          document.body.appendChild(pre);
        `);
      }
    }
  } catch {}

  return sourceWindow;
}
