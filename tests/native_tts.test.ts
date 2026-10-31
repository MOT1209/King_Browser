import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { NativeTts, parseSayVoices, buildSayArgs, type SayProcess } from '../electron/main/nativeTts';

/**
 * Native macOS text-to-speech lived in main.ts as module-level state with a
 * generation counter, a voice fallback and a watchdog, untested because it only
 * runs on macOS. Prevents: a voice name smuggling an option into /usr/bin/say,
 * a superseded request speaking over the newer one, a hung process leaving the
 * IPC call pending forever, and unbounded text reaching the process.
 */

console.log('\n--- Native TTS controller ---');

class FakeProc extends EventEmitter implements SayProcess {
  written = '';
  signals: Array<string | undefined> = [];
  closeOnKill = false;
  stdin = { on: () => {}, write: (chunk: string) => { this.written += chunk; return true; }, end: () => {} };
  stderr = { on: () => {} };
  constructor(public args: string[]) { super(); }
  kill(signal?: string) {
    this.signals.push(signal);
    if (this.closeOnKill) setImmediate(() => this.emit('close', null));
    return true;
  }
  exit(code: number | null) { this.emit('close', code); }
}

function harness(platform = 'darwin', speakTimeoutMs = 120000) {
  const procs: FakeProc[] = [];
  let spawnError: Error | null = null;
  const tts = new NativeTts({
    platform,
    speakTimeoutMs,
    spawn: (_cmd, args) => {
      if (spawnError) throw spawnError;
      const proc = new FakeProc(args);
      procs.push(proc);
      return proc;
    },
    listVoices: async () => 'Alex                en_US    # Most people recognize me by my voice.\nAnna                de_DE    # Hallo, ich heisse Anna.\nbroken line\n'
  });
  return { tts, procs, failSpawn: (e: Error) => { spawnError = e; } };
}

// Argument building and voice sanitising.
assert.deepEqual(buildSayArgs({ voiceName: 'Alex (Enhanced)' }), ['-v', 'Alex'], 'a parenthesised suffix is dropped');
assert.deepEqual(buildSayArgs({ voiceName: '--output-file=/tmp/x' }), [], 'an option-like name is refused');
assert.deepEqual(buildSayArgs({ voiceName: '-v' }), []);
assert.deepEqual(buildSayArgs({ voiceName: 'Alex; rm -rf /' }), [], 'shell metacharacters are refused');
assert.deepEqual(buildSayArgs({ voiceName: 'A'.repeat(41) }), [], 'overlong names are refused');
assert.deepEqual(buildSayArgs({ lang: 'de-DE' }), ['-v', 'Anna'], 'a language picks a default voice');
assert.deepEqual(buildSayArgs({ lang: 'xx' }), ['-v', 'Samantha'], 'unknown languages use the generic default');
for (const [lang, voice] of [['tr', 'Yelda'], ['de', 'Anna'], ['fr', 'Thomas'], ['es', 'Mónica'], ['it', 'Alice'], ['ja', 'Kyoko'], ['ru', 'Milena'], ['en', 'Samantha'], ['ar', 'Samantha'], ['DE-at', 'Anna']]) {
  assert.deepEqual(buildSayArgs({ lang }), ['-v', voice], `language ${lang} maps to ${voice}`);
}
assert.deepEqual(buildSayArgs({ lang: 'constructor' }), ['-v', 'Samantha'], 'inherited object keys are not treated as languages');
assert.deepEqual(buildSayArgs({ lang: '__proto__' }), ['-v', 'Samantha']);
assert.deepEqual(buildSayArgs({ voiceName: 'Alex', lang: 'de' }), ['-v', 'Alex'], 'an explicit voice wins over the language default');
assert.deepEqual(buildSayArgs({ rate: 1 }), ['-r', '175']);
assert.deepEqual(buildSayArgs({ rate: 10 }), ['-r', '438'], 'the rate is clamped to 2.5x');
assert.deepEqual(buildSayArgs({ rate: 0.1 }), ['-r', '88'], 'the rate is clamped to 0.5x');
assert.deepEqual(buildSayArgs({ rate: Number.NaN }), []);
assert.deepEqual(buildSayArgs({ rate: '2' as unknown as number }), []);

