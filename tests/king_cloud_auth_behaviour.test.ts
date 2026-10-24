/**
 * King Cloud auth — behaviour, not source shape.
 *
 * tests/king_cloud_auth.test.ts pins the order of statements inside
 * register()/login(); this suite drives those SAME code paths end to end
 * against a fake Supabase client (no network) and asserts the outcomes:
 *
 *   - register with a real session        -> signed in, key derived from the
 *                                            salt handed to signUp
 *   - register pending email confirmation -> EmailVerificationRequiredError,
 *                                            NOT signed in, no E2EE key, no
 *                                            profile, no local fallback
 *   - register duplicate                  -> "already exists" guidance, stays
 *                                            signed out
 *   - login wrong password / unconfirmed  -> actionable copy, no session,
 *                                            no provider internals leaked
 *   - login provider crash                -> reported, no signed-in state,
 *                                            no silent local fallback
 *   - logout                              -> every credential slot wiped
 *   - syncData while logged out           -> rejected
 *   - local vault (synthetic token)       -> cloud sync still refuses
 *   - cross-account vault                 -> unreadable, sync aborts, no write
 *   - restart restore                     -> with session+key: works;
 *                                            without: stays logged out
 *
 * The fake mirrors the real runtime traits the service depends on:
 *  - Supabase records signUp options.data into user_metadata, so the salt
 *    minted on THIS device travels with the account and later sign-ins see it;
 *  - supabase-js persists the JWT session to the Electron secure store under
 *    SUPABASE_AUTH_STORAGE_KEY ('nova_sb_auth_token') and emits
 *    INITIAL_SESSION when the auth listener subscribes. That event, not the
 *    synthetic-token path, is what restores a cloud session after restart;
 *  - the vault lives in nova_sync_vaults as {user_id, envelope, updated_at}
 *    and writes are guarded on the observed updated_at.
 *
 * The client override seam lives in supabaseClient.ts and the ElectronAPI
 * override hook in electronBridge.ts; both are always null in production.
 * Storage shims follow the harness convention used by
 * safe_storage_resilience.test.ts (globals are installed once; this suite sits
 * last in runAll.ts and its reassertGlobals() never touches `window`, because
 * the jsdom suites own that global while they run).
 */

import {
  EmailVerificationRequiredError,
  KingSyncService,
  SyncLocalData,
  SyncResult
} from '../src/services/syncService';
import { encryptSyncPayload, EncryptedSyncEnvelope } from '../src/services/syncCrypto';
import { setSupabaseClientFactoryForTests } from '../src/services/supabaseClient';
import { setElectronAPIForTests, type ElectronAPI } from '../src/utils/electronBridge';
import { lockTestGlobals } from './jsdom_suite_lock';
import { defaultSettings, SavedPassword } from '../src/types/browser';

console.log('\n--- King Cloud auth behaviour (register, login, logout, restore, isolation) ---');

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) {
    passed++;
    console.log(`[PASS] [KingCloudAuthBehaviour] ${name}`);
  } else {
    failed++;
    console.log(`[FAIL] [KingCloudAuthBehaviour] ${name}${extra ? ' :: ' + extra : ''}`);
    process.exitCode = 1;
  }
}

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';

// Published-salt semantics: the service accepts a salt only when it base64
// decodes to at least PBKDF2_SALT_BYTES (16), so the fixture salts are real
// 16-byte values.
const SALT_A = Buffer.from('salt-A-16-bytes!', 'utf-8').toString('base64');
const SALT_B = Buffer.from('salt-B-16-bytes!', 'utf-8').toString('base64');

const PASS_A = 'a-strong-password-123';
const PASS_B = 'b-strong-password-123';

// Config that passes isSupabaseConfigured(): a genuine-looking project
// endpoint plus an anon key without any placeholder marker.
const CONFIG_URL = 'https://behaviourauthsuite.supabase.co';
const CONFIG_KEY = 'king-cloud-behaviour-suite-anon-key-0000000000';

const CONFIG_STORAGE = 'nova_supabase_config';
const SECURE_USER = 'nova_auth_user';
const SECURE_TOKEN = 'nova_auth_token';
const SB_SESSION = 'nova_sb_auth_token';
const USER_REGISTRY = 'nova_accounts_registry';

