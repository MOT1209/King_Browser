import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * CLAUDE.md hard rule 1: every privileged ipcMain handler validates its sender.
 *
 * security_regression_audit.test.ts checks a fixed list of critical channels,
 * so a NEW channel added without a sender check passed every test. This scans
 * every handler registered anywhere under electron/ and fails when one does
 * not call a sender guard as its first statement. Prevents: a new IPC channel
 * that any guest page or extension frame can invoke.
 */

console.log('\n--- IPC sender guard coverage ---');

function guardFor(param: string): RegExp {
  return new RegExp(`^\\s*(?:if\\s*\\(\\s*!\\s*(?:isTrustedSender|trustedSenderCheck)\\s*\\(\\s*${param}\\s*\\)\\s*\\)|assertTrusted\\s*\\(\\s*${param}\\s*\\))`);
}

// Handlers that hand the whole decision to a module which receives
// isTrustedSender and applies a narrower, tested rule of its own.
const DELEGATED: Record<string, { module: string; check: RegExp; why: string }> = {
  'install-from-webstore': {
    module: 'electron/main/crxInstaller.ts',
    check: /export async function installFromWebstore[\s\S]{0,400}const isFromMainWindow = isTrustedSender\(event\);[\s\S]{0,1200}if \(!isFromMainWindow && !isFromWebstore\) \{\s*return \{ error:/,
    why: 'also accepts the Chrome Web Store main frame (webstore-preload), checked in crxInstaller',
  },
};

interface Finding { file: string; line: number; channel: string; reason: string }

function findUnguardedHandlers(source: string, file: string): { total: number; findings: Finding[] } {
  const findings: Finding[] = [];
  const registration = /(?:ipcMain\.(?:handle|on|once)|host\.handle)\(\s*['"]([^'"]+)['"]\s*,\s*/g;
  let total = 0;
  let match: RegExpExecArray | null;
  while ((match = registration.exec(source))) {
    total++;
    const channel = match[1];
    const line = source.slice(0, match.index).split('\n').length;
    const rest = source.slice(registration.lastIndex);
    if (DELEGATED[channel]) {
      if (!/^\(\s*event\s*,[^)]*\)\s*=>\s*\w+\(\{\s*isTrustedSender\b/.test(rest)) {
        findings.push({ file, line, channel, reason: 'delegated handler no longer passes isTrustedSender' });
      }
      continue;
    }
    const arrow = /^(?:async\s+)?\(\s*(_?event)\b[^)]*\)\s*=>\s*\{/.exec(rest);
    if (!arrow) {
      findings.push({ file, line, channel, reason: 'handler is not an inline (event, ...) => { ... } function' });
      continue;
    }
    const body = rest.slice(arrow[0].length);
    const guard = guardFor(arrow[1]);
    // Allow leading comments before the guard.
    const firstStatement = body.replace(/^(?:\s*\/\/[^\n]*\n|\s*\/\*[\s\S]*?\*\/)*/, '');
    if (!guard.test(firstStatement)) {
      findings.push({ file, line, channel, reason: 'first statement is not a sender check' });
    }
  }
  return { total, findings };
}

// The checker must flag what it exists to flag.
{
  const bad = `ipcMain.handle('leak', async (event, p) => {\n  return readSecret(p);\n});`;
  assert.equal(findUnguardedHandlers(bad, 'fixture').findings.length, 1, 'an unguarded handler is reported');
  const late = `ipcMain.on('late', (event) => {\n  doWork();\n  if (!isTrustedSender(event)) return;\n});`;
  assert.equal(findUnguardedHandlers(late, 'fixture').findings.length, 1, 'a guard after other work is reported');
  const named = `ipcMain.handle('named', handleNamed);`;
  assert.equal(findUnguardedHandlers(named, 'fixture').findings.length, 1, 'a handler that cannot be inspected is reported');
  const good = `ipcMain.handle('ok', async (event, x) => {\n  // why\n  if (!isTrustedSender(event)) return null;\n  return x;\n});`;
  assert.equal(findUnguardedHandlers(good, 'fixture').findings.length, 0, 'a guarded handler passes');
}

function listTsFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listTsFiles(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

const root = process.cwd();
let handlerCount = 0;
const allFindings: Finding[] = [];
for (const file of listTsFiles(path.join(root, 'electron'))) {
  const relative = path.relative(root, file).split(path.sep).join('/');
  const { total, findings } = findUnguardedHandlers(fs.readFileSync(file, 'utf8'), relative);
  handlerCount += total;
  allFindings.push(...findings);
}

for (const [channel, rule] of Object.entries(DELEGATED)) {
  const moduleSource = fs.readFileSync(path.join(root, rule.module), 'utf8');
  assert.match(moduleSource, rule.check, `${channel}: ${rule.why}`);
}

assert.ok(handlerCount >= 88, `expected the full IPC surface to be scanned, found only ${handlerCount} handlers`);
assert.deepEqual(
  allFindings.map((f) => `${f.file}:${f.line} ${f.channel} - ${f.reason}`),
  [],
  'every IPC handler validates its sender first',
);
console.log(`[PASS] all ${handlerCount} IPC handlers under electron/ check their sender first`);
