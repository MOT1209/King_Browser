import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * The production CSP is delivered twice: as a <meta> written into
 * dist/index.html by vite.config.ts (HARDENED_PROD_CSP) and as a response
 * header set in electron/main.ts. The page enforces the intersection, so both
 * comments say the two copies MUST stay byte-identical, but nothing checked
 * it. Prevents: editing one copy (for example adding a connect-src host or
 * 'unsafe-eval') and silently changing the effective policy.
 */

console.log('\n--- Production CSP parity ---');

const root = process.cwd();
const viteSource = fs.readFileSync(path.join(root, 'vite.config.ts'), 'utf8');
const mainSource = fs.readFileSync(path.join(root, 'electron/main.ts'), 'utf8');

const arrayMatch = /const HARDENED_PROD_CSP = \[([\s\S]*?)\]\.join\('; '\);/.exec(viteSource);
assert.ok(arrayMatch, 'vite.config.ts still defines HARDENED_PROD_CSP as an array joined with "; "');
const viteCsp = Array.from(arrayMatch[1].matchAll(/"([^"]*)"/g), (m) => m[1]).join('; ');

// The header is `isDev ? `<dev policy>` : `<prod policy>``; take the prod branch.
const headerMatch = /responseHeaders\['Content-Security-Policy'\] = \[\s*isDev\s*\?\s*`[^`]*`\s*:\s*`([^`]*)`/.exec(mainSource);
assert.ok(headerMatch, 'electron/main.ts still sets the production CSP header in an isDev ? dev : prod expression');
const headerCsp = headerMatch[1];

assert.equal(headerCsp, viteCsp, 'production CSP header and meta policy are byte-identical');

const directives = new Map(viteCsp.split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
  const [name, ...values] = d.split(/\s+/);
  return [name, values] as const;
}));
const scriptSrc = directives.get('script-src') ?? [];
assert.ok(scriptSrc.length > 0, 'script-src is set');
for (const forbidden of ["'unsafe-inline'", "'unsafe-eval'", 'blob:', 'data:', 'http:', 'https:', '*']) {
  assert.ok(!scriptSrc.includes(forbidden), `script-src does not allow ${forbidden}`);
}
assert.deepEqual(directives.get('object-src'), ["'none'"], "object-src stays 'none'");
assert.deepEqual(directives.get('base-uri'), ["'self'"], "base-uri stays 'self'");

// When the renderer has been built (npm test builds it first), the shipped
// file must carry exactly this policy too.
const distIndex = path.join(root, 'dist', 'index.html');
if (fs.existsSync(distIndex)) {
  const builtMeta = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(fs.readFileSync(distIndex, 'utf8'));
  assert.ok(builtMeta, 'dist/index.html carries a CSP meta tag');
  assert.equal(builtMeta[1], viteCsp, 'dist/index.html ships the hardened policy');
}

console.log('[PASS] production CSP meta, header and built index.html agree; script-src has no inline, eval or remote sources');
