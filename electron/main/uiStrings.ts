/**
 * Strings the main process shows itself (the page context menu and native
 * dialogs), in the three interface languages. The renderer reports the chosen
 * language through the `set-app-language` IPC.
 */

import type { ApprovalNotificationStrings } from './approvalAttention.js';

export type UiLanguage = 'en' | 'ar' | 'de';

export function normalizeUiLanguage(lang: unknown): UiLanguage {
  if (typeof lang !== 'string') return 'en';
  const code = lang.trim().toLowerCase();
  if (code === 'ar' || code.startsWith('ar-')) return 'ar';
  if (code === 'de' || code.startsWith('de-')) return 'de';
  return 'en';
}

export interface ContextMenuLabels {
  noGuesses: string;
  addToDictionary: string;
  openLinkNewTab: string;
  openLinkNewIncognitoTab: string;
  saveLinkAs: string;
  copyLinkAddress: string;
  openImageNewTab: string;
  saveImageAs: string;
  copyImage: string;
  copyImageAddress: string;
  searchImageLens: string;
  play: string;
  pause: string;
  mute: string;
  unmute: string;
  loop: string;
  showControls: string;
  pictureInPicture: string;
  saveVideoAs: string;
  copyVideoAddress: string;
  saveAudioAs: string;
  copyAudioAddress: string;
  copy: string;
  cut: string;
  paste: string;
  pasteAsPlainText: string;
  selectAll: string;
  undo: string;
  redo: string;
  delete: string;
  searchFor: (query: string) => string;
  aiExplain: string;
  back: string;
  forward: string;
  reload: string;
  translatePage: string;
  openInSystemBrowser: string;
  savePageAs: string;
  print: string;
  viewSource: string;
  inspect: string;
}

