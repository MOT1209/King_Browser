/**
 * Native text-to-speech through macOS `/usr/bin/say`, split out of main.ts.
 *
 * Decisions made here, all testable without a Mac because the process and the
 * platform are injected:
 *  - the text goes to `say` through stdin, never argv, and is capped;
 *  - the voice name is sanitised so it cannot smuggle an option into `say`;
 *  - each speak request invalidates the previous one (generation counter), so a
 *    killed request's close handler can never spawn a voice fallback over the
 *    newer request;
 *  - a watchdog guarantees the IPC call settles even if `say` hangs.
 * The IPC handlers and their isTrustedSender checks stay in main.ts.
 */

export interface SayProcess {
  stdin?: { on: (event: string, cb: () => void) => unknown; write: (chunk: string, encoding: BufferEncoding) => unknown; end: () => unknown } | null;
  stderr?: { on: (event: string, cb: () => void) => unknown } | null;
  kill: (signal?: NodeJS.Signals) => boolean;
  on: (event: any, listener: (...args: any[]) => void) => unknown;
}

export interface NativeTtsDeps {
  platform: string;
  spawn: (command: string, args: string[], options: { stdio: Array<'pipe' | 'ignore'> }) => SayProcess;
  /** Output of `say -v ?`. */
  listVoices: () => Promise<string>;
  /** Overall cap for one speak request, shared across voice-fallback retries. */
  speakTimeoutMs?: number;
}

export interface SayVoice { name: string; lang: string; description: string }
export type SpeakResult = { success: boolean; error?: string };

const MAX_TEXT_CHARS = 100000;
const DEFAULT_SPEAK_TIMEOUT_MS = 120000;
const SAY = '/usr/bin/say';

// A Map, not an object literal: a language such as "constructor" must not resolve to an inherited property.
const DEFAULT_VOICE_BY_LANGUAGE = new Map<string, string>([
  ['tr', 'Yelda'], ['de', 'Anna'], ['fr', 'Thomas'], ['es', 'Mónica'], ['it', 'Alice'], ['ja', 'Kyoko'], ['ru', 'Milena']
]);

export function parseSayVoices(stdout: string): SayVoice[] {
  const list: SayVoice[] = [];
  for (const line of stdout.split('\n')) {
    const match = line.match(/^([^\t#]+?)\s+([a-zA-Z]{2}_[a-zA-Z0-9]+)\s+#\s*(.*)$/);
    if (match) {
      list.push({ name: match[1].trim(), lang: match[2].replace('_', '-'), description: match[3].trim() });
    }
  }
  return list;
}

/** Arguments for `say` (voice and rate); the text is never part of them. */
export function buildSayArgs(options: { voiceName?: unknown; rate?: unknown; lang?: unknown }): string[] {
  // Security: sanitise strictly against command flag injection.
  let cleanVoice: string | null = null;
  if (options.voiceName && typeof options.voiceName === 'string') {
    const rawName = options.voiceName.split('(')[0].trim();
    if (/^[a-zA-Z0-9\s]+$/.test(rawName) && rawName.length <= 40 && !rawName.startsWith('-')) {
      cleanVoice = rawName;
    }
  }
  // With no voice specified, pick the best default by language.
  if (!cleanVoice && options.lang && typeof options.lang === 'string') {
    const prefix = options.lang.toLowerCase().split('-')[0];
    cleanVoice = DEFAULT_VOICE_BY_LANGUAGE.get(prefix) ?? 'Samantha';
  }
  const args: string[] = [];
  if (cleanVoice) args.push('-v', cleanVoice);
  if (options.rate && typeof options.rate === 'number' && Number.isFinite(options.rate)) {
    const clampedRate = Math.max(0.5, Math.min(2.5, options.rate));
    args.push('-r', String(Math.round(175 * clampedRate)));
  }
  return args;
}

export class NativeTts {
  private active: SayProcess | null = null;
  // Each speak request invalidates the previous one so a killed request's
  // close-handler can never spawn a fallback that talks over the newer request.
  private generation = 0;

  constructor(private readonly deps: NativeTtsDeps) {}

  async getVoices(): Promise<SayVoice[]> {
    if (this.deps.platform !== 'darwin') return [];
    try {
      return parseSayVoices(await this.deps.listVoices());
    } catch (e) {
      console.error('Failed to get macOS native voices:', e);
      return [];
    }
  }

  speak(text: unknown, voiceName?: unknown, rate?: unknown, lang?: unknown): Promise<SpeakResult> {
    if (!text || typeof text !== 'string') return Promise.resolve({ success: false, error: 'Invalid text' });
    const speech = text.length > MAX_TEXT_CHARS ? text.substring(0, MAX_TEXT_CHARS) : text;

    // Invalidate any in-flight request BEFORE killing it: its close handler runs
    // on a future tick, so bumping the generation first guarantees it observes
    // the mismatch and never spawns a voice-fallback over this request.
    const myGeneration = ++this.generation;
    this.killActive();

    if (this.deps.platform !== 'darwin') {
      return Promise.resolve({ success: false, error: 'Native TTS is only available on macOS' });
    }

    return new Promise((resolve) => {
      // Hard overall cap so a hung `say` can never leave this call pending
      // forever. One shared deadline across voice-fallback retries.
      let settled = false;
      let timedOut = false;
      const watchdog = setTimeout(() => {
        timedOut = true;
        this.killActive();
      }, this.deps.speakTimeoutMs ?? DEFAULT_SPEAK_TIMEOUT_MS);
      watchdog.unref?.();
      const finish = (result: SpeakResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(watchdog);
        resolve(result);
      };

      const run = (args: string[]) => {
        try {
          const proc = this.deps.spawn(SAY, args, { stdio: ['pipe', 'ignore', 'pipe'] });
          this.active = proc;
          // Drain stderr so pipe backpressure can never stall the process.
          proc.stderr?.on('data', () => {});
          if (proc.stdin) {
            proc.stdin.on('error', () => {});
            try {
              proc.stdin.write(speech, 'utf8');
              proc.stdin.end();
            } catch (_) {}
          }
          proc.on('close', (code: number | null) => {
            if (this.active === proc) this.active = null;
            if (myGeneration !== this.generation) {
              finish({ success: false, error: 'Superseded or stopped' });
            } else if (timedOut) {
              finish({ success: false, error: 'Speech synthesis timed out' });
            } else if (code === 0) {
              finish({ success: true });
            } else if (code !== null && args.includes('-v')) {
              // Not cancelled, and the custom voice failed: retry once without it.
              run(args.filter((a, i) => a !== '-v' && args[i - 1] !== '-v'));
            } else {
              finish({ success: false, error: `Process exited with code ${code}` });
            }
          });
          proc.on('error', (err: Error) => {
            if (this.active === proc) this.active = null;
            finish({ success: false, error: err.message });
          });
        } catch (err: any) {
          this.active = null;
          finish({ success: false, error: err.message });
        }
      };

      run(buildSayArgs({ voiceName, rate, lang }));
    });
  }

  /** Invalidates in-flight requests and kills the process. True when something was playing. */
  stop(): boolean {
    this.generation++;
    if (this.active) {
      try { this.active.kill('SIGKILL'); } catch (_) {}
      this.active = null;
      return true;
    }
    return false;
  }

  private killActive(): void {
    if (this.active) {
      try { this.active.kill(); } catch (_) {}
      this.active = null;
    }
  }
}
