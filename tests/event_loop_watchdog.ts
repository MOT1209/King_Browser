/**
 * Fails the combined run when one suite blocks the shared event loop for too
 * long. Every suite in tests/runAll.ts runs on one thread, so a synchronous
 * stretch in one suite delays the timers and deadlines of all the others.
 * Prevents: the 4 GiB CRX buffer in adversarial_hacker_security.test.ts that
 * froze the loop for about 16 s, longer than the 15 s MCP action window, and
 * made timing-sensitive suites fail only in the combined run.
 *
 * The limit is half the action window, so a block that can break another
 * suite's deadline is reported, with the output printed around it.
 * Module loading itself is not measured: arming waits until every suite body
 * has been evaluated. This file must stay the first import in runAll.ts.
 */

const BLOCK_LIMIT_MS = 7500;
const TICK_MS = 50;

const worst = { blockedMs: 0, before: '', after: '' };
let lastLine = '';
let awaitingAfter = false;

const originalLog = console.log;
console.log = (...args: unknown[]) => {
  const line = args.map((a) => (typeof a === 'string' ? a : String(a))).join(' ').trim().slice(0, 160);
  if (line) {
    if (awaitingAfter) { worst.after = line; awaitingAfter = false; }
    lastLine = line;
  }
  originalLog(...args);
};

setImmediate(() => {
  let last = Date.now();
  const timer = setInterval(() => {
    const now = Date.now();
    const blocked = now - last - TICK_MS;
    last = now;
    if (blocked > worst.blockedMs) {
      worst.blockedMs = blocked;
      worst.before = lastLine;
      worst.after = '';
      awaitingAfter = true;
    }
  }, TICK_MS);
  // Never keep the run alive on its own.
  timer.unref();
});

process.on('exit', () => {
  if (worst.blockedMs <= BLOCK_LIMIT_MS) return;
  console.error(
    `[FAIL] [Event-Loop-Watchdog] a suite blocked the shared event loop for ${worst.blockedMs} ms (limit ${BLOCK_LIMIT_MS} ms).\n` +
    `  last output before the block: ${worst.before || '(none)'}\n` +
    `  first output after the block: ${worst.after || '(none)'}\n` +
    '  Look for large synchronous work (huge buffers, sync crypto, busy loops) in the suite that printed around it.'
  );
  process.exitCode = 1;
});