const CONTEXT_MENU: Record<UiLanguage, ContextMenuLabels> = {
  en: {
    noGuesses: 'No guesses found',
    addToDictionary: 'Add to Dictionary',
    openLinkNewTab: 'Open Link in New Tab',
    openLinkNewIncognitoTab: 'Open Link in Incognito Window',
    saveLinkAs: 'Save Link As...',
    copyLinkAddress: 'Copy Link Address',
    openImageNewTab: 'Open Image in New Tab',
    saveImageAs: 'Save Image As...',
    copyImage: 'Copy Image',
    copyImageAddress: 'Copy Image Address',
    searchImageLens: 'Search Image with Google Lens',
    play: 'Play',
    pause: 'Pause',
    mute: 'Mute',
    unmute: 'Unmute',
    loop: 'Loop',
    showControls: 'Show Controls',
    pictureInPicture: 'Picture in Picture',
    saveVideoAs: 'Save Video As...',
    copyVideoAddress: 'Copy Video Address',
    saveAudioAs: 'Save Audio As...',
    copyAudioAddress: 'Copy Audio Address',
    copy: 'Copy',
    cut: 'Cut',
    paste: 'Paste',
    pasteAsPlainText: 'Paste as Plain Text',
    selectAll: 'Select All',
    undo: 'Undo',
    redo: 'Redo',
    delete: 'Delete',
    searchFor: (query: string) => `Search Google for "${query}"`,
    aiExplain: 'Explain with King AI',
    back: 'Back',
    forward: 'Forward',
    reload: 'Reload',
    translatePage: 'Translate Page',
    openInSystemBrowser: 'Open Page in Default Browser',
    savePageAs: 'Save As...',
    print: 'Print...',
    viewSource: 'View Page Source',
    inspect: 'Inspect',
  },
  ar: {
    noGuesses: 'لا توجد اقتراحات',
    addToDictionary: 'إضافة إلى القاموس',
    openLinkNewTab: 'فتح الرابط في تبويب جديد',
    openLinkNewIncognitoTab: 'فتح الرابط في نافذة تصفح خفي',
    saveLinkAs: 'حفظ الرابط باسم...',
    copyLinkAddress: 'نسخ عنوان الرابط',
    openImageNewTab: 'فتح الصورة في تبويب جديد',
    saveImageAs: 'حفظ الصورة باسم...',
    copyImage: 'نسخ الصورة',
    copyImageAddress: 'نسخ عنوان الصورة',
    searchImageLens: 'البحث عن الصورة باستخدام Google Lens',
    play: 'تشغيل',
    pause: 'إيقاف مؤقت',
    mute: 'كتم الصوت',
    unmute: 'إلغاء كتم الصوت',
    loop: 'تكرار',
    showControls: 'إظهار عناصر التحكم',
    pictureInPicture: 'صورة داخل صورة',
    saveVideoAs: 'حفظ الفيديو باسم...',
    copyVideoAddress: 'نسخ عنوان الفيديو',
    saveAudioAs: 'حفظ الصوت باسم...',
    copyAudioAddress: 'نسخ عنوان الصوت',
    copy: 'نسخ',
    cut: 'قص',
    paste: 'لصق',
    pasteAsPlainText: 'لصق كنص عادي',
    selectAll: 'تحديد الكل',
    undo: 'تراجع',
    redo: 'إعادة',
    delete: 'حذف',
    searchFor: (query: string) => `البحث في Google عن "${query}"`,
    aiExplain: 'الشرح باستخدام King AI',
    back: 'رجوع',
    forward: 'تقدّم',
    reload: 'إعادة التحميل',
    translatePage: 'ترجمة الصفحة',
    openInSystemBrowser: 'فتح الصفحة في المتصفح الافتراضي',
    savePageAs: 'حفظ باسم...',
    print: 'طباعة...',
    viewSource: 'عرض مصدر الصفحة',
    inspect: 'فحص',
  },
  de: {
    noGuesses: 'Keine Vorschläge gefunden',
    addToDictionary: 'Zum Wörterbuch hinzufügen',
    openLinkNewTab: 'Link in neuem Tab öffnen',
    openLinkNewIncognitoTab: 'Link im Inkognito-Fenster öffnen',
    saveLinkAs: 'Link speichern unter...',
    copyLinkAddress: 'Linkadresse kopieren',
    openImageNewTab: 'Bild in neuem Tab öffnen',
    saveImageAs: 'Bild speichern unter...',
    copyImage: 'Bild kopieren',
    copyImageAddress: 'Bildadresse kopieren',
    searchImageLens: 'Bild mit Google Lens suchen',
    play: 'Abspielen',
    pause: 'Pause',
    mute: 'Stummschalten',
    unmute: 'Stummschaltung aufheben',
    loop: 'Wiederholen',
    showControls: 'Steuerelemente anzeigen',
    pictureInPicture: 'Bild im Bild',
    saveVideoAs: 'Video speichern unter...',
    copyVideoAddress: 'Videoadresse kopieren',
    saveAudioAs: 'Audio speichern unter...',
    copyAudioAddress: 'Audioadresse kopieren',
    copy: 'Kopieren',
    cut: 'Ausschneiden',
    paste: 'Einfügen',
    pasteAsPlainText: 'Als reinen Text einfügen',
    selectAll: 'Alles auswählen',
    undo: 'Rückgängig',
    redo: 'Wiederholen',
    delete: 'Löschen',
    searchFor: (query: string) => `Google nach „${query}“ durchsuchen`,
    aiExplain: 'Mit King AI erklären',
    back: 'Zurück',
    forward: 'Vorwärts',
    reload: 'Neu laden',
    translatePage: 'Seite übersetzen',
    openInSystemBrowser: 'Seite im Standardbrowser öffnen',
    savePageAs: 'Speichern unter...',
    print: 'Drucken...',
    viewSource: 'Seitenquelltext anzeigen',
    inspect: 'Untersuchen',
  },
};

export function contextMenuLabels(lang: UiLanguage): ContextMenuLabels {
  return CONTEXT_MENU[lang] ?? CONTEXT_MENU.en;
}

export interface GoogleSigninDialogStrings {
  message: string;
  detail: (target: string) => string;
  openInDefaultBrowser: string;
  cancel: string;
}

const GOOGLE_SIGNIN_DIALOG: Record<UiLanguage, GoogleSigninDialogStrings> = {
  en: {
    message: 'Google blocked sign-in in this browser',
    detail: (target) => `Google does not allow signing in from embedded browsers such as King Browser. You can continue in your default browser:\n${target}\n\nTo sign in inside King Browser instead, turn on Settings → Privacy → Google sign-in compatibility and try again.`,
    openInDefaultBrowser: 'Open in Default Browser',
    cancel: 'Cancel',
  },
  ar: {
    message: 'منع Google تسجيل الدخول في هذا المتصفح',
    detail: (target) => `لا يسمح Google بتسجيل الدخول من المتصفحات المضمّنة مثل King Browser. يمكنك المتابعة في متصفحك الافتراضي:\n${target}\n\nلتسجيل الدخول داخل King Browser بدلاً من ذلك، فعّل الإعدادات ← الخصوصية ← توافق تسجيل الدخول إلى Google ثم حاول مجدداً.`,
    openInDefaultBrowser: 'فتح في المتصفح الافتراضي',
    cancel: 'إلغاء',
  },
  de: {
    message: 'Google hat die Anmeldung in diesem Browser blockiert',
    detail: (target) => `Google erlaubt keine Anmeldung aus eingebetteten Browsern wie King Browser. Sie können in Ihrem Standardbrowser fortfahren:\n${target}\n\nUm sich stattdessen in King Browser anzumelden, aktivieren Sie Einstellungen → Datenschutz → Google-Anmeldekompatibilität und versuchen Sie es erneut.`,
    openInDefaultBrowser: 'Im Standardbrowser öffnen',
    cancel: 'Abbrechen',
  },
};

