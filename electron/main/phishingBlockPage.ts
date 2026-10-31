/**
 * What a webview shows when a navigation or redirect is stopped because the
 * destination matches the phishing list.
 *
 * The blocked URL is attacker controlled and is spliced into source that
 * webContents.executeJavaScript runs, so it is only ever embedded as a JSON
 * string literal (never concatenated into code) and is truncated first. Both
 * will-navigate and will-redirect use this single builder so the two paths
 * cannot drift apart.
 */
const MAX_DISPLAYED_URL_LENGTH = 500;

export function buildPhishingBlockScript(blockedUrl: string): string {
  const safeUrlJson = JSON.stringify(String(blockedUrl).substring(0, MAX_DISPLAYED_URL_LENGTH));
  return `
    (() => {
      document.title = 'Dangerous Site Blocked';
      document.body.style.cssText = 'font-family:system-ui,-apple-system,sans-serif;text-align:center;padding:50px;color:#ef4444;background:#fef2f2;height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;margin:0;box-sizing:border-box;';
      const h1 = document.createElement('h1');
      h1.textContent = 'Dangerous Site Blocked';
      h1.style.cssText = 'font-size:24px;font-weight:700;margin-bottom:12px;color:#b91c1c;';
      const p = document.createElement('p');
      p.textContent = 'This site (' + ${safeUrlJson} + ') has been identified as containing phishing or malicious software and was blocked for your safety.';
      p.style.cssText = 'font-size:14px;color:#7f1d1d;max-width:600px;word-break:break-all;line-height:1.5;';
      document.body.appendChild(h1);
      document.body.appendChild(p);
    })()
  `;
}
