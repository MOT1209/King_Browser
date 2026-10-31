import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  MAX_PREVIEW_HTML_BYTES,
  validatePreviewUrl,
  readResponseTextWithLimit,
  fetchPageHtml,
  type PreviewValidationDeps
} from '../electron/main/previewFetch';

/**
 * The link-preview / source-viewer fetch is the main process requesting URLs the
 * renderer chose, so it is an SSRF surface. Its validation and body limits lived
 * in main.ts with no test. Prevents: requests to loopback, private, link-local
 * or mapped addresses (including via DNS answers and redirects), to the local
 * MCP port, to credential-bearing or non-web URLs, unbounded response bodies,
 * and unsanitised HTML reaching the renderer.
 */

console.log('\n--- Preview fetch (SSRF validation, body limit, redirects) ---');

function deps(answers: Record<string, string[] | Error>, mcpPort: number | string = 3020, dnsTimeoutMs = 3000): PreviewValidationDeps & { lookups: string[] } {
  const lookups: string[] = [];
  return {
    lookups,
    dnsTimeoutMs,
    getMcpPort: () => mcpPort,
    lookup: async (host: string) => {
      lookups.push(host);
      const answer = answers[host];
      if (answer instanceof Error) throw answer;
      if (!answer) throw new Error('ENOTFOUND');
      return answer.map((address) => ({ address }));
    }
  };
}

async function blocked(url: string, d: PreviewValidationDeps, why: RegExp) {
  const out = await validatePreviewUrl(url, d);
  assert.ok('error' in out, `${url} must be refused`);
  assert.match((out as { error: string }).error, why, `${url}: ${(out as { error: string }).error}`);
}

