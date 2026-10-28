import assert from 'node:assert/strict';
import {
  PILL_MARGIN,
  clampPillPosition,
  defaultPillPosition,
  isDragGesture,
  parseStoredPillPosition,
  shouldShowPill,
} from '../src/utils/agentPillPlacement';

console.log('\n--- Agent status pill placement and visibility ---');

const pill = { width: 120, height: 32 };
const viewport = { width: 1280, height: 800 };

// Regression: the pill was fixed bottom-right and the RTL stylesheet flipped it
// bottom-left, on top of the assistant chat input. The default now sits on the
// inline-start side, away from the side panel.
assert.deepEqual(defaultPillPosition(pill, viewport, false), { x: PILL_MARGIN, y: 800 - 32 - PILL_MARGIN }, 'LTR default is bottom-left');
assert.deepEqual(defaultPillPosition(pill, viewport, true), { x: 1280 - 120 - PILL_MARGIN, y: 800 - 32 - PILL_MARGIN }, 'RTL default is bottom-right');

// A dragged or stored position never leaves the screen (window resized smaller).
assert.deepEqual(clampPillPosition({ x: 5000, y: 5000 }, pill, viewport), { x: 1280 - 120 - PILL_MARGIN, y: 800 - 32 - PILL_MARGIN });
assert.deepEqual(clampPillPosition({ x: -50, y: -50 }, pill, viewport), { x: PILL_MARGIN, y: PILL_MARGIN });
assert.deepEqual(clampPillPosition({ x: 400, y: 300 }, pill, viewport), { x: 400, y: 300 });
assert.deepEqual(clampPillPosition({ x: Number.NaN, y: 300 }, pill, viewport), { x: 1280 - 120 - PILL_MARGIN, y: 300 }, 'NaN falls back to the edge');
assert.deepEqual(clampPillPosition({ x: 10, y: 10 }, pill, { width: 50, height: 20 }), { x: PILL_MARGIN, y: PILL_MARGIN }, 'tiny viewport keeps the margin');

assert.deepEqual(parseStoredPillPosition('{"x":10,"y":20}'), { x: 10, y: 20 });
assert.equal(parseStoredPillPosition(null), null);
assert.equal(parseStoredPillPosition('not json'), null, 'corrupt storage falls back to default');
assert.equal(parseStoredPillPosition('{"x":"1","y":2}'), null);
assert.equal(parseStoredPillPosition('null'), null);

assert.equal(isDragGesture({ x: 0, y: 0 }, { x: 2, y: 3 }), false, 'a jitter is still a click');
assert.equal(isDragGesture({ x: 0, y: 0 }, { x: 10, y: 0 }), true);

const base = { state: 'idle', hasPendingApproval: false, queueLength: 0, panelOpen: false, hiddenByUser: false, hideWhenIdle: true };
assert.equal(shouldShowPill(base), false, 'idle pill hides when hide-when-idle is on');
assert.equal(shouldShowPill({ ...base, hideWhenIdle: false }), true);
assert.equal(shouldShowPill({ ...base, queueLength: 2 }), true, 'queued work keeps the pill visible');
assert.equal(shouldShowPill({ ...base, state: 'running' }), true);
assert.equal(shouldShowPill({ ...base, state: 'running', hiddenByUser: true }), false, 'the user can close the pill');
assert.equal(shouldShowPill({ ...base, state: 'running', hiddenByUser: true, panelOpen: true }), true, 'opening the panel by shortcut shows it');

// While the human drives, the way to hand the browser back must stay reachable.
assert.equal(shouldShowPill({ ...base, state: 'paused', takenOver: true, hiddenByUser: true }), true, 'a take-over keeps the pill even if the user closed it');
assert.equal(shouldShowPill({ ...base, state: 'idle', takenOver: true }), true, 'and even when idle');
assert.equal(shouldShowPill({ ...base, takenOver: false }), false);

// The approval gate cannot be hidden: a pending approval always shows the pill.
assert.equal(shouldShowPill({ ...base, hasPendingApproval: true, hiddenByUser: true }), true);
assert.equal(shouldShowPill({ ...base, state: 'awaiting_approval', hiddenByUser: true }), true);

console.log('[PASS] [Agent-Pill] placement clamps to the viewport and a pending approval is never hidden.');
