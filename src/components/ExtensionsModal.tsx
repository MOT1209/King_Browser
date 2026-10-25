import React, { useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Puzzle, Power, Trash2, Settings, ExternalLink, FolderOpen, Play, Shield, AlertTriangle, CheckCircle } from 'lucide-react';
import { Extension, Tab } from '../types/browser';
import { useModalFocusTrap } from '../hooks/useModalFocusTrap';
import { showAlert } from '../utils/confirmDialog';
import { useDialogA11y } from '../hooks/useDialogA11y';
import { useTranslation } from '../services/i18n';

interface ExtensionPermission {
  name: string;
  description: string;
  isHostPermission: boolean;
}

interface ExtensionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  extensions: Extension[];
  activeTab?: Tab | null;
  onToggleExtension?: (id: string) => void;
  onRemoveExtension?: (id: string) => void;
  onManageExtensions?: () => void;
  onOpenUrl?: (url: string) => void;
  // Permission review dialog
  pendingPermissionReview?: {
    extensionId: string;
    extensionName: string;
    permissions: ExtensionPermission[];
  } | null;
  onPermissionReviewResponse?: (allowed: boolean) => void;
}

interface PermissionReviewDialogProps {
  extensionId: string;
  extensionName: string;
  permissions: ExtensionPermission[];
  onConfirm: (allowed: boolean) => void;
}

