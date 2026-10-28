import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MousePointer2, Keyboard, ShieldAlert } from 'lucide-react';
import { generateId } from '../utils/idGenerator';
import { getElectronAPI } from '../utils/electronBridge';
import { mergeActivity, toActivityLine } from '../utils/agentActivity';
import { useTranslation } from '../services/i18n';
import type { ElectronEngineActionRecord, ElectronEnginePendingApproval } from '../vite-env';

export interface AICursorEvent {
  x: number;
  y: number;
  action: 'move' | 'click' | 'type';
  text?: string;
  /** The text is a secret: `text` already holds the mask, never the value. */
  masked?: boolean;
}

const IDLE_HIDE_MS = 8000;
/** The action strip fades away once the agent has been quiet this long. */
const STRIP_HIDE_MS = 20000;

const STATUS_DOT: Record<string, string> = {
  completed: 'bg-emerald-400',
  running: 'bg-cyan-400 animate-pulse',
  requested: 'bg-amber-400 animate-pulse',
  failed: 'bg-red-400',
  rejected: 'bg-red-400',
  cancelled: 'bg-slate-400'
};

const STATUS_LABEL_KEYS: Record<string, string> = {
  completed: 'agentPanel.statusCompleted',
  running: 'agentPanel.statusRunning',
  requested: 'agentPanel.statusRequested',
  failed: 'agentPanel.statusFailed',
  rejected: 'agentPanel.statusRejected',
  cancelled: 'agentPanel.statusCancelled'
};

