/**
 * Record and replay (plan.md, WP4).
 *
 * The user starts a recording, an agent works, the user stops it, and the steps
 * can be replayed later without any AI model. Replays go through the same
 * approval gate as live agent actions, one step at a time.
 *
 * Honest limits, enforced here:
 *  - A step that typed into a password-like field is stored WITHOUT its text and
 *    marked needsInput; a replay stops there instead of typing bullets.
 *  - Element refs (e12) change from page load to page load, so a step that used
 *    a ref is stored as the element's role + name (+ which one of identical
 *    ones) and re-resolved from a fresh snapshot at replay time. If the page no
 *    longer has it, the replay stops with a clear message; it never guesses.
 *  - Only a fixed set of page actions is recorded; sign-in is not.
 *
 * Dependency-free apart from node:fs (no Electron imports).
 */

import * as fs from 'node:fs';

export const RECORDABLE_TOOLS: ReadonlySet<string> = new Set([
  'browser_navigate',
  'browser_new_tab',
  'browser_click',
  'browser_type',
  'browser_select_option',
  'browser_press_key',
  'browser_scroll',
  'browser_scroll_to_element',
  'browser_hover',
  'browser_focus',
  'browser_go_back',
  'browser_go_forward',
  'browser_reload',
  'browser_wait'
]);

export const MAX_STEPS = 200;
export const MAX_RECORDINGS = 50;
const MAX_ARGS_JSON = 4000;
const MAX_NAME = 80;

export interface StepTarget {
  role: string;
  name: string;
  /** Which of several elements with the same role and name (0 = first). */
  occurrence: number;
}

export interface RecordedStep {
  tool: string;
  args: Record<string, unknown>;
  target?: StepTarget;
  needsInput?: boolean;
}

export interface Recording {
  id: string;
  name: string;
  createdAt: string;
  steps: RecordedStep[];
}

export interface SnapshotEntry {
  ref: string;
  role: string;
  name: string;
}

/** Reads the lines `browser_snapshot` produces: `e12 button "Save"`. */
export function parseSnapshot(text: string): SnapshotEntry[] {
  const entries: SnapshotEntry[] = [];
  for (const line of String(text ?? '').split('\n')) {
    const match = /^(e[1-9][0-9]{0,4}) (\S+) "(.*?)"(?: \[checked\])?(?: -> .*)?$/.exec(line);
    if (match) entries.push({ ref: match[1], role: match[2], name: match[3] });
  }
  return entries;
}

export function describeTarget(snapshotText: string, ref: string): StepTarget | undefined {
  const entries = parseSnapshot(snapshotText);
  const index = entries.findIndex(entry => entry.ref === ref);
  if (index < 0) return undefined;
  const { role, name } = entries[index];
  const occurrence = entries.slice(0, index).filter(entry => entry.role === role && entry.name === name).length;
  return { role, name, occurrence };
}

export function findRef(snapshotText: string, target: StepTarget): string | undefined {
  const matches = parseSnapshot(snapshotText).filter(entry => entry.role === target.role && entry.name === target.name);
  return matches[target.occurrence]?.ref;
}

export interface StepContext {
  /** The arguments exactly as the agent sent them (before a ref became a selector). */
  originalArgs: Record<string, unknown>;
  /** The latest browser_snapshot output, used to describe a ref'd element. */
  lastSnapshot: string;
  /** True when the typed text would be redacted (password-like field). */
  sensitiveText: boolean;
}

export type BuildStepResult = { ok: true; step: RecordedStep } | { ok: false; reason: string };

export function buildStep(tool: string, ctx: StepContext): BuildStepResult {
  if (!RECORDABLE_TOOLS.has(tool)) return { ok: false, reason: `${tool} is not recorded` };
  const args: Record<string, unknown> = { ...ctx.originalArgs };
  delete args.tabId;
  let target: StepTarget | undefined;

  if (typeof args.ref === 'string' && args.ref) {
    target = describeTarget(ctx.lastSnapshot, args.ref);
    if (!target) return { ok: false, reason: `ref ${String(args.ref).slice(0, 12)} is not in the last snapshot, so the element cannot be described` };
    delete args.ref;
  }

  const step: RecordedStep = { tool, args };
  if (target) step.target = target;

  const sensitive = ctx.sensitiveText || target?.role === 'textbox(password)';
  if (tool === 'browser_type' && sensitive) {
    delete args.text;
    step.needsInput = true;
  }

  if (JSON.stringify(step).length > MAX_ARGS_JSON) return { ok: false, reason: 'step is too large to store' };
  return { ok: true, step };
}

function cleanName(input: unknown): string {
  return typeof input === 'string' ? input.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME) : '';
}

