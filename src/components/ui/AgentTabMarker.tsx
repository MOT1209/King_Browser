import React from 'react';
import { Bot } from 'lucide-react';
import { useTranslation } from '../../services/i18n';
import { useAgentTakenOver } from '../../services/agentTabStore';

/**
 * Overlay that marks a tab the agent is working in: an amber ring around the
 * tab and a small robot badge. The parent must be `relative`.
 */
export function AgentTabMarker({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const takenOver = useAgentTakenOver();
  const label = t(takenOver ? 'agentPanel.tabMarkerTakenOver' : 'agentPanel.tabMarker');
  return (
    <>
      <span aria-hidden="true" className={`pointer-events-none absolute inset-0 rounded-[inherit] ring-2 ring-inset ${takenOver ? 'ring-sky-400/90' : 'ring-amber-400/90'}`} />
      <span
        role="img"
        aria-label={label}
        title={label}
        className={`absolute top-0.5 start-0.5 z-20 flex items-center justify-center rounded-full ${takenOver ? 'bg-sky-400' : 'bg-amber-400'} text-slate-900 shadow-xs ${compact ? 'w-3 h-3' : 'w-3.5 h-3.5'}`}
      >
        <Bot className={compact ? 'w-2 h-2' : 'w-2.5 h-2.5'} />
      </span>
    </>
  );
}
