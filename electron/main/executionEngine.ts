/**
 * King Browser — Authoritative Execution Engine (§11 of the Master Prompt).
 *
 * Single state machine that gates every agent action:
 *   idle → running ⇄ paused ⇄ awaiting_approval → stopping → stopped / error
 *
 * Invariants:
 * - Exactly one action in flight at any time (no uncontrolled parallel actions).
 * - Queued actions are bounded; every submitted action settles exactly once
 *   with a terminal status: completed | failed | cancelled | rejected.
 * - STOP NOW rejects new submissions immediately, cancels the queue, aborts the
 *   in-flight operation when supported, and silently discards any late
 *   completion (generation guard) so delayed commands can never continue.
 * - The final state is reported honestly: late-settling operations are marked
 *   as settled-after-stop instead of pretending they never ran.
 * - State transitions are validated; unauthorized commands are rejected even
 *   if the UI is bypassed.
 *
 * Dependency-free (no Electron imports) so it is unit-testable in plain Node.
 * Side effects are injected: executor, abortInFlight, askApproval, persist.
 */

export type EngineState =
  | 'idle'
  | 'running'
  | 'paused'
  | 'awaiting_approval'
  | 'stopping'
  | 'stopped'
  | 'error';

export type ActionStatus =
  | 'requested'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'rejected';

export type ActionRisk = 'safe' | 'sensitive';

export interface ActionRequest {
  toolName: string;
  args: Record<string, unknown>;
  risk: ActionRisk;
  summary?: string;
  domain?: string;
}

export interface ActionRecord {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  risk: ActionRisk;
  summary?: string;
  domain?: string;
  status: ActionStatus;
  requestedAt: number;
  startedAt?: number;
  endedAt?: number;
  error?: string;
  stoppedBy?: string;
}

export interface PendingApproval {
  actionId: string;
  toolName: string;
  args: Record<string, unknown>;
  summary?: string;
  domain?: string;
}

export type PhaseCondition =
  | { type: 'action_count'; value: number }
  | { type: 'tool_called'; toolName: string }
  | { type: 'external'; id: string };

export interface PhaseDefinition {
  objective: string;
  preconditions?: PhaseCondition[];
  permittedActions: string[];
  maxActions: number;
  completionConditions?: PhaseCondition[];
  failureConditions?: PhaseCondition[];
  approvalPoints?: string[];
}

export type EngineEvent =
  | { type: 'state_changed'; from: EngineState; to: EngineState; reason: string; at: number }
  | { type: 'action_updated'; record: ActionRecord }
  | { type: 'approval_needed'; approval: PendingApproval }
  | { type: 'approval_resolved'; actionId: string; approved: boolean }
  | { type: 'phase_updated'; phase: PhaseDefinition | null; actionsUsed: number; status: 'running' | 'completed' | 'boundary' | 'failed' };

export interface EngineRunContext {
  phase: PhaseDefinition | null;
  phaseActionsUsed: number;
  history: readonly ActionRecord[];
}

export type ConditionEvaluator = (condition: PhaseCondition, context: EngineRunContext) => boolean | Promise<boolean>;

export interface ExecutionEngineOptions {
  executor: (request: ActionRequest) => Promise<unknown>;
  abortInFlight?: (reason: string) => void;
  askApproval?: (approval: PendingApproval) => Promise<boolean>;
  persist?: (record: ActionRecord) => void;
  evaluateCondition?: ConditionEvaluator;
  onEvent?: (event: EngineEvent) => void;
  now?: () => number;
  maxQueueSize?: number;
  actionTimeoutMs?: number;
  maxActionsPerRun?: number;
}

interface QueueEntry {
  actionId: string;
  request: ActionRequest;
  resolve: (record: ActionRecord) => void;
  reject: (error: Error) => void;
}

const COUNTED_STATUSES: ReadonlySet<ActionStatus> = new Set(['completed', 'failed']);

