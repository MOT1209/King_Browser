import React, { useState, useEffect } from 'react';
import { Cloud, Check, ShieldAlert, ShieldCheck, RefreshCw, Link2, Laptop, Bookmark, Key, Settings, FolderTree, Sparkles } from 'lucide-react';
import { UserSettings } from '../../types/browser';
import { syncService, KingSyncService, SyncStatus, SyncPreferences } from '../../services/syncService';
import { KingCloudAuthForm } from '../KingCloudAuthForm';
import { safeParseArrayWithBackup, safeParseObjectWithBackup } from '../../utils/safeStorage';
import { getLocale } from '../../services/i18n';
import { copyTextToClipboard } from '../../utils/clipboard';
import { useSafeTimeout } from '../../hooks/useSafeTimeout';
import { useTranslation } from '../../services/i18n';

function safeParseArray<T>(raw: string | null, key: string = 'unknown_array'): T[] {
  return safeParseArrayWithBackup<T>(key, raw, []);
}

function safeParsePasswords<T>(raw: string | null): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function safeParseObject<T extends object>(raw: string | null, fallback: T, key: string = 'unknown_object'): T {
  return safeParseObjectWithBackup<T>(key, raw, fallback);
}

export interface SyncSectionProps {
  settings: Pick<UserSettings, 'language'>;
  onPerformSync?: (mergedData?: any) => Promise<void> | void;
}

