/**
 * §10 Agent control panel — the human control surface over the §11 execution
 * engine and §12 policy decisions.
 *
 * Collapsed it is a small status pill the user can drag anywhere, close, or
 * hide while idle (placement rules in utils/agentPillPlacement.ts; a pending
 * approval always brings it back). Expanded it shows live
 * engine state, phase progress, the approval queue, run controls (Full control,
 * Next step, Pause, Resume), a prominent STOP NOW, Emergency close, and recent
 * activity. STOP NOW acknowledges synchronously in the engine and reports its
 * honest result — the panel never claims an action was interrupted when the
 * engine says it could not be.
 */

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  ChevronDown,
  Hand,
  Download,
  AlertTriangle,
  GripVertical,
  Play,
  Pause as PauseIcon,
  SkipForward,
  Square,
  X
} from 'lucide-react';
import { getElectronAPI } from '../utils/electronBridge';
import { useTranslation } from '../services/i18n';
import { formatBinding, matchesShortcut } from '../utils/keyboardShortcuts';
import { isMac } from '../utils/appConstants';
import { buildDefaultShortcuts } from '../utils/shortcutCatalog';
import { setAgentEngineState } from '../services/agentTabStore';
import {
  clampPillPosition,
  defaultPillPosition,
  isDragGesture,
  parseStoredPillPosition,
  shouldShowPill,
  type PillPoint
} from '../utils/agentPillPlacement';
import type { ShortcutConfig } from '../types/browser';
import type {
  ElectronEngineActionRecord,
  ElectronEngineStatus
} from '../vite-env';

const HISTORY_LIMIT = 6;
const POSITION_STORAGE_KEY = 'king_agent_pill_position';
const PANEL_WIDTH = 384;

type Translate = ReturnType<typeof useTranslation>['t'];

function formatAge(timestamp: number, now: number, t: Translate): string {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 60) return t('agentPanel.ageSeconds', { count: seconds });
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return t('agentPanel.ageMinutes', { count: minutes });
  return t('agentPanel.ageHours', { count: Math.round(minutes / 60) });
}

const STATUS_KEYS: Record<ElectronEngineActionRecord['status'], string> = {
  requested: 'agentPanel.statusRequested',
  running: 'agentPanel.statusRunning',
  completed: 'agentPanel.statusCompleted',
  failed: 'agentPanel.statusFailed',
  cancelled: 'agentPanel.statusCancelled',
  rejected: 'agentPanel.statusRejected'
};

function readStoredPosition(): PillPoint | null {
  try {
    return parseStoredPillPosition(localStorage.getItem(POSITION_STORAGE_KEY));
  } catch {
    return null;
  }
}

function storePosition(point: PillPoint | null) {
  try {
    if (point) localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(point));
    else localStorage.removeItem(POSITION_STORAGE_KEY);
  } catch {
    // Storage unavailable: the position simply resets next launch.
  }
}

function statusTone(status: ElectronEngineActionRecord['status']): string {
  switch (status) {
    case 'completed':
      return 'text-emerald-600 dark:text-emerald-400';
    case 'failed':
      return 'text-red-600 dark:text-red-400';
    case 'cancelled':
    case 'rejected':
      return 'text-amber-600 dark:text-amber-400';
    default:
      return 'text-gray-500 dark:text-gray-400';
  }
}

export interface AgentControlPanelProps {
  shortcuts?: Record<string, ShortcutConfig>;
  hideWhenIdle?: boolean;
  hidden?: boolean;
  onHiddenChange?: (hidden: boolean) => void;
  /** The active page, named to the agent on hand-back. Undefined when the agent must not learn it. */
  activeTabUrl?: string;
}