// --- Harness: Web Storage + Electron secure store ----------------------------
//
// When this suite runs inside the bundled runAll() entrypoint, every suite in
// the tree shares ONE process object space, and some suites swap the
// window/localStorage globals from their own running async mains while other
// suites are awaiting. getElectronAPI() and the storage adapter read those
// globals LIVE on every call, so a swap that lands while one of our
// PBKDF2-heavy phases is parked would silently redirect our credential reads
// and writes into another suite's store. The shims are therefore named
// objects and re-installed via reassertGlobals() at every phase boundary; the
// maps themselves (storageMap/secureStore) are suite-locals and never shared.

const storageMap = new Map<string, string>();
const myLocalStorage = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, value: string) => { storageMap.set(key, String(value)); },
  removeItem: (key: string) => { storageMap.delete(key); },
  clear: () => { storageMap.clear(); }
};

// The service reaches the OS secure store via window.electronAPI
// (getElectronAPI). Install it once; other suites replace the globals with
// their own shims when they need to.
const secureStore = new Map<string, string>();
const myElectronAPI = {
  secureStoreGet: async (name: string) => secureStore.get(name) ?? '',
  secureStoreSet: async (name: string, value: string) => { secureStore.set(String(name), String(value)); return true; },
  secureStoreDelete: async (name: string) => { secureStore.delete(String(name)); return true; }
};
const myWindow = { electronAPI: myElectronAPI };

// One-time install at module body (before any suite async main starts). This
// suite is imported last in runAll.ts, so this leaves OUR globals as the
// starting state of the whole bundled run.
const installOwnGlobals = () => {
  (globalThis as any).localStorage = myLocalStorage;
  (globalThis as any).window = myWindow;
};

/**
 * Mid-run re-assert. It deliberately touches ONLY localStorage: the process
 * `window` object is owned per suite (the jsdom suites install and restore
 * window/document inside their own running async mains) and replacing it
 * mid-flight breaks their React work. The service's window dependency is
 * neutralized instead by wiring our secure-store shim straight into
 * getElectronAPI via the test seam below.
 */
const reassertGlobals = () => {
  (globalThis as any).localStorage = myLocalStorage;
};

installOwnGlobals();

const secureOf = (name: string) => secureStore.get(name) ?? '';

const installConfig = () => {
  storageMap.set(CONFIG_STORAGE, JSON.stringify({ url: CONFIG_URL, anonKey: CONFIG_KEY }));
};
const dropConfig = () => {
  storageMap.delete(CONFIG_STORAGE);
};

// --- Harness: fake Supabase auth provider -----------------------------------

interface Credentials {
  email: string;
  password: string;
  options?: { data?: Record<string, unknown> };
}
interface ProviderResult {
  data: { user: unknown; session: unknown } | null;
  error: unknown;
}

const provider = {
  signUp: async (_credentials: Credentials): Promise<ProviderResult> => {
    throw new Error('unexpected signUp for this phase');
  },
  signIn: async (_credentials: Credentials): Promise<ProviderResult> => {
    throw new Error('unexpected signInWithPassword for this phase');
  }
};

const ok = (user: unknown, session: unknown): ProviderResult => ({ data: { user, session }, error: null });
// Real supabase-js surfaces auth failures as Error subclasses (AuthApiError);
// the service's isExistingAccountError/isUnconfirmedEmailError classifiers
// read error.message via `instanceof Error`, so the sanity of this fake
// depends on the error being a real Error.
const err = (message: string): ProviderResult => ({ data: null, error: new Error(message) });

const cloudUser = (id: string, email: string, salt: string) => ({
  id,
  email,
  created_at: '2026-01-01T00:00:00.000Z',
  email_confirmed_at: '2026-01-01T00:00:00.000Z',
  last_sign_in_at: '2026-01-01T00:00:00.000Z',
  aud: 'authenticated',
  user_metadata: { display_name: email.split('@')[0], sync_key_salt: salt }
});

const makeSession = (token: string, user: unknown) => ({ access_token: token, token_type: 'bearer', user });

// --- Harness: fake vault table ----------------------------------------------

