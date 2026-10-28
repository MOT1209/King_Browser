import assert from 'node:assert/strict';
import { createApprovalAttention } from '../electron/main/approvalAttention';

console.log('\n--- Approval attention (notification + taskbar flash) ---');

function setup(focused: boolean) {
  const calls: string[] = [];
  const notifications: Array<{ title: string; body: string; onClick: () => void }> = [];
  const state = { focused };
  const attention = createApprovalAttention({
    isWindowFocused: () => state.focused,
    flashWindow: (on) => calls.push(`flash:${on}`),
    focusWindow: () => calls.push('focus'),
    showNotification: (title, body, onClick) => notifications.push({ title, body, onClick }),
    strings: () => ({ title: 'Approval needed', body: (tool, domain) => `${tool} on ${domain ?? '-'}` }),
  });
  return { attention, calls, notifications, state };
}

const approval = (actionId: string, extra: Record<string, unknown> = {}) => ({
  type: 'approval_needed',
  approval: { actionId, toolName: 'browser_click', domain: 'bank.example.com', summary: 'type secret123', ...extra },
});

// Regression: an approval requested while King sat in the background went
// unseen and timed out as a rejection. Now the window flashes and notifies.
{
  const { attention, calls, notifications } = setup(false);
  attention.handleEngineEvent(approval('a1'));
  assert.deepEqual(calls, ['flash:true']);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].body, 'browser_click on bank.example.com');
  assert.ok(!notifications[0].body.includes('secret123'), 'the action summary (typed text) never reaches the notification');

  attention.handleEngineEvent(approval('a1'));
  assert.equal(notifications.length, 1, 'one notification per pending action');

  notifications[0].onClick();
  assert.deepEqual(calls, ['flash:true', 'focus', 'flash:false'], 'clicking the notification focuses King and stops flashing');
}

// A focused window already shows the approval: no notification, no flash.
{
  const { attention, calls, notifications } = setup(true);
  attention.handleEngineEvent(approval('a2'));
  assert.equal(notifications.length, 0);
  assert.deepEqual(calls, []);
}

// Focusing the window stops the flash; a new action notifies again.
{
  const { attention, calls, notifications, state } = setup(false);
  attention.handleEngineEvent(approval('a3'));
  state.focused = true;
  attention.handleWindowFocus();
  attention.handleWindowFocus();
  assert.deepEqual(calls, ['flash:true', 'flash:false'], 'stop flashing once');
  state.focused = false;
  attention.handleEngineEvent(approval('a4', { domain: undefined, toolName: '  browser_type \n x ' }));
  assert.equal(notifications.length, 2);
  assert.equal(notifications[1].body, 'browser_type x on -');
}

// Other events and malformed payloads are ignored.
{
  const { attention, notifications } = setup(false);
  attention.handleEngineEvent({ type: 'state_changed' } as any);
  attention.handleEngineEvent({ type: 'approval_needed', approval: null });
  attention.handleEngineEvent({ type: 'approval_needed', approval: { actionId: 42 } } as any);
  attention.handleEngineEvent(null as any);
  assert.equal(notifications.length, 0);
}

console.log('[PASS] [Approval-Attention] background approvals notify once, flash until focus, and never expose typed text.');
