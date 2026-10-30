import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Module from 'node:module';

// An MCP client reads `tools/list` and builds its calls from each inputSchema.
// A property without a type or description, a `required` entry that names no
// property, or a README that states the wrong tool count all make a client
// guess. mcp_tool_catalog.test.ts proves the registry, permission table and
// Settings list agree; this file proves each registered tool is well-formed
// and that the published tool counts are true.

console.log('\n--- MCP tool schema validation ---');

async function loadServer() {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'king-mcp-schema-'));
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

const JSON_TYPES = new Set(['string', 'number', 'integer', 'boolean', 'array', 'object']);

async function run() {
  const { TOOLS, TOOL_PERMISSIONS } = await loadServer();
  const problems: string[] = [];

  const names = TOOLS.map(tool => tool.name);
  assert.equal(new Set(names).size, names.length, 'tool names are unique');

  for (const tool of TOOLS) {
    const where = tool.name;
    if (!/^(king_browser_info|browser_[a-z][a-z0-9_]*)$/.test(tool.name)) problems.push(`${where}: name must be king_browser_info or browser_<snake_case>`);
    if (typeof tool.description !== 'string' || tool.description.trim().length < 20) problems.push(`${where}: description must say what the tool does (20+ characters)`);
    const schema = tool.inputSchema;
    if (!schema || schema.type !== 'object') { problems.push(`${where}: inputSchema.type must be "object"`); continue; }
    if (!schema.properties || typeof schema.properties !== 'object') { problems.push(`${where}: inputSchema.properties must be an object`); continue; }

    const props = Object.keys(schema.properties);
    for (const prop of props) {
      const def = schema.properties[prop] as Record<string, unknown>;
      const type = def.type;
      if (typeof type !== 'string' || !JSON_TYPES.has(type)) problems.push(`${where}.${prop}: type must be one of ${[...JSON_TYPES].join('|')}`);
      if (typeof def.description !== 'string' || def.description.trim().length < 5) problems.push(`${where}.${prop}: needs a description`);
      if (type === 'array' && (typeof def.items !== 'object' || def.items === null)) problems.push(`${where}.${prop}: array needs "items"`);
      if ('enum' in def && (!Array.isArray(def.enum) || def.enum.length === 0)) problems.push(`${where}.${prop}: enum must be a non-empty array`);
    }

    const required = schema.required ?? [];
    if (!Array.isArray(required)) { problems.push(`${where}: required must be an array`); continue; }
    if (new Set(required).size !== required.length) problems.push(`${where}: duplicate entries in required`);
    for (const key of required) {
      if (!props.includes(key)) problems.push(`${where}: required "${key}" is not a declared property`);
    }
  }
  assert.deepEqual(problems, [], 'every registered MCP tool has a well-formed input schema');
  console.log(`[PASS] [MCPSchema] ${TOOLS.length} tools: names, descriptions, property types and required lists are well-formed`);

  // Published counts. A fresh install enables only the tools classed safe, so
  // that number is what a client sees on the first tools/list.
  const readme = fs.readFileSync(path.join(process.cwd(), 'README.md'), 'utf8');
  const safeCount = Object.values(TOOL_PERMISSIONS).filter(level => level === 'safe').length;
  const defines = /defines (\d+) tools/.exec(readme);
  const exposes = /Exposes (\d+) tools[^.]*only the (\d+) classed safe/.exec(readme);
  assert.ok(defines && exposes, 'README states the tool count in both places');
  assert.equal(Number(defines[1]), TOOLS.length, 'README "King Browser defines N tools" matches the registry');
  assert.equal(Number(exposes[1]), TOOLS.length, 'README "Exposes N tools" matches the registry');
  assert.equal(Number(exposes[2]), safeCount, 'README safe-by-default count matches TOOL_PERMISSIONS');
  console.log(`[PASS] [MCPSchema] README counts (${TOOLS.length} tools, ${safeCount} safe by default) match the registry`);

  // Every registered tool is handled by the renderer bridge or the engine, so
  // a tool cannot be listed to clients and then fail with "unknown tool".
  const bridge = fs.readFileSync(path.join(process.cwd(), 'src/hooks/useBrowserAgentBridge.ts'), 'utf8');
  const server = fs.readFileSync(path.join(process.cwd(), 'electron/mcpServer.ts'), 'utf8');
  // browser_fill_form is expanded into browser_type calls inside mcpServer.ts.
  const engineTools = new Set(['king_browser_info', 'browser_status', 'browser_request_approval', 'browser_next_step', 'browser_next_phase', 'browser_pause', 'browser_resume', 'browser_stop', 'browser_fill_form']);
  const aliasBlock = /const TOOL_ALIASES[^{]*\{([^}]*)\}/.exec(server);
  assert.ok(aliasBlock, 'TOOL_ALIASES block found in mcpServer.ts');
  const aliases = new Map([...aliasBlock[1].matchAll(/(\w+):\s*'(\w+)'/g)].map(m => [m[1], m[2]]));
  const unhandled = names.filter(name => !engineTools.has(name) && !bridge.includes(`'${aliases.get(name) ?? name}'`));
  assert.deepEqual(unhandled, [], 'every registered tool is routed by the bridge, the engine, or an alias that resolves to one the bridge implements');
  console.log('[PASS] [MCPSchema] every registered tool has a handler or alias route');

  console.log('[PASS] MCP tool schema suite complete');
}

run().catch(error => {
  console.error('[FAIL] MCP tool schema suite:', error);
  process.exitCode = 1;
});