const PermissionReviewDialog: React.FC<PermissionReviewDialogProps> = ({
  extensionId,
  extensionName,
  permissions,
  onConfirm,
}) => {
  const { l } = useTranslation();
  const [rememberDecision, setRememberDecision] = useState(false);

  const handleConfirm = useCallback((allowed: boolean) => {
    onConfirm(allowed);
  }, [onConfirm]);

  return (
    <motion.div
      onClick={(e) => e.stopPropagation()}
      initial={{ opacity: 0, scale: 0.95, y: 15 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 10 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className="w-full max-w-lg bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl rounded-2xl shadow-2xl border border-slate-200/80 dark:border-white/10 overflow-hidden flex flex-col outline-none"
    >
      <div className="px-5 py-4 border-b border-slate-100 dark:border-white/10 flex justify-between items-center bg-amber-50/80 dark:bg-amber-900/30 backdrop-blur-md">
        <div className="flex items-center gap-2.5 text-slate-800 dark:text-slate-100">
          <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <Shield className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold">{l({ en: 'Review Permissions', ar: 'مراجعة الأذونات', de: 'Berechtigungen prüfen' })}</h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">{l({ en: 'Extension requests access to the following', ar: 'تطلب الإضافة الوصول إلى ما يلي', de: 'Die Erweiterung fordert Zugriff auf Folgendes' })}</p>
          </div>
        </div>
      </div>

      <div className="p-4 max-h-[60vh] overflow-y-auto">
        <div className="mb-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-white/10">
          <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 mb-2">
            <Puzzle className="w-4 h-4 text-cyan-500" />
            <span className="font-medium">{extensionName}</span>
            <span className="text-[10px] text-slate-400 font-mono">({extensionId})</span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {l({ en: 'This extension is requesting permission to access certain data and features. Please review the permissions below before installing.', ar: 'تطلب هذه الإضافة إذناً للوصول إلى بيانات وميزات معيّنة. يرجى مراجعة الأذونات أدناه قبل التثبيت.', de: 'Diese Erweiterung fordert Zugriff auf bestimmte Daten und Funktionen an. Bitte prüfen Sie die Berechtigungen vor der Installation.' })}
          </p>
        </div>

        <div className="space-y-2">
          {permissions.map((perm) => (
            <div
              key={perm.name}
              className="flex items-start gap-3 p-3 rounded-xl bg-slate-50/50 dark:bg-white/[0.02] border border-slate-100/50 dark:border-white/5"
            >
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center mt-0.5">
                {perm.isHostPermission ? (
                  <AlertTriangle className="w-4 h-4" />
                ) : (
                  <CheckCircle className="w-4 h-4" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  {perm.name}
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {perm.description}
                </p>
                {perm.isHostPermission && (
                  <span className="inline-block mt-1.5 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/30 rounded-full">
                    {l({ en: 'Host Permission', ar: 'إذن الوصول إلى موقع', de: 'Website-Berechtigung' })}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {permissions.length === 0 && (
          <div className="py-8 px-6 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-3">
              <CheckCircle className="w-6 h-6" />
            </div>
            <h3 className="text-slate-800 dark:text-slate-200 font-medium mb-1">{l({ en: 'No special permissions required', ar: 'لا تتطلب أذونات خاصة', de: 'Keine besonderen Berechtigungen erforderlich' })}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs">
              {l({ en: 'This extension doesn\'t request any additional permissions beyond basic functionality.', ar: 'لا تطلب هذه الإضافة أي أذونات إضافية تتجاوز الوظائف الأساسية.', de: 'Diese Erweiterung benötigt keine Berechtigungen über die Grundfunktionen hinaus.' })}
            </p>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-slate-100 dark:border-white/10 bg-slate-50/50 dark:bg-slate-800/30 flex flex-col gap-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={rememberDecision}
            onChange={(e) => setRememberDecision(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
          />
          <span className="text-xs text-slate-600 dark:text-slate-400">
            {l({ en: 'Remember this decision for future installations', ar: 'تذكّر هذا القرار في عمليات التثبيت القادمة', de: 'Diese Entscheidung für künftige Installationen merken' })}
          </span>
        </label>
        <div className="flex gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleConfirm(false);
            }}
            className="flex-1 py-2 px-3 bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-white/10 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
          >
            <X className="w-3.5 h-3.5" /> {l({ en: 'Cancel', ar: 'إلغاء', de: 'Abbrechen' })}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleConfirm(true);
            }}
            className="flex-1 py-2 px-3 bg-cyan-500 hover:bg-cyan-600 text-white border border-cyan-500 rounded-xl text-xs font-medium transition-colors flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
          >
            <CheckCircle className="w-3.5 h-3.5" /> {l({ en: 'Allow & Install', ar: 'سماح وتثبيت', de: 'Zulassen & installieren' })}
          </button>
        </div>
      </div>
    </motion.div>
  );
};

export const ExtensionsModal: React.FC<ExtensionsModalProps> = ({
  isOpen,
  onClose,
  extensions,
  activeTab,
  onToggleExtension,
  onRemoveExtension,
  onManageExtensions,
  onOpenUrl,
  pendingPermissionReview,
  onPermissionReviewResponse
}) => {
  const { l } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  useDialogA11y({ isOpen, onClose, containerRef });
  useModalFocusTrap(isOpen, onClose, containerRef);

  const handleLaunchExtension = (ext: Extension, e?: React.MouseEvent) => {
    if (ext.popupUrl) {
      const cleanPopup = ext.popupUrl.replace(/^\.?\//, '');
      const url = `chrome-extension://${ext.id}/${cleanPopup}`;
      if ((window as any).electronAPI?.openExtensionPopup) {
        let bounds: any = undefined;
        if (e) {
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          bounds = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        }
        (window as any).electronAPI.openExtensionPopup(
          url, 
          bounds,
          activeTab ? {
            id: activeTab.id,
            url: activeTab.url,
            title: activeTab.title,
            favIconUrl: activeTab.favicon,
            webContentsId: activeTab.webContentsId,
            isIncognito: Boolean(activeTab.isIncognito)
          } : undefined
        );
        onClose();
      } else if (onOpenUrl) {
        onOpenUrl(url);
        onClose();
      }
    } else if (ext.optionsUrl) {
      const cleanOptions = ext.optionsUrl.replace(/^\.?\//, '');
      const url = `chrome-extension://${ext.id}/${cleanOptions}`;
      if (onOpenUrl) {
        onOpenUrl(url);
        onClose();
      }
    }
  };

  const handleLoadUnpacked = async () => {
    try {
      if ((window as any).electronAPI?.selectExtensionFolder && (window as any).electronAPI?.installExtension) {
        const result = await (window as any).electronAPI.selectExtensionFolder();
        if (!result.canceled && result.folderPath) {
          const installRes = await (window as any).electronAPI.installExtension(result.folderPath);
          if (installRes.error) {
            void showAlert({ title: l({ en: 'Extensions', ar: 'الإضافات', de: 'Erweiterungen' }), message: l({ en: 'Extension load error: {error}', ar: 'خطأ في تحميل الإضافة: {error}', de: 'Fehler beim Laden der Erweiterung: {error}' }, { error: String(installRes.error) }) });
          }
        }
      }
    } catch (err: any) {
      console.error('Failed to load unpacked extension:', err);
      void showAlert({ title: l({ en: 'Extensions', ar: 'الإضافات', de: 'Erweiterungen' }), message: err?.message || l({ en: 'Failed to load extension.', ar: 'تعذّر تحميل الإضافة.', de: 'Erweiterung konnte nicht geladen werden.' }) });
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md" onClick={onClose}>
          {pendingPermissionReview && onPermissionReviewResponse ? (
            <PermissionReviewDialog
              extensionId={pendingPermissionReview.extensionId}
              extensionName={pendingPermissionReview.extensionName}
              permissions={pendingPermissionReview.permissions}
              onConfirm={onPermissionReviewResponse}
            />
          ) : (
            // Regular Extensions Modal
            <motion.div
              ref={containerRef}
              role="dialog"
              aria-modal="true"
              aria-label={l({ en: 'Extensions', ar: 'الإضافات', de: 'Erweiterungen' })}
              onClick={(e) => e.stopPropagation()}
              tabIndex={-1}
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              className="w-full max-w-md bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl rounded-2xl shadow-2xl border border-slate-200/80 dark:border-white/10 overflow-hidden flex flex-col outline-none"
            >
            <div className="px-5 py-4 border-b border-slate-100 dark:border-white/10 flex justify-between items-center bg-slate-50/80 dark:bg-slate-800/50 backdrop-blur-md">
              <div className="flex items-center gap-2.5 text-slate-800 dark:text-slate-100">
                <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
                  <Puzzle className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-semibold">{l({ en: 'Extensions', ar: 'الإضافات', de: 'Erweiterungen' })}</h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">{l({ en: 'Chrome extensions; compatibility depends on the APIs they use.', ar: 'إضافات Chrome؛ يعتمد التوافق على الواجهات البرمجية التي تستخدمها.', de: 'Chrome-Erweiterungen; die Kompatibilität hängt von den genutzten APIs ab.' })}</p>
                </div>
              </div>
              <button 
                onClick={onClose} 
                className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-2 max-h-[60vh] overflow-y-auto">
              {extensions.length === 0 ? (
                <div className="py-12 px-6 flex flex-col items-center justify-center text-center">
                  <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 text-cyan-500 flex items-center justify-center mb-3">
                    <Puzzle className="w-7 h-7" />
                  </div>
                  <h3 className="text-slate-800 dark:text-slate-200 font-medium mb-1">{l({ en: 'No extensions installed', ar: 'لا توجد إضافات مثبّتة', de: 'Keine Erweiterungen installiert' })}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs">{l({ en: 'Enhance King Browser with extensions from the Chrome Web Store or load unpacked folders.', ar: 'عزّز King Browser بإضافات من Chrome Web Store أو حمّل مجلدات غير مضغوطة.', de: 'Erweitern Sie King Browser mit Erweiterungen aus dem Chrome Web Store oder laden Sie entpackte Ordner.' })}</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {extensions.map(ext => (
                    <div 
                      key={ext.id} 
                      onClick={(e) => handleLaunchExtension(ext, e)}
                      className={`flex items-center justify-between p-3 rounded-xl hover:bg-slate-100/70 dark:hover:bg-white/[0.04] group transition-colors ${ext.popupUrl || ext.optionsUrl ? 'cursor-pointer' : ''}`}
                    >
                      <div className="flex items-center gap-3 min-w-0 pr-2">
                        <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden shrink-0">
                          {ext.iconData ? (
                            <img src={ext.iconData} alt={ext.name} className="w-5 h-5 object-contain" />
                          ) : (
                            <div className="w-6 h-6 rounded-md bg-purple-500/20 text-purple-400 flex items-center justify-center text-xs font-bold uppercase">
                              {ext.name ? ext.name.charAt(0) : <Puzzle className="w-4 h-4" />}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{ext.name}</h4>
                            {ext.version && (
                              <span className="text-[10px] text-slate-400 font-mono">v{ext.version}</span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 truncate">{ext.description || l({ en: 'No description available', ar: 'لا يوجد وصف', de: 'Keine Beschreibung verfügbar' })}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100 transition-opacity shrink-0" onClick={(e) => e.stopPropagation()}>
                        {(ext.popupUrl || ext.optionsUrl) && (
                          <button 
                            onClick={(e) => handleLaunchExtension(ext, e)}
                            className="p-1.5 rounded-lg text-cyan-600 dark:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-500/20 transition-colors cursor-pointer"
                            title={ext.popupUrl ? l({ en: 'Open Popup', ar: 'فتح النافذة', de: 'Popup öffnen' }) : l({ en: 'Open Options', ar: 'فتح الخيارات', de: 'Optionen öffnen' })}
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                          </button>
                        )}
                        <button 
                          onClick={() => onToggleExtension?.(ext.id)}
                          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${ext.enabled !== false ? 'text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/20' : 'text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'}`}
                          title={ext.enabled !== false ? l({ en: 'Disable', ar: 'تعطيل', de: 'Deaktivieren' }) : l({ en: 'Enable', ar: 'تفعيل', de: 'Aktivieren' })}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => onRemoveExtension?.(ext.id)}
                          className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-500/20 transition-colors cursor-pointer"
                          title={l({ en: 'Remove', ar: 'إزالة', de: 'Entfernen' })}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="p-3 border-t border-slate-100 dark:border-white/10 bg-slate-50/50 dark:bg-slate-800/30 flex gap-2">
              <button 
                onClick={handleLoadUnpacked}
                className="py-2 px-3 bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-white/10 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                title={l({ en: 'Load unpacked extension folder', ar: 'تحميل مجلد إضافة غير مضغوطة', de: 'Entpackten Erweiterungsordner laden' })}
              >
                <FolderOpen className="w-3.5 h-3.5 text-amber-500" /> {l({ en: 'Load Folder', ar: 'تحميل مجلد', de: 'Ordner laden' })}
              </button>
              <button 
                onClick={() => {
                  if (onManageExtensions) onManageExtensions();
                  onClose();
                }}
                className="flex-1 py-2 px-3 bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-white/10 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5" /> {l({ en: 'Manage', ar: 'إدارة', de: 'Verwalten' })}
              </button>
              <button 
                onClick={() => {
                  if (onOpenUrl) onOpenUrl('https://chromewebstore.google.com/');
                  else window.open('https://chromewebstore.google.com/', '_blank');
                  onClose();
                }}
                className="flex-1 py-2 px-3 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 rounded-xl text-xs font-medium transition-colors flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5" /> {l({ en: 'Web Store', ar: 'متجر الإضافات', de: 'Web Store' })}
              </button>
            </div>
          </motion.div>
          )}
        </div>
      )}
    </AnimatePresence>
  );
};
