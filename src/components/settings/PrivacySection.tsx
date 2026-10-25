import React, { useState, useEffect } from 'react';
import { ShieldCheck, ExternalLink, Trash2, Cpu } from 'lucide-react';
import { ADBLOCK_WHITELIST_EVENT, ADBLOCK_WHITELIST_KEY, addWhitelistHost, parseWhitelist, removeWhitelistHost } from '../../utils/adblockWhitelist';
import { UserSettings } from '../../types/browser';
import { showConfirm } from '../../utils/confirmDialog';
import { getElectronAPI } from '../../utils/electronBridge';
import { aiAgent } from '../../services/aiAgent';
import { ToggleSwitch } from './ToggleSwitch';
import { useSafeTimeout } from '../../hooks/useSafeTimeout';
import { useTranslation } from '../../services/i18n';

export interface PrivacySectionProps {
  settings: UserSettings;
  onUpdateSettings: (newSettings: Partial<UserSettings>) => void;
}

export const PrivacySection: React.FC<PrivacySectionProps> = ({
  settings,
  onUpdateSettings,
}) => {
  const { l } = useTranslation();
  const [aiCacheOk, setAiCacheOk] = useState(false);
  const [aiVramTimeout, setAiVramTimeout] = useState<number>(() => aiAgent.getAutoParkTimeoutMinutes());
  const [aiEngineLoaded, setAiEngineLoaded] = useState<boolean>(() => aiAgent.isEngineLoaded());
  const [rememberedPermCount, setRememberedPermCount] = useState<number>(0);
  const [resettingPerms, setResettingPerms] = useState(false);
  const [resetPermsSuccess, setResetPermsSuccess] = useState(false);
  const [aiCacheStatus, setAiCacheStatus] = useState<string>('');
  const [isClearingCache, setIsClearingCache] = useState<boolean>(false);
  const { setSafeTimeout } = useSafeTimeout();
  const [blockerOffSites, setBlockerOffSites] = useState<string[]>([]);
  const [siteInput, setSiteInput] = useState('');
  const [siteError, setSiteError] = useState('');

  const loadBlockerOffSites = React.useCallback(async () => {
    try {
      const raw = await getElectronAPI()?.storeGet?.(ADBLOCK_WHITELIST_KEY);
      setBlockerOffSites(parseWhitelist(raw));
    } catch (_) {}
  }, []);

  useEffect(() => {
    void loadBlockerOffSites();
    // The address-bar shield popover edits the same list.
    window.addEventListener(ADBLOCK_WHITELIST_EVENT, loadBlockerOffSites);
    return () => window.removeEventListener(ADBLOCK_WHITELIST_EVENT, loadBlockerOffSites);
  }, [loadBlockerOffSites]);

  const saveBlockerOffSites = async (next: string[]) => {
    setBlockerOffSites(next);
    await getElectronAPI()?.storeSet?.(ADBLOCK_WHITELIST_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(ADBLOCK_WHITELIST_EVENT));
  };

  const handleAddBlockerOffSite = async () => {
    const { list, added } = addWhitelistHost(blockerOffSites, siteInput);
    if (!added) {
      setSiteError(l({ en: 'Enter a site like example.com', ar: 'أدخل موقعاً مثل example.com', de: 'Geben Sie eine Website wie example.com ein' }));
      return;
    }
    setSiteError('');
    setSiteInput('');
    await saveBlockerOffSites(list);
  };

  useEffect(() => {
    if (getElectronAPI()?.getRememberedPermissionsCount) {
      getElectronAPI()!.getRememberedPermissionsCount().then((count: number) => {
        setRememberedPermCount(count || 0);
      }).catch(() => {});
    }
  }, []);

  const handleResetRememberedPermissions = async () => {
    if (!getElectronAPI()?.resetRememberedPermissions) return;
    setResettingPerms(true);
    try {
      await getElectronAPI()!.resetRememberedPermissions();
      setRememberedPermCount(0);
      setResetPermsSuccess(true);
      setSafeTimeout(() => setResetPermsSuccess(false), 3000);
    } catch (_) {}
    setResettingPerms(false);
  };

  useEffect(() => {
    return aiAgent.onStatus(() => {
      setAiEngineLoaded(aiAgent.isEngineLoaded());
    });
  }, []);

  const handleClearAiCache = async () => {
    const confirmed = await showConfirm({
      title: l({ en: 'Clear AI Cache', ar: 'محو ذاكرة الذكاء الاصطناعي', de: 'KI-Cache leeren' }),
      message: l({ en: 'Clear all downloaded local AI model files and temporary cache?', ar: 'هل تريد حذف كل ملفات نماذج الذكاء الاصطناعي المنزّلة والذاكرة المؤقتة؟', de: 'Alle heruntergeladenen lokalen KI-Modelldateien und den temporären Cache löschen?' }),
      confirmLabel: l({ en: 'Clear Cache', ar: 'محو الذاكرة المؤقتة', de: 'Cache leeren' }),
      cancelLabel: l({ en: 'Cancel', ar: 'إلغاء', de: 'Abbrechen' })
    });
    if (!confirmed) return;
    setIsClearingCache(true);
    try {
      if (typeof window !== 'undefined' && 'caches' in window) {
        const keys = await window.caches.keys();
        for (const k of keys) {
          await window.caches.delete(k);
        }
      }
      if (getElectronAPI()?.clearAiModelsCache) {
        await getElectronAPI()!.clearAiModelsCache();
      }
      setAiCacheOk(true);
      setAiCacheStatus(l({ en: 'AI model cache cleared successfully!', ar: 'تم محو ذاكرة نماذج الذكاء الاصطناعي بنجاح!', de: 'KI-Modell-Cache erfolgreich geleert!' }));
      setSafeTimeout(() => setAiCacheStatus(''), 4000);
    } catch (e: any) {
      setAiCacheOk(false);
      setAiCacheStatus(l({ en: 'Failed to clear cache: {msg}', ar: 'تعذّر محو الذاكرة المؤقتة: {msg}', de: 'Cache konnte nicht geleert werden: {msg}' }, { msg: e?.message || String(e) }));
    } finally {
      setIsClearingCache(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <section>
        <div className="premium-card bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 overflow-hidden">
          <div className="p-6 flex items-start gap-4">
            <div className="p-3 bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-2xl">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{l({ en: 'Ad & Tracker Blocking', ar: 'حظر الإعلانات وأدوات التتبّع', de: 'Werbe- und Tracker-Blocker' })}</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 mb-6 max-w-lg">
                {l({ en: 'King\'s Privacy Shield blocks malicious scripts, tracking cookies, and intrusive ads across all websites. It uses Ghostery and Cliqz blocklists to keep your browsing fast and secure.', ar: 'يحظر درع الخصوصية في King السكربتات الضارة وملفات تعريف الارتباط للتتبّع والإعلانات المزعجة في جميع المواقع، مستخدماً قوائم حظر Ghostery وCliqz ليبقى تصفحك سريعاً وآمناً.', de: 'Der Privacy Shield von King blockiert schädliche Skripte, Tracking-Cookies und aufdringliche Werbung auf allen Websites. Er nutzt die Sperrlisten von Ghostery und Cliqz, damit Ihr Surfen schnell und sicher bleibt.' })}
              </p>

              <div className="flex items-center justify-between gap-4 mb-2">
                <div>
                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{l({ en: 'Ad & tracker blocker', ar: 'حاظر الإعلانات وأدوات التتبّع', de: 'Werbe- und Tracker-Blocker' })}</div>
                  <div className={`text-xs mt-0.5 font-medium ${settings.privacyShield ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                    {settings.privacyShield ? l({ en: 'On: ads and trackers are blocked', ar: 'مفعّل: الإعلانات وأدوات التتبّع محظورة', de: 'An: Werbung und Tracker werden blockiert' }) : l({ en: 'Off: nothing is blocked', ar: 'معطّل: لا يُحظر شيء', de: 'Aus: Nichts wird blockiert' })}
                  </div>
                </div>
                <ToggleSwitch
                  ariaLabel={l({ en: 'Toggle the ad and tracker blocker', ar: 'تشغيل أو إيقاف حاظر الإعلانات وأدوات التتبّع', de: 'Werbe- und Tracker-Blocker umschalten' })}
                  checked={settings.privacyShield}
                  onToggle={() => onUpdateSettings({ privacyShield: !settings.privacyShield })}
                />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {l({ en: 'If a site does not open or asks you to turn off your ad blocker, switch this off, or add just that site below. Reload the open pages after changing it.', ar: 'إذا لم يفتح موقع أو طلب منك إيقاف حاظر الإعلانات، فأوقف هذا الخيار أو أضف ذلك الموقع وحده أدناه. أعد تحميل الصفحات المفتوحة بعد التغيير.', de: 'Wenn eine Website nicht lädt oder Sie bittet, den Werbeblocker auszuschalten, schalten Sie ihn hier aus oder fügen Sie nur diese Website unten hinzu. Laden Sie offene Seiten nach der Änderung neu.' })}
              </p>

              <div className="mt-5">
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1.5">{l({ en: 'Sites where blocking is off', ar: 'مواقع أُوقف فيها الحظر', de: 'Websites ohne Blocker' })}</div>
                <form
                  className="flex gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleAddBlockerOffSite();
                  }}
                >
                  <input
                    value={siteInput}
                    onChange={(event) => { setSiteInput(event.target.value); setSiteError(''); }}
                    placeholder="example.com"
                    aria-label={l({ en: 'Site where the blocker is off', ar: 'موقع أُوقف فيه الحاظر', de: 'Website ohne Blocker' })}
                    maxLength={253}
                    className="flex-1 min-w-0 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-100"
                  />
                  <button type="submit" className="px-3 py-1.5 rounded-lg bg-blue-500 text-white text-sm hover:bg-blue-600">{l({ en: 'Add', ar: 'إضافة', de: 'Hinzufügen' })}</button>
                </form>
                {siteError && <p className="text-xs text-red-600 mt-1" role="alert">{siteError}</p>}
                {blockerOffSites.length === 0 ? (
                  <p className="text-xs text-slate-400 mt-2">{l({ en: 'No exceptions. The blocker works on every site.', ar: 'لا استثناءات. الحاظر يعمل على كل المواقع.', de: 'Keine Ausnahmen. Der Blocker ist auf jeder Website aktiv.' })}</p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {blockerOffSites.map(host => (
                      <li key={host} className="flex items-center justify-between gap-2 py-1.5 px-3 rounded-lg border border-slate-200 dark:border-slate-700/50">
                        <code className="text-xs font-mono text-slate-700 dark:text-slate-200 truncate">{host}</code>
                        <button
                          type="button"
                          onClick={() => void saveBlockerOffSites(removeWhitelistHost(blockerOffSites, host))}
                          aria-label={l({ en: 'Turn the blocker back on for {host}', ar: 'إعادة تشغيل الحاظر لـ {host}', de: 'Blocker für {host} wieder einschalten' }, { host })}
                          className="text-xs text-slate-500 hover:text-red-600 shrink-0"
                        >
                          {l({ en: 'Remove', ar: 'إزالة', de: 'Entfernen' })}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4 border-b border-slate-200 dark:border-slate-800 pb-2">{l({ en: 'Tracking & Cookies', ar: 'التتبّع وملفات تعريف الارتباط', de: 'Tracking & Cookies' })}</h2>
        <div className="premium-card bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 divide-y divide-slate-100 dark:divide-slate-700/50">
          <div className="p-5 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{l({ en: 'Send a "Do Not Track" request', ar: 'إرسال طلب "عدم التتبّع"', de: '„Do Not Track“-Anfrage senden' })}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{l({ en: 'Request that your browsing traffic is not tracked', ar: 'اطلب من المواقع عدم تتبّع تصفحك', de: 'Websites bitten, Ihr Surfen nicht zu verfolgen' })}</div>
            </div>
            <ToggleSwitch
              ariaLabel={l({ en: 'Toggle Do Not Track request', ar: 'تشغيل أو إيقاف طلب عدم التتبّع', de: '„Do Not Track“ umschalten' })}
              checked={settings.doNotTrack}
              onToggle={() => onUpdateSettings({ doNotTrack: !settings.doNotTrack })}
            />
          </div>

          <div className="p-5 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{l({ en: 'Clear cookies on exit', ar: 'محو ملفات تعريف الارتباط عند الخروج', de: 'Cookies beim Beenden löschen' })}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{l({ en: 'Clear cookies and site data when you close all windows', ar: 'محو ملفات تعريف الارتباط وبيانات المواقع عند إغلاق كل النوافذ', de: 'Cookies und Websitedaten löschen, wenn alle Fenster geschlossen werden' })}</div>
            </div>
            <ToggleSwitch
              ariaLabel={l({ en: 'Toggle clear cookies on exit', ar: 'تشغيل أو إيقاف محو ملفات تعريف الارتباط عند الخروج', de: 'Cookies beim Beenden löschen umschalten' })}
              checked={settings.clearOnExit}
              onToggle={() => onUpdateSettings({ clearOnExit: !settings.clearOnExit })}
            />
          </div>

          <div className="p-5 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{l({ en: 'Google sign-in compatibility', ar: 'توافق تسجيل الدخول إلى Google', de: 'Google-Anmeldekompatibilität' })}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{l({ en: 'Lets you sign in to Google, YouTube and Gmail by identifying as Firefox on accounts.google.com only. A workaround: Google may stop accepting it at any time.', ar: 'يتيح لك تسجيل الدخول إلى Google وYouTube وGmail عبر التعريف بالمتصفح كـFirefox على accounts.google.com فقط. هذا حل التفافي، وقد يتوقف Google عن قبوله في أي وقت.', de: 'Ermöglicht die Anmeldung bei Google, YouTube und Gmail, indem sich King nur auf accounts.google.com als Firefox ausgibt. Ein Workaround: Google kann ihn jederzeit unterbinden.' })}</div>
            </div>
            <ToggleSwitch
              ariaLabel={l({ en: 'Toggle Google sign-in compatibility', ar: 'تشغيل أو إيقاف توافق تسجيل الدخول إلى Google', de: 'Google-Anmeldekompatibilität umschalten' })}
              checked={settings.googleSigninCompat ?? false}
              onToggle={() => onUpdateSettings({ googleSigninCompat: !settings.googleSigninCompat })}
            />
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4 border-b border-slate-200 dark:border-slate-800 pb-2">{l({ en: 'Binary Integrity', ar: 'سلامة ملفات التثبيت', de: 'Integrität der Installationsdateien' })}</h2>
        <div className="premium-card bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span>{l({ en: 'SHA-256 Checksum Verification', ar: 'التحقق ببصمة SHA-256', de: 'SHA-256-Prüfsummen' })}</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                REPRODUCIBLE CI
              </span>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {l({ en: 'Every release publishes a SHA256SUMS.txt file. Run the command below to verify your download before installing.', ar: 'ينشر كل إصدار ملف SHA256SUMS.txt. شغّل الأمر التالي للتحقق من الملف المنزّل قبل التثبيت.', de: 'Jedes Release enthält eine Datei SHA256SUMS.txt. Prüfen Sie Ihren Download vor der Installation mit diesem Befehl.' })} <code dir="ltr" className="font-mono bg-slate-100 dark:bg-slate-800 px-1 rounded">sha256sum -c SHA256SUMS.txt</code>
            </div>
          </div>
          <a
            href="https://github.com/MOT1209/King_Browser/releases"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30 text-xs font-semibold shrink-0 transition-colors"
          >
            <span>{l({ en: 'View Checksums', ar: 'عرض البصمات', de: 'Prüfsummen ansehen' })}</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4 border-b border-slate-200 dark:border-slate-800 pb-2">{l({ en: 'Site Permissions', ar: 'أذونات المواقع', de: 'Website-Berechtigungen' })}</h2>
        <div className="premium-card bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{l({ en: 'Remembered Authorizations', ar: 'الأذونات المحفوظة', de: 'Gespeicherte Berechtigungen' })}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {l({ en: 'Permissions granted to websites (camera, microphone, notifications, location) automatically expire after 30 days. You can revoke all remembered permissions immediately.', ar: 'تنتهي صلاحية الأذونات الممنوحة للمواقع (الكاميرا، الميكروفون، الإشعارات، الموقع) تلقائياً بعد 30 يوماً. يمكنك سحب كل الأذونات المحفوظة فوراً.', de: 'Website-Berechtigungen (Kamera, Mikrofon, Benachrichtigungen, Standort) laufen nach 30 Tagen automatisch ab. Sie können alle gespeicherten Berechtigungen sofort widerrufen.' })}
            </div>
            {rememberedPermCount > 0 && (
              <div className="mt-2 text-xs font-medium text-slate-600 dark:text-slate-400">
                {l({ en: 'Remembered permissions for {n} site(s).', ar: 'أذونات محفوظة لـ {n} من المواقع.', de: 'Gespeicherte Berechtigungen für {n} Website(s).' }, { n: rememberedPermCount })}
              </div>
            )}
          </div>
          <button
            onClick={handleResetRememberedPermissions}
            disabled={resettingPerms}
            className="px-4 py-2 bg-slate-100 dark:bg-slate-700/50 hover:bg-red-50 dark:hover:bg-red-500/10 text-slate-700 dark:text-slate-200 hover:text-red-600 dark:hover:text-red-400 border border-slate-200 dark:border-slate-700 hover:border-red-200 dark:hover:border-red-500/30 rounded-xl text-xs font-semibold transition-colors shrink-0"
          >
            {resetPermsSuccess ? l({ en: 'Permissions Cleared!', ar: 'تم مسح الأذونات!', de: 'Berechtigungen gelöscht!' }) : resettingPerms ? l({ en: 'Resetting...', ar: 'جارٍ إعادة الضبط...', de: 'Wird zurückgesetzt...' }) : l({ en: 'Reset All Permissions', ar: 'إعادة ضبط كل الأذونات', de: 'Alle Berechtigungen zurücksetzen' })}
          </button>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4 border-b border-slate-200 dark:border-slate-800 pb-2">{l({ en: 'AI Storage & Model Cache', ar: 'تخزين الذكاء الاصطناعي وذاكرة النماذج', de: 'KI-Speicher & Modell-Cache' })}</h2>
        <div className="premium-card bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-5 flex items-center justify-between mb-4">
          <div>
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{l({ en: 'Purge AI Model Cache', ar: 'محو ذاكرة نماذج الذكاء الاصطناعي', de: 'KI-Modell-Cache leeren' })}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{l({ en: 'Delete downloaded local WebLLM neural network weights to free up disk space', ar: 'احذف أوزان نماذج WebLLM المنزّلة لتحرير مساحة على القرص', de: 'Heruntergeladene lokale WebLLM-Modellgewichte löschen, um Speicherplatz freizugeben' })}</div>
            {aiCacheStatus && (
              <div className={`text-xs mt-2 font-medium ${aiCacheOk ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                {aiCacheStatus}
              </div>
            )}
          </div>
          <button
            onClick={handleClearAiCache}
            disabled={isClearingCache}
            className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-500/10 dark:hover:bg-red-500/20 dark:text-red-400 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {isClearingCache ? l({ en: 'Clearing...', ar: 'جارٍ المحو...', de: 'Wird geleert...' }) : l({ en: 'Clear AI Cache', ar: 'محو ذاكرة الذكاء الاصطناعي', de: 'KI-Cache leeren' })}
          </button>
        </div>

        <div className="premium-card bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Cpu className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                <span>{l({ en: 'GPU VRAM & Anti-Jank Engine Management', ar: 'إدارة ذاكرة الرسوميات (VRAM) ومنع التقطّع', de: 'GPU-VRAM- und Ruckel-Schutz-Verwaltung' })}</span>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 max-w-md">
                {l({ en: 'Auto-parks the resident 3B model from VRAM when idle to eliminate scroll jank and keep GPU memory available for heavy web browsing.', ar: 'يُفرغ نموذج 3B من ذاكرة VRAM تلقائياً عند الخمول لمنع تقطّع التمرير وإبقاء ذاكرة الرسوميات متاحة للتصفح الثقيل.', de: 'Entlädt das 3B-Modell bei Inaktivität automatisch aus dem VRAM, damit Scrollen flüssig bleibt und GPU-Speicher für anspruchsvolle Websites frei ist.' })}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-1 rounded-xl text-xs font-mono font-medium border ${
                aiEngineLoaded
                  ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
              }`}>
                {aiEngineLoaded ? `VRAM: ~${aiAgent.getVramEstimate()} MB` : l({ en: 'VRAM: 0 MB (Parked)', ar: 'VRAM: 0 MB (مُفرَغ)', de: 'VRAM: 0 MB (entladen)' })}
              </span>
              {aiEngineLoaded && (
                <button
                  onClick={async () => {
                    await aiAgent.parkModel();
                    setAiEngineLoaded(false);
                  }}
                  className="px-3 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition-colors"
                >
                  {l({ en: 'Park Now', ar: 'إفراغ الآن', de: 'Jetzt entladen' })}
                </button>
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-700/50 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">{l({ en: 'Inactivity Auto-Park Timeout', ar: 'مهلة الإفراغ التلقائي عند الخمول', de: 'Zeit bis zum automatischen Entladen' })}</div>
              <div className="text-[11px] text-slate-400">{l({ en: 'Duration before resident WebLLM weights are automatically released from VRAM.', ar: 'المدة قبل تحرير أوزان WebLLM من ذاكرة VRAM تلقائياً.', de: 'Dauer, bis WebLLM-Gewichte automatisch aus dem VRAM freigegeben werden.' })}</div>
            </div>
            <select
              value={aiVramTimeout}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                setAiVramTimeout(val);
                aiAgent.setAutoParkTimeoutMinutes(val);
              }}
              className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-700/80 border border-slate-200 dark:border-slate-600 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              <option value={1}>{l({ en: '1 minute', ar: 'دقيقة واحدة', de: '1 Minute' })}</option>
              <option value={3}>{l({ en: '3 minutes (Recommended)', ar: '3 دقائق (موصى به)', de: '3 Minuten (empfohlen)' })}</option>
              <option value={5}>{l({ en: '5 minutes', ar: '5 دقائق', de: '5 Minuten' })}</option>
              <option value={10}>{l({ en: '10 minutes', ar: '10 دقائق', de: '10 Minuten' })}</option>
              <option value={0}>{l({ en: 'Disabled (Always Resident)', ar: 'معطّل (يبقى محمّلاً دائماً)', de: 'Deaktiviert (immer geladen)' })}</option>
            </select>
          </div>
        </div>
      </section>
    </div>
  );
};
