import assert from 'node:assert/strict';
import { mergeSettingsLastWriteWins } from '../src/services/syncService';
import { defaultSettings, type UserSettings } from '../src/types/browser';

console.log('\n--- Agent Profile Settings (sync guards) ---');

const NEWER = { agentIsolatedProfile: 2_000_000, agentPersistentProfile: 2_000_000 };
const OLDER = { agentIsolatedProfile: 1_000_000, agentPersistentProfile: 1_000_000 };

{
  assert.equal(defaultSettings.agentIsolatedProfile, false, 'isolation is opt-in');
  assert.equal(defaultSettings.agentPersistentProfile, false, 'keeping logins on disk is opt-in');
  console.log('[PASS] Agent profile — both settings default to off');
}

{
  const local = { ...defaultSettings, agentIsolatedProfile: true } as UserSettings;
  const merged = mergeSettingsLastWriteWins(local, { agentIsolatedProfile: false }, OLDER, NEWER, { now: 3_000_000 });
  assert.equal(merged.settings.agentIsolatedProfile, true, 'a newer remote value cannot switch isolation off');
  console.log('[PASS] Agent profile — sync cannot turn isolation off');
}

{
  const local = { ...defaultSettings, agentPersistentProfile: false } as UserSettings;
  const merged = mergeSettingsLastWriteWins(local, { agentPersistentProfile: true }, OLDER, NEWER, { now: 3_000_000 });
  assert.equal(merged.settings.agentPersistentProfile, false, 'a remote device cannot switch on keeping logins on disk');
  console.log('[PASS] Agent profile — sync cannot turn persistence on');
}

{
  const local = { ...defaultSettings, agentPersistentProfile: true } as UserSettings;
  const merged = mergeSettingsLastWriteWins(local, { agentPersistentProfile: false }, OLDER, NEWER, { now: 3_000_000 });
  assert.equal(merged.settings.agentPersistentProfile, false, 'turning persistence off (less risky) may sync');
  console.log('[PASS] Agent profile — the safer direction still syncs');
}
