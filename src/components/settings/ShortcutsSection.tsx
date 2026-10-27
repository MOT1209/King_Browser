import React, { useMemo, useState } from 'react';
import { Keyboard, RotateCcw, Search } from 'lucide-react';
import { UserSettings } from '../../types/browser';
import { useTranslation } from '../../services/i18n';
import { isMac } from '../../utils/appConstants';
import {
  eventToBinding,
  findConflict,
  formatBinding,
  sameBinding,
  type ShortcutBindingLike
} from '../../utils/keyboardShortcuts';
import {
  FIXED_SHORTCUTS,
  SHORTCUT_ACTIONS,
  SHORTCUT_GROUPS,
  buildDefaultShortcuts
} from '../../utils/shortcutCatalog';

export interface ShortcutsSectionProps {
  shortcuts?: UserSettings['shortcuts'];
  onUpdateSettings: (newSettings: Partial<UserSettings>) => void;
}

function markCustomized() {
  try {
    localStorage.setItem('shortcuts_customized', 'true');
    localStorage.setItem('shortcuts_v2_migrated', 'true');
  } catch (_) {}
}

export const ShortcutsSection: React.FC<ShortcutsSectionProps> = ({
  shortcuts,
  onUpdateSettings,
}) => {
  const { t } = useTranslation();
  const defaults = useMemo(() => buildDefaultShortcuts(isMac), []);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const bindingFor = (id: string): ShortcutBindingLike | undefined => shortcuts?.[id] ?? defaults[id];
  const actionLabel = (id: string) => t(`shortcuts.actions.${id}`);

  const save = (id: string, binding: ShortcutBindingLike) => {
    markCustomized();
    onUpdateSettings({ shortcuts: { ...shortcuts, [id]: binding } });
  };

  const stopRecording = () => {
    setRecordingId(null);
    setRecordError(null);
  };

  const onRecordKeyDown = (id: string) => (event: React.KeyboardEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
      stopRecording();
      return;
    }
    const binding = eventToBinding(event, isMac);
    if (!binding) {
      if (!['Control', 'Shift', 'Alt', 'Meta', 'AltGraph'].includes(event.key)) {
        setRecordError(t('shortcuts.needsModifier'));
      }
      return;
    }
    const merged = { ...defaults, ...shortcuts };
    const conflict = findConflict(merged, binding, id);
    if (conflict) {
      setRecordError(t('shortcuts.conflict', { action: actionLabel(conflict) }));
      return;
    }
    save(id, binding);
    stopRecording();
  };

  const needle = query.trim().toLowerCase();
  const visibleActions = SHORTCUT_ACTIONS.filter(action => {
    if (!needle) return true;
    return actionLabel(action.id).toLowerCase().includes(needle) ||
      formatBinding(bindingFor(action.id), isMac).toLowerCase().includes(needle);
  });

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <section>
        <div className="flex items-center justify-between gap-3 mb-2 border-b border-slate-200 dark:border-slate-800 pb-2">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{t('shortcuts.title')}</h2>
          <button
            type="button"
            onClick={() => {
              try {
                localStorage.removeItem('shortcuts_customized');
                localStorage.setItem('shortcuts_v2_migrated', 'true');
              } catch (_) {}
              stopRecording();
              onUpdateSettings({ shortcuts: { ...shortcuts, ...defaults } });
            }}
            className="flex items-center gap-1.5 text-xs text-blue-500 hover:text-blue-600 font-medium"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {t('shortcuts.resetAll')}
          </button>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">{t('shortcuts.subtitle')}</p>

        <div className="relative mb-5">
          <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t('shortcuts.search')}
            aria-label={t('shortcuts.search')}
            className="w-full ps-9 pe-3 py-2 rounded-xl bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500"
          />
        </div>

        {visibleActions.length === 0 && (
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('shortcuts.noResults')}</p>
        )}

        <div className="space-y-6">
          {SHORTCUT_GROUPS.map(group => {
            const actions = visibleActions.filter(action => action.group === group);
            if (actions.length === 0) return null;
            return (
              <div key={group}>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
                  {t(`shortcuts.groups.${group}`)}
                </h3>
                <div className="premium-card bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-2 divide-y divide-slate-100 dark:divide-slate-700/50">
                  {actions.map(action => {
                    const binding = bindingFor(action.id);
                    const isRecording = recordingId === action.id;
                    const isDefault = sameBinding(binding, defaults[action.id]);
                    const label = actionLabel(action.id);
                    return (
                      <div key={action.id} className="p-3 group hover:bg-slate-50 dark:hover:bg-slate-700/20 rounded-xl transition-colors">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 flex items-center gap-2">
                            <p className={`text-sm font-medium truncate ${action.id === 'agentStopNow' ? 'text-red-600 dark:text-red-400' : 'text-slate-800 dark:text-slate-200'}`}>
                              {label}
                            </p>
                            {!isDefault && (
                              <span className="shrink-0 text-[10px] font-semibold rounded-full px-1.5 py-0.5 bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
                                {t('shortcuts.customized')}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {!isDefault && !isRecording && (
                              <button
                                type="button"
                                onClick={() => save(action.id, defaults[action.id])}
                                className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-lg transition-colors"
                                aria-label={`${t('shortcuts.resetOne')}: ${label}`}
                                title={`${t('shortcuts.resetOne')} (${formatBinding(defaults[action.id], isMac)})`}
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              autoFocus={isRecording}
                              onClick={() => {
                                setRecordError(null);
                                setRecordingId(isRecording ? null : action.id);
                              }}
                              onKeyDown={isRecording ? onRecordKeyDown(action.id) : undefined}
                              onBlur={() => { if (isRecording) stopRecording(); }}
                              aria-label={`${t('shortcuts.edit')}: ${label}`}
                              title={t('shortcuts.edit')}
                              dir={isRecording ? undefined : 'ltr'}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium min-w-[120px] justify-center border transition-colors ${
                                isRecording
                                  ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-500 text-blue-600 dark:text-blue-300 animate-pulse'
                                  : 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-blue-400'
                              }`}
                            >
                              <Keyboard className="w-3.5 h-3.5 opacity-60" />
                              {isRecording ? t('shortcuts.pressKeys') : (formatBinding(binding, isMac) || '-')}
                            </button>
                          </div>
                        </div>
                        {isRecording && recordError && (
                          <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">{recordError}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {!needle && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">{t('shortcuts.fixedTitle')}</h3>
          <div className="premium-card bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-2 divide-y divide-slate-100 dark:divide-slate-700/50">
            {FIXED_SHORTCUTS.map(fixed => (
              <div key={`${fixed.id}-${fixed.keys}`} className="flex items-center justify-between gap-3 p-3">
                <p className="text-sm text-slate-700 dark:text-slate-300 truncate">{actionLabel(fixed.id)}</p>
                <span dir="ltr" className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-mono text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700">
                  {fixed.mod ? `${isMac ? 'Cmd' : 'Ctrl'}+${fixed.keys}` : fixed.keys}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
