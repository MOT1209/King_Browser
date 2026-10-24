import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { appendCrashLog, MAX_CRASH_LOG_BYTES } from '../electron/main/crashLog';

const fixtureDirectory = fs.mkdtempSync(path.join(process.cwd(), 'dist-test', 'crash-log-'));
const logPath = path.join(fixtureDirectory, 'crash.log');

try {
  appendCrashLog(logPath, 'first crash\n');
  appendCrashLog(logPath, 'second crash\n');
  assert.equal(fs.readFileSync(logPath, 'utf8'), 'first crash\nsecond crash\n');

  const oversizedLog = 'x'.repeat(MAX_CRASH_LOG_BYTES + 1);
  fs.writeFileSync(logPath, oversizedLog);
  appendCrashLog(logPath, 'new crash\n');

  const retainedLog = fs.readFileSync(logPath, 'utf8');
  assert.equal(retainedLog.length, 100 * 1024 + 'new crash\n'.length);
  assert.equal(retainedLog.endsWith('new crash\n'), true);
  assert.equal(retainedLog.startsWith('x'.repeat(100)), true);
  console.log('[PASS] Local crash log appends and trims oversized logs to a bounded tail.');
} finally {
  fs.rmSync(fixtureDirectory, { recursive: true, force: true });
}