interface VaultRow { envelope: EncryptedSyncEnvelope; updated_at: string }
interface VaultFakeConfig {
  rowsByUser: Map<string, VaultRow>;
  /** Rows the vault ACCEPTED; a guarded write that failed the precondition does not count. */
  writes: Array<{ user_id: string; updated_at: string }>;
  writeError: unknown;
  readError: unknown;
}

const makeVaultFake = () => {
  const cfg: VaultFakeConfig = {
    rowsByUser: new Map(),
    writes: [],
    writeError: null,
    readError: null
  };

  const table = {
    select() {
      let targetUser: string | null = null;
      const chain: any = {
        eq(column: string, value: string) {
          if (column === 'user_id') targetUser = value;
          return chain;
        },
        maybeSingle: async () => {
          if (cfg.readError) {
            const e = cfg.readError;
            cfg.readError = null;
            return { data: null, error: { message: String(e) } };
          }
          if (targetUser === null) return { data: null, error: { message: 'no user_id filter' } };
          return { data: cfg.rowsByUser.get(targetUser) ?? null, error: null };
        }
      };
      return chain;
    },
    upsert(payload: { user_id: string; envelope: EncryptedSyncEnvelope; updated_at: string }) {
      let expectedUpdatedAt: string | null = null;
      const apply = async (expected: string | null) => {
        if (cfg.writeError) {
          const e = cfg.writeError;
          cfg.writeError = null;
          return { data: [], error: { message: String(e) } };
        }
        const current = cfg.rowsByUser.get(payload.user_id);
        // Guarded write: the row must still carry the updated_at this sync read.
        // Matched-nothing answers come back as an EMPTY array with NO error,
        // exactly like PostgREST.
        if (expected !== null && (!current || current.updated_at !== expected)) {
          return { data: [], error: null };
        }
        cfg.rowsByUser.set(payload.user_id, { envelope: payload.envelope, updated_at: payload.updated_at });
        cfg.writes.push({ user_id: payload.user_id, updated_at: payload.updated_at });
        return { data: [{ updated_at: payload.updated_at }], error: null };
      };
      return {
        eq(_column: string, value: string) {
          expectedUpdatedAt = value;
          return { select: () => apply(expectedUpdatedAt) };
        },
        select: () => apply(expectedUpdatedAt)
      };
    }
  };

  return { cfg, table };
};

// --- Harness: fake Supabase client ------------------------------------------

// supabase-js session state as the service perceives it.
let fakeSession: Record<string, unknown> | null = null;
let lastSaltRepublish: string | null = null;

const persistSessionForFakes = (session: unknown) => {
  if (!session || typeof (session as { access_token?: unknown }).access_token !== 'string') return;
  fakeSession = session as Record<string, unknown>;
  secureStore.set(SB_SESSION, JSON.stringify(fakeSession));
};
const resetSupabaseFakes = () => {
  fakeSession = null;
  secureStore.set(SB_SESSION, '');
  lastSaltRepublish = null;
};

const vaultFake = makeVaultFake();

const fakeClient: any = {
  auth: {
    signUp: async (payload: Credentials) => {
      const result = await provider.signUp(payload);
      if (result.data) persistSessionForFakes(result.data.session);
      return result;
    },
    signInWithPassword: async (payload: Credentials) => {
      const result = await provider.signIn(payload);
      if (result.data) persistSessionForFakes(result.data.session);
      return result;
    },
    updateUser: async (data: unknown) => {
      lastSaltRepublish = (data as { data?: { sync_key_salt?: string } })?.data?.sync_key_salt ?? null;
      return { data: { user: { user_metadata: {} } }, error: null };
    },
    signOut: async () => {
      // Mirrors the real storage adapter: the persisted JWT is erased.
      resetSupabaseFakes();
      return { error: null };
    },
    onAuthStateChange: (callback: (event: string, session: unknown) => void) => {
      // supabase-js emits INITIAL_SESSION right after the listener subscribes,
      // carrying whatever session it could restore (null when none).
      const initial = fakeSession;
      setTimeout(() => {
        try { callback('INITIAL_SESSION', initial); } catch (_) { /* listener must never break the harness */ }
      }, 0);
      return { data: { subscription: { unsubscribe: () => undefined } } };
    }
  },
  from: () => vaultFake.table,
  channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
  removeChannel: () => undefined
};

