import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createApprovalModeStore, sanitizeApprovalMode, strictModeRequiresApproval, STRICT_EXEMPT_TOOLS } from '../electron/main/approvalMode';

console.log('\n--- Approval Mode Test Suite ---');

{
  assert.equal(sanitizeApprovalMode('strict'), 'strict');
  for (const other of ['balanced', 'relaxed', 'off', '', null, undefined, 1, {}, 'STRICT']) {
    assert.equal(sanitizeApprovalMode(other), 'balanced', `unknown value ${String(other)} falls back to balanced`);
  }
  console.log('[PASS] Approval mode — only "strict" is strict; there is no looser mode to select');
}

{
  assert.equal(strictModeRequiresApproval('balanced', 'browser_read_page'), false);
  assert.equal(strictModeRequiresApproval('strict', 'browser_read_page'), true);
  assert.equal(strictModeRequiresApproval('strict', 'browser_navigate'), true);
  assert.equal(strictModeRequiresApproval('strict', 'browser_snapshot'), true);
  for (const tool of STRICT_EXEMPT_TOOLS) assert.equal(strictModeRequiresApproval('strict', tool), false, tool);
  assert.ok(!STRICT_EXEMPT_TOOLS.has('browser_read_page') && !STRICT_EXEMPT_TOOLS.has('browser_screenshot'), 'tools that expose page content are never exempt');
  console.log('[PASS] Approval mode — strict asks for everything except metadata-only tools');
}

{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'king-mode-'));
  const file = path.join(dir, 'mode.json');
  const store = createApprovalModeStore(file);
  assert.equal(store.get(), 'balanced', 'default is balanced');
  assert.equal(store.set('strict'), 'strict');
  assert.equal(createApprovalModeStore(file).get(), 'strict', 'the choice survives a restart');
  assert.equal(store.set('bogus'), 'balanced', 'junk resets to balanced');
  fs.writeFileSync(file, '{ not json');
  assert.equal(createApprovalModeStore(file).get(), 'balanced', 'a corrupt file yields the default');
  assert.doesNotThrow(() => createApprovalModeStore(path.join(dir, 'missing', 'm.json')).set('strict'));
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('[PASS] Approval mode — store persists, tolerates corruption and write failures');
}