export function AgentControlPanel({
  shortcuts: shortcutsProp,
  hideWhenIdle = true,
  hidden = false,
  onHiddenChange,
  activeTabUrl
}: AgentControlPanelProps) {
  const { t, isRTL } = useTranslation();
  const shortcuts = useMemo(
    () => ({ ...buildDefaultShortcuts(isMac), ...shortcutsProp }),
    [shortcutsProp]
  );
  const api = useMemo(() => getElectronAPI(), []);
  const supported = Boolean(
    api &&
      typeof api.getEngineStatus === 'function' &&
      typeof api.sendEngineCommand === 'function' &&
      typeof api.onEngineEvent === 'function'
  );

  const [status, setStatus] = useState<ElectronEngineStatus | null>(null);
  const [history, setHistory] = useState<ElectronEngineActionRecord[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    if (!supported || !api) return;
    try {
      const [nextStatus, nextHistory] = await Promise.all([
        api.getEngineStatus(),
        api.getEngineHistory()
      ]);
      setStatus(nextStatus);
      setHistory(nextHistory.slice(-HISTORY_LIMIT).reverse());
    } catch {
      // Engine not reachable yet (server not started) — keep last known state.
    }
  }, [api, supported]);

  useEffect(() => {
    if (!supported || !api) return;
    void refresh();
    const unsubscribe = api.onEngineEvent(() => {
      void refresh();
    });
    return unsubscribe;
  }, [api, supported, refresh]);

  const exportLog = useCallback(async () => {
    if (!api) return;
    try {
      const json = await api.exportEngineLog('json');
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `king_agent_activity_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      setError(t('agentPanel.exportFailed'));
    }
  }, [api, t]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [open]);

  const pending = status?.pendingApproval ?? null;


  useEffect(() => {
    if (pending) setOpen(true);
  }, [pending?.actionId]);

  const runCommand = useCallback(
    async (command: string, payload?: unknown) => {
      if (!supported || !api) return;
      setBusy(command);
      setError(null);
      try {
        await api.sendEngineCommand(command, payload);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(null);
        setNow(Date.now());
        void refresh();
      }
    },
    [api, supported, refresh]
  );

  const respondApproval = useCallback(
    async (actionId: string, approved: boolean) => {
      if (!supported || !api) return;
      setError(null);
      try {
        await api.respondEngineApproval(actionId, approved);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        void refresh();
      }
    },
    [api, supported, refresh]
  );

  const takenOver = Boolean(status?.takenOver);
  const toggleTakeOver = useCallback(
    () => runCommand(takenOver ? 'hand_back' : 'take_over', takenOver ? { url: activeTabUrl } : undefined),
    [runCommand, takenOver, activeTabUrl]
  );

  // The tab strip and page frame mark the tab the agent works in, and change
  // color while the human drives.
  useEffect(() => {
    setAgentEngineState(status?.state ?? null, takenOver);
  }, [status?.state, takenOver]);

  useEffect(() => {
    if (!supported) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (matchesShortcut(shortcuts.agentTakeOver, event, isMac)) {
        event.preventDefault();
        setOpen(true);
        void toggleTakeOver();
      } else if (matchesShortcut(shortcuts.toggleAgentPanel, event, isMac)) {
        event.preventDefault();
        setOpen(value => !value);
      } else if (matchesShortcut(shortcuts.toggleAgentPill, event, isMac)) {
        event.preventDefault();
        if (hidden) {
          onHiddenChange?.(false);
        } else {
          setOpen(false);
          onHiddenChange?.(true);
        }
      } else if (matchesShortcut(shortcuts.agentStopNow, event, isMac)) {
        event.preventDefault();
        setOpen(true);
        void runCommand('stop');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [supported, shortcuts, hidden, onHiddenChange, runCommand, toggleTakeOver]);

  // Pill placement: physical pixels from the top-left, so the RTL stylesheet
  // that mirrors `right-*` utilities cannot push it onto the side panel.
  const pillRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<PillPoint | null>(() => readStoredPosition());
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  const [pillSize, setPillSize] = useState({ width: 140, height: 34 });
  const dragRef = useRef<{ pointerId: number; start: PillPoint; origin: PillPoint; last: PillPoint | null } | null>(null);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    const onResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useLayoutEffect(() => {
    const node = pillRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    if (rect.width && (Math.round(rect.width) !== pillSize.width || Math.round(rect.height) !== pillSize.height)) {
      setPillSize({ width: Math.round(rect.width), height: Math.round(rect.height) });
    }
  });

  const placed = position
    ? clampPillPosition(position, pillSize, viewport)
    : defaultPillPosition(pillSize, viewport, isRTL);

  const onPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    dragRef.current = {
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      origin: placed,
      last: null
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const current = { x: event.clientX, y: event.clientY };
    if (!drag.last && !isDragGesture(drag.start, current)) return;
    drag.last = clampPillPosition(
      { x: drag.origin.x + current.x - drag.start.x, y: drag.origin.y + current.y - drag.start.y },
      pillSize,
      viewport
    );
    setPosition(drag.last);
  };

  const onPointerUp = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (drag.last) {
      suppressClickRef.current = true;
      storePosition(drag.last);
    }
  };

  const resetPosition = () => {
    setPosition(null);
    storePosition(null);
  };

  const onPillKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    const step = event.shiftKey ? 40 : 10;
    const delta: Record<string, PillPoint> = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step }
    };
    const move = delta[event.key];
    if (!move) return;
    event.preventDefault();
    const next = clampPillPosition({ x: placed.x + move.x, y: placed.y + move.y }, pillSize, viewport);
    setPosition(next);
    storePosition(next);
  };

  if (!supported) return null;
  if (!status) return null;

  const state = status.state;
  const isStopped = state === 'stopped' || state === 'stopping';
  // While the human drives, only hand-back and STOP NOW apply.
  const canAutoRun = !isStopped && state !== 'error' && !takenOver;
  const canPause = (state === 'running' || state === 'awaiting_approval') && !takenOver;
  const canResume = (state === 'paused' || state === 'stopped') && !takenOver;
  const canTakeOver = takenOver || (!isStopped && state !== 'error');

  const pillTone = takenOver
    ? 'bg-sky-500'
    : pending
    ? 'bg-amber-500'
    : state === 'running'
      ? 'bg-emerald-500'
      : state === 'paused'
        ? 'bg-blue-500'
        : isStopped
          ? 'bg-red-500'
          : state === 'error'
            ? 'bg-red-600'
            : 'bg-gray-400';

  const visible = shouldShowPill({
    state,
    hasPendingApproval: Boolean(pending),
    queueLength: status.queueLength,
    panelOpen: open,
    hiddenByUser: hidden,
    hideWhenIdle,
    takenOver
  });
  if (!visible) return null;

  // The panel opens on whichever side of the pill has room, and stays on
  // screen when the pill sits near an edge.
  const opensUp = placed.y + pillSize.height / 2 > viewport.height / 2;
  const panelWidth = Math.min(PANEL_WIDTH, viewport.width - 32);
  const panelLeft = Math.min(
    Math.max(16, placed.x + pillSize.width - panelWidth),
    viewport.width - panelWidth - 16
  );
  const panelStyle: React.CSSProperties = opensUp
    ? { left: panelLeft, bottom: viewport.height - placed.y + 8, width: panelWidth, maxHeight: Math.max(160, placed.y - 24) }
    : { left: panelLeft, top: placed.y + pillSize.height + 8, width: panelWidth, maxHeight: Math.max(160, viewport.height - placed.y - pillSize.height - 24) };
  const panelShortcut = formatBinding(shortcuts.toggleAgentPanel, isMac);
  const pillShortcut = formatBinding(shortcuts.toggleAgentPill, isMac);
  const takeOverShortcut = formatBinding(shortcuts.agentTakeOver, isMac);

  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-label={t('agentPanel.title')}
          style={panelStyle}
          className="fixed z-50 overflow-y-auto rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-2xl"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <Bot size={16} className="text-gray-500 dark:text-gray-400" />
              <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
                {t('agentPanel.title')}
              </span>
              <span className={`w-2 h-2 rounded-full ${pillTone} ${pending ? 'animate-pulse' : ''}`} />
            </div>
            <button
              type="button"
              aria-label={t('agentPanel.expand')}
              onClick={() => setOpen(false)}
              className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
            >
              <ChevronDown size={16} />
            </button>
          </div>

          <div className="px-4 py-3 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-gray-900 dark:text-gray-100">
                {t(`agentPanel.states.${state}`)}
              </span>
              <span className="text-gray-500 dark:text-gray-400">
                {t(`agentPanel.modes.${status.mode}`)} · {t('agentPanel.queue', { count: status.queueLength })}
              </span>
            </div>

            <div className="text-xs text-gray-600 dark:text-gray-300">
              {status.inFlight
                ? t('agentPanel.inFlight', { tool: status.inFlight.toolName })
                : t('agentPanel.noAction')}
              <span className="block text-gray-400 dark:text-gray-500 mt-0.5">
                {t('agentPanel.actionsUsed', {
                  used: status.actionsUsedThisRun,
                  max: status.maxActionsPerRun
                })}
              </span>
            </div>

            {status.phase && (
              <div className="rounded-xl border border-gray-100 dark:border-gray-800 px-3 py-2 text-xs">
                <div className="font-medium text-gray-800 dark:text-gray-200">
                  {t('agentPanel.phase', { objective: status.phase.phase.objective })}
                </div>
                <div className="text-gray-500 dark:text-gray-400 mt-0.5">
                  {t('agentPanel.phaseActions', {
                    used: status.phase.actionsUsed,
                    max: status.phase.phase.maxActions
                  })}
                </div>
              </div>
            )}

            {status.stopReason && (
              <div className="rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 px-3 py-2 text-xs text-red-700 dark:text-red-300">
                {t('agentPanel.stopReason', { reason: status.stopReason })}
                <span className="block mt-0.5">{t('agentPanel.resumeRequired')}</span>
              </div>
            )}

            {pending && (
              <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800 dark:text-amber-300">
                  <AlertTriangle size={13} />
                  {pending.toolName === 'browser_login' ? t('agentPanel.loginTitle') : t('agentPanel.approvalTitle')}
                </div>
                <div className="text-xs text-gray-700 dark:text-gray-300">
                  {pending.toolName === 'browser_login'
                    ? t('agentPanel.loginMessage')
                    : t('agentPanel.approvalTool', { tool: pending.toolName })}
                  {pending.domain && (
                    <span className="block text-gray-500 dark:text-gray-400">
                      {t('agentPanel.approvalDomain', { domain: pending.domain })}
                    </span>
                  )}
                  {pending.summary && <span className="block mt-0.5">{pending.summary}</span>}
                </div>
                {pending.details && pending.details.length > 0 && (
                  <ul
                    data-testid="approval-details"
                    className="rounded-lg bg-white/70 dark:bg-black/20 border border-amber-200 dark:border-amber-900 px-2.5 py-1.5 space-y-0.5 text-xs text-gray-800 dark:text-gray-200"
                  >
                    {pending.details.map((line, index) => (
                      <li key={index} className="break-words" dir="auto">
                        {line.kind === 'other'
                          ? line.text
                          : <><span className="font-semibold">{t(`agentPanel.approvalDetails.${line.kind}`)}:</span> {line.text}</>}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={() => void respondApproval(pending.actionId, true)}
                    className="flex-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold py-1.5"
                  >
                    {pending.toolName === 'browser_login' ? t('agentPanel.loginYes') : t('agentPanel.approve')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void respondApproval(pending.actionId, false)}
                    className="flex-1 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-100 text-xs font-semibold py-1.5"
                  >
                    {pending.toolName === 'browser_login' ? t('agentPanel.loginNo') : t('agentPanel.reject')}
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 px-3 py-2 text-xs text-red-700 dark:text-red-300 break-words">
                {t('agentPanel.commandFailed', { error })}
              </div>
            )}

            {takenOver && (
              <div className="rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-900 px-3 py-2 text-xs text-sky-800 dark:text-sky-200">
                {t('agentPanel.takenOverNotice')}
              </div>
            )}

            <button
              type="button"
              disabled={!canTakeOver || busy !== null}
              onClick={() => void toggleTakeOver()}
              title={`${t('agentPanel.takeOverHint')}${takeOverShortcut ? ` (${takeOverShortcut})` : ''}`}
              className={`w-full flex items-center justify-center gap-1.5 rounded-xl disabled:opacity-40 text-sm font-semibold py-2.5 ${
                takenOver
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  : 'bg-sky-600 hover:bg-sky-500 text-white'
              }`}
            >
              <Hand size={14} />
              {takenOver ? t('agentPanel.handBack') : t('agentPanel.takeOver')}
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={!canAutoRun || busy !== null}
                onClick={() => void runCommand('auto_run')}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 text-xs font-medium text-gray-800 dark:text-gray-200 py-2"
              >
                <Play size={13} />
                {t('agentPanel.autoRun')}
              </button>
              <button
                type="button"
                disabled={!canAutoRun || busy !== null}
                onClick={() => void runCommand('next_step')}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 text-xs font-medium text-gray-800 dark:text-gray-200 py-2"
              >
                <SkipForward size={13} />
                {t('agentPanel.nextStep')}
              </button>
              <button
                type="button"
                disabled={!canPause || busy !== null}
                onClick={() => void runCommand('pause')}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 text-xs font-medium text-gray-800 dark:text-gray-200 py-2"
              >
                <PauseIcon size={13} />
                {t('agentPanel.pause')}
              </button>
              <button
                type="button"
                disabled={!canResume || busy !== null}
                onClick={() => void runCommand('resume')}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 text-xs font-medium text-gray-800 dark:text-gray-200 py-2"
              >
                <Play size={13} />
                {t('agentPanel.resume')}
              </button>
              {status.phase && (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void runCommand('cancel_phase')}
                  className="col-span-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 text-xs font-medium text-gray-800 dark:text-gray-200 py-2"
                >
                  {t('agentPanel.cancelPhase')}
                </button>
              )}
            </div>

            <div className="space-y-1.5">
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void runCommand('stop')}
                className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white text-sm font-bold py-2.5"
                title={t('agentPanel.stopNowHint')}
              >
                <Square size={14} fill="currentColor" />
                {t('agentPanel.stopNow')}
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void runCommand('emergency_close')}
                className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-40 text-xs font-semibold py-2"
              >
                <X size={13} />
                {t('agentPanel.emergencyClose')}
              </button>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                  {t('agentPanel.history')}
                </div>
                <button
                  type="button"
                  onClick={() => void exportLog()}
                  aria-label={t('agentPanel.exportLog')}
                  title={t('agentPanel.exportLog')}
                  className="p-1 rounded-md text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <Download size={13} />
                </button>
              </div>
              {history.length === 0 ? (
                <div className="text-xs text-gray-400 dark:text-gray-500">{t('agentPanel.noHistory')}</div>
              ) : (
                <ul className="space-y-1">
                  {history.map(record => (
                    <li
                      key={record.id}
                      className="flex items-center justify-between gap-2 text-xs bg-gray-50 dark:bg-gray-800/60 rounded-lg px-2.5 py-1.5"
                    >
                      <span className="truncate text-gray-800 dark:text-gray-200" dir="ltr">{record.toolName}</span>
                      <span className={`shrink-0 font-medium ${statusTone(record.status)}`}>
                        {t(STATUS_KEYS[record.status] ?? 'agentPanel.statusRequested')} · {formatAge(record.endedAt ?? record.requestedAt, now, t)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      <div
        ref={pillRef}
        style={{ left: placed.x, top: placed.y }}
        className="fixed z-50 flex items-center rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg hover:shadow-xl select-none"
      >
        <span
          role="button"
          tabIndex={0}
          aria-label={t('agentPanel.moveHint')}
          title={t('agentPanel.moveHint')}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={resetPosition}
          onKeyDown={onPillKeyDown}
          className="flex items-center ps-1.5 py-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-grab active:cursor-grabbing touch-none"
        >
          <GripVertical size={13} />
        </span>
        <button
          type="button"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onClick={() => {
            if (suppressClickRef.current) {
              suppressClickRef.current = false;
              return;
            }
            setOpen(value => !value);
          }}
          aria-expanded={open}
          aria-label={t('agentPanel.expand')}
          title={panelShortcut ? `${t('agentPanel.expand')} (${panelShortcut})` : t('agentPanel.expand')}
          className="flex items-center gap-2 ps-1.5 pe-2 py-1.5 touch-none"
        >
          <span className={`w-2 h-2 rounded-full ${pillTone} ${pending ? 'animate-pulse' : ''}`} />
          <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 whitespace-nowrap">
            {takenOver ? t('agentPanel.takenOverPill') : t(`agentPanel.states.${state}`)}
          </span>
          {pending && <AlertTriangle size={13} className="text-amber-500" />}
          {status.queueLength > 0 && (
            <span className="text-[10px] font-bold rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-1.5 py-0.5">
              {status.queueLength}
            </span>
          )}
        </button>
        {!pending && (
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onHiddenChange?.(true);
            }}
            aria-label={t('agentPanel.hidePill')}
            title={pillShortcut ? t('agentPanel.hidePillHint', { shortcut: pillShortcut }) : t('agentPanel.hidePill')}
            className="me-1 p-1 rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X size={12} />
          </button>
        )}
      </div>
    </>
  );
}
