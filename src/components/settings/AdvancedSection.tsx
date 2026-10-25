import React, { useState } from 'react';
import { Download, Upload, Check, Zap, Loader2 } from 'lucide-react';
import { UserSettings } from '../../types/browser';
import { ToggleSwitch } from './ToggleSwitch';
import { useSafeTimeout } from '../../hooks/useSafeTimeout';
import { useTranslation } from '../../services/i18n';

export interface AdvancedSectionProps {
  settings: UserSettings;
  onUpdateSettings: (newSettings: Partial<UserSettings>) => void;
  onPurgeMemory?: () => Promise<void> | void;
  onExportData?: () => void;
  onImportData?: (file: File) => void;
}

export const AdvancedSection: React.FC<AdvancedSectionProps> = ({
  settings,
  onUpdateSettings,
  onPurgeMemory,
  onExportData,
  onImportData,
}) => {
  const [isPurgingMemory, setIsPurgingMemory] = useState(false);
  const [purgedFeedback, setPurgedFeedback] = useState(false);
  const { setSafeTimeout } = useSafeTimeout();
  const { l } = useTranslation();

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <section>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4 border-b border-slate-200 dark:border-slate-800 pb-2">{l({ en: 'AI Features', ar: 'ميزات الذكاء الاصطناعي', de: 'KI-Funktionen' })}</h2>
        <div className="premium-card bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 divide-y divide-slate-100 dark:divide-slate-700/50 mb-8">
          <div className="p-5 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{l({ en: 'AI Link Preview (Hover Summaries)', ar: 'معاينة الروابط بالذكاء الاصطناعي (ملخص عند التمرير)', de: 'KI-Linkvorschau (Zusammenfassung beim Darüberfahren)' })}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{l({ en: 'Automatically reads and summarizes links when you hover over them. (Uses local WebLLM)', ar: 'يقرأ الروابط ويلخّصها تلقائياً عند تمرير المؤشر فوقها. (يستخدم WebLLM محلياً)', de: 'Liest und fasst Links automatisch zusammen, wenn Sie mit der Maus darüberfahren. (Nutzt lokales WebLLM)' })}</div>
            </div>
            <ToggleSwitch
              ariaLabel={l({ en: 'Toggle AI link preview', ar: 'تشغيل أو إيقاف معاينة الروابط', de: 'KI-Linkvorschau umschalten' })}
              checked={settings.aiLinkPreviewEnabled}
              onToggle={() => onUpdateSettings({ aiLinkPreviewEnabled: !settings.aiLinkPreviewEnabled })}
              activeColorClass="bg-indigo-500"
            />
          </div>

          {/* Password Manager */}
          <div className="p-5 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{l({ en: 'Password Manager', ar: 'مدير كلمات المرور', de: 'Passwortmanager' })}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{l({ en: 'Offer to save and autofill passwords on websites. Credentials are encrypted on this device.', ar: 'اعرض حفظ كلمات المرور وتعبئتها تلقائياً في المواقع. تُشفَّر بيانات الدخول على هذا الجهاز.', de: 'Anbieten, Passwörter auf Websites zu speichern und automatisch einzutragen. Zugangsdaten werden auf diesem Gerät verschlüsselt.' })}</div>
            </div>
            <ToggleSwitch
              ariaLabel={l({ en: 'Toggle password manager', ar: 'تشغيل أو إيقاف مدير كلمات المرور', de: 'Passwortmanager umschalten' })}
              checked={settings.passwordManagerEnabled}
              onToggle={() => onUpdateSettings({ passwordManagerEnabled: !settings.passwordManagerEnabled })}
              activeColorClass="bg-indigo-500"
            />
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4 border-b border-slate-200 dark:border-slate-800 pb-2">{l({ en: 'Memory & Performance', ar: 'الذاكرة والأداء', de: 'Speicher & Leistung' })}</h2>
        <div className="premium-card bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 divide-y divide-slate-100 dark:divide-slate-700/50 mb-8">
          {/* Automatic Tab Hibernation */}
          <div className="p-5 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{l({ en: 'Automatic Tab Hibernation (Memory Saver)', ar: 'إسبات التبويبات تلقائياً (توفير الذاكرة)', de: 'Automatischer Tab-Ruhezustand (Speichersparmodus)' })}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{l({ en: 'Unloads inactive background tabs from RAM to keep the browser lightning fast', ar: 'يُفرغ التبويبات الخاملة في الخلفية من الذاكرة ليبقى المتصفح سريعاً', de: 'Entlädt inaktive Hintergrund-Tabs aus dem Arbeitsspeicher, damit der Browser schnell bleibt' })}</div>
            </div>
            <ToggleSwitch
              ariaLabel={l({ en: 'Toggle automatic tab hibernation', ar: 'تشغيل أو إيقاف إسبات التبويبات', de: 'Automatischen Tab-Ruhezustand umschalten' })}
              checked={(settings.tabHibernationEnabled ?? true)}
              onToggle={() => onUpdateSettings({ tabHibernationEnabled: !(settings.tabHibernationEnabled ?? true) })}
            />
          </div>

          {(settings.tabHibernationEnabled ?? true) && (
            <div className="p-5 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{l({ en: 'Hibernation Inactivity Timeout', ar: 'مهلة الخمول قبل الإسبات', de: 'Inaktivitätszeit bis zum Ruhezustand' })}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{l({ en: 'Time after which unused tabs are suspended to save RAM', ar: 'المدة التي تُعلَّق بعدها التبويبات غير المستخدمة لتوفير الذاكرة', de: 'Zeit, nach der ungenutzte Tabs pausiert werden, um Arbeitsspeicher zu sparen' })}</div>
              </div>
              <select
                value={settings.hibernationTimeoutMinutes ?? 10}
                onChange={(e) => onUpdateSettings({ hibernationTimeoutMinutes: Number(e.target.value) })}
                className="bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 focus:outline-none"
              >
                <option value={5}>{l({ en: '5 minutes', ar: '5 دقائق', de: '5 Minuten' })}</option>
                <option value={10}>{l({ en: '10 minutes', ar: '10 دقائق', de: '10 Minuten' })}</option>
                <option value={30}>{l({ en: '30 minutes', ar: '30 دقيقة', de: '30 Minuten' })}</option>
                <option value={60}>{l({ en: '1 hour', ar: 'ساعة واحدة', de: '1 Stunde' })}</option>
              </select>
            </div>
          )}

          {/* Energy Saver Mode */}
          <div className="p-5 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{l({ en: 'Energy Saver Mode (Battery & CPU)', ar: 'وضع توفير الطاقة (البطارية والمعالج)', de: 'Energiesparmodus (Akku & CPU)' })}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{l({ en: 'Throttles heavy background canvas shaders and limits particle effects to extend laptop battery life', ar: 'يخفّف الرسوميات الثقيلة في الخلفية ويحدّ من تأثيرات الجزيئات لإطالة عمر بطارية الحاسوب', de: 'Drosselt aufwendige Hintergrundgrafik und begrenzt Partikeleffekte, um den Akku zu schonen' })}</div>
            </div>
            <ToggleSwitch
              ariaLabel={l({ en: 'Toggle energy saver mode', ar: 'تشغيل أو إيقاف وضع توفير الطاقة', de: 'Energiesparmodus umschalten' })}
              checked={settings.energySaverMode}
              onToggle={() => onUpdateSettings({ energySaverMode: !(settings.energySaverMode ?? false) })}
              activeColorClass="bg-emerald-500"
            />
          </div>

          {/* Link Preload & DNS Prefetching */}
          <div className="p-5 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{l({ en: 'DNS Prefetching & Link Pre-warming (Speed Booster)', ar: 'الجلب المسبق لـ DNS وتهيئة الروابط (مُسرّع)', de: 'DNS-Vorabruf & Link-Vorwärmung (Beschleuniger)' })}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{l({ en: 'Pre-resolves domain names and opens anticipatory sockets on link hover for instant page loads', ar: 'يحلّ أسماء النطاقات مسبقاً ويفتح الاتصالات عند تمرير المؤشر فوق الروابط لتحميل فوري للصفحات', de: 'Löst Domainnamen vorab auf und öffnet Verbindungen beim Darüberfahren über Links, damit Seiten sofort laden' })}</div>
            </div>
            <ToggleSwitch
              ariaLabel={l({ en: 'Toggle DNS prefetching and link pre-warming', ar: 'تشغيل أو إيقاف الجلب المسبق', de: 'DNS-Vorabruf umschalten' })}
              checked={(settings.preloadDnsEnabled ?? true)}
              onToggle={() => onUpdateSettings({ preloadDnsEnabled: !(settings.preloadDnsEnabled ?? true) })}
            />
          </div>

          {/* Smooth Scrolling Engine */}
          <div className="p-5 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{l({ en: 'Hardware-Accelerated Smooth Scrolling', ar: 'تمرير سلس بتسريع العتاد', de: 'Hardwarebeschleunigtes sanftes Scrollen' })}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{l({ en: 'Interpolates page scrolling with GPU composited physics for high refresh rate monitors', ar: 'ينعّم تمرير الصفحات باستخدام معالج الرسوميات للشاشات عالية التحديث', de: 'Glättet das Scrollen per GPU für Bildschirme mit hoher Bildwiederholrate' })}</div>
            </div>
            <ToggleSwitch
              ariaLabel={l({ en: 'Toggle smooth scrolling', ar: 'تشغيل أو إيقاف التمرير السلس', de: 'Sanftes Scrollen umschalten' })}
              checked={(settings.smoothScrollingEnabled ?? true)}
              onToggle={() => onUpdateSettings({ smoothScrollingEnabled: !(settings.smoothScrollingEnabled ?? true) })}
            />
          </div>

          {/* Instant Memory Purge Action */}
          <div className="p-5 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{l({ en: 'Instant RAM & Cache Purge', ar: 'تفريغ فوري للذاكرة والتخزين المؤقت', de: 'Sofortiges Leeren von RAM & Cache' })}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{l({ en: 'Immediately hibernates all background tabs, clears thumbnail cache, and triggers V8 garbage collection', ar: 'يُسبت كل تبويبات الخلفية فوراً، ويمسح ذاكرة الصور المصغّرة، ويشغّل تنظيف الذاكرة في V8', de: 'Versetzt alle Hintergrund-Tabs sofort in den Ruhezustand, leert den Vorschaubild-Cache und startet die V8-Speicherbereinigung' })}</div>
            </div>
            <button
              onClick={async () => {
                setIsPurgingMemory(true);
                try {
                  if (onPurgeMemory) await onPurgeMemory();
                } catch (_) {}
                setSafeTimeout(() => {
                  setIsPurgingMemory(false);
                  setPurgedFeedback(true);
                  setSafeTimeout(() => setPurgedFeedback(false), 3000);
                }, 500);
              }}
              disabled={isPurgingMemory}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer shadow-xs active:scale-95 disabled:opacity-50"
            >
              {isPurgingMemory ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
                  <span>{l({ en: 'Purging RAM...', ar: 'جارٍ تفريغ الذاكرة...', de: 'RAM wird geleert...' })}</span>
                </>
              ) : purgedFeedback ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-emerald-600 dark:text-emerald-400">{l({ en: 'RAM Purged!', ar: 'تم تفريغ الذاكرة!', de: 'RAM geleert!' })}</span>
                </>
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5 text-amber-500" />
                  <span>{l({ en: 'Purge RAM Now', ar: 'فرّغ الذاكرة الآن', de: 'RAM jetzt leeren' })}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4 border-b border-slate-200 dark:border-slate-800 pb-2">{l({ en: 'System & Developer', ar: 'النظام والمطوّرون', de: 'System & Entwickler' })}</h2>
        <div className="premium-card bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 divide-y divide-slate-100 dark:divide-slate-700/50">
          <div className="p-5 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{l({ en: 'Use hardware acceleration', ar: 'استخدام تسريع العتاد', de: 'Hardwarebeschleunigung verwenden' })}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{l({ en: 'Use GPU to render web pages faster (requires restart)', ar: 'استخدم معالج الرسوميات لعرض الصفحات أسرع (يتطلب إعادة التشغيل)', de: 'GPU zum schnelleren Darstellen von Webseiten nutzen (Neustart erforderlich)' })}</div>
            </div>
            <ToggleSwitch
              ariaLabel={l({ en: 'Toggle hardware acceleration', ar: 'تشغيل أو إيقاف تسريع العتاد', de: 'Hardwarebeschleunigung umschalten' })}
              checked={settings.hardwareAcceleration}
              onToggle={() => onUpdateSettings({ hardwareAcceleration: !settings.hardwareAcceleration })}
            />
          </div>

          <div className="p-5 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{l({ en: 'Developer Mode', ar: 'وضع المطوّر', de: 'Entwicklermodus' })}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{l({ en: 'Enable "Inspect Element" in right-click menu and advanced tools', ar: 'تفعيل "فحص العنصر" في قائمة الزر الأيمن والأدوات المتقدمة', de: '„Element untersuchen“ im Kontextmenü und erweiterte Werkzeuge aktivieren' })}</div>
            </div>
            <ToggleSwitch
              ariaLabel={l({ en: 'Toggle developer mode', ar: 'تشغيل أو إيقاف وضع المطوّر', de: 'Entwicklermodus umschalten' })}
              checked={settings.developerMode}
              onToggle={() => onUpdateSettings({ developerMode: !settings.developerMode })}
            />
          </div>
        </div>
        <div className="mt-4 p-5 flex items-center justify-between rounded-2xl border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800/50">
          <div>
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{l({ en: 'Crash logs', ar: 'سجلات الأعطال', de: 'Absturzprotokolle' })}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{l({ en: 'Show crash.log in your file manager.', ar: 'إظهار ملف crash.log في مدير الملفات.', de: 'crash.log im Dateimanager anzeigen.' })}</div>
          </div>
          <button
            type="button"
            onClick={() => { void window.electronAPI?.openCrashLogsFolder(); }}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 text-xs font-semibold transition-colors"
          >
            {l({ en: 'Open crash log', ar: 'فتح سجل الأعطال', de: 'Absturzprotokoll öffnen' })}
          </button>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4 border-b border-slate-200 dark:border-slate-800 pb-2">{l({ en: 'Backup & Restore', ar: 'النسخ الاحتياطي والاستعادة', de: 'Sicherung & Wiederherstellung' })}</h2>
        <div className="flex gap-4">
          <button
            onClick={onExportData}
            className="flex-1 bg-white dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-200 dark:border-slate-700/50 hover:border-blue-500 dark:hover:border-blue-500 transition-colors flex flex-col items-center justify-center gap-3 group"
          >
            <div className="w-12 h-12 bg-blue-50 dark:bg-blue-500/20 rounded-full flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform">
              <Download className="w-6 h-6" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-slate-800 dark:text-slate-100">{l({ en: 'Export Backup', ar: 'تصدير نسخة احتياطية', de: 'Sicherung exportieren' })}</p>
              <p className="text-xs text-slate-500 mt-1">{l({ en: 'Save bookmarks & settings to a JSON file', ar: 'احفظ الإشارات المرجعية والإعدادات في ملف JSON', de: 'Lesezeichen und Einstellungen in einer JSON-Datei speichern' })}</p>
            </div>
          </button>

          <label className="flex-1 bg-white dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-200 dark:border-slate-700/50 hover:border-emerald-500 dark:hover:border-emerald-500 transition-colors flex flex-col items-center justify-center gap-3 group cursor-pointer">
            <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-500/20 rounded-full flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
              <Upload className="w-6 h-6" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-slate-800 dark:text-slate-100">{l({ en: 'Import Backup', ar: 'استيراد نسخة احتياطية', de: 'Sicherung importieren' })}</p>
              <p className="text-xs text-slate-500 mt-1">{l({ en: 'Restore from a JSON backup file', ar: 'الاستعادة من ملف نسخة احتياطية JSON', de: 'Aus einer JSON-Sicherungsdatei wiederherstellen' })}</p>
            </div>
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file && onImportData) onImportData(file);
              }}
            />
          </label>
        </div>
      </section>

    </div>
  );
};
