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
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
            ? 'Account created. Your vault is now encrypted with your password.'
            : 'Local vault created on this device.'
        );
      } else {
        await syncService.login(trimmedEmail, password);
        setNotice(cloudEnabled ? 'Signed in.' : 'Unlocked the local vault on this device.');
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
        setError(err instanceof Error ? err.message : 'Authentication failed.');
      }
    } finally {
      setBusy(false);
    }
  };

  const pad = compact ? 'p-4' : 'p-5 sm:p-6';
  const fieldClass =
    'w-full bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 outline-none focus:border-cyan-500 transition-colors';

  return (
    <div className={`${pad} rounded-2xl bg-slate-50/80 dark:bg-white/[0.02] border border-slate-200/80 dark:border-white/5 space-y-4 ${className}`}>
      <div className="flex items-start gap-2.5">
        <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 shrink-0">
          {cloudEnabled ? <Cloud className="w-4 h-4" /> : <HardDrive className="w-4 h-4" />}
        </div>
        <div className="min-w-0">
          <h3 className="text-xs font-bold text-slate-800 dark:text-slate-100">
            {cloudEnabled
              ? mode === 'signup' ? 'Create a King Cloud account' : 'Sign in to King Cloud'
              : mode === 'signup' ? 'Create a local vault' : 'Unlock this device'}
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            {cloudEnabled
              ? 'Your vault is encrypted on this device before it is uploaded.'
              : 'No King Cloud backend is configured in this build.'}
          </p>
        </div>
      </div>

      {!cloudEnabled && (
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-2">
          <HardDrive className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed">
            <strong className="font-semibold">This device only — no sync.</strong>{' '}
            Bookmarks, history and passwords stay in an encrypted vault on this
            computer. Nothing is uploaded, and no other device can read it.
          </p>
        </div>
      )}

      <div
        role="tablist"
        aria-label="Authentication mode"
        className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-200/60 dark:bg-white/5"
      >
        {([
          ['signin', cloudEnabled ? 'Sign in' : 'Unlock'],
          ['signup', cloudEnabled ? 'Create account' : 'New vault']
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
            Email
          </label>
          <div className="relative">
            <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
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
              Display name
            </label>
            <div className="relative">
              <User className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="king-cloud-name"
                type="text"
                autoComplete="nickname"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Display name (optional)"
                disabled={busy}
                className={fieldClass}
              />
            </div>
          </div>
        )}

        <div>
          <label htmlFor="king-cloud-password" className="sr-only">
            Password
          </label>
          <div className="relative">
            <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="king-cloud-password"
              type="password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              disabled={busy}
              aria-describedby={mode === 'signup' ? 'king-cloud-password-hint' : undefined}
              className={fieldClass}
            />
          </div>
          {mode === 'signup' && (
            <p
              id="king-cloud-password-hint"
              className={`mt-1.5 pl-1 text-[11px] ${
                passwordTooShort ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500'
              }`}
            >
              At least {MIN_SYNC_PASSWORD_LENGTH} characters. It encrypts your vault, so it cannot be recovered for you.
            </p>
          )}
        </div>

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
              ? 'Please wait…'
              : mode === 'signup'
                ? cloudEnabled ? 'Create account' : 'Create vault'
                : cloudEnabled ? 'Sign in' : 'Unlock'}
          </span>
        </button>
      </form>
    </div>
  );
};
