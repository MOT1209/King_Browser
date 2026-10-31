import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * will-attach-webview called hardenIncognitoPartition(part) and discarded its
 * boolean result. When hardening threw (hardenIncognitoPartition returns
 * false), the webview was still attached to a session with no permission
 * handlers, so Electron's default permission behaviour applied.
 * Prevents: attaching an incognito or agent webview whose partition could not
 * be hardened. The attach must be cancelled (fail closed).
 */

console.log('\n--- will-attach-webview fails closed when partition hardening fails ---');

const mainSource = fs.readFileSync(path.join(process.cwd(), 'electron/main.ts'), 'utf8');

const callIdx = mainSource.indexOf("if (part.startsWith('incognito-') || part === AGENT_PERSIST_PARTITION) {");
assert.ok(callIdx > 0, 'will-attach-webview still hardens incognito and agent partitions');

const block = mainSource.slice(callIdx, callIdx + 600);
const closeIdx = block.indexOf('\n      }\n');
assert.ok(closeIdx > 0, 'hardening block is delimited');
const body = block.slice(0, closeIdx);

assert.match(body, /if \(!hardenIncognitoPartition\(part\)\)/, 'the hardening result is checked, not discarded');
assert.match(body, /event\.preventDefault\(\)/, 'the attach is cancelled when hardening fails');
assert.match(body, /return;/, 'the handler stops after cancelling the attach');

console.log('OK');