async function run() {
  // Scheme, credentials, syntax: refused before any DNS lookup.
  const none = deps({});
  await blocked('file:///etc/passwd', none, /HTTP\/HTTPS/);
  await blocked('ftp://example.com/', none, /HTTP\/HTTPS/);
  await blocked('javascript:alert(1)', none, /HTTP\/HTTPS/);
  await blocked('https://user:pw@example.com/', none, /credentials/);
  await blocked('https://user@example.com/', none, /credentials/);
  await blocked('not a url', none, /Invalid URL/);
  await blocked('', none, /Invalid URL/);
  await blocked('http://localhost/', none, /local hostnames/);
  await blocked('http://app.localhost:8080/', none, /local hostnames/);
  await blocked('http://printer.local/', none, /local hostnames/);
  await blocked('http://LOCALHOST/', none, /local hostnames/);
  assert.equal(none.lookups.length, 0, 'none of these reach DNS');

  // Private and special addresses, whether written as a literal or returned by DNS.
  const privateAnswers: Record<string, string[]> = {
    '127.0.0.1': ['127.0.0.1'], '10.1.2.3': ['10.1.2.3'], '192.168.0.1': ['192.168.0.1'], '172.16.5.5': ['172.16.5.5'],
    '169.254.169.254': ['169.254.169.254'], '0.0.0.0': ['0.0.0.0'],
    'rebind.example': ['93.184.216.34', '10.0.0.8'],
    'v6.example': ['::1'], 'mapped.example': ['::ffff:127.0.0.1'], 'ula.example': ['fd00::1'], 'll.example': ['fe80::1']
  };
  const priv = deps(privateAnswers);
  for (const host of Object.keys(privateAnswers)) {
    await blocked(`http://${host}/`, priv, /private\/internal/);
  }
  await blocked('http://empty.example/', deps({ 'empty.example': [] }), /private\/internal/);
  await blocked('http://down.example/', deps({ 'down.example': new Error('SERVFAIL') }), /DNS resolution failed/);
  await blocked('http://nxdomain.example/', deps({}), /DNS resolution failed/);

  // A DNS lookup that never answers is cut off.
  const slow: PreviewValidationDeps = { lookup: () => new Promise(() => {}), getMcpPort: () => 3020, dnsTimeoutMs: 30 };
  await blocked('http://slow.example/', slow, /DNS resolution failed/);

  // Public hosts pass and the first answer is pinned.
  const pub = deps({ 'example.com': ['93.184.216.34', '93.184.216.35'] });
  const okOut = await validatePreviewUrl('https://example.com/path?q=1', pub);
  assert.ok(!('error' in okOut));
  assert.equal((okOut as any).pinnedIp, '93.184.216.34');
  assert.equal((okOut as any).url.href, 'https://example.com/path?q=1');

  // The local MCP server port is refused on any public-looking host.
  await blocked('http://example.com:3020/', deps({ 'example.com': ['93.184.216.34'] }), /MCP server port/);
  await blocked('https://example.com:4321/', deps({ 'example.com': ['93.184.216.34'] }, 4321), /MCP server port/);
  await blocked('http://example.com:4321/', deps({ 'example.com': ['93.184.216.34'] }, '4321'), /MCP server port/);
  assert.ok(!('error' in await validatePreviewUrl('http://example.com:8080/', deps({ 'example.com': ['93.184.216.34'] }, 4321))), 'other ports are fine');

  // Body limits.
  const small = new EventEmitter() as any;
  const smallRead = readResponseTextWithLimit({ body: small }, 20);
  small.emit('data', Buffer.from('hello '));
  small.emit('data', 'world');
  small.emit('end');
  assert.equal(await smallRead, 'hello world', 'node streams are joined');

  const huge = Object.assign(new EventEmitter(), { destroyed: false, destroy() { this.destroyed = true; } }) as any;
  const hugeRead = readResponseTextWithLimit({ body: huge }, 10);
  huge.emit('data', Buffer.alloc(11, 1));
  await assert.rejects(hugeRead, /exceeds 10 byte/);
  assert.equal(huge.destroyed, true, 'the connection is torn down once the limit is crossed');

  const chunks = [new Uint8Array(6).fill(97), new Uint8Array(6).fill(98)];
  let cancelled = false;
  const web = { body: { getReader: () => ({ read: async () => (chunks.length ? { done: false, value: chunks.shift() } : { done: true }), cancel: async () => { cancelled = true; }, releaseLock() {} }) } };
  await assert.rejects(readResponseTextWithLimit(web, 10), /exceeds 10 byte/);
  assert.equal(cancelled, true, 'web streams are cancelled at the limit');
  assert.equal(await readResponseTextWithLimit({ body: { getReader: () => { const c = [new Uint8Array([104, 105])]; return { read: async () => (c.length ? { done: false, value: c.shift() } : { done: true }), cancel: async () => {}, releaseLock() {} }; } } }, 10), 'hi');

  assert.equal(await readResponseTextWithLimit({ arrayBuffer: async () => new TextEncoder().encode('buffered').buffer }, 100), 'buffered');
  await assert.rejects(readResponseTextWithLimit({ arrayBuffer: async () => new ArrayBuffer(50) }, 10), /exceeds 10 byte/);

  // fetchPageHtml: every hop is validated, redirects are bounded, output is sanitised and capped.
  const respond = (init: { status?: number; ok?: boolean; headers?: Record<string, string>; text?: string }) => ({
    status: init.status ?? 200,
    ok: init.ok ?? ((init.status ?? 200) < 300),
    headers: { get: (name: string) => init.headers?.[name.toLowerCase()] ?? null },
    arrayBuffer: async () => new TextEncoder().encode(init.text ?? '').buffer
  });
  const validated: string[] = [];
  const makeDeps = (script: Array<ReturnType<typeof respond>>, blockHost?: string) => {
    const calls: Array<{ url: string; agent: any; redirect: string }> = [];
    return {
      calls,
      d: {
        userAgent: 'test-agent',
        validate: async (u: string) => {
          validated.push(u);
          if (blockHost && new URL(u).hostname === blockHost) return { error: 'Requests to private/internal IP addresses are blocked.' };
          return { url: new URL(u), pinnedIp: '93.184.216.34' };
        },
        fetch: async (u: string, init: any) => { calls.push({ url: u, agent: init.agent, redirect: init.redirect }); return script.shift()!; },
        sanitize: (html: string) => html.replace(/<script[\s\S]*?<\/script>/gi, '')
      }
    };
  };

  const good = makeDeps([respond({ text: '<p>hi</p><script>evil()</script>' })]);
  assert.deepEqual(await fetchPageHtml('https://example.com/', good.d), { success: true, html: '<p>hi</p>' }, 'output is sanitised');
  assert.equal(good.calls[0].redirect, 'manual', 'redirects are never followed by fetch itself');
  assert.equal(await new Promise((resolve) => good.calls[0].agent.options.lookup('example.com', {}, (_e: unknown, ip: string) => resolve(ip))), '93.184.216.34', 'the connection is pinned to the validated IP');

  const hop = makeDeps([respond({ status: 302, headers: { location: 'http://internal.example/admin' } })], 'internal.example');
  assert.deepEqual(await fetchPageHtml('https://example.com/', hop.d), { error: 'Requests to private/internal IP addresses are blocked.' }, 'a redirect to an internal host is refused');
  assert.equal(hop.calls.length, 1, 'the internal host is never requested');

  const relative = makeDeps([respond({ status: 301, headers: { location: '/moved' } }), respond({ text: 'final' })]);
  assert.deepEqual(await fetchPageHtml('https://example.com/start', relative.d), { success: true, html: 'final' });
  assert.equal(relative.calls[1].url, 'https://example.com/moved', 'relative redirects resolve against the current URL');

  const loop = makeDeps(new Array(10).fill(0).map(() => respond({ status: 302, headers: { location: 'https://example.com/again' } })));
  assert.deepEqual(await fetchPageHtml('https://example.com/', loop.d), { error: 'Too many redirects' });
  assert.equal(loop.calls.length, 4, 'one request plus three redirects');

  assert.deepEqual(await fetchPageHtml('https://example.com/', makeDeps([respond({ status: 302 })]).d), { error: 'Redirect without Location header' });
  assert.deepEqual(await fetchPageHtml('https://example.com/', makeDeps([respond({ status: 500, ok: false })]).d), { error: 'HTTP 500' });
  assert.deepEqual(await fetchPageHtml('https://example.com/', makeDeps([respond({ headers: { 'content-length': String(MAX_PREVIEW_HTML_BYTES + 1) } })]).d), { error: 'Response body exceeds 5MB size limit' });
  assert.deepEqual(await fetchPageHtml('', makeDeps([]).d), { error: 'Invalid URL' });
  assert.deepEqual(await fetchPageHtml(5 as unknown as string, makeDeps([]).d), { error: 'Invalid URL' });

  const big = makeDeps([respond({ text: 'x'.repeat(3 * 1024 * 1024 + 100) })]);
  const bigOut = await fetchPageHtml('https://example.com/', big.d) as { html: string };
  assert.equal(bigOut.html.length, 3 * 1024 * 1024, 'sanitised output is capped at 3 MB');

  const failing = { ...makeDeps([]).d, fetch: async () => { throw new Error('socket hang up'); } };
  assert.deepEqual(await fetchPageHtml('https://example.com/', failing), { error: 'socket hang up' });

  console.log('[PASS] Preview fetch (SSRF validation, body limit, redirects)');
}
run().catch((error) => {
  process.stderr.write(`Preview fetch suite failed: ${error?.stack || error}\n`);
  process.exit(1);
});
