import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { defaultSettings, detectSystemLanguage } from '../src/types/browser';
import { normalizeLanguage } from '../src/services/language';
import { safeParseObjectWithBackup } from '../src/utils/safeStorage';

// Execute the real settings hook with a synchronous state adapter. This covers
// local startup and the shared setter used by disk restore, backup and sync.
function runSettingsHook(userSettings: string | null, bootLanguage: string | null = null) {
  const module = { exports: {} as any };
  const state: { current: any } = { current: undefined };
  const imports: Record<string, any> = {
    react: {
      useState: (init: Function) => {
        state.current = init();
        return [state.current, (update: any) => { state.current = typeof update === 'function' ? update(state.current) : update; }];
      },
      useRef: (value: any) => ({ current: value }),
      useEffect: () => {},
      useCallback: (fn: Function) => fn
    },
    '../types/browser': { defaultSettings },
    '../services/language': { normalizeLanguage },
    '../utils/safeStorage': { safeParseObjectWithBackup }
  };

  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/hooks/useSettings.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText, {
    module,
    exports: module.exports,
    require: (name: string) => imports[name],
    navigator: { language: 'en-US', languages: ['en-US'], userAgent: 'desktop' },
    localStorage: {
      getItem: (key: string) =>
        key === 'user_settings' ? userSettings : key === 'nova_language' ? bootLanguage : null,
      setItem: () => {}
    }
  });

  return {
    hook: module.exports.useSettings({ isMac: false }),
    get current() { return state.current; }
  };
}

// A stored Arabic preference survives startup and unrelated edits.
const first = runSettingsHook(
  JSON.stringify({ language: 'ar', theme: 'light', privacyShield: false })
);
assert.equal(first.current.language, 'ar');
assert.equal(first.current.theme, 'light');
assert.equal(first.current.privacyShield, false);

first.hook.setSettings((prev: any) => ({ ...prev, language: 'de', fontSize: 'large' }));
assert.equal(first.current.language, 'de');
assert.equal(first.current.fontSize, 'large');

// Legacy Turkish preferences cannot select a fourth interface language.
first.hook.setSettings({ ...first.current, language: 'tr', accentColor: 'red' });
assert.equal(first.current.language, 'en');
assert.equal(first.current.accentColor, 'red');

first.hook.handleUpdateSettings({ language: 'ar', theme: 'dark' });
assert.equal(first.current.language, 'ar');
assert.equal(first.current.theme, 'dark');

// A device that only has the boot key still starts in the chosen language.
const second = runSettingsHook(null, 'de');
assert.equal(second.current.language, 'de');

// Unknown stored values fall back to English.
const third = runSettingsHook(JSON.stringify({ language: 'fr', theme: 'dark' }));
assert.equal(third.current.language, 'en');
assert.equal(third.current.theme, 'dark');

// System detection recognises Arabic and German, and falls back to English.
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
try {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { language: 'de-DE', languages: ['de-DE', 'en'] }
  });
  assert.equal(detectSystemLanguage(), 'de');

  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { language: 'ar-SA', languages: ['ar-SA'] }
  });
  assert.equal(detectSystemLanguage(), 'ar');

  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { language: 'tr-TR', languages: ['tr-TR'] }
  });
  assert.equal(detectSystemLanguage(), 'en');

  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { language: 'fr-FR', languages: ['fr-FR'] }
  });
  assert.equal(detectSystemLanguage(), 'en');
} finally {
  if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
  else delete (globalThis as any).navigator;
}

assert.ok(defaultSettings.language === 'en' || defaultSettings.language === 'ar' || defaultSettings.language === 'de');
assert.equal(defaultSettings.defaultTranslationLanguage, 'en');

console.log('[PASS] Language settings accept English, Arabic and German, keep unrelated preferences, and map legacy codes.');