export const SyncSection: React.FC<SyncSectionProps> = ({
  settings,
  onPerformSync
}) => {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(syncService.getStatus());
  const { l } = useTranslation();
  const [syncLoading, setSyncLoading] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [syncErr, setSyncErr] = useState<string | null>(null);
  const [copiedSyncCode, setCopiedSyncCode] = useState(false);
  const { setSafeTimeout } = useSafeTimeout();

  useEffect(() => {
    const unsub = syncService.subscribe(status => {
      setSyncStatus(status);
    });
    return () => { unsub(); };
  }, []);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl">
      <section className="space-y-6">
        <div className="border-b border-slate-200 dark:border-slate-800/80 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 text-white shadow-sm shadow-cyan-500/20">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                {l({ en: 'King Cloud Sync', ar: 'مزامنة King السحابية', de: 'King Cloud Sync' })}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {l({ en: 'Access your bookmarks, saved passwords, browsing history, and settings from any computer.', ar: 'الوصول إلى إشاراتك المرجعية وكلمات مرورك المحفوظة وسجل تصفحك وإعداداتك من أي حاسوب.', de: 'Greifen Sie von jedem Computer auf Lesezeichen, gespeicherte Passwörter, Verlauf und Einstellungen zu.' })}
              </p>
            </div>
          </div>
        </div>

        {syncMsg && (
          <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-medium flex items-center gap-2.5">
            <Check className="w-4 h-4 shrink-0" />
            <span>{syncMsg}</span>
          </div>
        )}
        {syncErr && (
          <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs font-medium flex items-center gap-2.5">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>{syncErr}</span>
          </div>
        )}

        {syncStatus.isLoggedIn ? (
          /* ACTIVE SYNC CHAIN VIEW */
          <div className="space-y-6">
            {/* Active Sync Code Banner */}
            <div className="premium-card bg-white dark:bg-slate-800/60 rounded-3xl border border-slate-200 dark:border-slate-700/60 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 text-white font-bold text-xl flex items-center justify-center shadow-md shadow-cyan-500/20">
                  <Link2 className="w-7 h-7" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">{l({ en: 'King Sync Active', ar: 'مزامنة King مفعّلة', de: 'King Sync aktiv' })}</h3>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" /> {l({ en: 'E2EE Protected', ar: 'محمي بتشفير تام', de: 'E2EE-geschützt' })}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                    {l({ en: 'Code:', ar: 'الرمز:', de: 'Code:' })} <span className="font-mono text-cyan-600 dark:text-cyan-400 font-semibold">{syncStatus.syncCode || l({ en: 'Active Device', ar: 'الجهاز الحالي', de: 'Aktives Gerät' })}</span>
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    {l({ en: 'Status:', ar: 'الحالة:', de: 'Status:' })} <span className="text-emerald-500 font-medium">● {l({ en: 'Connected', ar: 'متصل', de: 'Verbunden' })}</span> · {l({ en: 'Last synced:', ar: 'آخر مزامنة:', de: 'Zuletzt synchronisiert:' })} {syncStatus.lastSyncedAt ? new Date(syncStatus.lastSyncedAt).toLocaleTimeString(getLocale(settings.language), { hour: '2-digit', minute: '2-digit' }) : l({ en: 'Just now', ar: 'الآن', de: 'Gerade eben' })}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={async () => {
                    if (syncLoading || syncStatus.isSyncing) return;
                    setSyncErr(null);
                    setSyncMsg(null);
                    setSyncLoading(true);
                    try {
                      if (onPerformSync) {
                        // Delegate directly to onPerformSync() to capture live in-memory React state
                        // rather than reading stale un-debounced localStorage entries.
                        await onPerformSync();
                      } else {
                        const rawB = localStorage.getItem('bookmarks');
                        const rawF = localStorage.getItem('folders_session');
                        const rawH = localStorage.getItem('browsing_history');
                        const rawP = await (window as any).electronAPI?.secureStoreGet?.('passwords');
                        const rawW = localStorage.getItem('workspaces_session');
                        const rawS = localStorage.getItem('user_settings');

                        const syncRes = await syncService.syncData({
                          bookmarks: safeParseArray(rawB),
                          folders: safeParseArray(rawF),
                          history: safeParseArray(rawH),
                          passwords: safeParsePasswords(rawP),
                          settings: safeParseObject(rawS, {} as any),
                          workspaces: safeParseArray(rawW)
                        });

                        if (syncRes && syncRes.mergedData) {
                          const md = syncRes.mergedData;
                          if (md.bookmarks) {
                            localStorage.setItem('bookmarks', JSON.stringify(md.bookmarks));
                            (window as any).electronAPI?.storeSet?.('bookmarks', JSON.stringify(md.bookmarks));
                          }
                          if (md.folders) {
                            localStorage.setItem('folders_session', JSON.stringify(md.folders));
                            (window as any).electronAPI?.storeSet?.('folders_session', JSON.stringify(md.folders));
                          }
                          if (md.history) {
                            localStorage.setItem('browsing_history', JSON.stringify(md.history));
                          }
                          if (md.workspaces) {
                            localStorage.setItem('workspaces_session', JSON.stringify(md.workspaces));
                            (window as any).electronAPI?.storeSet?.('workspaces_session', JSON.stringify(md.workspaces));
                          }
                          if (md.settings) {
                            localStorage.setItem('user_settings', JSON.stringify(md.settings));
                            (window as any).electronAPI?.storeSet?.('user_settings', JSON.stringify(md.settings));
                          }
                          if (md.passwords && (window as any).electronAPI?.secureStoreSet) {
                            await (window as any).electronAPI.secureStoreSet('passwords', JSON.stringify(md.passwords));
                          }
                        }
                      }

                      setSyncMsg(l({ en: 'Sync completed successfully!', ar: 'اكتملت المزامنة بنجاح!', de: 'Synchronisierung erfolgreich abgeschlossen!' }));
                      setSafeTimeout(() => setSyncMsg(null), 3000);
                    } catch (e: any) {
                      setSyncErr(e.message || l({ en: 'Sync failed', ar: 'فشلت المزامنة', de: 'Synchronisierung fehlgeschlagen' }));
                    } finally {
                      setSyncLoading(false);
                    }
                  }}
                  disabled={syncLoading || syncStatus.isSyncing}
                  className="px-4 py-2.5 bg-cyan-500 hover:bg-cyan-600 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncLoading || syncStatus.isSyncing ? 'animate-spin' : ''}`} />
                  <span>{syncLoading || syncStatus.isSyncing ? l({ en: 'Syncing...', ar: 'جارٍ المزامنة...', de: 'Wird synchronisiert...' }) : l({ en: 'Sync Now', ar: 'زامن الآن', de: 'Jetzt synchronisieren' })}</span>
                </button>

                <button
                  onClick={async () => {
                    if (logoutLoading) return;
                    setSyncErr(null);
                    setSyncMsg(null);
                    setLogoutLoading(true);
                    try {
                      await syncService.logout();
                      setSyncMsg(l({ en: 'Signed out.', ar: 'تم تسجيل الخروج.', de: 'Abgemeldet.' }));
                      setSafeTimeout(() => setSyncMsg(null), 3000);
                    } catch (e: any) {
                      setSyncErr(e?.message || l({ en: 'Sign out failed', ar: 'فشل تسجيل الخروج', de: 'Abmelden fehlgeschlagen' }));
                    } finally {
                      setLogoutLoading(false);
                    }
                  }}
                  disabled={logoutLoading}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-red-50 hover:text-red-600 dark:bg-slate-700/50 dark:hover:bg-red-500/10 dark:text-slate-300 dark:hover:text-red-400 rounded-xl text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                >
                  {logoutLoading ? l({ en: 'Signing out…', ar: 'جارٍ تسجيل الخروج…', de: 'Wird abgemeldet…' }) : l({ en: 'Leave Chain', ar: 'مغادرة سلسلة المزامنة', de: 'Kette verlassen' })}
                </button>
              </div>
            </div>

            {/* Pair Another Device Card - hidden until the pairing join flow exists */}
            {KingSyncService.PAIRING_AVAILABLE && (
            <div className="premium-card bg-white dark:bg-slate-800/60 rounded-3xl border border-slate-200 dark:border-slate-700/60 p-6 space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
                    <Laptop className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{l({ en: 'Pair Another Computer', ar: 'ربط حاسوب آخر', de: 'Weiteren Computer koppeln' })}</h4>
                    <p className="text-xs text-slate-400 dark:text-slate-500">{l({ en: 'Use your unique sync code to link other laptops or desktops.', ar: 'استخدم رمز المزامنة الخاص بك لربط أجهزة أخرى.', de: 'Verknüpfen Sie mit Ihrem Sync-Code weitere Laptops oder PCs.' })}</p>
                  </div>
                </div>

                <button
                  onClick={async () => {
                    try {
                      const rawB = localStorage.getItem('bookmarks');
                      const rawF = localStorage.getItem('folders_session');
                      const rawH = localStorage.getItem('browsing_history');
                      const rawP = await (window as any).electronAPI?.secureStoreGet?.('passwords');
                      const rawW = localStorage.getItem('workspaces_session');
                      const rawS = localStorage.getItem('user_settings');

                      const code = await syncService.generateSyncChainCode({
                        bookmarks: safeParseArray(rawB),
                        folders: safeParseArray(rawF),
                        history: safeParseArray(rawH),
                        passwords: safeParsePasswords(rawP),
                        settings: safeParseObject(rawS, {} as any),
                        workspaces: safeParseArray(rawW)
                      });

                      const copied = await copyTextToClipboard(code);
                      if (copied) {
                        setCopiedSyncCode(true);
                        setSyncMsg(l({ en: 'Sync code copied to clipboard: {code}', ar: 'نُسخ رمز المزامنة: {code}', de: 'Sync-Code in die Zwischenablage kopiert: {code}' }, { code }));
                        setSafeTimeout(() => setCopiedSyncCode(false), 3000);
                      } else {
                        setSyncMsg(l({ en: 'Sync code: {code} (copy it manually)', ar: 'رمز المزامنة: {code} (انسخه يدوياً)', de: 'Sync-Code: {code} (bitte manuell kopieren)' }, { code }));
                      }
                    } catch (err: any) {
                      setSyncErr(err.message || l({ en: 'Failed to generate code', ar: 'تعذّر إنشاء الرمز', de: 'Code konnte nicht erstellt werden' }));
                    }
                  }}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-700/60 hover:bg-cyan-500 hover:text-white dark:hover:bg-cyan-500 dark:hover:text-white text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Link2 className="w-3.5 h-3.5" />
                  <span>{copiedSyncCode ? l({ en: 'Code Copied!', ar: 'تم نسخ الرمز!', de: 'Code kopiert!' }) : l({ en: 'Copy Device Code', ar: 'نسخ رمز الجهاز', de: 'Gerätecode kopieren' })}</span>
                </button>
              </div>
            </div>
            )}

            {/* Synced Categories List */}
            <div className="premium-card bg-white dark:bg-slate-800/60 rounded-3xl border border-slate-200 dark:border-slate-700/60 p-6 space-y-4 shadow-sm">
              <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                {l({ en: 'Synchronized Data Categories', ar: 'فئات البيانات المتزامنة', de: 'Synchronisierte Datenkategorien' })}
              </h4>

              <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {[
                  { key: 'syncBookmarks', label: l({ en: 'Bookmarks & Folders', ar: 'الإشارات المرجعية والمجلدات', de: 'Lesezeichen & Ordner' }), icon: Bookmark, desc: l({ en: 'Your saved bookmarks and toolbar folders', ar: 'إشاراتك المرجعية المحفوظة ومجلدات الشريط', de: 'Ihre gespeicherten Lesezeichen und Ordner' }) },
                  { key: 'syncPasswords', label: l({ en: 'Saved Passwords (E2EE)', ar: 'كلمات المرور المحفوظة (تشفير تام)', de: 'Gespeicherte Passwörter (E2EE)' }), icon: Key, desc: l({ en: 'Zero-knowledge client-side encrypted with AES-256', ar: 'مشفّرة على جهازك بمعيار AES-256 دون أن يطّلع عليها أحد', de: 'Auf Ihrem Gerät mit AES-256 verschlüsselt (Zero-Knowledge)' }) },
                  { key: 'syncHistory', label: l({ en: 'Browsing History', ar: 'سجل التصفح', de: 'Browserverlauf' }), icon: Cloud, desc: l({ en: 'Your visited page history across devices', ar: 'سجل الصفحات التي زرتها عبر أجهزتك', de: 'Besuchte Seiten auf allen Geräten' }) },
                  { key: 'syncSettings', label: l({ en: 'Settings & Appearance', ar: 'الإعدادات والمظهر', de: 'Einstellungen & Darstellung' }), icon: Settings, desc: l({ en: 'Themes, search engine, shortcuts', ar: 'السمات، محرك البحث، الاختصارات', de: 'Designs, Suchmaschine, Tastenkürzel' }) },
                  { key: 'syncWorkspaces', label: l({ en: 'Workspaces', ar: 'مساحات العمل', de: 'Arbeitsbereiche' }), icon: FolderTree, desc: l({ en: 'Custom tab workspaces and icons', ar: 'مساحات عمل التبويبات وأيقوناتها', de: 'Eigene Tab-Arbeitsbereiche und Symbole' }) },
                ].map(item => {
                  const isChecked = syncStatus.user?.syncPreferences[item.key as keyof SyncPreferences] ?? true;
                  const Icon = item.icon;

                  return (
                    <button
                      key={item.key}
                      type="button"
                      role="switch"
                      aria-checked={isChecked}
                      aria-label={item.label}
                      onClick={() => {
                        if (syncStatus.user) {
                          syncService.updatePreferences({ [item.key]: !isChecked });
                        }
                      }}
                      className="w-full flex items-center justify-between py-3.5 first:pt-0 last:pb-0 cursor-pointer hover:opacity-80 transition-opacity text-start"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
                          <Icon className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">{item.label}</span>
                          <span className="text-[11px] text-slate-400 dark:text-slate-500">{item.desc}</span>
                        </div>
                      </div>

                      <div className={`w-9 h-5 rounded-full p-0.5 transition-colors ${isChecked ? 'bg-cyan-500' : 'bg-slate-200 dark:bg-slate-700'}`}>
                        <div className={`w-4 h-4 rounded-full bg-white transition-transform ${isChecked ? 'translate-x-4' : 'translate-x-0'}`} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : KingSyncService.PAIRING_AVAILABLE ? (
          /* PAIRING SETUP (NO EMAIL / NO PASSWORD) */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Option 1: Enter Code */}
            <div className="premium-card bg-white dark:bg-slate-800/60 rounded-3xl border border-slate-200 dark:border-slate-700/60 p-6 flex flex-col justify-between space-y-6 shadow-sm">
              <div className="space-y-3">
                <div className="p-3 w-fit rounded-2xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
                  <Laptop className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                  {l({ en: 'I have a Sync Code', ar: 'لديّ رمز مزامنة', de: 'Ich habe einen Sync-Code' })}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  {l({ en: 'Enter the pairing code generated from your other computer to sync all bookmarks, passwords, and history instantly.', ar: 'أدخل رمز الربط الذي أنشأته على حاسوبك الآخر لمزامنة الإشارات المرجعية وكلمات المرور والسجل فوراً.', de: 'Geben Sie den Kopplungscode Ihres anderen Computers ein, um Lesezeichen, Passwörter und Verlauf sofort zu synchronisieren.' })}
                </p>
              </div>

              <div className="space-y-3 pt-2">
                <input
                  type="text"
                  placeholder="king-xxxx-xxxx-xxxx-xxxx-xxxx-xxxx"
                  id="quick-pair-input"
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-cyan-500 font-mono"
                />
                <button
                  onClick={async () => {
                    const input = document.getElementById('quick-pair-input') as HTMLInputElement;
                    if (!input || !input.value.trim()) return;
                    setSyncLoading(true);
                    try {
                      await syncService.joinSyncChain(input.value.trim());
                      setSyncMsg(l({ en: 'Device paired successfully! Data synced.', ar: 'تم ربط الجهاز بنجاح ومزامنة البيانات!', de: 'Gerät erfolgreich gekoppelt! Daten synchronisiert.' }));
                    } catch (err: any) {
                      setSyncErr(err.message || l({ en: 'Invalid or expired sync code', ar: 'رمز المزامنة غير صالح أو منتهي', de: 'Ungültiger oder abgelaufener Sync-Code' }));
                    } finally {
                      setSyncLoading(false);
                    }
                  }}
                  className="w-full py-2.5 bg-cyan-500 hover:bg-cyan-600 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer shadow-xs flex items-center justify-center gap-2"
                >
                  <Link2 className="w-4 h-4" />
                  <span>{l({ en: 'Connect & Sync', ar: 'اتصال ومزامنة', de: 'Verbinden & synchronisieren' })}</span>
                </button>
              </div>
            </div>

            {/* Option 2: Generate Code on This Computer */}
            <div className="premium-card bg-white dark:bg-slate-800/60 rounded-3xl border border-slate-200 dark:border-slate-700/60 p-6 flex flex-col justify-between space-y-6 shadow-sm">
              <div className="space-y-3">
                <div className="p-3 w-fit rounded-2xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
                  <Sparkles className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                  {l({ en: 'Start New Encrypted Sync', ar: 'بدء مزامنة مشفّرة جديدة', de: 'Neue verschlüsselte Synchronisierung starten' })}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  {l({ en: 'Generate a secure 1-click pairing code on this computer to link your other laptops or desktops.', ar: 'أنشئ رمز ربط آمناً بنقرة واحدة على هذا الحاسوب لربط أجهزتك الأخرى.', de: 'Erstellen Sie auf diesem Computer mit einem Klick einen sicheren Kopplungscode für Ihre anderen Geräte.' })}
                </p>
              </div>

              <div className="space-y-3 pt-2">
                <button
                  onClick={async () => {
                    try {
                      const rawB = localStorage.getItem('bookmarks');
                      const rawF = localStorage.getItem('folders_session');
                      const rawH = localStorage.getItem('browsing_history');
                      const rawP = await (window as any).electronAPI?.secureStoreGet?.('passwords');
                      const rawW = localStorage.getItem('workspaces_session');
                      const rawS = localStorage.getItem('user_settings');

                      const code = await syncService.generateSyncChainCode({
                        bookmarks: safeParseArray(rawB),
                        folders: safeParseArray(rawF),
                        history: safeParseArray(rawH),
                        passwords: safeParsePasswords(rawP),
                        settings: safeParseObject(rawS, {} as any),
                        workspaces: safeParseArray(rawW)
                      });

                      const copied = await copyTextToClipboard(code);
                      if (copied) {
                        setCopiedSyncCode(true);
                        setSyncMsg(l({ en: 'Sync code: {code} (copied to clipboard)', ar: 'رمز المزامنة: {code} (تم النسخ)', de: 'Sync-Code: {code} (in die Zwischenablage kopiert)' }, { code }));
                        setSafeTimeout(() => setCopiedSyncCode(false), 4000);
                      } else {
                        setSyncMsg(l({ en: 'Sync code: {code} (copy it manually)', ar: 'رمز المزامنة: {code} (انسخه يدوياً)', de: 'Sync-Code: {code} (bitte manuell kopieren)' }, { code }));
                      }
                    } catch (err: any) {
                      setSyncErr(err.message || l({ en: 'Failed to generate code', ar: 'تعذّر إنشاء الرمز', de: 'Code konnte nicht erstellt werden' }));
                    }
                  }}
                  className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-semibold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                >
                  <Sparkles className="w-4 h-4 text-cyan-400 dark:text-cyan-600" />
                  <span>{copiedSyncCode ? l({ en: 'Sync Code Copied!', ar: 'تم نسخ رمز المزامنة!', de: 'Sync-Code kopiert!' }) : l({ en: 'Generate Sync Code', ar: 'إنشاء رمز مزامنة', de: 'Sync-Code erstellen' })}</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Pairing is not built yet: offering a code that can never be redeemed
             is worse than saying so, so this offers the one route that works. */
          <div className="premium-card bg-white dark:bg-slate-800/60 rounded-3xl border border-slate-200 dark:border-slate-700/60 p-6 shadow-sm">
            <div className="flex flex-col items-center text-center gap-3 mb-4">
              <div className="p-3 rounded-2xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
                <Laptop className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                {l({ en: 'Sign in to sync this browser', ar: 'سجّل الدخول لمزامنة هذا المتصفح', de: 'Anmelden, um diesen Browser zu synchronisieren' })}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-sm">
                {l({ en: 'Your bookmarks, history, tabs and workspaces sync through your King Cloud account. Pairing a second device with a sync code is not available yet.', ar: 'تتم مزامنة إشاراتك المرجعية وسجلّك وتبويباتك ومساحات عملك عبر حساب King Cloud. ربط جهاز ثانٍ برمز مزامنة غير متاح بعد.', de: 'Lesezeichen, Verlauf, Tabs und Arbeitsbereiche werden über Ihr King-Cloud-Konto synchronisiert. Das Koppeln eines zweiten Geräts per Sync-Code ist noch nicht verfügbar.' })}
              </p>
            </div>
            <KingCloudAuthForm
              onAuthenticated={() => {
                // The service notifies subscribers, which updates this card via
                // the subscription above. Nothing else to do here.
              }}
            />
          </div>
        )}
      </section>
    </div>
  );
};