export const AICursorOverlay: React.FC = () => {
  const { t } = useTranslation();
  const [cursor, setCursor] = useState<AICursorEvent | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [ripples, setRipples] = useState<{id: string, x: number, y: number}[]>([]);
  const [activity, setActivity] = useState<ElectronEngineActionRecord[]>([]);
  const [pending, setPending] = useState<ElectronEnginePendingApproval | null>(null);
  const [highlight, setHighlight] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  // The element behind a pending approval, measured by the agent bridge.
  useEffect(() => {
    const onHighlight = (e: Event) => setHighlight((e as CustomEvent<typeof highlight>).detail ?? null);
    window.addEventListener('ai-highlight', onHighlight);
    return () => window.removeEventListener('ai-highlight', onHighlight);
  }, []);

  useEffect(() => {
    let hideTimeout: ReturnType<typeof setTimeout>;
    const rippleTimers = new Set<ReturnType<typeof setTimeout>>();

    const handleAICursor = (e: Event) => {
      const customEvent = e as CustomEvent<AICursorEvent>;
      setCursor(customEvent.detail);
      setIsVisible(true);

      if (customEvent.detail.action === 'click') {
        const id = generateId('ripple');
        setRipples(prev => [...prev, { id, x: customEvent.detail.x, y: customEvent.detail.y }]);
        const rippleTimer = setTimeout(() => {
          setRipples(prev => prev.filter(r => r.id !== id));
          rippleTimers.delete(rippleTimer);
        }, 1000);
        rippleTimers.add(rippleTimer);
      }

      clearTimeout(hideTimeout);
      hideTimeout = setTimeout(() => {
        setIsVisible(false);
      }, IDLE_HIDE_MS);
    };

    window.addEventListener('ai-cursor', handleAICursor);
    return () => {
      window.removeEventListener('ai-cursor', handleAICursor);
      clearTimeout(hideTimeout);
      rippleTimers.forEach(t => clearTimeout(t));
      rippleTimers.clear();
    };
  }, []);

  // Live action strip: fed by the execution engine's event stream (no polling).
  useEffect(() => {
    const api = getElectronAPI();
    if (!api || typeof api.onEngineEvent !== 'function') return;
    return api.onEngineEvent(event => {
      if (event.type === 'action_updated') setActivity(prev => mergeActivity(prev, event.record));
      else if (event.type === 'approval_needed') setPending(event.approval);
      else if (event.type === 'approval_resolved') setPending(null);
    });
  }, []);

  useEffect(() => {
    if (activity.length === 0 || pending) return;
    const timer = setTimeout(() => setActivity([]), STRIP_HIDE_MS);
    return () => clearTimeout(timer);
  }, [activity, pending]);

  const lines = activity.map(toActivityLine).reverse();

  if (!cursor && lines.length === 0 && !pending && !highlight) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-[9999]">
      {/* The element the agent wants to act on, while the human decides */}
      {highlight && pending && (
        <div
          data-testid="approval-highlight"
          className="absolute rounded-md ring-2 ring-amber-400 bg-amber-400/10 animate-pulse"
          style={{ left: highlight.x - 3, top: highlight.y - 3, width: highlight.width + 6, height: highlight.height + 6 }}
        />
      )}

      {/* Click Ripples */}
      <AnimatePresence>
        {ripples.map(ripple => (
          <motion.div
            key={ripple.id}
            initial={{ scale: 0, opacity: 0.8 }}
            animate={{ scale: 2.5, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            style={{ left: ripple.x, top: ripple.y }}
            className="absolute w-8 h-8 -ms-4 -mt-4 rounded-full border-2 border-cyan-400"
          />
        ))}
      </AnimatePresence>

      {/* The AI Cursor */}
      {cursor && (
        <motion.div
          animate={{ x: cursor.x, y: cursor.y }}
          transition={{ type: 'spring', damping: 25, stiffness: 300, mass: 0.5 }}
          className="absolute top-0 start-0 flex items-start gap-2"
          style={{ opacity: isVisible ? 1 : 0 }}
        >
          <div className="relative">
            {cursor.action === 'type' ? (
              <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                className="bg-cyan-500 rounded-full p-1.5 shadow-lg shadow-cyan-500/40 text-slate-950"
              >
                <Keyboard className="w-4 h-4" />
              </motion.div>
            ) : (
              <motion.div
                animate={{ scale: cursor.action === 'click' ? 0.8 : 1 }}
                className="text-cyan-400 filter drop-shadow-[0_4px_10px_rgba(6,182,212,0.6)]"
              >
                <MousePointer2 className="w-7 h-7 fill-cyan-400 text-cyan-200" />
              </motion.div>
            )}

            <div className="absolute top-full start-full mt-1 ms-1 bg-cyan-500 text-slate-950 text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap shadow-md flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-slate-950 rounded-full animate-pulse" />
              AI Agent
            </div>

            {cursor.action === 'type' && cursor.text && (
              <div
                data-testid="ai-cursor-typed"
                className="absolute top-full start-full mt-6 ms-1 max-w-[260px] truncate bg-slate-900/90 text-cyan-100 text-xs font-mono px-2 py-1 rounded-md shadow-lg"
              >
                {cursor.masked ? '••••••••' : cursor.text}
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Live action strip */}
      {(lines.length > 0 || pending) && (
        <div
          data-testid="agent-activity-strip"
          className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[min(92vw,420px)] rounded-xl bg-slate-900/90 text-slate-100 text-xs shadow-xl backdrop-blur px-3 py-2 space-y-1"
        >
          {pending && (
            <div className="flex items-center gap-1.5 font-semibold text-amber-300">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>{pending.domain ? t('agentPanel.waitingForApprovalAt', { domain: pending.domain }) : t('agentPanel.waitingForApproval')}</span>
            </div>
          )}
          {lines.map(line => (
            <div key={line.id} className="flex items-center gap-2 min-w-0">
              <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[line.status] ?? 'bg-slate-400'}`} />
              <span className="font-medium capitalize">{line.label}</span>
              {line.site && <span className="text-slate-400 truncate">{line.site}</span>}
              <span className="ms-auto text-slate-400">{STATUS_LABEL_KEYS[line.status] ? t(STATUS_LABEL_KEYS[line.status]) : line.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
