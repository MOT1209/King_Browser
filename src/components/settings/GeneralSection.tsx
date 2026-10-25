import React, { useState, useEffect } from 'react';
import { ShieldCheck } from 'lucide-react';
import { UserSettings } from '../../types/browser';
import { showConfirm } from '../../utils/confirmDialog';
import { getElectronAPI } from '../../utils/electronBridge';
import { UpdateWidget } from './UpdateWidget';
import { useTranslation, normalizeLanguage } from '../../services/i18n';

export interface GeneralSectionProps {
  settings: UserSettings;
  onUpdateSettings: (newSettings: Partial<UserSettings>) => void;
  onClearHistory?: () => void;
}

export const GeneralSection: React.FC<GeneralSectionProps> = ({
  settings,
  onUpdateSettings,
  onClearHistory,
}) => {
  const { l } = useTranslation();
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
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4 border-b border-slate-200 dark:border-slate-800 pb-2">{l({ en: 'Language', ar: 'اللغة', de: 'Sprache' })}</h2>
        <div className="premium-card bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p id="setting-interface-language" className="font-semibold text-slate-800 dark:text-slate-100 text-sm">{l({ en: 'Interface language', ar: 'لغة الواجهة', de: 'Sprache der Oberfläche' })}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{l({ en: 'Menus, settings and messages. Applies immediately.', ar: 'القوائم والإعدادات والرسائل. يُطبَّق فوراً.', de: 'Menüs, Einstellungen und Meldungen. Gilt sofort.' })}</p>
            </div>
            <select
              aria-labelledby="setting-interface-language"
              value={normalizeLanguage(settings.language)}
              onChange={(e) => onUpdateSettings({ language: normalizeLanguage(e.target.value) })}
              className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-700/80 border border-slate-200 dark:border-slate-600 text-sm font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              <option value="ar" lang="ar" dir="rtl">العربية</option>
              <option value="en" lang="en">English</option>
              <option value="de" lang="de">Deutsch</option>
            </select>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4 border-b border-slate-200 dark:border-slate-800 pb-2">{l({ en: 'About King', ar: 'حول King', de: 'Über King' })}</h2>
        <div className="premium-card bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-6 flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">King Browser</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">{l({ en: 'Version {v} (Open Source Edition)', ar: 'الإصدار {v} (الإصدار مفتوح المصدر)', de: 'Version {v} (Open-Source-Edition)' }, { v: appVersion })}</p>
          </div>
          <UpdateWidget />
        </div>

        {systemVersions && (
          <div className="premium-card bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-4">
            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-3 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              <span>{l({ en: 'Engine & Security Patch Transparency', ar: 'شفافية المحرك والتحديثات الأمنية', de: 'Transparenz zu Engine und Sicherheitspatches' })}</span>
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
                <div className="text-[10px] text-slate-400 uppercase font-semibold">{l({ en: 'V8 Engine', ar: 'محرك V8', de: 'V8-Engine' })}</div>
                <div className="font-mono text-slate-800 dark:text-slate-200 mt-0.5">{systemVersions.v8}</div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60">
                <div className="text-[10px] text-slate-400 uppercase font-semibold">{l({ en: 'Architecture', ar: 'المعمارية', de: 'Architektur' })}</div>
                <div className="font-mono text-slate-800 dark:text-slate-200 mt-0.5">{systemVersions.platform} ({systemVersions.arch})</div>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-3 leading-relaxed">
              {l({ en: 'Patch gap tracking active: Automated CI/CD builds release Chromium security patches with verified platform binaries.', ar: 'تتبّع فجوة التحديثات مفعّل: تُصدر عمليات البناء الآلية (CI/CD) تحديثات Chromium الأمنية مع ملفات تشغيل موثّقة لكل نظام.', de: 'Patch-Lücken-Überwachung aktiv: Automatisierte CI/CD-Builds liefern Chromium-Sicherheitspatches mit verifizierten Binärdateien für jede Plattform.' })}
            </p>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4 border-b border-slate-200 dark:border-slate-800 pb-2">{l({ en: 'On Startup', ar: 'عند بدء التشغيل', de: 'Beim Start' })}</h2>
        <div className="premium-card bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-2 flex flex-col sm:flex-row gap-2">
          {[
            { id: 'newTab', label: l({ en: 'Open New Tab Page', ar: 'فتح صفحة تبويب جديد', de: 'Neuen Tab öffnen' }) },
            { id: 'continue', label: l({ en: 'Continue where you left off', ar: 'المتابعة من حيث توقفت', de: 'Dort weitermachen, wo Sie aufgehört haben' }) },
            { id: 'specificPages', label: l({ en: 'Open a specific page', ar: 'فتح صفحة معيّنة', de: 'Bestimmte Seite öffnen' }) }
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
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4 border-b border-slate-200 dark:border-slate-800 pb-2">{l({ en: 'Search Engine', ar: 'محرك البحث', de: 'Suchmaschine' })}</h2>
        <div className="premium-card bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1">
            {[
              { id: 'google', name: 'Google', desc: l({ en: 'Fast & Accurate', ar: 'سريع ودقيق', de: 'Schnell und genau' }) },
              { id: 'duckduckgo', name: 'DuckDuckGo', desc: l({ en: 'Privacy focused', ar: 'يركّز على الخصوصية', de: 'Datenschutzorientiert' }) },
              { id: 'brave', name: 'Brave Search', desc: l({ en: 'Independent index', ar: 'فهرس مستقل', de: 'Unabhängiger Index' }) },
              { id: 'bing', name: 'Bing', desc: l({ en: 'AI powered', ar: 'مدعوم بالذكاء الاصطناعي', de: 'KI-gestützt' }) },
              { id: 'ecosia', name: 'Ecosia', desc: l({ en: 'Plant trees', ar: 'يزرع الأشجار', de: 'Pflanzt Bäume' }) },
              { id: 'yahoo', name: 'Yahoo', desc: l({ en: 'Classic search', ar: 'بحث تقليدي', de: 'Klassische Suche' }) }
            ].map(engine => (
              <button
                key={engine.id}
                onClick={() => onUpdateSettings({ searchEngine: engine.id as any })}
                className={`p-4 rounded-xl text-start transition-all ${
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
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4 border-b border-slate-200 dark:border-slate-800 pb-2">{l({ en: 'Page Translation', ar: 'ترجمة الصفحات', de: 'Seitenübersetzung' })}</h2>
        <div className="premium-card bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p id="setting-target-language" className="font-semibold text-slate-800 dark:text-slate-100 text-sm">{l({ en: 'Default Target Language', ar: 'اللغة الافتراضية للترجمة', de: 'Standard-Zielsprache' })}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{l({ en: 'Foreign web pages will be translated to this language in 1-click.', ar: 'تُترجَم صفحات الويب الأجنبية إلى هذه اللغة بنقرة واحدة.', de: 'Fremdsprachige Webseiten werden mit einem Klick in diese Sprache übersetzt.' })}</p>
            </div>
            <select
              aria-labelledby="setting-target-language"
              value={settings.defaultTranslationLanguage || 'en'}
              onChange={(e) => onUpdateSettings({ defaultTranslationLanguage: e.target.value })}
              className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-700/80 border border-slate-200 dark:border-slate-600 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              <option value="en">English</option>
              <option value="tr">Turkish (Türkçe)</option>
              <option value="de">German (Deutsch)</option>
              <option value="fr">French (Français)</option>
              <option value="es">Spanish (Español)</option>
              <option value="it">Italian (Italiano)</option>
              <option value="ru">Russian (Русский)</option>
              <option value="ar">Arabic (العربية)</option>
              <option value="ja">Japanese (日本語)</option>
              <option value="zh">Chinese (中文)</option>
              <option value="az">Azərbaycan (Azerbaycan)</option>
            </select>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4 border-b border-slate-200 dark:border-slate-800 pb-2">{l({ en: 'Font Size', ar: 'حجم الخط', de: 'Schriftgröße' })}</h2>
        <div className="premium-card bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-2 flex gap-2">
          {(['small', 'medium', 'large'] as const).map(size => (
            <button
              key={size}
              onClick={() => onUpdateSettings({ fontSize: size })}
              className={`flex-1 py-3 px-4 rounded-xl text-sm font-medium capitalize transition-all ${
                settings.fontSize === size
                  ? 'bg-slate-900 text-white shadow-md dark:bg-blue-600 dark:text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {size === 'small' ? l({ en: 'Small', ar: 'صغير', de: 'Klein' }) : size === 'medium' ? l({ en: 'Medium', ar: 'متوسط', de: 'Mittel' }) : l({ en: 'Large', ar: 'كبير', de: 'Groß' })}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4 border-b border-slate-200 dark:border-slate-800 pb-2">{l({ en: 'Clear Browsing Data', ar: 'محو بيانات التصفح', de: 'Browserdaten löschen' })}</h2>
        <div className="premium-card bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-6 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{l({ en: 'Clear History & Cache', ar: 'محو السجل وذاكرة التخزين المؤقت', de: 'Verlauf und Cache löschen' })}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">{l({ en: 'Clear your browsing history, cookies, cache, and more.', ar: 'امسح سجل التصفح وملفات تعريف الارتباط وذاكرة التخزين المؤقت وغيرها.', de: 'Löschen Sie Browserverlauf, Cookies, Cache und mehr.' })}</p>
          </div>
          <button
            onClick={async () => {
              const confirmed = await showConfirm({
                title: l({ en: 'Clear Browsing History', ar: 'محو سجل التصفح', de: 'Browserverlauf löschen' }),
                message: l({ en: 'Are you sure you want to clear your browsing history?', ar: 'هل أنت متأكد أنك تريد محو سجل التصفح؟', de: 'Möchten Sie Ihren Browserverlauf wirklich löschen?' }),
                confirmLabel: l({ en: 'Clear History', ar: 'محو السجل', de: 'Verlauf löschen' }),
                cancelLabel: l({ en: 'Cancel', ar: 'إلغاء', de: 'Abbrechen' })
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
            {l({ en: 'Clear Data', ar: 'محو البيانات', de: 'Daten löschen' })}
          </button>
        </div>
      </section>
    </div>
  );
};
