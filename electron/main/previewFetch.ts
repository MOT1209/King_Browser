/**
 * The main process fetching a page the renderer asked about (link preview,
 * reader fallback, view-source). This is an SSRF surface, so the rules live
 * here, dependency-injected and tested:
 *  - only http(s), no credentials, no local hostnames;
 *  - the host is resolved once, every answer must be public, and the request is
 *    pinned to the validated address so a DNS rebind cannot swap it afterwards;
 *  - the local MCP port is refused;
 *  - redirects are followed manually (at most three) and each hop is validated
 *    again, since a public host can redirect to an internal one;
 *  - the body has a hard byte limit even without Content-Length, and the HTML is
 *    sanitised and capped before it reaches the renderer.
 * The IPC handler and its isTrustedSender check stay in main.ts.
 */
import http from 'http';
import https from 'https';
import { isPrivateIP } from './ipAddress.js';

export const MAX_PREVIEW_HTML_BYTES = 5 * 1024 * 1024;
const MAX_SANITIZED_HTML_CHARS = 3 * 1024 * 1024;
const MAX_REDIRECTS = 3;

export interface PreviewValidationDeps {
  /** Resolves a hostname to all of its addresses (dns.lookup with { all: true }). */
  lookup: (hostname: string) => Promise<Array<{ address?: string }> | { address?: string }>;
  getMcpPort: () => number | string;
  dnsTimeoutMs?: number;
}

export interface ValidatedPreviewTarget { url: URL; pinnedIp: string }

export async function validatePreviewUrl(rawUrl: string, deps: PreviewValidationDeps): Promise<ValidatedPreviewTarget | { error: string }> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return { error: 'Only HTTP/HTTPS protocols are allowed for this operation.' };
    }
    if (parsedUrl.username || parsedUrl.password) {
      return { error: 'URLs with embedded credentials are not allowed.' };
    }
  } catch {
    return { error: 'Invalid URL format' };
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    return { error: 'Requests to local hostnames are blocked.' };
  }

  let pinnedIp = '';
  let dnsTimeoutTimer: NodeJS.Timeout | undefined;
  try {
    const lookupPromise = deps.lookup(hostname) as Promise<any>;
    lookupPromise.catch(() => {});
    const addresses = await Promise.race([
      lookupPromise,
      new Promise<never>((_, reject) => {
        dnsTimeoutTimer = setTimeout(() => reject(new Error('DNS lookup timeout')), deps.dnsTimeoutMs ?? 3000);
      })
    ]);
    const addrList = Array.isArray(addresses) ? addresses : [addresses];
    if (addrList.length === 0 || addrList.some((entry: any) => isPrivateIP(entry?.address))) {
      return { error: 'Requests to private/internal IP addresses are blocked.' };
    }
    pinnedIp = String(addrList[0]?.address || '');
    if (!pinnedIp) {
      return { error: 'DNS resolution returned empty address.' };
    }
  } catch {
    return { error: 'DNS resolution failed.' };
  } finally {
    if (dnsTimeoutTimer) clearTimeout(dnsTimeoutTimer);
  }

  const port = parsedUrl.port || (parsedUrl.protocol === 'https:' ? '443' : '80');
  const activeMcpPort = String(deps.getMcpPort() || 3020);
  if (port === '3020' || port === activeMcpPort) {
    return { error: 'Requests to MCP server port are blocked.' };
  }
  return { url: parsedUrl, pinnedIp };
}

// Read a response body with a hard byte limit even when the server omits
// Content-Length. This keeps the SSRF-protected preview endpoint bounded for
// chunked/streaming responses as well as normal buffered responses.
export async function readResponseTextWithLimit(response: any, maxBytes: number): Promise<string> {
  const body = response?.body;
  if (body && typeof body.on === 'function') {
    return await new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];
      let received = 0;
      let settled = false;
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        try { body.destroy?.(); } catch (_) {}
        reject(error);
      };
      body.on('data', (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        received += buffer.length;
        if (received > maxBytes) {
          fail(new Error(`Response body exceeds ${maxBytes} byte size limit`));
          return;
        }
        chunks.push(buffer);
      });
      body.on('end', () => {
        if (settled) return;
        settled = true;
        resolve(Buffer.concat(chunks).toString('utf8'));
      });
      body.on('error', (error: Error) => fail(error));
    });
  }

  if (body && typeof body.getReader === 'function') {
    const reader = body.getReader();
    const chunks: Buffer[] = [];
    let received = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const buffer = Buffer.from(value);
        received += buffer.length;
        if (received > maxBytes) {
          try { await reader.cancel(); } catch (_) {}
          throw new Error(`Response body exceeds ${maxBytes} byte size limit`);
        }
        chunks.push(buffer);
      }
      return Buffer.concat(chunks).toString('utf8');
    } finally {
      try { reader.releaseLock?.(); } catch (_) {}
    }
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > maxBytes) {
    throw new Error(`Response body exceeds ${maxBytes} byte size limit`);
  }
  return Buffer.from(arrayBuffer).toString('utf8');
}

export interface FetchPageHtmlDeps {
  validate: (url: string) => Promise<ValidatedPreviewTarget | { error: string }>;
  fetch: (url: string, init: any) => Promise<any>;
  userAgent: string;
  /** DOMPurify-style whole-document sanitiser. */
  sanitize: (rawHtml: string) => string;
}

export type FetchPageHtmlResult = { success: true; html: string } | { error: string };

export async function fetchPageHtml(url: unknown, deps: FetchPageHtmlDeps): Promise<FetchPageHtmlResult> {
  if (!url || typeof url !== 'string') return { error: 'Invalid URL' };

  let currentUrl = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    // Validate every hop. Redirects can cross from a public host to localhost,
    // a private IP, a mapped IPv4 address, or the local MCP port.
    const validated = await deps.validate(currentUrl);
    if ('error' in validated) return validated;
    const { url: parsedUrl, pinnedIp } = validated;
    currentUrl = parsedUrl.href;

    try {
      const isHttps = parsedUrl.protocol === 'https:';
      const agentOptions = {
        lookup: (_hostname: string, _opts: any, cb: any) => {
          cb(null, pinnedIp, pinnedIp.includes(':') ? 6 : 4);
        }
      };
      const agent = isHttps ? new https.Agent(agentOptions) : new http.Agent(agentOptions);

      const res = await deps.fetch(currentUrl, {
        headers: {
          'User-Agent': deps.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
        },
        agent,
        redirect: 'manual',
        signal: AbortSignal.timeout(5000)
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (!location) return { error: 'Redirect without Location header' };
        currentUrl = new URL(location, currentUrl).href;
        continue;
      }

      if (res.ok) {
        const contentLength = res.headers.get('content-length');
        if (contentLength && parseInt(contentLength, 10) > MAX_PREVIEW_HTML_BYTES) {
          return { error: 'Response body exceeds 5MB size limit' };
        }
        const rawHtml = await readResponseTextWithLimit(res, MAX_PREVIEW_HTML_BYTES);
        // Security: sanitise in the main process (AST-based DOMPurify), then cap
        // the output (this also bounds the ReaderMode outerHTML fallback path).
        let html = deps.sanitize(rawHtml);
        if (html.length > MAX_SANITIZED_HTML_CHARS) {
          console.warn(`[fetch-page-html] Sanitized HTML exceeds 3MB (${html.length} chars), truncating`);
          html = html.slice(0, MAX_SANITIZED_HTML_CHARS);
        }
        return { success: true, html };
      }
      return { error: 'HTTP ' + res.status };
    } catch (err: any) {
      return { error: err.message };
    }
  }

  return { error: 'Too many redirects' };
}
