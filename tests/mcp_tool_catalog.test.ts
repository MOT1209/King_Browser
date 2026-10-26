import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Module from 'node:module';

// The Settings -> MCP panel used to keep its own copy of the tool list. It
// drifted: five tools were badged safer than the server classifies them, the
// info tool was missing, and a tool that no longer exists was still classified
// here. A wrong badge is not cosmetic - the badge is what the user reads before
// enabling a page-reading tool - so the two lists are now compared directly.

console.log('\n--- MCP tool catalog parity ---');

async function loadServer() {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'king-mcp-catalog-'));
  const electronStub = {
    app: { getPath: () => userData, getVersion: () => '0.0.0-test', isPackaged: false },
    safeStorage: { isEncryptionAvailable: () => false },
    dialog: {},
    powerMonitor: { on: () => {} },
    BrowserWindow: class {},
    ipcMain: { handle: () => {}, on: () => {}, removeHandler: () => {} }
  };
  const loader = Module as unknown as { _load: (request: string, ...rest: unknown[]) => unknown };
  const original = loader._load;
  loader._load = function (request: string, ...rest: unknown[]) {
    return request === 'electron' ? electronStub : original.call(this, request, ...rest);
  };
  try {
    return await import('../electron/mcpServer');
  } finally {
    loader._load = original;
  }
}

async function run() {
  const { TOOLS, TOOL_PERMISSIONS } = await loadServer();
  const { MCP_TOOLS } = await import('../src/components/settings/McpSection');

  const registered = TOOLS.map(tool => tool.name).sort();
  const classified = Object.keys(TOOL_PERMISSIONS).sort();

  // 1. The permission table describes the registry exactly: every tool is
  //    classified, and no entry survives a tool that was removed.
  assert.deepEqual(
    classified,
    registered,
    'TOOL_PERMISSIONS must list exactly the registered tools (no missing tool, no removed tool)'
  );
  console.log('[PASS] [MCPCatalog] the permission table matches the tool registry exactly');

  // 2. Every level is one the UI can render.
  for (const [name, level] of Object.entries(TOOL_PERMISSIONS)) {
    assert.ok(
      level === 'safe' || level === 'medium' || level === 'sensitive',
      `${name} has a renderable permission level`
    );
  }

  // 3. The Settings list shows every tool, once, at the server's level.
  const uiNames = MCP_TOOLS.map(tool => tool.name);
  assert.equal(new Set(uiNames).size, uiNames.length, 'no tool is listed twice in Settings');
  assert.deepEqual(
    [...uiNames].sort(),
    registered,
    'Settings lists exactly the registered tools (add a new tool here when you register it)'
  );
  for (const tool of MCP_TOOLS) {
    assert.equal(
      tool.level,
      TOOL_PERMISSIONS[tool.name],
      `${tool.name} badge level must match the server classification`
    );
    assert.ok(tool.desc && tool.desc.length > 0, `${tool.name} has display copy`);
  }
  console.log('[PASS] [MCPCatalog] the Settings list mirrors the registry and its levels');

  console.log('[PASS] MCP tool catalog suite complete');
}

run().catch(error => {
  console.error('[FAIL] MCP tool catalog suite:', error);
  process.exitCode = 1;
});