// Voice list parsing.
assert.deepEqual(parseSayVoices('Alex                en_US    # Most people recognize me.\nAnna  de_DE  # Hallo\njunk\n'), [
  { name: 'Alex', lang: 'en-US', description: 'Most people recognize me.' },
  { name: 'Anna', lang: 'de-DE', description: 'Hallo' }
]);

async function run() {
  // The watchdog timer is unref'd (as in the app, where the event loop lives on); keep this process alive for it.
  const keepAlive = setInterval(() => {}, 1000);
  // Not macOS.
  const linux = harness('linux');
  assert.deepEqual(await linux.tts.getVoices(), []);
  assert.deepEqual(await linux.tts.speak('hi'), { success: false, error: 'Native TTS is only available on macOS' });
  assert.equal(linux.procs.length, 0, 'nothing is spawned off macOS');

  // Voices on macOS.
  const mac = harness();
  assert.equal((await mac.tts.getVoices()).length, 2);

  // Invalid input.
  assert.deepEqual(await mac.tts.speak(''), { success: false, error: 'Invalid text' });
  assert.deepEqual(await mac.tts.speak(5 as unknown as string), { success: false, error: 'Invalid text' });

  // Success path: text goes through stdin, never argv.
  const ok = harness();
  const okPromise = ok.tts.speak('hello world', 'Alex', 1, 'en');
  assert.deepEqual(ok.procs[0].args, ['-v', 'Alex', '-r', '175']);
  assert.equal(ok.procs[0].written, 'hello world', 'the text is written to stdin');
  assert.ok(!ok.procs[0].args.includes('hello world'), 'the text is never an argument');
  ok.procs[0].exit(0);
  assert.deepEqual(await okPromise, { success: true });

  // Text is capped.
  const cap = harness();
  const capPromise = cap.tts.speak('x'.repeat(150000));
  assert.equal(cap.procs[0].written.length, 100000);
  cap.procs[0].exit(0);
  await capPromise;

  // A failing custom voice falls back to the default voice once.
  const fb = harness();
  const fbPromise = fb.tts.speak('hi', 'Nobody', 1);
  fb.procs[0].exit(1);
  assert.equal(fb.procs.length, 2, 'a second process is spawned without the voice');
  assert.deepEqual(fb.procs[1].args, ['-r', '175']);
  fb.procs[1].exit(0);
  assert.deepEqual(await fbPromise, { success: true });

  // Without a voice, a failure is reported rather than retried forever.
  const nofb = harness();
  const nofbPromise = nofb.tts.speak('hi');
  nofb.procs[0].exit(3);
  assert.deepEqual(await nofbPromise, { success: false, error: 'Process exited with code 3' });
  assert.equal(nofb.procs.length, 1);

  // A newer request supersedes the older one, which must not fall back and talk over it.
  const sup = harness();
  const first = sup.tts.speak('first', 'Alex');
  const second = sup.tts.speak('second', 'Anna');
  assert.deepEqual(sup.procs[0].signals, [undefined], 'the older process is killed');
  sup.procs[0].exit(1);
  assert.deepEqual(await first, { success: false, error: 'Superseded or stopped' });
  assert.equal(sup.procs.length, 2, 'the superseded request spawns no fallback');
  sup.procs[1].exit(0);
  assert.deepEqual(await second, { success: true });

  // Stop.
  const stp = harness();
  assert.equal(stp.tts.stop(), false, 'stopping with nothing playing reports false');
  const playing = stp.tts.speak('long text', 'Alex');
  assert.equal(stp.tts.stop(), true);
  assert.deepEqual(stp.procs[0].signals, ['SIGKILL']);
  stp.procs[0].exit(null);
  assert.deepEqual(await playing, { success: false, error: 'Superseded or stopped' });

  // A hung process is cut off by the watchdog.
  const hung = harness('darwin', 20);
  const hungProc = hung.tts.speak('stuck');
  hung.procs[0].closeOnKill = true;
  assert.deepEqual(await hungProc, { success: false, error: 'Speech synthesis timed out' });

  // A spawn failure is reported, not thrown.
  const bad = harness();
  bad.failSpawn(new Error('spawn ENOENT'));
  assert.deepEqual(await bad.tts.speak('hi'), { success: false, error: 'spawn ENOENT' });

  // A process error event is reported.
  const err = harness();
  const errPromise = err.tts.speak('hi');
  err.procs[0].emit('error', new Error('boom'));
  assert.deepEqual(await errPromise, { success: false, error: 'boom' });


  // Regression: an old request's watchdog must never kill a NEWER request's process.
  // Before the fix the watchdog killed "whatever is active", so an older request
  // whose process ignored the kill (stayed alive, never emitted close) fired later
  // and silenced the speech that replaced it.
  const wd = harness('darwin', 100);
  const oldReq = wd.tts.speak('old', 'Alex');
  await new Promise((resolve) => setTimeout(resolve, 50));
  const newReq = wd.tts.speak('new', 'Anna');
  assert.deepEqual(await oldReq, { success: false, error: 'Superseded or stopped' }, 'a superseded request settles at once, even if its process ignores the kill');
  await new Promise((resolve) => setTimeout(resolve, 70)); // past the OLD request's deadline (100ms), before the new one's (150ms)
  assert.deepEqual(wd.procs[1].signals, [], 'the old watchdog did not kill the newer process');
  wd.procs[1].exit(0);
  assert.deepEqual(await newReq, { success: true }, 'the newer request completes normally');

  // A timeout kills its own process, settles without waiting for close, and frees the slot.
  const to = harness('darwin', 20);
  const toPromise = to.tts.speak('stuck', 'Alex');
  assert.deepEqual(await toPromise, { success: false, error: 'Speech synthesis timed out' }, 'timeout settles even if the process never closes');
  assert.deepEqual(to.procs[0].signals, [undefined], 'the timed-out process is killed');
  to.procs[0].exit(1); // a late close must neither resolve again nor spawn a voice fallback
  assert.equal(to.procs.length, 1, 'no fallback is spawned after a timeout');
  const afterTimeout = to.tts.speak('again');
  assert.equal(to.procs.length, 2, 'the next request starts normally after a timeout');
  to.procs[1].exit(0);
  assert.deepEqual(await afterTimeout, { success: true });

  // stop() settles a pending request immediately and kills its process.
  const stp2 = harness();
  const pendingStop = stp2.tts.speak('long', 'Alex');
  stp2.tts.stop();
  assert.deepEqual(await pendingStop, { success: false, error: 'Superseded or stopped' }, 'stop does not wait for the process to close');
  assert.equal(stp2.tts.stop(), false, 'stopping twice is harmless');

  // Rapid concurrent requests: only the last one speaks and every promise settles exactly once.
  const burst = harness();
  const results = [burst.tts.speak('a', 'Alex'), burst.tts.speak('b', 'Alex'), burst.tts.speak('c', 'Alex')];
  assert.equal(burst.procs.length, 3);
  burst.procs[0].exit(1); burst.procs[1].exit(1); // old closes after being superseded: no fallbacks
  burst.procs[2].exit(0);
  const settled = await Promise.all(results);
  assert.deepEqual(settled, [
    { success: false, error: 'Superseded or stopped' },
    { success: false, error: 'Superseded or stopped' },
    { success: true }
  ]);
  assert.equal(burst.procs.length, 3, 'superseded requests spawn no fallback processes');

  // A process error after a timeout does not change the outcome.
  const lateErr = harness('darwin', 15);
  const lateErrPromise = lateErr.tts.speak('x');
  assert.equal((await lateErrPromise).error, 'Speech synthesis timed out');
  lateErr.procs[0].emit('error', new Error('late'));

  clearInterval(keepAlive);
  console.log('[PASS] Native TTS controller');
}
run().catch((error) => {
  process.stderr.write(`Native TTS suite failed: ${error?.stack || error}\n`);
  process.exit(1);
});
