import assert from 'node:assert/strict';
import fs from 'node:fs';
import { publishActionContext, subscribeActionContext } from '../src/services/aiActionContext';

console.log('\n--- AI agent stays out of the startup bundle ---');

// A minimal context: only identity matters for these checks.
const ctx = (name: string) => ({ name }) as any;

// 1. A subscriber that arrives after the context was published still gets it,
//    so loading the agent lazily loses nothing.
{
  publishActionContext(ctx('first'));
  const seen: string[] = [];
  const unsubscribe = subscribeActionContext((c: any) => seen.push(c.name));
  assert.deepEqual(seen, ['first'], 'a late subscriber receives the latest context immediately');
  publishActionContext(ctx('second'));
  assert.deepEqual(seen, ['first', 'second'], 'later publications reach the subscriber');
  unsubscribe();
  publishActionContext(ctx('third'));
  assert.deepEqual(seen, ['first', 'second'], 'an unsubscribed listener hears nothing more');
  const again: string[] = [];
  subscribeActionContext((c: any) => again.push(c.name))();
  assert.deepEqual(again, ['third'], 'only the newest context is replayed');
  console.log('[PASS] AI action context - late subscribers get the latest context, updates and unsubscribe work');
}

// 2. The modules loaded with the main window must not import the agent
//    statically: that put it back into the entry chunk (559.76 KB against the
//    550 KB budget in challenger_m4_bundle_empirical).
{
  const eager = ['src/hooks/useBrowserAgentBridge.ts', 'src/hooks/useTabOperations.ts'];
  for (const file of eager) {
    const source = fs.readFileSync(file, 'utf8');
    assert.ok(!/from\s+['"][./]*\/services\/aiAgent['"]/.test(source), `${file} must not import services/aiAgent statically`);
  }
  assert.match(fs.readFileSync('src/hooks/useBrowserAgentBridge.ts', 'utf8'), /publishActionContext\(\{/, 'the bridge publishes the action context');
  assert.match(fs.readFileSync('src/hooks/useTabOperations.ts', 'utf8'), /await import\('\.\.\/services\/aiAgent'\)/, 'memory purge loads the agent on demand');
  const agent = fs.readFileSync('src/services/aiAgent.ts', 'utf8');
  assert.match(agent, /subscribeActionContext\(\(context\) => aiAgent\.setActionContext\(context\)\)/, 'the agent subscribes to the published context when it loads');
  console.log('[PASS] AI agent lazy load - eager modules do not import the agent; the agent subscribes on load');
}
