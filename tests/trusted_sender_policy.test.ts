import assert from 'node:assert/strict';
import { createTrustedSenderPolicy } from '../electron/security/trustedSender';

const mainFrame = { url: 'king://settings' };
const sent: Array<{ channel: string; payload: unknown }> = [];
let destroyed = false;
const window = {
  webContents: {
    id: 7,
    mainFrame,
    send: (channel: string, payload: unknown) => sent.push({ channel, payload }),
  },
  isDestroyed: () => destroyed,
} as any;
const policy = createTrustedSenderPolicy(() => window);

assert.equal(policy.isTrustedAppOrigin('king://settings'), true);
assert.equal(policy.isTrustedAppOrigin('king://settings#extensions'), true);
assert.equal(policy.isTrustedAppOrigin('king://evil'), false);
assert.equal(policy.isTrustedAppOrigin('king://settings#unknown'), false);
assert.equal(policy.isTrustedAppOrigin('devtools://devtools'), false);
assert.equal(policy.isTrustedAppOrigin('https://example.com'), false);

const mainEvent = {
  sender: { id: 7 },
  senderFrame: mainFrame,
} as any;
assert.equal(policy.isTrustedSender(mainEvent), true);
assert.equal(policy.isTrustedSender({ sender: { id: 8 }, senderFrame: mainFrame } as any), false);
assert.equal(policy.isTrustedSender({ sender: { id: 7 } } as any), false);
assert.equal(policy.isTrustedSender({ sender: { id: 7 }, senderFrame: { url: 'king://evil' } } as any), false);

destroyed = true;
assert.equal(policy.isTrustedSender(mainEvent), false);
policy.sendToMainWindow('test-channel', { ok: true });
assert.deepEqual(sent, []);

destroyed = false;
policy.sendToMainWindow('test-channel', { ok: true });
assert.deepEqual(sent, [{ channel: 'test-channel', payload: { ok: true } }]);

console.log('[PASS] Extracted trusted sender policy keeps sender and origin boundaries intact.');