setSupabaseClientFactoryForTests(
  (async () => fakeClient) as unknown as Parameters<typeof setSupabaseClientFactoryForTests>[0]
);

// --- Suite helpers -----------------------------------------------------------

const emptyLocalData = (): SyncLocalData => ({
  bookmarks: [],
  folders: [],
  history: [],
  passwords: [],
  settings: defaultSettings,
  workspaces: []
});

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

const waitFor = async (cond: () => boolean, ms = 5000): Promise<boolean> => {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (cond()) return true;
    await delay(25);
  }
  return cond();
};

const resetState = () => {
  storageMap.clear();
  secureStore.clear();
  resetSupabaseFakes();
};

const masterKeyFor = (userId: string) => secureOf(`sync_master_key_${userId}`);

/** nk2$<saltB64>$<keyB64> -> parts; null when the key is not in that format. */
const dedicatedKeyParts = (key: string): { saltB64: string; key: string } | null => {
  if (!key.startsWith('nk2$')) return null;
  const parts = key.slice('nk2$'.length).split('$');
  return parts.length === 2 && parts[0] && parts[1] ? { saltB64: parts[0], key: parts[1] } : null;
};

/** Mirrors the service's own isUsableSyncSalt threshold. */
const isMaybeUsableSalt = (salt: unknown): salt is string => {
  if (typeof salt !== 'string' || salt.length === 0) return false;
  try { return atob(salt).length >= 16; } catch { return false; }
};

const userRegistryJoined = () =>
  (secureOf(USER_REGISTRY) || storageMap.get(USER_REGISTRY) || '');

// --- Concurrency hardening helpers ------------------------------------------
//
// The bundled runAll() executes every suite's async main in one shared event
// loop. Suites that swap window/localStorage from their own async mains can
// land that swap inside one of OUR awaited stretches (the 600k-round PBKDF2 in
// register/login, vault round-trips, restore timers). The storage adapter
// reads localStorage live per call, so re-assert our localStorage immediately
// before every service creation and every service call that follows a wait of
// ours; window ownership is handled by the getElectronAPI test seam, and
// reassertGlobals() below stays out of that global on purpose.

/** Creates a KingSyncService with this suite's globals guaranteed installed. */
const ownService = () => {
  reassertGlobals();
  return new KingSyncService();
};

/** Runs an awaited service call with this suite's globals guaranteed installed. */
const withOwnGlobals = async <T>(step: () => Promise<T>): Promise<T> => {
  reassertGlobals();
  return await step();
};

// --- The suite ---------------------------------------------------------------

