import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Cloud,
  HardDrive,
  Loader2,
  Lock,
  Mail,
  User
} from 'lucide-react';
import { EmailVerificationRequiredError, syncService } from '../services/syncService';
import { isSupabaseConfigured } from '../services/supabaseClient';
import { useTranslation } from '../services/i18n';

/**
 * Must stay in sync with the floor enforced inside KingSyncService.register()
 * and syncCrypto.deriveKey(). Checking it here only saves the user a round trip;
 * the service is still the authority.
 */
export const MIN_SYNC_PASSWORD_LENGTH = 12;

type AuthMode = 'signin' | 'signup';

interface KingCloudAuthFormProps {
  /** Called after the service reports a real signed-in state. */
  onAuthenticated?: () => void | Promise<void>;
  /** Slightly tighter spacing for the account modal. */
  compact?: boolean;
  className?: string;
}

export const KingCloudAuthForm: React.FC<KingCloudAuthFormProps> = ({
  onAuthenticated,
  compact = false,
  className = ''
}) => {
  const { l } = useTranslation();
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showReset, setShowReset] = useState(false);

  // Read on render rather than memoised: the value depends on localStorage,
  // which the settings UI can rewrite without unmounting this form.
  const cloudEnabled = isSupabaseConfigured();

  const trimmedEmail = email.trim();
  const passwordTooShort = password.length > 0 && password.length < MIN_SYNC_PASSWORD_LENGTH;
  const canSubmit =
    !busy &&
    trimmedEmail.length > 0 &&
    password.length > 0 &&
    (mode === 'signin' || password.length >= MIN_SYNC_PASSWORD_LENGTH);

  const switchMode = (next: AuthMode) => {
    if (busy || next === mode) return;
    setMode(next);
    setError(null);
    setNotice(null);
    setShowReset(false);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;

    setError(null);
    setNotice(null);
    setBusy(true);

    try {
      if (mode === 'signup') {
        await syncService.register(trimmedEmail, password, displayName.trim() || undefined);
        setNotice(
          cloudEnabled
            ? l({ en: 'Account created. Your vault is now encrypted with your password.', ar: 'تم إنشاء الحساب. خزنتك الآن مشفّرة بكلمة مرورك.', de: 'Konto erstellt. Ihr Tresor ist jetzt mit Ihrem Passwort verschlüsselt.' })
            : l({ en: 'Local vault created on this device.', ar: 'تم إنشاء خزنة محلية على هذا الجهاز.', de: 'Lokaler Tresor auf diesem Gerät erstellt.' })
        );
      } else {
        await syncService.login(trimmedEmail, password);
        setNotice(cloudEnabled ? l({ en: 'Signed in.', ar: 'تم تسجيل الدخول.', de: 'Angemeldet.' }) : l({ en: 'Unlocked the local vault on this device.', ar: 'تم فتح الخزنة المحلية على هذا الجهاز.', de: 'Lokaler Tresor auf diesem Gerät entsperrt.' }));
      }
      setPassword('');
      await onAuthenticated?.();
    } catch (err) {
      if (err instanceof EmailVerificationRequiredError) {
        // Not a failure: the account exists, there is just no session yet.
        // Swallow it into a notice so the user is not told their sign-up broke.
        setNotice(err.message);
        setMode('signin');
        setPassword('');
      } else {
        setError(err instanceof Error ? err.message : l({ en: 'Authentication failed.', ar: 'فشلت المصادقة.', de: 'Authentifizierung fehlgeschlagen.' }));
      }
    } finally {
      setBusy(false);
    }
  };

  const handleResetPassword = async () => {
    if (busy || !trimmedEmail) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await syncService.requestPasswordReset(trimmedEmail);
      setNotice(l({ en: 'Password reset email sent. Check your inbox for the link.', ar: 'أُرسل بريد إعادة تعيين كلمة المرور. تحقّق من بريدك الوارد.', de: 'E-Mail zum Zurücksetzen gesendet. Prüfen Sie Ihren Posteingang.' }));
      setShowReset(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : l({ en: 'Could not send the reset email.', ar: 'تعذّر إرسال بريد إعادة التعيين.', de: 'Die E-Mail zum Zurücksetzen konnte nicht gesendet werden.' }));
    } finally {
      setBusy(false);
    }
  };

  const pad = compact ? 'p-4' : 'p-5 sm:p-6';
  const fieldClass =
    'w-full bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl ps-10 pe-3.5 py-2.5 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 outline-none focus:border-cyan-500 transition-colors';

  return (
    <div className={`${pad} rounded-2xl bg-slate-50/80 dark:bg-white/[0.02] border border-slate-200/80 dark:border-white/5 space-y-4 ${className}`}>
      <div className="flex items-start gap-2.5">
        <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 shrink-0">
          {cloudEnabled ? <Cloud className="w-4 h-4" /> : <HardDrive className="w-4 h-4" />}
        </div>
        <div className="min-w-0">
          <h3 className="text-xs font-bold text-slate-800 dark:text-slate-100">
            {cloudEnabled
              ? mode === 'signup' ? l({ en: 'Create a King Cloud account', ar: 'إنشاء حساب King Cloud', de: 'King-Cloud-Konto erstellen' }) : l({ en: 'Sign in to King Cloud', ar: 'تسجيل الدخول إلى King Cloud', de: 'Bei King Cloud anmelden' })
              : mode === 'signup' ? l({ en: 'Create a local vault', ar: 'إنشاء خزنة محلية', de: 'Lokalen Tresor erstellen' }) : l({ en: 'Unlock this device', ar: 'فتح هذا الجهاز', de: 'Dieses Gerät entsperren' })}
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            {cloudEnabled
              ? l({ en: 'Your vault is encrypted on this device before it is uploaded.', ar: 'تُشفَّر خزنتك على هذا الجهاز قبل رفعها.', de: 'Ihr Tresor wird auf diesem Gerät verschlüsselt, bevor er hochgeladen wird.' })
              : l({ en: 'No King Cloud backend is configured in this build.', ar: 'لا يوجد خادم King Cloud مُعدّ في هذه النسخة.', de: 'In diesem Build ist kein King-Cloud-Backend konfiguriert.' })}
          </p>
        </div>
      </div>

      {!cloudEnabled && (
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-2">
          <HardDrive className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed">
            <strong className="font-semibold">{l({ en: 'This device only — no sync.', ar: 'هذا الجهاز فقط، بلا مزامنة.', de: 'Nur dieses Gerät – keine Synchronisierung.' })}</strong>{' '}
            {l({ en: 'Bookmarks, history and passwords stay in an encrypted vault on this computer. Nothing is uploaded, and no other device can read it.', ar: 'تبقى الإشارات المرجعية والسجل وكلمات المرور في خزنة مشفّرة على هذا الحاسوب. لا يُرفع شيء، ولا يستطيع أي جهاز آخر قراءتها.', de: 'Lesezeichen, Verlauf und Passwörter bleiben in einem verschlüsselten Tresor auf diesem Computer. Nichts wird hochgeladen, und kein anderes Gerät kann sie lesen.' })}
          </p>
        </div>
      )}

      <div
        role="tablist"
        aria-label={l({ en: 'Authentication mode', ar: 'وضع المصادقة', de: 'Anmeldemodus' })}
        className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-200/60 dark:bg-white/5"
      >
        {([
          ['signin', cloudEnabled ? l({ en: 'Sign in', ar: 'تسجيل الدخول', de: 'Anmelden' }) : l({ en: 'Unlock', ar: 'فتح', de: 'Entsperren' })],
          ['signup', cloudEnabled ? l({ en: 'Create account', ar: 'إنشاء حساب', de: 'Konto erstellen' }) : l({ en: 'New vault', ar: 'خزنة جديدة', de: 'Neuer Tresor' })]
        ] as Array<[AuthMode, string]>).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => switchMode(value)}
            disabled={busy}
            className={`py-2 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed ${
              mode === value
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-3" noValidate>
        <div>
          <label htmlFor="king-cloud-email" className="sr-only">
            {l({ en: 'Email', ar: 'البريد الإلكتروني', de: 'E-Mail' })}
          </label>
          <div className="relative">
            <Mail className="w-3.5 h-3.5 text-slate-400 absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="king-cloud-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={busy}
              className={fieldClass}
            />
          </div>
        </div>

        {mode === 'signup' && (
          <div>
            <label htmlFor="king-cloud-name" className="sr-only">
              {l({ en: 'Display name', ar: 'الاسم الظاهر', de: 'Anzeigename' })}
            </label>
            <div className="relative">
              <User className="w-3.5 h-3.5 text-slate-400 absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="king-cloud-name"
                type="text"
                autoComplete="nickname"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={l({ en: 'Display name (optional)', ar: 'الاسم الظاهر (اختياري)', de: 'Anzeigename (optional)' })}
                disabled={busy}
                className={fieldClass}
              />
            </div>
          </div>
        )}

        <div>
          <label htmlFor="king-cloud-password" className="sr-only">
            {l({ en: 'Password', ar: 'كلمة المرور', de: 'Passwort' })}
          </label>
          <div className="relative">
            <Lock className="w-3.5 h-3.5 text-slate-400 absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="king-cloud-password"
              type="password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={l({ en: 'Password', ar: 'كلمة المرور', de: 'Passwort' })}
              disabled={busy}
              aria-describedby={mode === 'signup' ? 'king-cloud-password-hint' : undefined}
              className={fieldClass}
            />
          </div>
          {mode === 'signup' && (
            <p
              id="king-cloud-password-hint"
              className={`mt-1.5 ps-1 text-[11px] ${
                passwordTooShort ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500'
              }`}
            >
              {l({ en: 'At least {n} characters. It encrypts your vault, so it cannot be recovered for you.', ar: '{n} أحرف على الأقل. تُشفِّر خزنتك، لذا لا يمكن استعادتها لك.', de: 'Mindestens {n} Zeichen. Es verschlüsselt Ihren Tresor und kann daher nicht für Sie wiederhergestellt werden.' }, { n: MIN_SYNC_PASSWORD_LENGTH })}
            </p>
          )}
        </div>

        {mode === 'signin' && cloudEnabled && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => { setError(null); setNotice(null); setShowReset(true); }}
              disabled={busy}
              className="text-[11px] text-cyan-600 dark:text-cyan-400 hover:underline disabled:opacity-50"
            >
              {l({ en: 'Forgot password?', ar: 'نسيت كلمة المرور؟', de: 'Passwort vergessen?' })}
            </button>
          </div>
        )}

        {showReset && (
          <div className="p-3 rounded-xl bg-cyan-500/5 border border-cyan-500/20 space-y-2">
            <p className="text-[11px] text-slate-600 dark:text-slate-300">
              {l({ en: 'Send a reset link to {email}.', ar: 'أرسل رابط إعادة التعيين إلى {email}.', de: 'Einen Link zum Zurücksetzen an {email} senden.' }, { email: trimmedEmail || l({ en: 'your email', ar: 'بريدك الإلكتروني', de: 'Ihre E-Mail-Adresse' }) })}
            </p>
            <button
              type="button"
              onClick={handleResetPassword}
              disabled={busy || !trimmedEmail}
              className="w-full py-2 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-white text-[11px] font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              <span>{l({ en: 'Send reset link', ar: 'إرسال رابط إعادة التعيين', de: 'Link zum Zurücksetzen senden' })}</span>
            </button>
          </div>
        )}
        {error && (
          <div
            role="alert"
            className="p-3 rounded-xl bg-red-500/10 border border-red-500/25 flex items-start gap-2"
          >
            <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-red-600 dark:text-red-300 leading-relaxed break-words">{error}</p>
          </div>
        )}

        {notice && (
          <div
            role="status"
            className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-start gap-2"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-emerald-700 dark:text-emerald-300 leading-relaxed break-words">{notice}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-semibold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Lock className="w-3.5 h-3.5" />
          )}
          <span>
            {busy
              ? l({ en: 'Please wait…', ar: 'يرجى الانتظار…', de: 'Bitte warten…' })
              : mode === 'signup'
                ? cloudEnabled ? l({ en: 'Create account', ar: 'إنشاء حساب', de: 'Konto erstellen' }) : l({ en: 'Create vault', ar: 'إنشاء خزنة', de: 'Tresor erstellen' })
                : cloudEnabled ? l({ en: 'Sign in', ar: 'تسجيل الدخول', de: 'Anmelden' }) : l({ en: 'Unlock', ar: 'فتح', de: 'Entsperren' })}
          </span>
        </button>
      </form>
    </div>
  );
};
