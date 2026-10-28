import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Lock, 
  Unlock, 
  ShieldCheck, 
  ShieldAlert, 
  Cookie, 
  Camera, 
  Mic, 
  Bell, 
  MapPin, 
  ExternalLink, 
  X, 
  Check, 
  Info,
  Layers,
  Sparkles
} from 'lucide-react';
import { getUrlSecurityInfo } from '../utils/securityUtils';
import { useTranslation } from '../services/i18n';

interface SiteInfoPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  url: string;
  blockedAdsCount?: number;
  buttonRef?: React.RefObject<HTMLButtonElement | null>;
}

export const SiteInfoPopover: React.FC<SiteInfoPopoverProps> = ({
  isOpen,
  onClose,
  url,
  blockedAdsCount = 0,
  buttonRef
}) => {
  const { l } = useTranslation();
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        popoverRef.current && 
        !popoverRef.current.contains(e.target as Node) &&
        (!buttonRef?.current || !buttonRef.current.contains(e.target as Node))
      ) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    if (isOpen) {
      window.addEventListener('mousedown', handleOutsideClick);
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, buttonRef]);

  const sec = getUrlSecurityInfo(url);
  let domain = '';
  let protocol = 'https:';
  let origin = '';
  try {
    const parsed = new URL(url);
    domain = parsed.hostname;
    protocol = parsed.protocol;
    origin = parsed.protocol === 'chrome-extension:' ? `chrome-extension://${parsed.hostname}` : parsed.origin;
  } catch {
    domain = url || l({ en: 'New Tab', ar: 'تبويب جديد', de: 'Neuer Tab' });
  }

  const isDangerous = sec.level === 'dangerous';
  const isHttp = sec.level === 'http';
  const isFile = sec.level === 'file';
  const isInternal = sec.level === 'internal' || url.startsWith('king://') || url.startsWith('about:');
  const isSecure = sec.level === 'secure' || (!isDangerous && !isHttp && !isInternal && !isFile && protocol === 'https:');

  const [sitePerms, setSitePerms] = useState<Record<string, { allow: boolean; ts: number }>>({});

  useEffect(() => {
    setSitePerms({});
    if (!isOpen || isInternal || !domain) return;
    let isCancelled = false;
    const api = (window as any).electronAPI;
    if (api?.getSitePermissions) {
      api.getSitePermissions(origin).then((perms: any) => {
        if (!isCancelled && perms && typeof perms === 'object') {
          setSitePerms(perms);
        }
      }).catch(() => {
        if (!isCancelled) setSitePerms({});
      });
    }
    return () => {
      isCancelled = true;
    };
  }, [isOpen, isInternal, origin, domain]);

  const getPermStatus = (key: string) => {
    const p = sitePerms[key];
    if (!p) return { label: l({ en: 'Ask', ar: 'اسأل', de: 'Fragen' }), color: 'text-slate-400' };
    return p.allow 
      ? { label: l({ en: 'Allowed', ar: 'مسموح', de: 'Erlaubt' }), color: 'text-emerald-500 font-semibold' }
      : { label: l({ en: 'Blocked', ar: 'محظور', de: 'Blockiert' }), color: 'text-rose-500 font-semibold' };
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={popoverRef}
          initial={{ opacity: 0, y: -6, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.96 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className="absolute top-11 start-2 z-[99999] w-80 bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl border border-slate-200/80 dark:border-white/10 rounded-2xl shadow-2xl p-4 text-xs text-slate-700 dark:text-slate-200 select-none cursor-default"
        >
        {/* Header */}
        <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-100 dark:border-white/10">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`p-2 rounded-xl shrink-0 ${
              isDangerous ? 'bg-rose-500/10 text-rose-500' :
              isInternal ? 'bg-cyan-500/10 text-cyan-500' :
              isSecure ? 'bg-emerald-500/10 text-emerald-500' :
              'bg-amber-500/10 text-amber-500'
            }`}>
              {isDangerous ? <ShieldAlert className="w-4 h-4" /> :
               isInternal ? <Sparkles className="w-4 h-4" /> :
               isSecure ? <Lock className="w-4 h-4" /> :
               <Unlock className="w-4 h-4" />}
            </div>
            <div className="min-w-0">
              <div className="font-bold text-sm text-slate-800 dark:text-slate-100 truncate" title={domain}>
                {domain}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {isDangerous ? (sec.tooltip || l({ en: 'Phishing or dangerous site blocked', ar: 'حُظر موقع تصيّد أو موقع خطير', de: 'Phishing- oder gefährliche Website blockiert' })) :
                 isInternal ? l({ en: 'Internal King System Page', ar: 'صفحة داخلية من King', de: 'Interne King-Systemseite' }) :
                 isFile ? l({ en: 'Local Filesystem Resource', ar: 'ملف من جهازك', de: 'Lokale Datei' }) :
                 isSecure ? l({ en: 'Connection is secure (Encrypted TLS)', ar: 'الاتصال آمن (مشفّر بـ TLS)', de: 'Verbindung ist sicher (verschlüsselt per TLS)' }) :
                 l({ en: 'Connection is not secure (Unencrypted HTTP)', ar: 'الاتصال غير آمن (HTTP غير مشفّر)', de: 'Verbindung ist nicht sicher (unverschlüsseltes HTTP)' })}
              </div>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Security & Certificate Details */}
        <div className="py-3 space-y-2 border-b border-slate-100 dark:border-white/10">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <ShieldCheck className={`w-3.5 h-3.5 ${isDangerous ? 'text-rose-500' : isSecure ? 'text-emerald-500' : 'text-amber-500'}`} />
              {l({ en: 'Certificate', ar: 'الشهادة', de: 'Zertifikat' })}
            </span>
            <span className={`font-semibold ${isDangerous ? 'text-rose-500' : isSecure ? 'text-slate-700 dark:text-slate-200' : 'text-amber-500'}`}>
              {isDangerous ? l({ en: 'Blocked / Untrusted', ar: 'محظور / غير موثوق', de: 'Blockiert / nicht vertrauenswürdig' }) :
               isInternal ? l({ en: 'Built-in (Verified)', ar: 'مدمج (موثّق)', de: 'Integriert (verifiziert)' }) :
               isFile ? l({ en: 'Local origin', ar: 'مصدر محلي', de: 'Lokaler Ursprung' }) :
               isSecure ? l({ en: 'Valid & Encrypted', ar: 'صالحة ومشفّرة', de: 'Gültig & verschlüsselt' }) :
               l({ en: 'None (Unencrypted)', ar: 'لا توجد (غير مشفّر)', de: 'Keines (unverschlüsselt)' })}
            </span>
          </div>

          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Cookie className="w-3.5 h-3.5 text-amber-500" />
              {l({ en: 'Cookies & Site Data', ar: 'ملفات تعريف الارتباط وبيانات الموقع', de: 'Cookies & Websitedaten' })}
            </span>
            <span className="font-semibold text-slate-700 dark:text-slate-200">
              {isInternal ? l({ en: 'None', ar: 'لا شيء', de: 'Keine' }) : l({ en: 'Protected in Partition', ar: 'محمية في قسم منفصل', de: 'In eigener Partition geschützt' })}
            </span>
          </div>

          {blockedAdsCount > 0 && (
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-cyan-500" />
                {l({ en: 'Trackers & Ads Blocked', ar: 'أدوات التتبّع والإعلانات المحظورة', de: 'Blockierte Tracker & Werbung' })}
              </span>
              <span className="font-bold text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded-md">
                {l({ en: '{n} blocked', ar: '{n} محظور', de: '{n} blockiert' }, { n: blockedAdsCount })}
              </span>
            </div>
          )}
        </div>

        {/* Permissions */}
        {!isInternal && (
          <div className="pt-3 space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {l({ en: 'Permissions for this site', ar: 'أذونات هذا الموقع', de: 'Berechtigungen für diese Website' })}
            </div>
            
            <div className="grid grid-cols-2 gap-1.5">
              <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-white/5">
                <div className="flex items-center gap-1.5 truncate">
                  <Camera className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="text-[11px] truncate">{l({ en: 'Camera:', ar: 'الكاميرا:', de: 'Kamera:' })}</span>
                </div>
                <span className={`text-[11px] shrink-0 ${getPermStatus('media:video').color}`}>{getPermStatus('media:video').label}</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-white/5">
                <div className="flex items-center gap-1.5 truncate">
                  <Mic className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="text-[11px] truncate">{l({ en: 'Microphone:', ar: 'الميكروفون:', de: 'Mikrofon:' })}</span>
                </div>
                <span className={`text-[11px] shrink-0 ${getPermStatus('media:audio').color}`}>{getPermStatus('media:audio').label}</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-white/5">
                <div className="flex items-center gap-1.5 truncate">
                  <Bell className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="text-[11px] truncate">{l({ en: 'Notifications:', ar: 'الإشعارات:', de: 'Benachrichtigungen:' })}</span>
                </div>
                <span className={`text-[11px] shrink-0 ${getPermStatus('notifications').color}`}>{getPermStatus('notifications').label}</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-white/5">
                <div className="flex items-center gap-1.5 truncate">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="text-[11px] truncate">{l({ en: 'Location:', ar: 'الموقع الجغرافي:', de: 'Standort:' })}</span>
                </div>
                <span className={`text-[11px] shrink-0 ${getPermStatus('geolocation').color}`}>{getPermStatus('geolocation').label}</span>
              </div>
            </div>
          </div>
        )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