async function runBehaviourTests() {

  // 1. Register with a real session -> genuinely signed in ---------------------
  {
    reassertGlobals();
    resetState();
    installConfig();

    let saltGivenToSignUp = '';
    provider.signUp = async (c) => {
      const salt = c.options?.data?.sync_key_salt;
      check('register mints a full-size 16-byte salt and hands it to signUp', isMaybeUsableSalt(salt), String(salt));
      check('register records the display name in signUp metadata', c.options?.data?.display_name === 'Alice', String(c.options?.data?.display_name));
      saltGivenToSignUp = typeof salt === 'string' ? salt : '';
      const user = cloudUser(UUID_A, c.email, saltGivenToSignUp);
      return ok(user, makeSession('access-token-session-A', user));
    };

    const svc = ownService();
    const registered = await svc.register('a@example.test', PASS_A, 'Alice');

    check('register with a session returns the cloud user', registered.id === UUID_A && registered.email === 'a@example.test');
    check('register reports a signed-in session', svc.getStatus().isLoggedIn === true && svc.getStatus().user?.id === UUID_A, JSON.stringify(svc.getStatus()));
    const profileRaw = secureOf(SECURE_USER);
    let profileOk = false;
    try {
      const parsed = JSON.parse(profileRaw);
      profileOk = parsed.id === UUID_A && parsed.displayName === 'Alice' && !('password' in parsed);
    } catch { profileOk = false; }
    check('the persisted profile is the cloud profile and carries no password', profileOk, profileRaw);
    check('the JWT is not mirrored into the synthetic-token slot', secureOf(SECURE_TOKEN) === '');
    check('the JWT session lives in the supabase-js secure slot', secureOf(SB_SESSION).includes('access-token-session-A'));
    const keyPartsA = dedicatedKeyParts(masterKeyFor(UUID_A));
    check('the E2EE key was persisted under THIS user id in nk2$ format', Boolean(keyPartsA), masterKeyFor(UUID_A) ? `len=${masterKeyFor(UUID_A).length}` : 'missing');
    check('the derived key embeds the exact salt handed to signUp', Boolean(keyPartsA && saltGivenToSignUp && keyPartsA.saltB64 === saltGivenToSignUp));
    check('the key material itself is 32 bytes of base64', Boolean(keyPartsA && keyPartsA.key.length >= 40));
    check('no local fallback registry entry exists for a cloud account', userRegistryJoined() === '');

    // 1b. Logout wipes every credential slot ----------------------------------
    await withOwnGlobals(() => svc.logout());
    await delay(10);
    check('logout clears the signed-in state', svc.getStatus().isLoggedIn === false && svc.getStatus().user === null);
    check('logout wipes the profile from the secure store', secureOf(SECURE_USER) === '');
    check('logout wipes the synthetic-token slot', secureOf(SECURE_TOKEN) === '');
    check('logout wipes the supabase-js JWT slot', secureOf(SB_SESSION) === '');
    check('logout wipes the scoped E2EE key', masterKeyFor(UUID_A) === '');

    let loggedOutSyncError: unknown;
    try { loggedOutSyncError = await withOwnGlobals(() => svc.syncData(emptyLocalData())); } catch (e) { loggedOutSyncError = e; }
    check('syncData refuses to run while logged out', loggedOutSyncError instanceof Error && /not logged in/i.test(loggedOutSyncError.message), String(loggedOutSyncError));

    // 1c. The synthetic local token can never drive cloud sync ----------------
    dropConfig();
    provider.signUp = async () => { throw new Error('local mode must not reach the provider'); };
    const localSvc = ownService();
    const localUser = await localSvc.register('local@example.test', 'local-password-123', 'Local');
    const localId = localUser.id;
    check('local vault register returns a locally-scoped id', typeof localId === 'string' && localId.startsWith('usr_'), localId);
    check('local vault gets a synthetic session marker for THIS DEVICE only', secureOf(SECURE_TOKEN).startsWith('nvt_'), secureOf(SECURE_TOKEN).slice(0, 8));
    check('local vault derives and stores its own E2EE key', Boolean(dedicatedKeyParts(masterKeyFor(localId))));
    let localSyncError: unknown;
    try { localSyncError = await withOwnGlobals(() => localSvc.syncData(emptyLocalData())); } catch (e) { localSyncError = e; }
    check('a synthetic local token can NOT start cloud sync', localSyncError instanceof Error && /Cloud sync requires a King Cloud account/.test(localSyncError.message), String(localSyncError));
    check('no vault write happened for a local account', vaultFake.cfg.writes.length === 0);

    const localSvc2 = ownService();
    let wrongLocalLoginError: unknown;
    try { await localSvc2.login('local@example.test', 'this-is-not-the-password'); } catch (e) { wrongLocalLoginError = e; }
    check('local vault login rejects a wrong password', wrongLocalLoginError instanceof Error && /Invalid email or password/.test(wrongLocalLoginError.message), String(wrongLocalLoginError));
    const registryRaw = userRegistryJoined();
    let registryEntry: { passwordHash?: string; syncKeySalt?: string } | undefined;
    try { registryEntry = JSON.parse(registryRaw)['local@example.test']; } catch { registryEntry = undefined; }
    check('the local registry stores a pbkdf2 hash and a salt, never the password',
      Boolean(registryEntry?.passwordHash?.startsWith('pbkdf2$'))
      && Boolean(registryEntry?.syncKeySalt)
      && !registryRaw.includes('this-is-not-the-password')
      && !registryRaw.includes('local-password-123'),
      registryRaw);
  }

  // 2. Register pending email confirmation -------------------------------------
  {
    reassertGlobals();
    resetState();
    installConfig();
    provider.signUp = async () => ok(cloudUser(UUID_A, 'a@example.test', SALT_A), null);

    const svc = ownService();
    let pendingError: unknown;
    try { await svc.register('a@example.test', PASS_A, 'Alice'); } catch (e) { pendingError = e; }
    check('register with no session raises EmailVerificationRequiredError', pendingError instanceof EmailVerificationRequiredError, String(pendingError));
    if (pendingError instanceof EmailVerificationRequiredError) {
      check('the confirmation error names the mailbox', pendingError.message.includes('a@example.test'));
    }
    check('a pending confirmation does NOT mark the user signed in', svc.getStatus().isLoggedIn === false);
    check('a pending confirmation derives no E2EE key', masterKeyFor(UUID_A) === '');
    check('a pending confirmation persists no profile', secureOf(SECURE_USER) === '');
    check('a pending confirmation creates no local fallback account', userRegistryJoined() === '');
  }

  // 3. Register a duplicate -----------------------------------------------------
  {
    reassertGlobals();
    resetState();
    installConfig();
    provider.signUp = async () => err('User already registered');

    const svc = ownService();
    let dupError: unknown;
    try { await svc.register('a@example.test', PASS_A, 'Alice'); } catch (e) { dupError = e; }
    check('a duplicate account is rejected with sign-in guidance', dupError instanceof Error && dupError.message.includes('already exists'), String(dupError));
    check('a duplicate register never signs the user in', svc.getStatus().isLoggedIn === false);
    check('a duplicate register persists no profile', secureOf(SECURE_USER) === '');
  }

  // 4. Login outcomes ------------------------------------------------------------
  {
    reassertGlobals();
    resetState();
    installConfig();
    provider.signUp = async () => err('no signUp expected in phase 4');
    provider.signIn = async (c) => c.email === 'a@example.test' && c.password === PASS_A
      ? ok(cloudUser(UUID_A, c.email, SALT_A), makeSession('access-token-login-A', cloudUser(UUID_A, c.email, SALT_A)))
      : err('Invalid login credentials');

    const svc = ownService();
    const loggedIn = await svc.login('a@example.test', PASS_A);
    check('login with valid credentials signs in', loggedIn.id === UUID_A && svc.getStatus().isLoggedIn === true);
    check('login persists the profile for restart restore', secureOf(SECURE_USER).includes(UUID_A));
    check('login persists the JWT session to the legit slot', secureOf(SB_SESSION).includes('access-token-login-A'));
    check('login derives the E2EE key from the server-published salt', dedicatedKeyParts(masterKeyFor(UUID_A))?.saltB64 === SALT_A);
    check('a converged login never re-publishes the salt', lastSaltRepublish === null, String(lastSaltRepublish));

    const svcWrong = ownService();
    let wrongError: unknown;
    try { await svcWrong.login('a@example.test', 'not-the-password-99'); } catch (e) { wrongError = e; }
    check('a wrong password keeps the user signed out', svcWrong.getStatus().isLoggedIn === false);
    check('a wrong password produces safe, actionable copy', wrongError instanceof Error && wrongError.message.includes('Could not sign in to your cloud account'), String(wrongError));
    check('the wrong-password copy never leaks provider internals', wrongError instanceof Error && !wrongError.message.toLowerCase().includes('invalid login credentials'));

    const svcUnconfirmed = ownService();
    provider.signIn = async () => err('Email not confirmed');
    let unconfirmedError: unknown;
    try { await svcUnconfirmed.login('a@example.test', PASS_A); } catch (e) { unconfirmedError = e; }
    check('an unconfirmed email surfaces the confirm-first guidance', unconfirmedError instanceof EmailVerificationRequiredError, String(unconfirmedError));
    check('an unconfirmed login never claims a session', svcUnconfirmed.getStatus().isLoggedIn === false);

    const svcOutage = ownService();
    provider.signIn = async () => { throw new Error('fetch failed'); };
    let outageError: unknown;
    try { await svcOutage.login('a@example.test', PASS_A); } catch (e) { outageError = e; }
    check('a provider outage is reported, not swallowed', outageError instanceof Error && outageError.message.length > 10, String(outageError));
    check('an outage never claims a signed-in state', svcOutage.getStatus().isLoggedIn === false);
    check('an outage cannot fall through to a local account', !userRegistryJoined().includes('a@example.test'));
  }

  // 5. Sync round-trip as a logged-in user --------------------------------------
  {
    reassertGlobals();
    resetState();
    installConfig();
    provider.signIn = async () => ok(cloudUser(UUID_A, 'a@example.test', SALT_A), makeSession('access-token-sync-A', cloudUser(UUID_A, 'a@example.test', SALT_A)));

    const svc = ownService();
    await svc.login('a@example.test', PASS_A);
    const keyAfterLogin = masterKeyFor(UUID_A);

    const localPasswords: SavedPassword[] = [
      { hostname: 'example.test', username: 'u1', password: 's3cret-mobile-site', createdAt: Date.now() }
    ];
    let syncResult: SyncResult | null = null;
    let syncError: unknown;
    try { syncResult = await withOwnGlobals(() => svc.syncData({ ...emptyLocalData(), passwords: localPasswords })); } catch (e) { syncError = e; }
    check('a signed-in UUID user completes the vault round-trip', Boolean(syncResult && (syncResult.mergedData instanceof Object)), String(syncError));
    const remoteRow = vaultFake.cfg.rowsByUser.get(UUID_A);
    check('the vault write addressed the CURRENT user id only', vaultFake.cfg.writes.length > 0 && vaultFake.cfg.writes.every(w => w.user_id === UUID_A), JSON.stringify(vaultFake.cfg.writes));
    check('the pushed envelope is a version-2 encrypted envelope',
      Boolean(remoteRow && remoteRow.envelope && remoteRow.envelope.version === 2 && remoteRow.envelope.ciphertext && remoteRow.envelope.salt && remoteRow.envelope.iv),
      remoteRow ? 'row present' : 'row missing');
    check('the plaintext password never reached the vault row',
      !remoteRow || !JSON.stringify(remoteRow).includes('s3cret-mobile-site'));

    // 5b. Cross-account isolation: another account's sealed vault -------------
    const aBundle = { version: 2, timestamp: Date.now(), userId: UUID_A, bookmarks: [], folders: [], history: [], settings: defaultSettings, workspaces: [] };
    const foreignEnvelope = await encryptSyncPayload(aBundle, keyAfterLogin);

    const writesBefore = vaultFake.cfg.writes.length;
    provider.signIn = async () => ok(cloudUser(UUID_B, 'b@example.test', SALT_B), makeSession('access-token-login-B', cloudUser(UUID_B, 'b@example.test', SALT_B)));
    const svcB = ownService();
    await svcB.login('b@example.test', PASS_B);
    check('a second account signs in without an intervening logout', svcB.getStatus().user?.id === UUID_B);

    vaultFake.cfg.rowsByUser.set(UUID_B, { envelope: foreignEnvelope, updated_at: '2026-10-01T00:00:00.000Z' });
    let foreignSyncError: unknown;
    try { foreignSyncError = await withOwnGlobals(() => svcB.syncData(emptyLocalData())); } catch (e) { foreignSyncError = e; }
    check('another account\'s sealed vault can NOT be decrypted by this device', foreignSyncError instanceof Error && /aborted to protect your data/.test(foreignSyncError.message), String(foreignSyncError));
    check('the aborted foreign sync never wrote', vaultFake.cfg.writes.length === writesBefore, JSON.stringify(vaultFake.cfg.writes));

    // Control: B's own vault, sealed under B's own key, syncs fine.
    const keyOfB = masterKeyFor(UUID_B);
    const ownEnvelope = await encryptSyncPayload(aBundle, keyOfB);
    vaultFake.cfg.rowsByUser.set(UUID_B, { envelope: ownEnvelope, updated_at: '2026-10-01T00:00:00.000Z' });
    let ownResult: SyncResult | null = null;
    let ownError: unknown;
    try { ownResult = await withOwnGlobals(() => svcB.syncData(emptyLocalData())); } catch (e) { ownError = e; }
    check('a legitimately signed-in user CAN sync their own vault', Boolean(ownResult && ownResult.mergedData), String(ownError));
    check('the own-vault write went to THIS user id', Boolean(vaultFake.cfg.writes.at(-1)) && vaultFake.cfg.writes.at(-1)!.user_id === UUID_B, JSON.stringify(vaultFake.cfg.writes.at(-1)));

    const partsA = dedicatedKeyParts(masterKeyFor(UUID_A));
    const partsB = dedicatedKeyParts(masterKeyFor(UUID_B));
    check('both accounts keep independent, per-user keys in the secure store',
      Boolean(partsA && partsA.saltB64 === SALT_A) && Boolean(partsB && partsB.saltB64 === SALT_B));
  }

  // 6. Session restore after restart --------------------------------------------
  {
    reassertGlobals();
    resetState();
    installConfig();
    provider.signIn = async () => ok(cloudUser(UUID_A, 'a@example.test', SALT_A), makeSession('access-token-restore-A', cloudUser(UUID_A, 'a@example.test', SALT_A)));

    // Bootstrap once so the secure store looks exactly like a signed-in device.
    const bootstrapper = ownService();
    await bootstrapper.login('a@example.test', PASS_A);
    const bootstrapKey = masterKeyFor(UUID_A);
    const restoreBundle = { version: 2, timestamp: Date.now(), userId: UUID_A, bookmarks: [], folders: [], history: [], settings: defaultSettings, workspaces: [] };
    vaultFake.cfg.rowsByUser.set(UUID_A, { envelope: await encryptSyncPayload(restoreBundle, bootstrapKey), updated_at: '2026-10-01T00:00:00.000Z' });

    // 6a. A fresh service instance rehydrates a signed-in, fully working session.
    const restored = ownService();
    const settleOk = await waitFor(() => restored.getStatus().isLoggedIn);
    check('a valid stored session restores the signed-in state after restart', settleOk && restored.getStatus().user?.id === UUID_A, JSON.stringify(restored.getStatus()));
    let restoredResult: SyncResult | null = null;
    let restoredSyncError: unknown;
    try { restoredResult = await withOwnGlobals(() => restored.syncData(emptyLocalData())); } catch (e) { restoredSyncError = e; }
    check('the restored session can sync against the vault', Boolean(restoredResult && restoredResult.mergedData), String(restoredSyncError));
    await withOwnGlobals(() => restored.logout());
    await delay(10);
    check('logout after restore leaves no credential trace', secureOf(SECURE_USER) === '' && secureOf(SB_SESSION) === '' && masterKeyFor(UUID_A) === '');

    // 6b. A stored profile WITHOUT a session must not become a half-session.
    secureStore.set(SECURE_USER, JSON.stringify({
      id: UUID_A,
      email: 'a@example.test',
      displayName: 'Alice',
      createdAt: 1,
      lastLoginAt: 2,
      syncPreferences: { syncBookmarks: true, syncHistory: true, syncPasswords: true, syncSettings: true, syncWorkspaces: true }
    }));
    const halfSvc = ownService();
    const stayedOut = await waitFor(() => halfSvc.getStatus().isLoggedIn === false);
    check('a stored profile without a session token does NOT become a session', stayedOut && halfSvc.getStatus().isLoggedIn === false, JSON.stringify(halfSvc.getStatus()));
    let halfSyncError: unknown;
    try { halfSyncError = await withOwnGlobals(() => halfSvc.syncData(emptyLocalData())); } catch (e) { halfSyncError = e; }
    check('the refused half-session cannot sync', halfSyncError instanceof Error && /not logged in/i.test(halfSyncError.message), String(halfSyncError));
  }

  // Teardown: production paths must never see the test client or the test
  // ElectronAPI again, and the shared localStorage stays pointed at this
  // suite's shim as the run ends.
  setSupabaseClientFactoryForTests(null);
  setElectronAPIForTests(null);
  reassertGlobals();

  return { passed, failed };
}

// The suite itself is LOCKED (see jsdom_suite_lock): like the jsdom suites, it
// would otherwise replace shared globals while other suites' async mains run.
// Inside the lock it claims the ElectronAPI test seam, because the AgentPanel
// component reaches its own window.electronAPI stub through getElectronAPI()
// as well; only while THIS suite holds the lock may the seam point at our
// secure-store shim.

lockTestGlobals(async () => {
  setElectronAPIForTests(myElectronAPI as unknown as ElectronAPI);
  try {
    return await runBehaviourTests();
  } finally {
    setElectronAPIForTests(null);
  }
}).then((summary) => {
  console.log(`\n${summary.passed} king-cloud auth behaviour checks passed, ${summary.failed} failed\n`);
}).catch((err) => {
  console.error('[FAIL] [KingCloudAuthBehaviour] Suite failed:', err);
  process.exitCode = 1;
});