export class ExecutionEngine {
  private state: EngineState = 'idle';
  private queue: QueueEntry[] = [];
  private inFlight: ActionRecord | null = null;
  private inFlightEntry: QueueEntry | null = null;
  private approvalEntry: { entry: QueueEntry; record: ActionRecord } | null = null;
  private history: ActionRecord[] = [];
  private runActionsUsed = 0;
  private generation = 0;
  private mode: 'auto' | 'step' = 'auto';
  private pauseOnBoundary = false;
  private pendingApproval: PendingApproval | null = null;
  private phase: PhaseDefinition | null = null;
  private phaseActionsUsed = 0;
  private stopReason: string | null = null;
  private lastFinalState: { stoppedBy: string; inFlightAborted: boolean; inFlightSettledLater: boolean } | null = null;
  private actionCounter = 0;
  private inFlightTimer: { entry: QueueEntry; handle: ReturnType<typeof setTimeout> } | null = null;
  private inFlightGeneration = 0;

  private readonly now: () => number;
  private readonly maxQueueSize: number;
  private readonly actionTimeoutMs: number;
  private readonly maxActionsPerRun: number;

  constructor(private readonly options: ExecutionEngineOptions) {
    this.now = options.now ?? (() => Date.now());
    this.maxQueueSize = options.maxQueueSize ?? 50;
    this.actionTimeoutMs = options.actionTimeoutMs ?? 15000;
    this.maxActionsPerRun = options.maxActionsPerRun ?? 500;
  }

  // ---------------------------------------------------------------- queries

  getState(): EngineState { return this.state; }
  getMode(): 'auto' | 'step' { return this.mode; }
  getQueueLength(): number { return this.queue.length; }
  getInFlight(): ActionRecord | null { return this.inFlight ? { ...this.inFlight } : null; }
  getHistory(): ActionRecord[] { return this.history.map(r => ({ ...r })); }
  getPendingApproval(): PendingApproval | null { return this.pendingApproval ? { ...this.pendingApproval } : null; }
  getPhase(): { phase: PhaseDefinition; actionsUsed: number } | null {
    return this.phase ? { phase: { ...this.phase }, actionsUsed: this.phaseActionsUsed } : null;
  }
  getStopReason(): string | null { return this.stopReason; }
  getLastFinalState(): typeof this.lastFinalState { return this.lastFinalState ? { ...this.lastFinalState } : null; }

  getStatusSnapshot() {
    return {
      state: this.state,
      mode: this.mode,
      queueLength: this.queue.length,
      inFlight: this.getInFlight(),
      pendingApproval: this.getPendingApproval(),
      phase: this.getPhase(),
      actionsUsedThisRun: this.runActionsUsed,
      maxActionsPerRun: this.maxActionsPerRun,
      stopReason: this.stopReason,
      lastFinalState: this.getLastFinalState()
    };
  }

  // ------------------------------------------------------------- internals