export function googleSigninDialogStrings(lang: UiLanguage): GoogleSigninDialogStrings {
  return GOOGLE_SIGNIN_DIALOG[lang] ?? GOOGLE_SIGNIN_DIALOG.en;
}

const APPROVAL_NOTIFICATION: Record<UiLanguage, ApprovalNotificationStrings> = {
  en: {
    title: 'King Browser: approval needed',
    body: (tool, domain) => domain
      ? `The agent is waiting for your decision: ${tool} on ${domain}.`
      : `The agent is waiting for your decision: ${tool}.`,
  },
  ar: {
    title: 'King Browser: مطلوب موافقتك',
    body: (tool, domain) => domain
      ? `الوكيل ينتظر قرارك: ${tool} على ${domain}.`
      : `الوكيل ينتظر قرارك: ${tool}.`,
  },
  de: {
    title: 'King Browser: Freigabe erforderlich',
    body: (tool, domain) => domain
      ? `Der Agent wartet auf Ihre Entscheidung: ${tool} auf ${domain}.`
      : `Der Agent wartet auf Ihre Entscheidung: ${tool}.`,
  },
};

export function approvalNotificationStrings(lang: UiLanguage): ApprovalNotificationStrings {
  return APPROVAL_NOTIFICATION[lang] ?? APPROVAL_NOTIFICATION.en;
}

export interface ApprovalDialogStrings {
  title: string;
  message: string;
  site: string;
  action: string;
  tool: string;
  approve: string;
  reject: string;
  details: string;
  kinds: { type: string; value: string; url: string; key: string; option: string };
}

const APPROVAL_DIALOG: Record<UiLanguage, ApprovalDialogStrings> = {
  en: {
    title: 'King Browser - Action Approval',
    message: 'The agent is requesting approval for a sensitive action.',
    site: 'Site',
    action: 'Action',
    tool: 'Tool',
    approve: 'Approve',
    reject: 'Reject',
    details: 'Details',
    kinds: { type: 'Will type', value: 'Value', url: 'Will open', key: 'Will press', option: 'Will choose' },
  },
  ar: {
    title: 'King Browser - الموافقة على إجراء',
    message: 'الوكيل يطلب موافقتك على إجراء حساس.',
    site: 'الموقع',
    action: 'الإجراء',
    tool: 'الأداة',
    approve: 'موافقة',
    reject: 'رفض',
    details: 'التفاصيل',
    kinds: { type: 'سيكتب', value: 'القيمة', url: 'سيفتح', key: 'سيضغط', option: 'سيختار' },
  },
  de: {
    title: 'King Browser - Aktion freigeben',
    message: 'Der Agent bittet um Freigabe für eine sensible Aktion.',
    site: 'Website',
    action: 'Aktion',
    tool: 'Werkzeug',
    approve: 'Freigeben',
    reject: 'Ablehnen',
    details: 'Details',
    kinds: { type: 'Wird eingeben', value: 'Wert', url: 'Wird öffnen', key: 'Wird drücken', option: 'Wird wählen' },
  },
};

export function approvalDialogStrings(lang: UiLanguage): ApprovalDialogStrings {
  return APPROVAL_DIALOG[lang] ?? APPROVAL_DIALOG.en;
}

export interface ApprovalDialogInput {
  domain?: string;
  summary?: string;
  toolName: string;
  details?: Array<{ kind: 'type' | 'value' | 'url' | 'key' | 'option' | 'other'; text: string }>;
}

/** The multi-line body of the native approval dialog, in the interface language. */
export function buildApprovalDialogDetail(input: ApprovalDialogInput, strings: ApprovalDialogStrings): string {
  const lines: string[] = [];
  if (input.domain) lines.push(`${strings.site}: ${input.domain}`);
  if (input.summary) lines.push(`${strings.action}: ${input.summary}`);
  lines.push(`${strings.tool}: ${input.toolName}`);
  if (input.details && input.details.length > 0) {
    lines.push('', `${strings.details}:`);
    for (const line of input.details) {
      lines.push(line.kind === 'other' ? `- ${line.text}` : `- ${strings.kinds[line.kind]}: ${line.text}`);
    }
  }
  return lines.join('\n');
}
