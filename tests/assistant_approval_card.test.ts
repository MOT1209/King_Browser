import assert from 'node:assert/strict';
import fs from 'node:fs';
import { orchestrator } from '../src/services/agentOrchestrator';
import { describeActionArgs } from '../src/components/AssistantApprovalCard';

// The in-app assistant queues click/type actions as 'pending' and waits for
// approveAction/denyAction. This card is the only UI that answers them.
async function run() {
  assert.match(fs.readFileSync('src/components/SidePanel.tsx', 'utf8'), /<AssistantApprovalCard \/>/,
    'the assistant side panel must render the approval card');

  const described = describeActionArgs({ selector: '#login', password: 'hunter2', text: 'hello' });
  assert.ok(!described.includes('hunter2'), 'sensitive argument values are masked');
  assert.match(described, /selector: #login/);
  assert.match(described, /text: hello/);

  const approved = orchestrator.enqueueAction('click_element', { selector: '#a' });
  assert.equal(orchestrator.getQueue().find(a => a.id === approved.id)?.state, 'pending');
  orchestrator.approveAction(approved.id);
  assert.equal(await approved.done, true, 'approving from the card resumes the assistant');

  const denied = orchestrator.enqueueAction('click_element', { selector: '#b' });
  orchestrator.denyAction(denied.id);
  assert.equal(await denied.done, false, 'rejecting from the card stops the action');
  console.log('[PASS] [Assistant-Approval] pending assistant actions can be approved or rejected from the side panel');
}
run().catch(error => { console.error('[FAIL] Assistant approval card:', error); process.exitCode = 1; });
