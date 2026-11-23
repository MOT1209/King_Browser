/**
 * Version and release labels shown to MCP clients and in the UI.
 *
 * Failures this prevents:
 *  1. The MCP server reported a hard-coded '1.5.0' whenever app.getVersion()
 *     was unavailable, a number King never shipped (it is at 0.0.x).
 *  2. electron-updater's releaseNotes can be a list (fullChangelog); an
 *     `as any` cast passed that list on to a renderer that expects a string.
 *  3. Reader mode labelled the default macOS voice "Samantha" for every
 *     language except Turkish, while the speak path used getMacDefaultVoice
 *     (Anna for German, and so on), and the label suffix was English only.
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveAppVersion, UNKNOWN_APP_VERSION } from '../electron/main/appVersion';
import { releaseNameText, releaseNotesText } from '../electron/main/updateInfoText';
import { macDefaultVoiceLabel } from '../src/components/ReaderMode';
import { getLanguage, setLanguage } from '../src/services/i18n';

console.log('\n--- Version and Release Labels Test Suite ---');

{
  assert.equal(resolveAppVersion(() => '0.0.11'), '0.0.11');
  assert.equal(resolveAppVersion(() => ' 0.0.12 '), '0.0.12');
  for (const getter of [undefined, () => undefined, () => '', () => '  ', () => 42]) {
    assert.equal(resolveAppVersion(getter), UNKNOWN_APP_VERSION);
  }
  assert.equal(resolveAppVersion(() => { throw new Error('app not ready'); }), UNKNOWN_APP_VERSION);
  const server = fs.readFileSync(path.join(__dirname, '..', 'electron', 'mcpServer.ts'), 'utf8');
  assert.ok(!/['"]\d+\.\d+\.\d+['"]/.test(server),
    'mcpServer.ts holds no hard-coded version string');
  console.log('[PASS] App version — real version or "unknown", never an invented number');
}

{
  assert.equal(releaseNotesText('Fixes'), 'Fixes');
  assert.equal(releaseNotesText(null), '');
  assert.equal(releaseNotesText(undefined), '');
  assert.equal(releaseNotesText({ note: 'x' }), '');
  assert.equal(
    releaseNotesText([{ version: '0.0.12', note: 'New' }, { version: '0.0.11', note: null }, { note: 'Older' }, null]),
    '0.0.12\nNew\n\nOlder'
  );
  assert.equal(releaseNameText({ releaseName: 'Spring', version: '0.0.12' }), 'Spring');
  assert.equal(releaseNameText({ releaseName: null, version: '0.0.12' }), 'v0.0.12');
  assert.equal(releaseNameText({ releaseName: '  ', version: '0.0.12' }), 'v0.0.12');
  console.log('[PASS] Update info — release notes list flattened to text, name falls back to the version');
}

{
  const previous = getLanguage();
  try {
    setLanguage('en');
    assert.equal(macDefaultVoiceLabel('de-DE'), 'Anna (Apple natural voice)', 'German names the voice that speaks');
    assert.equal(macDefaultVoiceLabel('tr'), 'Yelda (Apple natural voice)');
    assert.equal(macDefaultVoiceLabel('en-US'), 'Samantha (Apple natural voice)');
    setLanguage('ar');
    assert.equal(macDefaultVoiceLabel('en'), 'Samantha (صوت Apple الطبيعي)', 'suffix is translated');
    setLanguage('de');
    assert.equal(macDefaultVoiceLabel('fr'), 'Thomas (natürliche Apple-Stimme)');
  } finally {
    setLanguage(previous);
  }
  // The player row picked its own default (Samantha unless Turkish) instead of
  // asking getMacDefaultVoice, so it disagreed with the voice that spoke.
  const reader = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'ReaderMode.tsx'), 'utf8');
  assert.ok(!/startsWith\('tr'\)\s*\?\s*'Yelda'/.test(reader),
    'ReaderMode.tsx picks no default macOS voice by hand; it asks getMacDefaultVoice');
  console.log('[PASS] Reader voice label — names the voice actually used, translated suffix');
}