/** Validates a stored or imported recording; returns null if it is unusable. */
export function sanitizeRecording(input: unknown): Recording | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const name = cleanName(raw.name);
  if (!name || typeof raw.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(raw.id) || !Array.isArray(raw.steps)) return null;
  const steps: RecordedStep[] = [];
  for (const item of raw.steps.slice(0, MAX_STEPS)) {
    if (!item || typeof item !== 'object') continue;
    const s = item as Record<string, unknown>;
    if (typeof s.tool !== 'string' || !RECORDABLE_TOOLS.has(s.tool)) continue;
    if (!s.args || typeof s.args !== 'object' || Array.isArray(s.args)) continue;
    const step: RecordedStep = { tool: s.tool, args: { ...(s.args as Record<string, unknown>) } };
    delete step.args.ref;
    const t = s.target as Record<string, unknown> | undefined;
    if (t && typeof t.role === 'string' && typeof t.name === 'string' && Number.isInteger(t.occurrence) && (t.occurrence as number) >= 0) {
      step.target = { role: t.role.slice(0, 40), name: t.name.slice(0, 200), occurrence: t.occurrence as number };
    }
    if (s.needsInput === true) step.needsInput = true;
    if (JSON.stringify(step).length <= MAX_ARGS_JSON) steps.push(step);
  }
  if (steps.length === 0) return null;
  return {
    id: raw.id,
    name,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt.slice(0, 40) : '',
    steps
  };
}

export interface RecordingStore {
  list(): Recording[];
  add(recording: Recording): Recording[];
  remove(id: string): Recording[];
  get(id: string): Recording | undefined;
}

export function createRecordingStore(filePath: string): RecordingStore {
  let cache: Recording[] | null = null;
  const load = (): Recording[] => {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (!Array.isArray(parsed)) return [];
      return parsed.map(sanitizeRecording).filter((r): r is Recording => r !== null).slice(0, MAX_RECORDINGS);
    } catch {
      return [];
    }
  };
  const save = (list: Recording[]) => {
    cache = list;
    try {
      fs.writeFileSync(filePath, JSON.stringify(list), { encoding: 'utf8', mode: 0o600 });
    } catch {
      /* keep the in-memory list for this run */
    }
    return list.map(r => ({ ...r }));
  };
  const current = () => (cache ??= load());
  return {
    list: () => current().map(r => ({ ...r })),
    get: id => current().find(r => r.id === id),
    add(recording) {
      const clean = sanitizeRecording(recording);
      if (!clean) return current().map(r => ({ ...r }));
      return save([clean, ...current().filter(r => r.id !== clean.id)].slice(0, MAX_RECORDINGS));
    },
    remove: id => save(current().filter(r => r.id !== id))
  };
}

/** Collects steps while a recording is running. */
export class Recorder {
  private steps: RecordedStep[] = [];
  private skipped: string[] = [];

  add(tool: string, ctx: StepContext): void {
    if (this.steps.length >= MAX_STEPS) {
      this.skipped.push('recording is full');
      return;
    }
    const result = buildStep(tool, ctx);
    if (result.ok) this.steps.push(result.step);
    else if (RECORDABLE_TOOLS.has(tool)) this.skipped.push(result.reason);
  }

  get stepCount(): number {
    return this.steps.length;
  }

  get skippedReasons(): string[] {
    return [...this.skipped];
  }

  finish(id: string, name: string, now: Date = new Date()): Recording | null {
    return sanitizeRecording({ id, name, createdAt: now.toISOString(), steps: this.steps });
  }
}

export interface ReplayReport {
  total: number;
  completed: number;
  status: 'done' | 'needs_input' | 'target_not_found' | 'failed' | 'busy';
  message: string;
}

export interface ReplayDeps {
  /** Runs one tool call through the normal approval path; throws on refusal or failure. */
  run: (tool: string, args: Record<string, unknown>) => Promise<string>;
}

/** Replays steps in order and stops at the first one that cannot run. */
export async function replaySteps(steps: readonly RecordedStep[], deps: ReplayDeps): Promise<ReplayReport> {
  const total = steps.length;
  let completed = 0;
  for (const step of steps) {
    const args: Record<string, unknown> = { ...step.args };
    if (step.needsInput) {
      return { total, completed, status: 'needs_input', message: `Step ${completed + 1} (${step.tool}) needs text only you can enter, so the replay stopped before it.` };
    }
    try {
      if (step.target) {
        const snapshot = await deps.run('browser_snapshot', {});
        const ref = findRef(snapshot, step.target);
        if (!ref) {
          return { total, completed, status: 'target_not_found', message: `Step ${completed + 1}: no ${step.target.role} named "${step.target.name}" on the page now, so the replay stopped.` };
        }
        args.ref = ref;
      }
      await deps.run(step.tool, args);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return { total, completed, status: 'failed', message: `Step ${completed + 1} (${step.tool}) did not run: ${reason}` };
    }
    completed++;
  }
  return { total, completed, status: 'done', message: `Replayed ${completed} of ${total} steps.` };
}