  private newActionId(): string {
    this.actionCounter += 1;
    return `act_${this.now().toString(36)}_${this.actionCounter.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private transition(to: EngineState, reason: string): void {
    if (this.state === to) return;
    const from = this.state;
    this.state = to;
    this.emit({ type: 'state_changed', from, to, reason, at: this.now() });
  }

  private emit(event: EngineEvent): void {
    try { this.options.onEvent?.(event); } catch { /* observers must never break the machine */ }
  }

  private publish(record: ActionRecord): void {
    this.emit({ type: 'action_updated', record: { ...record } });
    try { this.options.persist?.({ ...record }); } catch { /* persistence must never break the machine */ }
  }

  /** Terminal transition: one place records endedAt, history, and observers. */
  private finalize(record: ActionRecord, status: ActionStatus, extra?: Partial<ActionRecord>): void {
    record.status = status;
    if (extra) Object.assign(record, extra);
    if (record.endedAt === undefined) record.endedAt = this.now();
    const index = this.history.findIndex(r => r.id === record.id);
    const snapshot = { ...record };
    if (index >= 0) this.history[index] = snapshot;
    else this.history.push(snapshot);
    this.publish(record);

    if (COUNTED_STATUSES.has(status)) {
      this.runActionsUsed++;
      if (this.phase) this.phaseActionsUsed++;
    }
  }

  // ------------------------------------------------------------------ submit

  submit(request: ActionRequest): Promise<ActionRecord> {
    if (this.state === 'stopping' || this.state === 'stopped') {
      return Promise.reject(new Error(
        `Execution engine is ${this.state}: new actions are rejected. ` +
        `STOP NOW active${this.stopReason ? ` (${this.stopReason})` : ''}. Explicit resume is required.`
      ));
    }
    if (this.state === 'error') {
      return Promise.reject(new Error('Execution engine is in error state: explicit reset or resume is required.'));
    }
    if (this.queue.length >= this.maxQueueSize) {
      return Promise.reject(new Error(`Execution queue is full (${this.maxQueueSize} pending actions).`));
    }
    if (this.runActionsUsed >= this.maxActionsPerRun) {
      return Promise.reject(new Error(`Run action limit reached (${this.maxActionsPerRun}). Start a new run to continue.`));
    }
    if (this.phase) {
      if (!this.phase.permittedActions.includes(request.toolName)) {
        return Promise.reject(new Error(
          `Phase "${this.phase.objective}" does not permit action "${request.toolName}".`
        ));
      }
      if (this.phaseActionsUsed >= this.phase.maxActions) {
        return Promise.reject(new Error(
          `Phase "${this.phase.objective}" reached its action budget (${this.phase.maxActions}).`
        ));
      }
    }

    return new Promise<ActionRecord>((resolve, reject) => {
      const entry: QueueEntry = { actionId: this.newActionId(), request, resolve, reject };
      this.queue.push(entry);
      if (this.state === 'idle') this.transition('running', 'first action submitted');
      this.pump();
    });
  }

  // ------------------------------------------------------------------ pump

  private pump(): void {
    if (this.state !== 'running') return;
    if (this.inFlightEntry) return;
    if (this.pendingApproval) return;

    const entry = this.queue.shift();
    if (!entry) return;

    if (this.phase && this.phaseActionsUsed >= this.phase.maxActions) {
      const record = this.buildRecord(entry, 'requested');
      this.finalize(record, 'rejected', { error: `Phase "${this.phase.objective}" reached its action budget (${this.phase.maxActions}).` });
      entry.resolve(record);
      if (this.state === 'running') this.transition('paused', 'phase action budget exhausted');
      return;
    }

    const record = this.buildRecord(entry, 'requested');
    this.publish(record);

    if (record.risk === 'sensitive') {
      if (this.options.askApproval) {
        this.beginApproval(entry, record);
        return;
      }
      this.finalize(record, 'rejected', { error: 'No approval handler configured for sensitive action.' });
      entry.resolve(record);
      this.afterBoundaryCheck();
      return;
    }
    void this.execute(entry, record);
  }

  private buildRecord(entry: QueueEntry, status: ActionStatus): ActionRecord {
    return {
      id: entry.actionId,
      toolName: entry.request.toolName,
      args: entry.request.args,
      risk: entry.request.risk,
      summary: entry.request.summary,
      domain: entry.request.domain,
      status,
      requestedAt: this.now()
    };
  }

  // ---------------------------------------------------------------- execute

  private execute(entry: QueueEntry, record: ActionRecord): void {
    const generation = this.generation;
    this.inFlight = record;
    this.inFlightEntry = entry;
    record.status = 'running';
    record.startedAt = this.now();
    this.inFlightGeneration = generation;
    this.publish(record);

    this.armInFlightTimeout(entry, record, generation, this.actionTimeoutMs);

    this.options.executor(entry.request).then(
      (result) => this.settle(entry, record, generation, 'completed', undefined, result),
      (error: unknown) => this.settle(entry, record, generation, 'failed', error instanceof Error ? error.message : String(error))
    );
  }

  private armInFlightTimeout(entry: QueueEntry, record: ActionRecord, generation: number, ms: number): void {
    this.clearInFlightTimer();
    const handle = setTimeout(() => {
      if (this.inFlightTimer?.handle === handle) this.inFlightTimer = null;
      this.settle(entry, record, generation, 'failed', `Action '${record.toolName}' timed out after ${ms}ms`);
    }, ms);
    handle.unref?.();
    this.inFlightTimer = { entry, handle };
  }

  private clearInFlightTimer(entry?: QueueEntry): void {
    if (!this.inFlightTimer) return;
    if (entry && this.inFlightTimer.entry !== entry) return;
    clearTimeout(this.inFlightTimer.handle);
    this.inFlightTimer = null;
  }

  /**
   * Re-arms the running action's timeout to `ms` from now. The renderer uses
   * this (through the MCP bridge) to give the user time to approve a sensitive
   * action, then to restart the execution clock once it is approved. Returns
   * false when nothing current is in flight, e.g. after STOP NOW.
   */
  extendInFlightTimeout(ms: number): boolean {
    const entry = this.inFlightEntry;
    const record = this.inFlight;
    if (!entry || !record || !Number.isFinite(ms) || ms <= 0) return false;
    if (this.inFlightGeneration !== this.generation) return false;
    this.armInFlightTimeout(entry, record, this.inFlightGeneration, ms);
    return true;
  }

  /**
   * Single settlement path. If the generation is stale (STOP NOW happened),
   * the terminal status is still recorded honestly — but no further scheduling
   * occurs and no queued work runs.
   */
  private settle(
    entry: QueueEntry,
    record: ActionRecord,
    generation: number,
    outcome: 'completed' | 'failed',
    error?: string,
    _result?: unknown
  ): void {
    if (record.endedAt !== undefined) return;
    this.clearInFlightTimer(entry);
    if (this.inFlightEntry === entry) {
      this.inFlightEntry = null;
      this.inFlight = null;
    }

    if (generation === this.generation) {
      this.finalize(record, outcome, error ? { error } : undefined);
      entry.resolve(record);
      this.afterAction();
      return;
    }

    if (this.lastFinalState) this.lastFinalState.inFlightSettledLater = true;
    this.finalize(record, outcome, {
      ...(error ? { error } : {}),
      stoppedBy: this.stopReason ?? record.stoppedBy
    });
    entry.resolve(record);
    if (this.state === 'stopping') this.finalizeStop();
  }

  private afterAction(): void {
    if (this.state === 'stopping') {
      this.finalizeStop();
      return;
    }
    if (this.phase) this.evaluatePhaseStatus();
    this.afterBoundaryCheck();
  }

  private afterBoundaryCheck(): void {
    if (this.mode === 'step' || this.pauseOnBoundary) {
      this.pauseOnBoundary = false;
      if (this.state === 'running') {
        this.transition('paused', this.mode === 'step' ? 'next-step boundary reached' : 'action boundary reached');
      }
      return;
    }
    this.pump();
  }

  // -------------------------------------------------------------- approvals

  private beginApproval(entry: QueueEntry, record: ActionRecord): void {
    this.approvalEntry = { entry, record };
    this.pendingApproval = {
      actionId: record.id,
      toolName: record.toolName,
      args: record.args,
      summary: record.summary,
      domain: record.domain
    };
    this.transition('awaiting_approval', `approval required for ${record.toolName}`);
    this.emit({ type: 'approval_needed', approval: { ...this.pendingApproval } });

    const generation = this.generation;
    const approval = this.pendingApproval;
    void this.options.askApproval!(approval)
      .then((approved) => {
        if (generation !== this.generation) return;
        if (this.pendingApproval?.actionId !== approval.actionId) return;
        this.respondToApproval(approval.actionId, approved);
      })
      .catch(() => {
        if (generation !== this.generation) return;
        if (this.pendingApproval?.actionId !== approval.actionId) return;
        this.respondToApproval(approval.actionId, false);
      });
  }

  /** Called by the approval UI. An approval binds to exactly one action id. */
  respondToApproval(actionId: string, approved: boolean): boolean {
    if (!this.pendingApproval || this.pendingApproval.actionId !== actionId) return false;
    if (!this.approvalEntry || this.approvalEntry.record.id !== actionId) return false;

    const { entry, record } = this.approvalEntry;
    this.approvalEntry = null;
    this.pendingApproval = null;
    this.emit({ type: 'approval_resolved', actionId, approved });

    if (!approved) {
      this.finalize(record, 'rejected', { error: 'Rejected by user.' });
      entry.resolve(record);
      if (this.state === 'awaiting_approval') this.transition('running', 'approval rejected');
      this.afterBoundaryCheck();
      return true;
    }

    const wasPaused = this.state === 'paused';
    if (this.state === 'awaiting_approval' || this.state === 'paused') {
      this.transition('running', 'approval granted');
    }
    if (wasPaused) this.pauseOnBoundary = true;
    void this.execute(entry, record);
    return true;
  }

  // ---------------------------------------------------------------- controls

  /** §10 Next Step — execute exactly one action, then pause. */
  nextStep(): void {
    this.assertNotStopped('next step');
    this.mode = 'step';
    if (this.state === 'idle') this.transition('running', 'next-step requested');
    if (this.state === 'paused') this.transition('running', 'next-step resume');
    this.pump();
  }

  /** §10 Full Control / Auto-run — allowed actions run automatically. */
  setAutoRun(): void {
    this.assertNotStopped('auto-run');
    this.mode = 'auto';
    if (this.state === 'paused') this.transition('running', 'auto-run selected');
    this.pump();
  }

  /** §10 Pause — stop scheduling new actions at a safe boundary. */
  pause(): void {
    if (this.state === 'running' || this.state === 'awaiting_approval') {
      this.transition('paused', 'user paused');
    }
  }

  /** §10 Resume — continue from the saved execution state. */
  resume(): void {
    if (this.state !== 'paused' && this.state !== 'stopped') return;
    if (this.state === 'stopped') {
      this.generation++;
      this.stopReason = null;
      this.mode = 'auto';
      this.runActionsUsed = 0;
    }
    this.transition('running', 'user resumed');
    this.pump();
  }

  /** §10 STOP NOW — emergency stop. Synchronous acknowledgement. */
  stop(reason: string): { accepted: true; inFlightAborted: boolean; cancelled: number; finalStateNote: string } {
    if (this.state === 'stopping' || this.state === 'stopped') {
      return { accepted: true, inFlightAborted: false, cancelled: 0, finalStateNote: `already ${this.state}` };
    }

    this.stopReason = reason;
    this.generation++;

    const hadInFlight = this.inFlightEntry !== null;
    let cancelled = 0;

    for (const entry of this.queue) {
      const record = this.buildRecord(entry, 'cancelled');
      record.endedAt = this.now();
      record.stoppedBy = reason;
      record.error = `Cancelled by STOP NOW: ${reason}`;
      const index = this.history.findIndex(r => r.id === record.id);
      const snapshot = { ...record };
      if (index >= 0) this.history[index] = snapshot;
      else this.history.push(snapshot);
      this.publish(record);
      entry.resolve(record);
      cancelled++;
    }
    this.queue = [];

    if (this.approvalEntry) {
      const { entry, record } = this.approvalEntry;
      this.approvalEntry = null;
      const approvalId = record.id;
      this.pendingApproval = null;
      this.finalize(record, 'cancelled', {
        stoppedBy: reason,
        error: `Cancelled by STOP NOW: ${reason}`
      });
      entry.resolve(record);
      this.emit({ type: 'approval_resolved', actionId: approvalId, approved: false });
    }

    let inFlightAborted = false;
    if (hadInFlight && this.options.abortInFlight) {
      try {
        this.options.abortInFlight(reason);
        inFlightAborted = true;
      } catch {
        inFlightAborted = false;
      }
    }

    this.transition('stopping', `STOP NOW: ${reason}`);
    this.lastFinalState = { stoppedBy: reason, inFlightAborted, inFlightSettledLater: false };

    if (hadInFlight) {
      if (this.inFlight) this.inFlight.stoppedBy = reason;
    } else {
      this.finalizeStop();
    }

    return {
      accepted: true,
      inFlightAborted,
      cancelled,
      finalStateNote: hadInFlight
        ? (inFlightAborted
          ? 'In-flight action was signalled for abortion; its final status will be reported honestly when it settles.'
          : 'An operation was running and could not be interrupted instantly; it will be reported honestly when it settles.')
        : 'No operation was running; all queued actions were cancelled.'
    };
  }

  private finalizeStop(): void {
    if (this.state !== 'stopping') return;
    this.inFlight = null;
    this.inFlightEntry = null;
    this.transition('stopped', 'STOP NOW settled — explicit resume required');
  }

  /** §10 Emergency Close — refuse further work without claiming processes died. */
  emergencyClose(reason: string): { accepted: true; note: string } {
    const result = this.stop(reason);
    return {
      accepted: true,
      note: `${result.finalStateNote} Emergency close requested; the engine will not schedule further actions.`
    };
  }

  private assertNotStopped(command: string): void {
    if (this.state === 'stopping' || this.state === 'stopped' || this.state === 'error') {
      throw new Error(`Cannot ${command}: engine is ${this.state}. Explicit resume or new run is required.`);
    }
  }

  // ------------------------------------------------------------------ phases

  /** §10 Next Phase — run one explicitly defined phase and pause at its boundary. */
  runPhase(phase: PhaseDefinition): void {
    this.assertNotStopped('run phase');
    if (!phase || typeof phase.objective !== 'string' || !phase.objective.trim()) {
      throw new Error('Phase definition requires a non-empty objective.');
    }
    if (!Array.isArray(phase.permittedActions) || phase.permittedActions.length === 0) {
      throw new Error('Phase definition requires a non-empty permittedActions allowlist.');
    }
    if (!Number.isFinite(phase.maxActions) || phase.maxActions < 1) {
      throw new Error('Phase definition requires maxActions >= 1.');
    }
    this.phase = { ...phase, permittedActions: [...phase.permittedActions] };
    this.phaseActionsUsed = 0;
    this.emit({ type: 'phase_updated', phase: { ...this.phase }, actionsUsed: 0, status: 'running' });
    if (this.state === 'paused' || this.state === 'idle') this.transition('running', 'phase started');
    this.pump();
  }

  cancelPhase(): void {
    this.phase = null;
    this.phaseActionsUsed = 0;
    this.emit({ type: 'phase_updated', phase: null, actionsUsed: 0, status: 'boundary' });
  }

  private evaluatePhaseStatus(): void {
    const phase = this.phase;
    if (!phase) return;

    const used = this.phaseActionsUsed;
    if (used >= phase.maxActions) {
      this.emit({ type: 'phase_updated', phase: { ...phase }, actionsUsed: used, status: 'boundary' });
      if (this.state === 'running') this.transition('paused', 'phase action budget exhausted');
      return;
    }

    const evaluator = this.options.evaluateCondition;
    if (!evaluator || !phase.completionConditions?.length) return;

    const context: EngineRunContext = { phase, phaseActionsUsed: used, history: this.history };
    void (async () => {
      for (const condition of phase.completionConditions!) {
        let met = false;
        try { met = await evaluator(condition, context); } catch { met = false; }
        if (this.phase !== phase) return;
        if (met) {
          this.emit({ type: 'phase_updated', phase: { ...phase }, actionsUsed: used, status: 'completed' });
          this.phase = null;
          this.phaseActionsUsed = 0;
          if (this.state === 'running') this.transition('paused', `phase completed: ${phase.objective}`);
          return;
        }
      }
    })();
  }
}
