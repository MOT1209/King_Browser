import assert from 'node:assert/strict';
import { isLocalOrIntranetHost } from '../electron/main/hostPolicy';

for (const host of [
  'localhost',
  'myhost.localhost',
  'myhost.local',
  'router.internal',
  'printer.lan',
  '127.0.0.1',
  '127.1.2.3',
  '0.0.0.0',
  '::1',
  '[::1]',
  '10.0.0.2',
  '192.168.1.1',
  'fd00::1',
]) {
  assert.equal(isLocalOrIntranetHost(host), true, `${host} should be treated as local or non-public`);
}

for (const host of ['google.com', 'example.org', '93.184.216.34', '2606:2800:220:1::1']) {
  assert.equal(isLocalOrIntranetHost(host), false, `${host} should remain public`);
}

assert.equal(isLocalOrIntranetHost(''), false);
assert.equal(isLocalOrIntranetHost('LOCALHOST.'), true);
assert.equal(isLocalOrIntranetHost('google.com.'), false);

console.log('[PASS] Extracted local/intranet host policy preserves public-vs-local classification.');
