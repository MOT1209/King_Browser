import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  HelpCircle, 
  X, 
  Keyboard, 
  Sparkles, 
  Shield, 
  ShieldCheck,
  Info, 
  ExternalLink, 
  Command, 
  Globe, 
  Lock, 
  Cpu, 
  Layers, 
  BookOpen,
  Search,
  CheckCircle2,
  Sliders,
  Terminal,
  Volume2
} from 'lucide-react';
import { useModalFocusTrap } from '../hooks/useModalFocusTrap';
import { useTranslation } from '../services/i18n';
import type { ShortcutConfig } from '../types/browser';
import { bindingParts } from '../utils/keyboardShortcuts';
import {
  FIXED_SHORTCUTS,
  SHORTCUT_ACTIONS,
  SHORTCUT_GROUPS as SHORTCUT_GROUP_IDS,
  buildDefaultShortcuts,
  fixedShortcutParts
} from '../utils/shortcutCatalog';

const GithubIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/>
    <path d="M9 18c-4.51 2-5-2-7-2"/>
  </svg>
);

export interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'help' | 'shortcuts' | 'ai' | 'privacy' | 'about';
  /** The user's bindings, so the guide shows what Settings > Shortcuts set. */
  shortcuts?: Record<string, ShortcutConfig>;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

interface ShortcutRow {
  keys: string[];
  desc: string;
}

interface ShortcutRowGroup {
  title: string;
  shortcuts: ShortcutRow[];
}

