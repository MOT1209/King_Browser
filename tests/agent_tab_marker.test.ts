import assert from 'node:assert/strict';
import {
  agentTabToMark,
  getAgentTabSnapshot,
  markAgentTab,
  resetAgentTabStoreForTests,
  setAgentEngineState,
  subscribeAgentTab,
} from '../src/services/agentTabStore';

console.log('\n--- Agent tab marker ---');

const open = ['t1', 't2'];

// The human must see where the agent acts: an active engine marks its last tab.
assert.equal(agentTabToMark('t1', 'running', open), 't1');
assert.equal(agentTabToMark('t2', 'awaiting_approval', open), 't2', 'a pending approval keeps the marker');
assert.equal(agentTabToMark('t2', 'paused', open), 't2', 'a paused agent still owns its tab');
assert.equal(agentTabToMark('t1', 'stopping', open), 't1');

// No stale marker once the agent is not active or the tab is gone.
assert.equal(agentTabToMark('t1', 'idle', open), null);
assert.equal(agentTabToMark('t1', 'stopped', open), null);
assert.equal(agentTabToMark('t1', 'error', open), null);
assert.equal(agentTabToMark('t1', null, open), null);
assert.equal(agentTabToMark(null, 'running', open), null);
assert.equal(agentTabToMark('closed', 'running', open), null, 'a closed tab is never marked');

// Store: listeners fire only on real changes.
resetAgentTabStoreForTests();
let calls = 0;
const unsubscribe = subscribeAgentTab(() => { calls++; });
markAgentTab('t1');
setAgentEngineState('running');
markAgentTab('t1');
setAgentEngineState('running');
markAgentTab('');
markAgentTab(undefined);
assert.deepEqual(getAgentTabSnapshot(), { tabId: 't1', engineState: 'running', takenOver: false });
assert.equal(calls, 2, 'duplicate and empty updates do not notify');
unsubscribe();
markAgentTab('t2');
assert.equal(calls, 2, 'unsubscribed listeners are not called');
resetAgentTabStoreForTests();

// The marker changes color while the human drives; leaving the take-over notifies listeners too.
resetAgentTabStoreForTests();
let takeOverCalls = 0;
const unsubscribeTakeOver = subscribeAgentTab(() => { takeOverCalls++; });
setAgentEngineState('paused', true);
assert.equal(getAgentTabSnapshot().takenOver, true);
setAgentEngineState('paused', true);
assert.equal(takeOverCalls, 1, 'an unchanged take-over does not notify');
setAgentEngineState('running', false);
assert.equal(getAgentTabSnapshot().takenOver, false);
assert.equal(takeOverCalls, 2);
unsubscribeTakeOver();
resetAgentTabStoreForTests();

// Regression: the tab items use custom React.memo comparators. A comparator
// that ignores isAgentTab keeps the marker from ever appearing.
import fs from 'node:fs';
for (const file of ['src/components/TopBar.tsx', 'src/components/SidebarTabs.tsx']) {
  const source = fs.readFileSync(file, 'utf8');
  assert.ok(/prev(Props)?\.isAgentTab === next(Props)?\.isAgentTab/.test(source), `${file} memo comparator must compare isAgentTab`);
}

console.log('[PASS] [Agent-Tab-Marker] the agent tab is marked only while the agent is active.');
