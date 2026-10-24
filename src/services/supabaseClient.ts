/**
 * King Browser Supabase Client
 * Manages Supabase connection, credentials, and real-time syncing.
 */

// PERF: type-only import — erased at compile time so @supabase/supabase-js
// (~216KB vendor chunk) is NOT pulled into the entry bundle. The runtime
// module is loaded via dynamic import on first getSupabaseClient() call.
import type { SupabaseClient } from '@supabase/supabase-js';
import { getElectronAPI } from '../utils/electronBridge';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  isCustom: boolean;
}

const STORAGE_KEY = 'nova_supabase_config';

// Auth storage key used by supabase-js. Exported so the sync service can
// scrub stale JWT copies from localStorage on logout (sessions now live in
// the OS-keychain-backed secure store, not Web Storage).
export const SUPABASE_AUTH_STORAGE_KEY = 'nova_sb_auth_token';

// A custom endpoint read from localStorage must never be blindly trusted —
// it could otherwise point the anon key at an attacker-controlled host. Only accept genuine Supabase project URLs of the form
// https://<project-ref>.supabase.co. Project refs are lowercase alphanumeric
// IDs; they are commonly 20 chars but vary in length, so accept [a-z0-9]{10,}
// instead of a fixed width. Anything else falls back to the env default.
const CUSTOM_SUPABASE_URL_PATTERN = /^https:\/\/[a-z0-9]{10,}\.supabase\.co$/;

const isValidCustomSupabaseUrl = (url: unknown): url is string =>
  typeof url === 'string' && CUSTOM_SUPABASE_URL_PATTERN.test(url);

// Values shipped in .env.example. Copying that file verbatim must NOT count as
// "configured": doing so makes the app attempt real auth against a project
// that does not exist instead of falling back to the local vault.
const PLACEHOLDER_MARKERS = [
  'your-project',
  'your-supabase',
  'your_supabase',
  'placeholder',
  'changeme',
  'change-me',
  'dummykeyfordemo',
  'example.com'
];

const looksLikePlaceholder = (value: string): boolean => {
  const lower = value.trim().toLowerCase();
  return PLACEHOLDER_MARKERS.some((marker) => lower.includes(marker));
};

/**
 * A build-time endpoint is only usable when it is a genuine https URL. A
 * `.supabase.co` host must additionally look like a project ref, which is what
 * rejects the example value `https://your-project.supabase.co`. Self-hosted
 * deployments on other hosts stay allowed as long as they are https (or
 * loopback, for local development).
 */
const isValidConfiguredSupabaseUrl = (raw: unknown): boolean => {
  if (typeof raw !== 'string' || !raw.trim()) return false;
  if (looksLikePlaceholder(raw)) return false;
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  const isLoopback = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLoopback)) {
    return false;
  }
  // supabase-js appends its own paths (/auth/v1, /rest/v1). A base URL that
  // already carries a path, query or fragment silently breaks every request,
  // so treat it as unconfigured instead of failing later during sign-in.
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    return false;
  }
  if (host.endsWith('.supabase.co')) {
    return CUSTOM_SUPABASE_URL_PATTERN.test(parsed.origin);
  }
  return true;
};

const isValidAnonKey = (raw: unknown): boolean => {
  if (typeof raw !== 'string') return false;
  const key = raw.trim();
  if (key.length < 20) return false;
  return !looksLikePlaceholder(key);
};

// Default Supabase project endpoints for King Cloud Sync
const DEFAULT_CONFIG: SupabaseConfig = {
  url: import.meta.env?.VITE_SUPABASE_URL || '',
  anonKey: import.meta.env?.VITE_SUPABASE_ANON_KEY || '',
  isCustom: false
};

let cachedClient: SupabaseClient | null = null;
let currentConfigKey = '';
// In-flight (or resolved) lazy construction. Kept so concurrent callers share
// a single dynamic import + createClient call; reset when config changes.
let clientPromise: Promise<SupabaseClient> | null = null;

// Test-only client factory override. The auth behavior suite substitutes the
// real supabase-js client so register/login/logout/vault round-trips run
// through the unperturbed service code without touching a live project.
// Always null outside tests; setting it also drops any cached client so a
// following getSupabaseClient() call picks the override up immediately.
let clientFactoryForTests: (() => Promise<SupabaseClient>) | null = null;

