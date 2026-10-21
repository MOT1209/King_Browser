/**
 * §10 Agent control panel — the human control surface over the §11 execution
 * engine and §12 policy decisions.
 *
 * Collapsed it is a small status pill (bottom-right); expanded it shows live
 * engine state, phase progress, the approval queue, run controls (Full control,
 * Next step, Pause, Resume), a prominent STOP NOW, Emergency close, and recent
 * activity. STOP NOW acknowledges synchronously in the engine and reports its
 * honest result — the panel never claims an action was interrupted when the
 * engine says it could not be.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bot,
  ChevronDown,
  AlertTriangle,
  Play,
  Pause as PauseIcon,
  SkipForward,
  Square,
  X
} from 'lucide-react';
import { getElectronAPI } from '../utils/electronBridge';
import { useTranslation } from '../services/i18n';
import type {
  ElectronEngineActionRecord,
  ElectronEngineStatus
} from '../vite-env';

const HISTORY_LIMIT = 6;

function formatAge(timestamp: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.round(minutes / 60)}h`;
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

export function AgentControlPanel() {
  const { t } = useTranslation();
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

  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [open]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && (event.key === '.' || event.code === 'Period')) {
        event.preventDefault();
        setOpen(value => !value);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

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

  if (!supported) return null;
  if (!status) return null;

  const state = status.state;
  const isStopped = state === 'stopped' || state === 'stopping';
  const canAutoRun = !isStopped && state !== 'error';
  const canPause = state === 'running' || state === 'awaiting_approval';
  const canResume = state === 'paused' || state === 'stopped';

  const pillTone = pending
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

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2" dir="ltr">
      {open && (
        <div className="w-96 max-w-[calc(100vw-2rem)] max-h-[75vh] overflow-y-auto rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-2xl">
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
                  {t('agentPanel.approvalTitle')}
                </div>
                <div className="text-xs text-gray-700 dark:text-gray-300">
                  {t('agentPanel.approvalTool', { tool: pending.toolName })}
                  {pending.domain && (
                    <span className="block text-gray-500 dark:text-gray-400">
                      {t('agentPanel.approvalDomain', { domain: pending.domain })}
                    </span>
                  )}
                  {pending.summary && <span className="block mt-0.5">{pending.summary}</span>}
                </div>
                <div className="flex gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={() => void respondApproval(pending.actionId, true)}
                    className="flex-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold py-1.5"
                  >
                    {t('agentPanel.approve')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void respondApproval(pending.actionId, false)}
                    className="flex-1 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-100 text-xs font-semibold py-1.5"
                  >
                    {t('agentPanel.reject')}
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 px-3 py-2 text-xs text-red-700 dark:text-red-300 break-words">
                {t('agentPanel.commandFailed', { error })}
              </div>
            )}

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
              <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                {t('agentPanel.history')}
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
                      <span className="truncate text-gray-800 dark:text-gray-200">{record.toolName}</span>
                      <span className={`shrink-0 font-medium ${statusTone(record.status)}`}>
                        {record.status} · {formatAge(record.endedAt ?? record.requestedAt, now)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        aria-label={t('agentPanel.expand')}
        title={`${t('agentPanel.expand')} (${t('agentPanel.shortcutHint')})`}
        className="flex items-center gap-2 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg px-3 py-1.5 hover:shadow-xl"
      >
        <span className={`w-2 h-2 rounded-full ${pillTone} ${pending ? 'animate-pulse' : ''}`} />
        <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">
          {t(`agentPanel.states.${state}`)}
        </span>
        {pending && <AlertTriangle size={13} className="text-amber-500" />}
        {status.queueLength > 0 && (
          <span className="text-[10px] font-bold rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-1.5 py-0.5">
            {status.queueLength}
          </span>
        )}
      </button>
    </div>
  );
}