export const HelpModal: React.FC<HelpModalProps> = React.memo(({
  isOpen,
  onClose,
  initialTab = 'help',
  shortcuts
}) => {
  const { l, t, language } = useTranslation();
  const [activeTab, setActiveTab] = useState<'help' | 'shortcuts' | 'ai' | 'privacy' | 'about'>(initialTab);
  const [shortcutSearch, setShortcutSearch] = useState('');
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
    if (window.electronAPI?.getAppVersion) {
      window.electronAPI.getAppVersion().then(ver => {
        if (ver) setAppVersion(ver);
      }).catch(() => {});
    }
    if (window.electronAPI?.getSystemVersions) {
      window.electronAPI.getSystemVersions().then(ver => {
        if (ver) setSystemVersions(ver);
      }).catch(() => {});
    }
  }, []);

  const containerRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(isOpen, onClose, containerRef);

  // Built from the same table as Settings > Shortcuts, so the guide always
  // shows the keys the user actually configured.
  const shortcutGroups = useMemo<ShortcutRowGroup[]>(() => {
    const bindings = { ...buildDefaultShortcuts(isMac), ...shortcuts };
    const groups: ShortcutRowGroup[] = SHORTCUT_GROUP_IDS.map(group => ({
      title: t(`shortcuts.groups.${group}`),
      shortcuts: SHORTCUT_ACTIONS
        .filter(action => action.group === group)
        .map(action => ({ keys: bindingParts(bindings[action.id], isMac), desc: t(`shortcuts.actions.${action.id}`) }))
        .filter(row => row.keys.length > 0),
    }));
    groups.push({
      title: t('shortcuts.fixedTitle'),
      shortcuts: FIXED_SHORTCUTS.map(fixed => ({ keys: fixedShortcutParts(fixed, isMac), desc: t(`shortcuts.actions.${fixed.id}`) })),
    });
    return groups;
  }, [shortcuts, language, t]);

  // Filter shortcuts based on query
  const filteredShortcutGroups = useMemo(() => {
    if (!shortcutSearch.trim()) return shortcutGroups;
    const q = shortcutSearch.toLowerCase();
    return shortcutGroups.map(group => ({
      ...group,
      shortcuts: group.shortcuts.filter(sc =>
        sc.desc.toLowerCase().includes(q) ||
        sc.keys.some(k => k.toLowerCase().includes(q))
      )
    })).filter(group => group.shortcuts.length > 0);
  }, [shortcutSearch, shortcutGroups]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-md p-4 sm:p-6" 
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: 'spring', damping: 28, stiffness: 400 }}
            ref={containerRef}
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-[#11141d] border border-slate-200/80 dark:border-white/10 rounded-2xl shadow-2xl w-full max-w-2xl h-[600px] flex flex-col overflow-hidden outline-none"
            tabIndex={-1}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/[0.08] bg-slate-50/90 dark:bg-[#151924]/90 backdrop-blur-md shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
                  <HelpCircle className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    {l({ en: 'King Browser Help & Documentation', ar: 'مساعدة King Browser ووثائقه', de: 'King Browser Hilfe & Dokumentation' })}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {l({ en: 'Keyboard shortcuts, AI features, and user guide', ar: 'اختصارات لوحة المفاتيح وميزات الذكاء الاصطناعي ودليل الاستخدام', de: 'Tastenkürzel, KI-Funktionen und Benutzerhandbuch' })}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-white/10 transition-colors cursor-pointer"
                title={l({ en: 'Close (Esc)', ar: 'إغلاق (Esc)', de: 'Schließen (Esc)' })}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center gap-1.5 px-6 py-2.5 border-b border-slate-100 dark:border-white/[0.06] bg-slate-50/40 dark:bg-black/20 shrink-0 overflow-x-auto no-scrollbar">
              <button
                onClick={() => setActiveTab('help')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'help'
                    ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 border border-transparent'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>{l({ en: 'Guide', ar: 'الدليل', de: 'Anleitung' })}</span>
              </button>

              <button
                onClick={() => setActiveTab('shortcuts')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'shortcuts'
                    ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 border border-transparent'
                }`}
              >
                <Keyboard className="w-3.5 h-3.5" />
                <span>{l({ en: 'Shortcuts', ar: 'الاختصارات', de: 'Tastenkürzel' })}</span>
              </button>

              <button
                onClick={() => setActiveTab('ai')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'ai'
                    ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 border border-transparent'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{l({ en: 'AI & Copilot', ar: 'الذكاء الاصطناعي والمساعد', de: 'KI & Copilot' })}</span>
              </button>

              <button
                onClick={() => setActiveTab('privacy')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'privacy'
                    ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 border border-transparent'
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                <span>{l({ en: 'Privacy', ar: 'الخصوصية', de: 'Datenschutz' })}</span>
              </button>

              <button
                onClick={() => setActiveTab('about')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'about'
                    ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 border border-transparent'
                }`}
              >
                <Info className="w-3.5 h-3.5" />
                <span>{l({ en: 'About', ar: 'حول', de: 'Über' })}</span>
              </button>
            </div>

            {/* Tab Body with Custom Scrollbar */}
            <div className="flex-1 modal-scroll p-6 space-y-6 text-slate-700 dark:text-slate-300">
              {/* GUIDE & OVERVIEW */}
              {activeTab === 'help' && (
                <div className="space-y-5">
                  <div className="p-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-start gap-3">
                    <Sparkles className="w-5 h-5 text-cyan-500 shrink-0 mt-0.5" />
                    <div className="text-xs space-y-1">
                      <h4 className="font-bold text-slate-900 dark:text-cyan-300">{l({ en: 'Welcome to King Browser', ar: 'مرحباً بك في King Browser', de: 'Willkommen bei King Browser' })}</h4>
                      <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                        {l({ en: 'King combines privacy-first browsing, local WebGPU AI models, Model Context Protocol (MCP), and split-screen workspaces into a lightweight desktop browser.', ar: 'يجمع King بين تصفح يضع الخصوصية أولاً، ونماذج ذكاء اصطناعي محلية عبر WebGPU، وبروتوكول MCP، ومساحات عمل بشاشة مقسومة، في متصفح سطح مكتب خفيف.', de: 'King vereint datenschutzorientiertes Surfen, lokale KI-Modelle per WebGPU, das Model Context Protocol (MCP) und Arbeitsbereiche mit geteiltem Bildschirm in einem schlanken Desktop-Browser.' })}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200/70 dark:border-white/10 space-y-1.5">
                      <div className="flex items-center gap-2 font-bold text-xs text-slate-900 dark:text-white">
                        <Layers className="w-4 h-4 text-cyan-500" />
                        <span>{l({ en: 'Split View & Workspaces', ar: 'العرض المقسوم ومساحات العمل', de: 'Geteilte Ansicht & Arbeitsbereiche' })}</span>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                        {l({ en: 'Drag any tab into the browser area to split screen horizontally or vertically. Organize tabs into distinct Workspaces.', ar: 'اسحب أي تبويب إلى منطقة المتصفح لتقسيم الشاشة أفقياً أو عمودياً، ونظّم تبويباتك في مساحات عمل مستقلة.', de: 'Ziehen Sie einen Tab in den Browserbereich, um den Bildschirm horizontal oder vertikal zu teilen. Ordnen Sie Tabs in eigene Arbeitsbereiche.' })}
                      </p>
                    </div>

                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200/70 dark:border-white/10 space-y-1.5">
                      <div className="flex items-center gap-2 font-bold text-xs text-slate-900 dark:text-white">
                        <Command className="w-4 h-4 text-purple-500" />
                        <span>{l({ en: 'Command Palette (⌘K)', ar: 'لوحة الأوامر (⌘K)', de: 'Befehlspalette (⌘K)' })}</span>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                        {l({ en: 'Press ⌘K or ⌘L to quickly search open tabs, history, bookmarks, or run commands with instant keyboard navigation.', ar: 'اضغط ⌘K أو ⌘L للبحث سريعاً في التبويبات المفتوحة والسجل والإشارات المرجعية، أو لتنفيذ الأوامر من لوحة المفاتيح.', de: 'Drücken Sie ⌘K oder ⌘L, um offene Tabs, Verlauf und Lesezeichen zu durchsuchen oder Befehle per Tastatur auszuführen.' })}
                      </p>
                    </div>

                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200/70 dark:border-white/10 space-y-1.5">
                      <div className="flex items-center gap-2 font-bold text-xs text-slate-900 dark:text-white">
                        <Shield className="w-4 h-4 text-emerald-500" />
                        <span>{l({ en: 'Privacy Shield & AdBlock', ar: 'درع الخصوصية وحاجب الإعلانات', de: 'Privacy Shield & Werbeblocker' })}</span>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                        {l({ en: 'Built-in engine blocks trackers, banner ads, and malware scripts automatically without third-party extensions.', ar: 'محرك مدمج يحظر أدوات التتبّع والإعلانات والسكربتات الضارة تلقائياً دون إضافات خارجية.', de: 'Die integrierte Engine blockiert Tracker, Werbebanner und Schadskripte automatisch, ohne Erweiterungen von Drittanbietern.' })}
                      </p>
                    </div>

                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200/70 dark:border-white/10 space-y-1.5">
                      <div className="flex items-center gap-2 font-bold text-xs text-slate-900 dark:text-white">
                        <Globe className="w-4 h-4 text-blue-500" />
                        <span>{l({ en: 'Chrome Extensions', ar: 'إضافات Chrome', de: 'Chrome-Erweiterungen' })}</span>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                        {l({ en: 'Install Chrome extensions directly from the Chrome Web Store or load unpacked development extensions.', ar: 'ثبّت إضافات Chrome مباشرة من Chrome Web Store أو حمّل إضافات غير مضغوطة قيد التطوير.', de: 'Installieren Sie Chrome-Erweiterungen direkt aus dem Chrome Web Store oder laden Sie entpackte Entwicklungserweiterungen.' })}
                      </p>
                    </div>

                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200/70 dark:border-white/10 space-y-1.5">
                      <div className="flex items-center gap-2 font-bold text-xs text-slate-900 dark:text-white">
                        <Volume2 className="w-4 h-4 text-amber-500" />
                        <span>{l({ en: 'Reader Mode & Voice TTS', ar: 'وضع القراءة والقراءة الصوتية', de: 'Lesemodus & Vorlesen' })}</span>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                        {l({ en: 'Distraction-free article reader mode with native OS speech synthesis to read web articles aloud.', ar: 'وضع قراءة خالٍ من المشتتات، مع قراءة المقالات بصوت عالٍ عبر محرك الكلام في نظامك.', de: 'Ablenkungsfreier Lesemodus mit Sprachausgabe des Betriebssystems, die Artikel vorliest.' })}
                      </p>
                    </div>

                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200/70 dark:border-white/10 space-y-1.5">
                      <div className="flex items-center gap-2 font-bold text-xs text-slate-900 dark:text-white">
                        <Sliders className="w-4 h-4 text-rose-500" />
                        <span>{l({ en: 'Themes & Customization', ar: 'السمات والتخصيص', de: 'Designs & Anpassung' })}</span>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                        {l({ en: 'Customize accent colors, vertical tab styles, start page animations (Nebula, Cyber Grid, Aurora Waves), and dark themes.', ar: 'خصّص ألوان التمييز وأنماط التبويبات العمودية وحركات صفحة البداية (Nebula وCyber Grid وAurora Waves) والسمات الداكنة.', de: 'Passen Sie Akzentfarben, vertikale Tab-Stile, Startseiten-Animationen (Nebula, Cyber Grid, Aurora Waves) und dunkle Designs an.' })}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* KEYBOARD SHORTCUTS */}
              {activeTab === 'shortcuts' && (
                <div className="space-y-4">
                  {/* Search Shortcuts Input */}
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder={l({ en: 'Search shortcuts (e.g. tab, zoom, reload, find)...', ar: 'ابحث في الاختصارات (مثلاً: تبويب، تكبير، تحميل، بحث)...', de: 'Tastenkürzel suchen (z. B. Tab, Zoom, Neu laden, Suchen)...' })}
                      value={shortcutSearch}
                      onChange={(e) => setShortcutSearch(e.target.value)}
                      className="w-full ps-10 pe-4 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 rounded-xl text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  {filteredShortcutGroups.length === 0 ? (
                    <div className="text-center py-8 text-xs text-slate-400">
                      {l({ en: 'No shortcuts matching "{q}"', ar: 'لا توجد اختصارات تطابق "{q}"', de: 'Keine Tastenkürzel für „{q}“' }, { q: shortcutSearch })}
                    </div>
                  ) : (
                    filteredShortcutGroups.map((group, idx) => (
                      <div key={idx} className="space-y-2">
                        <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          {group.title}
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {group.shortcuts.map((sc, sIdx) => (
                            <div 
                              key={sIdx}
                              className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200/70 dark:border-white/10"
                            >
                              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                                {sc.desc}
                              </span>
                              <div className="flex items-center gap-1" dir="ltr">
                                {sc.keys.map((k, kIdx) => (
                                  <kbd 
                                    key={kIdx} 
                                    className="px-2 py-0.5 text-[11px] font-semibold bg-white dark:bg-[#1a202c] border border-slate-300 dark:border-white/15 rounded-lg shadow-xs text-slate-800 dark:text-slate-200 min-w-[22px] text-center font-mono"
                                  >
                                    {k}
                                  </kbd>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* AI & COPILOT */}
              {activeTab === 'ai' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-purple-500/10 border border-purple-500/20 space-y-2">
                    <div className="flex items-center gap-2 font-bold text-sm text-purple-700 dark:text-purple-300">
                      <Cpu className="w-4 h-4" />
                      <span>{l({ en: 'On-Device Local AI (Web-LLM) & Cloud Models', ar: 'ذكاء اصطناعي محلي على جهازك (Web-LLM) ونماذج سحابية', de: 'Lokale KI auf dem Gerät (Web-LLM) & Cloud-Modelle' })}</span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      {l({ en: 'King Browser runs deep learning models directly on your device GPU using WebGPU, ensuring 100% privacy without sending web content to cloud servers.', ar: 'يشغّل King Browser نماذج التعلّم العميق مباشرة على معالج الرسوميات في جهازك عبر WebGPU، فتبقى خصوصيتك كاملة دون إرسال محتوى الصفحات إلى خوادم سحابية.', de: 'King Browser führt Deep-Learning-Modelle per WebGPU direkt auf der GPU Ihres Geräts aus – ohne Webinhalte an Cloud-Server zu senden.' })}
                    </p>
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {l({ en: 'How to use AI Features', ar: 'كيف تستخدم ميزات الذكاء الاصطناعي', de: 'So nutzen Sie die KI-Funktionen' })}
                    </h4>
                    <div className="space-y-2.5">
                      <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200/70 dark:border-white/10 text-xs space-y-1">
                        <p className="font-semibold text-slate-800 dark:text-slate-200">{l({ en: '1. Address Bar Quick Trigger', ar: '1. التشغيل السريع من شريط العنوان', de: '1. Schnellstart über die Adressleiste' })}</p>
                        <p className="text-slate-500 dark:text-slate-400">{l({ en: 'Type @ai followed by Tab in the address bar to ask the AI assistant immediately.', ar: 'اكتب ‎@ai‎ ثم اضغط Tab في شريط العنوان لسؤال مساعد الذكاء الاصطناعي فوراً.', de: 'Geben Sie in der Adressleiste @ai ein und drücken Sie Tab, um sofort den KI-Assistenten zu fragen.' })}</p>
                      </div>
                      <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200/70 dark:border-white/10 text-xs space-y-1">
                        <p className="font-semibold text-slate-800 dark:text-slate-200">{l({ en: '2. Side Panel Copilot', ar: '2. المساعد في اللوحة الجانبية', de: '2. Copilot in der Seitenleiste' })}</p>
                        <p className="text-slate-500 dark:text-slate-400">{l({ en: 'Click the AI button in the top bar to open the side panel for page summaries, questions and answers, and translations.', ar: 'انقر زر AI في الشريط العلوي لفتح اللوحة الجانبية لتلخيص الصفحات وطرح الأسئلة والترجمة.', de: 'Klicken Sie oben auf die Schaltfläche AI, um die Seitenleiste für Zusammenfassungen, Fragen und Übersetzungen zu öffnen.' })}</p>
                      </div>
                      <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200/70 dark:border-white/10 text-xs space-y-1">
                        <p className="font-semibold text-slate-800 dark:text-slate-200">{l({ en: '3. Model Context Protocol (MCP)', ar: '3. بروتوكول سياق النموذج (MCP)', de: '3. Model Context Protocol (MCP)' })}</p>
                        <p className="text-slate-500 dark:text-slate-400">{l({ en: 'Connect local tools, SQLite, code interpreters, and external agents directly to King Browser via standard MCP JSON-RPC on port 3020.', ar: 'اربط الأدوات المحلية وSQLite ومفسّرات الأكواد والوكلاء الخارجيين مباشرة بـ King Browser عبر MCP JSON-RPC القياسي على المنفذ 3020.', de: 'Verbinden Sie lokale Werkzeuge, SQLite, Code-Interpreter und externe Agenten über Standard-MCP-JSON-RPC auf Port 3020 direkt mit King Browser.' })}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* PRIVACY & SECURITY */}
              {activeTab === 'privacy' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 space-y-2">
                    <div className="flex items-center gap-2 font-bold text-sm text-emerald-700 dark:text-emerald-300">
                      <Lock className="w-4 h-4" />
                      <span>{l({ en: 'Security & Zero-Telemetry Architecture', ar: 'الأمان وبنية بلا قياس عن بُعد', de: 'Sicherheit & Architektur ohne Telemetrie' })}</span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      {l({ en: 'King Browser is designed with strict sandbox isolation. It does not track your browsing history, record search queries, or send telemetry to external servers.', ar: 'صُمّم King Browser بعزل صارم داخل بيئة معزولة. لا يتتبّع سجل تصفحك، ولا يسجّل عمليات بحثك، ولا يرسل بيانات قياس إلى خوادم خارجية.', de: 'King Browser ist mit strikter Sandbox-Isolation gebaut. Er verfolgt Ihren Verlauf nicht, speichert keine Suchanfragen und sendet keine Telemetrie an externe Server.' })}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200/70 dark:border-white/10 space-y-1">
                      <p className="font-bold text-slate-800 dark:text-slate-200">{l({ en: 'Encrypted Password Vault', ar: 'خزنة كلمات مرور مشفّرة', de: 'Verschlüsselter Passworttresor' })}</p>
                      <p className="text-slate-500 dark:text-slate-400 text-[11px]">{l({ en: 'Passwords and credentials are encrypted using macOS Keychain / Windows DPAPI OS-level native cryptography.', ar: 'تُشفَّر كلمات المرور وبيانات الدخول بتشفير النظام نفسه (Keychain في macOS وDPAPI في Windows).', de: 'Passwörter und Zugangsdaten werden mit der Verschlüsselung des Betriebssystems geschützt (macOS-Schlüsselbund / Windows DPAPI).' })}</p>
                    </div>
                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200/70 dark:border-white/10 space-y-1">
                      <p className="font-bold text-slate-800 dark:text-slate-200">{l({ en: 'Permission Check Isolation', ar: 'عزل فحص الأذونات', de: 'Isolierte Berechtigungsprüfung' })}</p>
                      <p className="text-slate-500 dark:text-slate-400 text-[11px]">{l({ en: 'Strict permission checks block background microphone/camera probing and fingerprinting exploits.', ar: 'فحوص أذونات صارمة تمنع المواقع من استخدام الميكروفون أو الكاميرا في الخلفية ومن محاولات بصمة المتصفح.', de: 'Strenge Berechtigungsprüfungen verhindern heimliche Mikrofon-/Kamerazugriffe und Fingerprinting.' })}</p>
                    </div>
                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200/70 dark:border-white/10 space-y-1">
                      <p className="font-bold text-slate-800 dark:text-slate-200">{l({ en: 'AdBlock & Tracking Shield', ar: 'حاجب الإعلانات ودرع التتبّع', de: 'Werbeblocker & Tracking-Schutz' })}</p>
                      <p className="text-slate-500 dark:text-slate-400 text-[11px]">{l({ en: 'Hardware-accelerated adblocker strips tracking queries and malicious scripts before network execution.', ar: 'يحذف حاجب الإعلانات معاملات التتبّع والسكربتات الضارة قبل تنفيذ الطلبات.', de: 'Der Werbeblocker entfernt Tracking-Parameter und Schadskripte, bevor Anfragen ausgeführt werden.' })}</p>
                    </div>
                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200/70 dark:border-white/10 space-y-1">
                      <p className="font-bold text-slate-800 dark:text-slate-200">{l({ en: 'Zero-Knowledge Encrypted Sync', ar: 'مزامنة مشفّرة دون اطلاع أحد', de: 'Verschlüsselte Zero-Knowledge-Synchronisierung' })}</p>
                      <p className="text-slate-500 dark:text-slate-400 text-[11px]">{l({ en: 'Multi-device synchronization encrypted with client-side AES-256-GCM keys.', ar: 'مزامنة بين الأجهزة مشفّرة بمفاتيح AES-256-GCM على جهازك.', de: 'Synchronisierung zwischen Geräten, verschlüsselt mit AES-256-GCM-Schlüsseln auf Ihrem Gerät.' })}</p>
                    </div>
                  </div>

                  {/* Binary Integrity Card */}
                  <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 font-bold text-xs text-emerald-800 dark:text-emerald-300">
                        <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        <span>{l({ en: 'Binary Integrity Verification', ar: 'التحقق من سلامة ملفات التثبيت', de: 'Integritätsprüfung der Installationsdateien' })}</span>
                      </div>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                        SHA-256
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      {l({ en: 'Every release publishes a SHA256SUMS.txt file. Verify your download with this command before installing:', ar: 'ينشر كل إصدار ملف SHA256SUMS.txt. تحقّق من الملف المنزّل بهذا الأمر قبل التثبيت:', de: 'Jedes Release enthält eine Datei SHA256SUMS.txt. Prüfen Sie Ihren Download vor der Installation mit diesem Befehl:' })} <code dir="ltr" className="font-mono bg-slate-100 dark:bg-slate-800 px-1 rounded">sha256sum -c SHA256SUMS.txt</code>
                    </p>
                    <div className="pt-1">
                      <a
                        href="https://github.com/MOT1209/King_Browser/releases"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
                      >
                        <span>{l({ en: 'View Checksums on GitHub Releases', ar: 'عرض البصمات في إصدارات GitHub', de: 'Prüfsummen auf GitHub Releases ansehen' })}</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>

                </div>
              )}

              {/* ABOUT */}
              {activeTab === 'about' && (
                <div className="space-y-5 text-center py-2">
                  <div className="w-20 h-20 mx-auto rounded-3xl p-1 flex items-center justify-center relative overflow-hidden">
                    <img 
                      src="./logo.png" 
                      alt="King Browser" 
                      className="w-full h-full object-contain" 
                    />
                  </div>
                  
                  <div className="space-y-1">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">King Browser</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{l({ en: 'Version {v} (Open Source Edition)', ar: 'الإصدار {v} (الإصدار مفتوح المصدر)', de: 'Version {v} (Open-Source-Edition)' }, { v: appVersion })}</p>
                    <p className="text-xs text-cyan-600 dark:text-cyan-400 font-medium font-mono">{l({ en: 'Fast • AI-Powered • Private', ar: 'سريع • ذكي • خاص', de: 'Schnell • KI-gestützt • Privat' })}</p>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200/70 dark:border-white/10 max-w-md mx-auto text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {l({ en: 'Designed and built with modern web technologies: React, TypeScript, Tailwind CSS, Electron, Web-LLM, and Model Context Protocol.', ar: 'صُمّم وبُني بتقنيات ويب حديثة: React وTypeScript وTailwind CSS وElectron وWeb-LLM وبروتوكول MCP.', de: 'Entwickelt mit modernen Webtechnologien: React, TypeScript, Tailwind CSS, Electron, Web-LLM und Model Context Protocol.' })}
                  </div>

                  {systemVersions && (
                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200/70 dark:border-white/10 max-w-md mx-auto text-start">
                      <div className="text-[11px] font-semibold text-slate-800 dark:text-slate-200 mb-2 flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                        <span>{l({ en: 'Engine & Security Patch Transparency', ar: 'شفافية المحرك والتحديثات الأمنية', de: 'Transparenz zu Engine und Sicherheitspatches' })}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div className="p-2 rounded-lg bg-white/60 dark:bg-black/20 border border-slate-200/50 dark:border-white/5">
                          <span className="text-slate-400 block text-[9px] uppercase font-semibold">{l({ en: 'Chromium Engine', ar: 'محرك Chromium', de: 'Chromium-Engine' })}</span>
                          <span className="font-mono text-slate-800 dark:text-slate-200">{systemVersions.chrome || '134.0.6998'}</span>
                        </div>
                        <div className="p-2 rounded-lg bg-white/60 dark:bg-black/20 border border-slate-200/50 dark:border-white/5">
                          <span className="text-slate-400 block text-[9px] uppercase font-semibold">{l({ en: 'Electron Runtime', ar: 'بيئة Electron', de: 'Electron-Laufzeit' })}</span>
                          <span className="font-mono text-slate-800 dark:text-slate-200">{systemVersions.electron}</span>
                        </div>
                        <div className="p-2 rounded-lg bg-white/60 dark:bg-black/20 border border-slate-200/50 dark:border-white/5">
                          <span className="text-slate-400 block text-[9px] uppercase font-semibold">{l({ en: 'V8 JS Engine', ar: 'محرك V8 لـ JavaScript', de: 'V8-JS-Engine' })}</span>
                          <span className="font-mono text-slate-800 dark:text-slate-200">{systemVersions.v8}</span>
                        </div>
                        <div className="p-2 rounded-lg bg-white/60 dark:bg-black/20 border border-slate-200/50 dark:border-white/5">
                          <span className="text-slate-400 block text-[9px] uppercase font-semibold">{l({ en: 'Architecture', ar: 'المعمارية', de: 'Architektur' })}</span>
                          <span className="font-mono text-slate-800 dark:text-slate-200">{systemVersions.platform} ({systemVersions.arch})</span>
                        </div>
                      </div>
                      <div className="mt-2 text-[10px] text-slate-400 dark:text-slate-500 leading-normal">
                        {l({ en: 'Security patch cadence tracked against upstream releases with zero-delay automated deployment.', ar: 'تُتابَع التحديثات الأمنية مقابل الإصدارات الأصلية وتُنشر آلياً دون تأخير.', de: 'Sicherheitspatches werden mit den Upstream-Releases abgeglichen und automatisch ohne Verzögerung ausgeliefert.' })}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                    <button
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent('open-changelog'));
                        onClose();
                      }}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors shadow-sm cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>{l({ en: 'What\'s New (Changelog)', ar: 'ما الجديد (سجل التغييرات)', de: 'Neuigkeiten (Änderungsprotokoll)' })}</span>
                    </button>
                    <a
                      href="https://github.com/MOT1209/King_Browser"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-semibold text-xs hover:opacity-90 transition-opacity shadow-sm cursor-pointer"
                    >
                      <GithubIcon className="w-4 h-4" />
                      <span>{l({ en: 'GitHub Repository', ar: 'مستودع GitHub', de: 'GitHub-Repository' })}</span>
                    </a>
                    <a
                      href="https://github.com/MOT1209/King_Browser/releases"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 font-semibold text-xs transition-colors cursor-pointer"
                      title={l({ en: 'Verify SHA-256 checksums on GitHub Releases', ar: 'التحقق من بصمات SHA-256 في إصدارات GitHub', de: 'SHA-256-Prüfsummen auf GitHub Releases prüfen' })}
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>{l({ en: 'SHA-256 Checksums', ar: 'بصمات SHA-256', de: 'SHA-256-Prüfsummen' })}</span>
                    </a>
                    <a
                      href="https://github.com/MOT1209/King_Browser/issues"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/15 text-slate-800 dark:text-slate-200 font-semibold text-xs transition-colors cursor-pointer border border-slate-200 dark:border-white/10"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>{l({ en: 'Report Issue', ar: 'الإبلاغ عن مشكلة', de: 'Problem melden' })}</span>
                    </a>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3.5 border-t border-slate-100 dark:border-white/[0.08] bg-slate-50/90 dark:bg-[#151924]/90 flex items-center justify-between text-xs text-slate-500 shrink-0">
              <span className="flex items-center gap-1.5 font-mono text-[11px]">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> {l({ en: 'King Browser Help Center', ar: 'مركز مساعدة King Browser', de: 'King Browser Hilfecenter' })}
              </span>
              <button
                onClick={onClose}
                className="px-4 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-white/10 dark:hover:bg-white/15 text-slate-700 dark:text-slate-200 font-semibold transition-colors cursor-pointer"
              >
                {l({ en: 'Close (Esc)', ar: 'إغلاق (Esc)', de: 'Schließen (Esc)' })}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
});
