/**
 * King Cloud auth — the two defects that made the login path silently unsafe.
 *
 * 1. Registration with email confirmation ON returns a user and NO session.
 *    The old code still marked the user signed in and derived an E2EE key from
 *    a salt it then failed to persist, so a second device derived a DIFFERENT
 *    key and could never decrypt the first device's vault — with no error.
 * 2. `.env.example` copied verbatim (https://your-project.supabase.co +
 *    your-supabase-anon-key) counted as "configured", so the app tried real
 *    auth against a non-existent project instead of using the local vault.
 *
 * The order-sensitive assertions below read the shipped source on purpose: the
 * property is "the salt is created before signUp" and "no signed-in state is
 * set without a session", neither of which is observable without a live project.
 */

import fs from 'fs';
import path from 'path';
import { EmailVerificationRequiredError, KingSyncService } from '../src/services/syncService';
import {
  isSupabaseConfigured,
  isValidSupabaseAnonKey,
  isValidSupabaseEndpoint
} from '../src/services/supabaseClient';

console.log('--- King Cloud auth (placeholders, E2EE salt, session guard) ---');

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) {
    passed++;
    console.log(`[PASS] [KingCloudAuth] ${name}`);
  } else {
    failed++;
    console.log(`[FAIL] [KingCloudAuth] ${name} ${extra}`);
    process.exitCode = 1;
  }
}

// --- 1. Placeholder configuration must not count as configured --------------

const REJECTED_ENDPOINTS = [
  'https://your-project.supabase.co',
  'https://your_supabase.supabase.co',
  'https://example.com',
  '',
  'not-a-url',
  'ftp://abcdefghijklmn.supabase.co',
  'http://abcdefghijklmn.supabase.co',
  'https://abc.supabase.co',
  'https://abcdefghij.supabase.co/rest/v1'
];

for (const endpoint of REJECTED_ENDPOINTS) {
  check(
    `endpoint rejected: ${JSON.stringify(endpoint)}`,
    !isValidSupabaseEndpoint(endpoint)
  );
}

check(
  'a real project endpoint is accepted',
  isValidSupabaseEndpoint('https://abcdefghijklmnop.supabase.co')
);
check(
  'loopback http stays usable for local development',
  isValidSupabaseEndpoint('http://localhost:54321')
);
check(
  'a self-hosted https endpoint is accepted',
  isValidSupabaseEndpoint('https://supabase.internal.example.org')
);

const REJECTED_KEYS = [
  '',
  'short',
  'your-supabase-anon-key',
  'dummyKeyForDemo',
  'CHANGEME-0000000000000000'
];

for (const key of REJECTED_KEYS) {
  check(
    `anon key rejected: ${JSON.stringify(key)}`,
    !isValidSupabaseAnonKey(key)
  );
}

check(
  'a real anon key is accepted',
  isValidSupabaseAnonKey(
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyZWYiOiJhYmMiLCJyb2xlIjoiYW5vbiJ9.c2lnbmF0dXJl'
  )
);

check(
  'with no env and no stored config this build is local-only',
  isSupabaseConfigured() === false
);

// --- 2. The E2EE salt must exist before signUp -----------------------------

const syncSource = fs
  .readFileSync(path.resolve(process.cwd(), 'src/services/syncService.ts'), 'utf-8')
  .replace(/\r\n/g, '\n');

const registerStart = syncSource.indexOf('public async register(');
const loginStart = syncSource.indexOf('public async login(');
const logoutStart = syncSource.indexOf('public async logout(');

check(
  'the register and login boundaries are locatable',
  registerStart !== -1 && loginStart !== -1 && logoutStart !== -1
);

const registerBody = syncSource.slice(registerStart, loginStart);
const loginBody = syncSource.slice(loginStart, logoutStart);

const saltCreatedAt = registerBody.indexOf('const saltB64 = bytesToBase64');
const signUpAt = registerBody.indexOf('.auth.signUp(');
check(
  'register mints the salt before calling signUp',
  saltCreatedAt !== -1 && signUpAt !== -1 && saltCreatedAt < signUpAt
);

check(
  'the salt travels with signUp so it survives email confirmation',
  registerBody.includes('data: { display_name: finalName, sync_key_salt: saltB64 }')
);

check(
  'register no longer tries to persist the salt after the fact',
  !registerBody.includes('updateUser({ data: { sync_key_salt')
);

check(
  'register refuses to claim a session when confirmation is pending',
  registerBody.indexOf('if (!data.session?.access_token)') !== -1 &&
    registerBody.indexOf('if (!data.session?.access_token)') <
      registerBody.indexOf('this.currentUser = newUser')
);

check(
  'login refuses to claim a session when confirmation is pending',
  loginBody.indexOf('if (!data.session?.access_token)') !== -1 &&
    loginBody.indexOf('if (!data.session?.access_token)') <
      loginBody.indexOf('this.currentUser = loggedUser')
);

check(
  'register surfaces the confirmation error instead of swallowing it',
  registerBody.includes('if (err instanceof EmailVerificationRequiredError) throw err;')
);

check(
  'login surfaces the confirmation error instead of swallowing it',
  loginBody.includes('if (err instanceof EmailVerificationRequiredError) throw err;')
);

// --- 3. Behaviour that does not need a backend -----------------------------

const error = new EmailVerificationRequiredError('user@example.com');
check('the confirmation error is a real Error subclass', error instanceof Error);
check(
  'the confirmation error keeps its own name so callers can branch on it',
  error.name === 'EmailVerificationRequiredError'
);
check(
  'the confirmation error names the mailbox to check',
  error.message.includes('user@example.com')
);

(async () => {
  const svc = new KingSyncService();
  const rejects = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      return false;
    } catch {
      return true;
    }
  };

  check(
    'register rejects a too-short password before any network call',
    await rejects(() => svc.register('user@example.com', 'short'))
  );
  check(
    'login rejects a too-short password before any network call',
    await rejects(() => svc.login('user@example.com', 'short'))
  );

  console.log(`\n${passed} king-cloud auth checks passed, ${failed} failed\n`);
})();
