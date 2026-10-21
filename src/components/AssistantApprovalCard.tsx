import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { orchestrator, type QueuedAction } from '../services/agentOrchestrator';
import { useTranslation } from '../services/i18n';

const SENSITIVE_ARG_KEY = /pass|secret|token|otp|cvv|cvc|card|ssn|pin/i;

/** Short, display-only description of an action's arguments. */
export function describeActionArgs(args: unknown): string {
  if (!args || typeof args !== 'object') return '';
  return Object.entries(args as Record<string, unknown>)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => {
      const shown = SENSITIVE_ARG_KEY.test(key) ? '••••••' : (typeof value === 'string' ? value : JSON.stringify(value));
      return `${key}: ${String(shown).slice(0, 80)}`;
    })
    .join(' · ')
    .slice(0, 240);
}

/**
 * Approval prompt for actions the in-app assistant queues in the orchestrator.
 * The assistant waits on these before clicking, typing or changing data; without
 * this card nothing could answer them and they were denied after five minutes.
 */
export const AssistantApprovalCard: React.FC = () => {
  const { t } = useTranslation();
  const [pending, setPending] = useState<QueuedAction | null>(null);

  useEffect(() => {
    const unsubscribe = orchestrator.subscribe(actions => {
      setPending(actions.find(action => action.state === 'pending') ?? null);
    });
    return () => { unsubscribe(); };
  }, []);

  if (!pending) return null;
  const details = describeActionArgs(pending.args);

  return (
    <div role="alertdialog" aria-label={t('agentPanel.approvalTitle')}
      className="mx-3 my-2 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800 dark:text-amber-300">
        <AlertTriangle size={13} />
        {t('agentPanel.approvalTitle')}
      </div>
      <div className="text-xs text-gray-700 dark:text-gray-300">
        {t('agentPanel.approvalTool', { tool: pending.toolName })}
        {details && <span className="block mt-0.5 break-words text-gray-500 dark:text-gray-400">{details}</span>}
      </div>
      <div className="flex gap-2 pt-0.5">
        <button
          type="button"
          onClick={() => orchestrator.approveAction(pending.id)}
          className="flex-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold py-1.5"
        >
          {t('agentPanel.approve')}
        </button>
        <button
          type="button"
          onClick={() => orchestrator.denyAction(pending.id)}
          className="flex-1 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-100 text-xs font-semibold py-1.5"
        >
          {t('agentPanel.reject')}
        </button>
      </div>
    </div>
  );
};