export const setSupabaseClientFactoryForTests = (
  factory: (() => Promise<SupabaseClient>) | null
): void => {
  clientFactoryForTests = factory;
  cachedClient = null;
  currentConfigKey = '';
  clientPromise = null;
};

export const getSupabaseConfig = (): SupabaseConfig => {
  try {
    // Renderer-only storage. Server-side renders and the Node test harness have
    // no localStorage, which is not an error — just no custom config.
    if (typeof localStorage === 'undefined') return DEFAULT_CONFIG;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.url && parsed.anonKey) {
        if (!isValidCustomSupabaseUrl(parsed.url)) {
          console.warn('[SupabaseConfig] Rejected untrusted custom Supabase URL; falling back to default config.');
        } else {
          return { url: parsed.url, anonKey: String(parsed.anonKey), isCustom: true };
        }
      }
    }
  } catch (e) {
    console.error('[SupabaseConfig] Failed to load config:', e);
  }
  return DEFAULT_CONFIG;
};

// --- Secure session storage -------------------------------------------------

export const hasElectronSecureStore = (): boolean => {
  const api = getElectronAPI();
  return Boolean(api?.secureStoreSet && api?.secureStoreGet);
};

/**
 * supabase-js storage adapter backed by the Electron secure store
 * (safeStorage-encrypted files in the main process). Keeps refresh/access
 * tokens out of localStorage entirely.
 */
const electronSecureStorage = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      const api = getElectronAPI();
      if (!api?.secureStoreGet) return null;
      const value = await api.secureStoreGet(key);
      // The bridge has no remove API; logout overwrites with ''. Treat that
      // (and any other empty value) as "no session".
      return typeof value === 'string' && value.length > 0 ? value : null;
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    const api = getElectronAPI();
    if (api?.secureStoreSet) {
      await api.secureStoreSet(key, value);
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      const api = getElectronAPI();
      if (api?.secureStoreDelete) {
        await api.secureStoreDelete(key);
      } else if (api?.secureStoreSet) {
        await api.secureStoreSet(key, '');
      }
    } catch {
      // Best-effort only.
    }
  }
};

/**
 * Lazily constructs (and caches) the Supabase client. PERF: the client and
 * the @supabase/supabase-js module itself are only loaded on the first actual
 * auth/sync use — never at module import / first paint. Concurrent callers
 * share one in-flight construction; a config change invalidates the cache.
 */
export const getSupabaseClient = (): Promise<SupabaseClient> => {
  if (clientFactoryForTests) return clientFactoryForTests();
  const config = getSupabaseConfig();
  const configKey = `${config.url}_${config.anonKey}`;

  if (cachedClient && currentConfigKey === configKey) {
    return Promise.resolve(cachedClient);
  }

  if (!clientPromise) {
    clientPromise = (async () => {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const isElectron = hasElectronSecureStore();
        const client = createClient(config.url, config.anonKey, {
          auth: {
            // Security: In web mode, never persist sessions to localStorage (prevents JWT theft via XSS).
            // Persistence is enabled only in Electron where sessions are stored in the OS-keychain-backed secure store.
            persistSession: isElectron,
            autoRefreshToken: isElectron,
            detectSessionInUrl: false,
            storageKey: SUPABASE_AUTH_STORAGE_KEY,
            storage: isElectron ? electronSecureStorage : undefined
          },
          realtime: {
            params: {
              eventsPerSecond: 3
            }
          }
        });
        cachedClient = client;
        currentConfigKey = configKey;
        return client;
      } catch (err) {
        console.error('[Supabase] Failed to initialize Supabase client:', err);
        // Fail-closed: do not cache or return a dummy client when configuration is broken.
        throw err;
      }
    })();
    // Allow a later call to retry after a failed construction.
    clientPromise.catch(() => { clientPromise = null; });
  }
  return clientPromise;
};

export const isSupabaseConfigured = (): boolean => {
  const config = getSupabaseConfig();
  return isValidConfiguredSupabaseUrl(config.url) && isValidAnonKey(config.anonKey);
};

/**
 * Exposed for diagnostics and tests: the same rules that decide whether King
 * Cloud auth is reachable at all. Kept separate from `isSupabaseConfigured` so a
 * caller can explain WHY a build is local-only instead of only reporting that
 * it is.
 */
export const isValidSupabaseEndpoint = isValidConfiguredSupabaseUrl;
export const isValidSupabaseAnonKey = isValidAnonKey;
export const looksLikeSupabasePlaceholder = looksLikePlaceholder;
