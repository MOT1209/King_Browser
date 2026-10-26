import React, { useState, useEffect } from 'react';
import { ShieldCheck } from 'lucide-react';
import { UserSettings } from '../../types/browser';
import { useTranslation, type LocalizedText } from '../../services/i18n';
import { normalizeLanguage } from '../../services/language';
import { showConfirm } from '../../utils/confirmDialog';
import { getElectronAPI } from '../../utils/electronBridge';
import { UpdateWidget } from './UpdateWidget';

export interface GeneralSectionProps {
  settings: UserSettings;
  onUpdateSettings: (newSettings: Partial<UserSettings>) => void;
  onClearHistory?: () => void;
}

// Page translation targets: the name in each interface language, plus the
// language's own name so it is recognisable whatever the interface language.
const TRANSLATION_LANGUAGES: Array<{ code: string; name: LocalizedText; native: string }> = [
  { code: 'en', name: { en: 'English', ar: 'الإنجليزية', de: 'Englisch' }, native: 'English' },
  { code: 'tr', name: { en: 'Turkish', ar: 'التركية', de: 'Türkisch' }, native: 'Türkçe' },
  { code: 'de', name: { en: 'German', ar: 'الألمانية', de: 'Deutsch' }, native: 'Deutsch' },
  { code: 'fr', name: { en: 'French', ar: 'الفرنسية', de: 'Französisch' }, native: 'Français' },
  { code: 'es', name: { en: 'Spanish', ar: 'الإسبانية', de: 'Spanisch' }, native: 'Español' },
  { code: 'it', name: { en: 'Italian', ar: 'الإيطالية', de: 'Italienisch' }, native: 'Italiano' },
  { code: 'ru', name: { en: 'Russian', ar: 'الروسية', de: 'Russisch' }, native: 'Русский' },
  { code: 'ar', name: { en: 'Arabic', ar: 'العربية', de: 'Arabisch' }, native: 'العربية' },
  { code: 'ja', name: { en: 'Japanese', ar: 'اليابانية', de: 'Japanisch' }, native: '日本語' },
  { code: 'zh', name: { en: 'Chinese', ar: 'الصينية', de: 'Chinesisch' }, native: '中文' },
  { code: 'az', name: { en: 'Azerbaijani', ar: 'الأذربيجانية', de: 'Aserbaidschanisch' }, native: 'Azərbaycan' },
];

