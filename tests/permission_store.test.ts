import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  PERMISSION_TTL_MS,
  permissionKeys,
  permissionOriginFor,
  rememberedDecision,
  parseRememberedPermissions,
  writeRememberedPermissions,
  purgeExpiredPermissions,
  type PermissionDecisions
} from '../electron/main/permissionStore';

/**
 * The pure rules behind site permission prompts (which key a request maps to,
 * which origin owns it, how long a remembered answer lives, and how the answers
 * are persisted) were buried in a 1,800-line closure in main.ts. Prevents:
 * microphone approval granting the camera, an expired or future-dated answer
 * being honoured, a credential-bearing or opaque origin collecting grants, and
 * a crash mid-write wiping every remembered decision.
 */

console.log('\n--- Permission store rules ---');

// Keys: camera and microphone are separate capabilities.
assert.deepEqual(permissionKeys('geolocation'), ['geolocation']);
assert.deepEqual(permissionKeys('media', ['audio']), ['media:audio']);
assert.deepEqual(permissionKeys('media', ['audio', 'video', 'audio']), ['media:audio', 'media:video']);
assert.equal(permissionKeys('media'), null, 'media without types needs a fresh prompt');
assert.equal(permissionKeys('media', []), null);
assert.equal(permissionKeys('media', ['audio', 'screen']), null, 'unknown media types are refused');
assert.equal(permissionKeys('media', 'audio'), null);

// Origins.
const trustedApp = (url: string) => url === 'nova://newtab';
assert.equal(permissionOriginFor('nova://newtab', trustedApp), 'app');
assert.equal(permissionOriginFor('https://example.com/a?b=1', trustedApp), 'https://example.com');
assert.equal(permissionOriginFor('http://example.com:8080/x', trustedApp), 'http://example.com:8080');
assert.equal(permissionOriginFor('https://user:pw@example.com/', trustedApp), '', 'credentials get no grants');
assert.equal(permissionOriginFor('file:///etc/passwd', trustedApp), '');
assert.equal(permissionOriginFor('data:text/html,x', trustedApp), '');
assert.equal(permissionOriginFor('not a url', trustedApp), '');
const extId = 'a'.repeat(32);
assert.equal(permissionOriginFor(`chrome-extension://${extId}/page.html`, trustedApp), `chrome-extension://${extId}`);
assert.equal(permissionOriginFor('chrome-extension://short/page.html', trustedApp), '', 'malformed extension ids get no grants');

// Remembered decisions.
const NOW = 1_700_000_000_000;
const decisions: PermissionDecisions = new Map([
  ['https://a.example', new Map([
    ['media:audio', { allow: true, ts: NOW - 1000 }],
    ['media:video', { allow: false, ts: NOW - 1000 }],
    ['geolocation', { allow: true, ts: NOW - PERMISSION_TTL_MS }],
    ['notifications', { allow: true, ts: NOW + 60_000 }]
  ])]
]);
assert.equal(rememberedDecision(decisions, 'https://a.example', ['media:audio'], NOW), true);
assert.equal(rememberedDecision(decisions, 'https://a.example', ['media:video'], NOW), false);
assert.equal(rememberedDecision(decisions, 'https://a.example', ['media:audio', 'media:video'], NOW), false, 'a single denial wins');
assert.equal(rememberedDecision(decisions, 'https://a.example', ['media:audio', 'camera'], NOW), undefined, 'an unknown key is undecided');
assert.equal(rememberedDecision(decisions, 'https://b.example', ['media:audio'], NOW), undefined);
assert.equal(rememberedDecision(decisions, 'https://a.example', ['geolocation'], NOW), undefined, 'an answer exactly at the TTL has expired');
assert.equal(rememberedDecision(decisions, 'https://a.example', ['notifications'], NOW), undefined, 'a future-dated answer is not honoured');
assert.ok(!decisions.get('https://a.example')!.has('geolocation'), 'expired answers are dropped when read');
const lone: PermissionDecisions = new Map([['https://c.example', new Map([['geolocation', { allow: true, ts: NOW - PERMISSION_TTL_MS - 1 }]])]]);
assert.equal(rememberedDecision(lone, 'https://c.example', ['geolocation'], NOW), undefined);
assert.ok(!lone.has('https://c.example'), 'an origin with no answers left is removed');

// Purge.
const purgeable: PermissionDecisions = new Map([
  ['https://old.example', new Map([['geolocation', { allow: true, ts: NOW - PERMISSION_TTL_MS - 1 }]])],
  ['https://mixed.example', new Map([['a', { allow: true, ts: NOW - PERMISSION_TTL_MS - 1 }], ['b', { allow: false, ts: NOW }]])]
]);
purgeExpiredPermissions(purgeable, NOW);
assert.ok(!purgeable.has('https://old.example'));
assert.deepEqual([...purgeable.get('https://mixed.example')!.keys()], ['b']);

// Parsing a file from disk drops expired and malformed entries and tolerates junk.
const parsed = parseRememberedPermissions(JSON.stringify({
  'https://keep.example': { geolocation: { allow: true, ts: NOW - 5 }, stale: { allow: true, ts: NOW - PERMISSION_TTL_MS - 5 }, bad: { allow: 'yes', ts: NOW }, worse: null },
  'https://empty.example': { stale: { allow: false, ts: 1 } },
  'https://junk.example': 'nope'
}), NOW);
assert.deepEqual([...parsed.keys()], ['https://keep.example']);
assert.deepEqual([...parsed.get('https://keep.example')!.keys()], ['geolocation']);
assert.equal(parseRememberedPermissions('[1,2]', NOW).size, 0);
assert.throws(() => parseRememberedPermissions('{ truncated', NOW), 'a truncated file is reported to the caller');

// Persistence is atomic, private and round-trips.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'king-perm-store-'));
try {
  const file = path.join(dir, 'remembered_permissions.json');
  writeRememberedPermissions(file, parsed);
  assert.ok(!fs.existsSync(file + '.tmp'), 'no temp file is left behind');
  if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600, 'the file is private');
  const reread = parseRememberedPermissions(fs.readFileSync(file, 'utf8'), NOW);
  assert.deepEqual([...reread.get('https://keep.example')!.entries()], [...parsed.get('https://keep.example')!.entries()]);

  const missingDir = path.join(dir, 'does-not-exist', 'remembered_permissions.json');
  assert.throws(() => writeRememberedPermissions(missingDir, parsed), 'a failed write is reported');
  assert.ok(!fs.existsSync(missingDir + '.tmp'));
  assert.ok(fs.existsSync(file), 'the previous file is untouched by another failed write');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log('[PASS] Permission store rules');
