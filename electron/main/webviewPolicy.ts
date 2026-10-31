/**
 * What a <webview> guest is allowed to attach with. These are the pure
 * decisions behind main.ts's will-attach-webview handler; the handler keeps
 * the side effects (hardening the session, choosing the preload, cancelling).
 *
 * The renderer is untrusted by main, so both the partition and the src are
 * validated here rather than trusted. Everything fails closed.
 */

const INCOGNITO_PARTITION = /^incognito-[a-zA-Z0-9_-]+$/;
const EXTENSION_ID = /^[a-zA-Z0-9_-]+$/;

/** Only the default, the agent profile and per-tab incognito partitions may be attached. */
export function isAllowedWebviewPartition(partition: string, agentPartition: string): boolean {
  return partition === '' || partition === agentPartition || INCOGNITO_PARTITION.test(partition);
}

export type WebviewSrcVerdict = { allowed: boolean; isWebstore: boolean };

/**
 * Only http(s), about:blank and an installed chrome-extension:// page may be
 * loaded, never with credentials in the URL. `isExtensionInstalled` is asked
 * about the host so that an extension-shaped id alone is not enough. A guest
 * on the Chrome Web Store origin (and only it) gets the webstore preload.
 */
export function evaluateWebviewSrc(src: string, isExtensionInstalled: (id: string) => boolean): WebviewSrcVerdict {
  const refused: WebviewSrcVerdict = { allowed: false, isWebstore: false };
  let parsed: URL;
  try {
    parsed = new URL(src);
  } catch {
    return refused;
  }
  if (parsed.username || parsed.password) return refused;

  const isHttp = parsed.protocol === 'http:' || parsed.protocol === 'https:';
  const isAboutBlank = parsed.protocol === 'about:' && (parsed.pathname === 'blank' || parsed.href === 'about:blank');
  const isExtension = parsed.protocol === 'chrome-extension:' && EXTENSION_ID.test(parsed.hostname) && isExtensionInstalled(parsed.hostname);
  if (!isHttp && !isAboutBlank && !isExtension) return refused;

  const isWebstore = parsed.protocol === 'https:' && (
    parsed.hostname === 'chromewebstore.google.com' ||
    (parsed.hostname === 'chrome.google.com' && parsed.pathname.startsWith('/webstore/'))
  );
  return { allowed: true, isWebstore };
}