export const GeneralSection: React.FC<GeneralSectionProps> = ({
  settings,
  onUpdateSettings,
  onClearHistory,
}) => {
  const { t, l } = useTranslation();
  const [appVersion, setAppVersion] = useState<string>(() => {
    return typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.5.0';
  });
  const [systemVersions, setSystemVersions] = useState<{
    app: string;
    electron: string;
    chrome: string;
    node: string;
    v8: string;
    platform: string;
    arch: string;
  } | null>(null);

  useEffect(() => {
    if (getElectronAPI()?.getAppVersion) {
      getElectronAPI()?.getAppVersion().then(ver => {
        if (ver) setAppVersion(ver);
      }).catch(() => {});
    }
    if (getElectronAPI()?.getSystemVersions) {
      getElectronAPI()?.getSystemVersions().then(ver => {
        if (ver) setSystemVersions(ver);
      }).catch(() => {});
    }
  }, []);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

      <section>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4 border-b border-slate-200 dark:border-slate-800 pb-2">{t('settings.selectLanguage')}</h2>
        <div className="premium-card bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{t('settings.languageDesc')}</p>
          <div role="radiogroup" aria-label={t('settings.selectLanguage')} className="flex flex-col sm:flex-row gap-2">
            {([
              { id: 'en', label: 'English' },
              { id: 'ar', label: 'العربية' },
              { id: 'de', label: 'Deutsch' }
            ] as const).map(option => {
              const active = normalizeLanguage(settings.language) === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  dir={option.id === 'ar' ? 'rtl' : 'ltr'}
                  onClick={() => onUpdateSettings({ language: option.id })}
                  className={`flex-1 py-3 px-4 rounded-xl text-sm font-medium transition-all ${
                    active
                      ? 'bg-slate-900 text-white shadow-md dark:bg-blue-600 dark:text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4 border-b border-slate-200 dark:border-slate-800 pb-2">{t('settings.aboutKing')}</h2>
        <div className="premium-card bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-6 flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">King Browser</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">{t('settings.versionLine', { version: appVersion })}</p>
          </div>
          <UpdateWidget />
        </div>

        {systemVersions && (
          <div className="premium-card bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-4">
            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-3 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              <span>{t('settings.engineTransparency')}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60">
                <div className="text-[10px] text-slate-400 uppercase font-semibold">Chromium</div>
                <div className="font-mono text-slate-800 dark:text-slate-200 mt-0.5">{systemVersions.chrome || '134.0.6998'}</div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60">
                <div className="text-[10px] text-slate-400 uppercase font-semibold">Electron</div>
                <div className="font-mono text-slate-800 dark:text-slate-200 mt-0.5">{systemVersions.electron}</div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60">
                <div className="text-[10px] text-slate-400 uppercase font-semibold">V8 Engine</div>
                <div className="font-mono text-slate-800 dark:text-slate-200 mt-0.5">{systemVersions.v8}</div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60">
                <div className="text-[10px] text-slate-400 uppercase font-semibold">{l({ en: 'Architecture', ar: 'المعمارية', de: 'Architektur' })}</div>
                <div className="font-mono text-slate-800 dark:text-slate-200 mt-0.5">{systemVersions.platform} ({systemVersions.arch})</div>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-3 leading-relaxed">
              {t('settings.patchTracking')}
            </p>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4 border-b border-slate-200 dark:border-slate-800 pb-2">{t('settings.onStartup')}</h2>
        <div className="premium-card bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-2 flex flex-col sm:flex-row gap-2">
          {[
            { id: 'newTab', label: t('settings.startupNewTab') },
            { id: 'continue', label: t('settings.startupContinue') },
            { id: 'specificPages', label: t('settings.startupSpecific') }
          ].map(opt => (
            <button
              key={opt.id}
              onClick={() => onUpdateSettings({ startupBehavior: opt.id as any })}
              className={`flex-1 py-3 px-4 rounded-xl text-sm font-medium transition-all ${
                settings.startupBehavior === opt.id || (!settings.startupBehavior && opt.id === 'newTab')
                  ? 'bg-slate-900 text-white shadow-md dark:bg-blue-600 dark:text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4 border-b border-slate-200 dark:border-slate-800 pb-2">{t('settings.searchEngineHeading')}</h2>
        <div className="premium-card bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1">
            {[
              { id: 'google', name: 'Google', desc: t('settings.searchEngineFast') },
              { id: 'duckduckgo', name: 'DuckDuckGo', desc: t('settings.searchEnginePrivacy') },
              { id: 'brave', name: 'Brave Search', desc: t('settings.searchEngineIndependent') },
              { id: 'bing', name: 'Bing', desc: t('settings.searchEngineAI') },
              { id: 'ecosia', name: 'Ecosia', desc: t('settings.searchEngineTrees') },
              { id: 'yahoo', name: 'Yahoo', desc: t('settings.searchEngineClassic') }
            ].map(engine => (
              <button
                key={engine.id}
                onClick={() => onUpdateSettings({ searchEngine: engine.id as any })}
                className={`p-4 rounded-xl text-left transition-all ${
                  settings.searchEngine === engine.id
                    ? 'bg-blue-50 dark:bg-blue-500/10 ring-1 ring-blue-500 text-blue-900 dark:text-blue-100'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <p className="font-semibold">{engine.name}</p>
                <p className={`text-xs mt-1 ${settings.searchEngine === engine.id ? 'text-blue-700/70 dark:text-blue-400/70' : 'text-slate-500 dark:text-slate-400'}`}>{engine.desc}</p>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4 border-b border-slate-200 dark:border-slate-800 pb-2">{t('settings.pageTranslation')}</h2>
        <div className="premium-card bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p id="setting-target-language" className="font-semibold text-slate-800 dark:text-slate-100 text-sm">{t('settings.targetLanguage')}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t('settings.targetLanguageDesc')}</p>
            </div>
            <select
              aria-labelledby="setting-target-language"
              value={settings.defaultTranslationLanguage || 'en'}
              onChange={(e) => onUpdateSettings({ defaultTranslationLanguage: e.target.value })}
              className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-700/80 border border-slate-200 dark:border-slate-600 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              {TRANSLATION_LANGUAGES.map(({ code, name, native }) => {
                const label = l(name);
                return <option key={code} value={code}>{label === native ? label : `${label} (${native})`}</option>;
              })}
            </select>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4 border-b border-slate-200 dark:border-slate-800 pb-2">{t('settings.fontSize')}</h2>
        <div className="premium-card bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-2 flex gap-2">
          {(['small', 'medium', 'large'] as const).map(size => (
            <button
              key={size}
              onClick={() => onUpdateSettings({ fontSize: size })}
              className={`flex-1 py-3 px-4 rounded-xl text-sm font-medium transition-all ${
                settings.fontSize === size
                  ? 'bg-slate-900 text-white shadow-md dark:bg-blue-600 dark:text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {t(size === 'small' ? 'settings.sizeSmall' : size === 'medium' ? 'settings.sizeMedium' : 'settings.sizeLarge')}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4 border-b border-slate-200 dark:border-slate-800 pb-2">{t('settings.clearData')}</h2>
        <div className="premium-card bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-6 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t('settings.clearDataTitle')}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">{t('settings.clearDataDesc')}</p>
          </div>
          <button
            onClick={async () => {
              const confirmed = await showConfirm({
                title: t('settings.clearHistoryTitle'),
                message: t('settings.clearHistoryMessage'),
                confirmLabel: t('settings.clearHistoryConfirm'),
                cancelLabel: t('common.cancel')
              });
              if (confirmed) {
                if (onClearHistory) {
                  onClearHistory();
                } else {
                  localStorage.removeItem('browsing_history');
                }
              }
            }}
            className="px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20 rounded-xl font-medium transition-colors text-sm"
          >
            {t('settings.clearDataButton')}
          </button>
        </div>
      </section>
    </div>
  );
};
