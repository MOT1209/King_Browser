import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { defaultSettings } from '../src/types/browser';
import { safeParseObjectWithBackup } from '../src/utils/safeStorage';
import { normalizeLanguage } from '../src/services/i18n';

// Execute the real settings hook with a synchronous state adapter. This covers
// local startup and the shared setter used by disk restore, backup and sync.
const module = { exports: {} as any };
let current: any;
const saved = JSON.stringify({ language: 'ar', theme: 'light', privacyShield: false });
const imports: Record<string, any> = {
  react: {
    useState: (init: Function) => { current = init(); return [current, (update: any) => { current = typeof update === 'function' ? update(current) : update; }]; },
    useRef: (value: any) => ({ current: value }), useEffect: () => {}, useCallback: (fn: Function) => fn,
  },
  '../types/browser': { defaultSettings },
  '../utils/safeStorage': { safeParseObjectWithBackup },
  '../services/i18n': { normalizeLanguage },
};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/hooks/useSettings.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, {
  module, exports: module.exports, require: (name: string) => imports[name],
  navigator: { language: 'ar-SA', userAgent: 'desktop' },
  localStorage: { getItem: (key: string) => key === 'user_settings' ? saved : null },
});
const hook = module.exports.useSettings({ isMac: false });
// The saved interface language (ar/en/de) is kept on startup.
assert.equal(current.language, 'ar');
assert.equal(current.theme, 'light');
assert.equal(current.privacyShield, false);
hook.setSettings((prev: any) => ({ ...prev, language: 'de', fontSize: 'large' }));
assert.equal(current.language, 'de');
assert.equal(current.fontSize, 'large');
// Turkish was retired: an old backup or sync payload that still says 'tr' becomes English.
hook.setSettings({ ...current, language: 'tr', accentColor: 'red' });
assert.equal(current.language, 'en');
assert.equal(current.accentColor, 'red');
hook.handleUpdateSettings({ language: 'ar', theme: 'dark' });
assert.equal(current.language, 'ar');
assert.equal(current.theme, 'dark');
hook.handleUpdateSettings({ language: 'zz' as any });
assert.equal(current.language, 'en');
assert.equal(defaultSettings.defaultTranslationLanguage, 'en');
console.log('[PASS] Settings keep the chosen interface language (en/ar/de), map retired codes to English and preserve other preferences.');
