/**
 * Agent browser tools: regressions found by driving King Browser over MCP.
 *
 *   - Screenshots reached the agent as ~90k characters of base64 text.
 *   - Renderer failures were reported as "Error: Error: ...".
 *   - Agent clicks ran without a user gesture, so Chromium marked the page they
 *     left as skippable and Back jumped over it (canGoBack() was false).
 *   - A click that navigated was reported as a failure.
 *   - pressEnter / press_key Enter never submitted the form.
 *   - browser_close_tab "closed" tabs that did not exist.
 *   - The default workspace showed "Personal" in every language.
 *
 * Plus the new tools: console capture, wait_for, fill_form, element screenshot.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { toMcpContent, formatToolError } from '../electron/main/mcpContent';
import { recordConsoleMessage, getConsoleMessages, clearConsoleMessages, normalizeConsoleLevel } from '../src/utils/consoleBuffer';
import { classifyAction } from '../electron/main/policyEngine';
import { resolveElementRef } from '../electron/main/elementRefs';
import { displayWorkspaceName, seedDictionary, setLanguage } from '../src/services/i18n';
import { replyLanguage, say } from '../src/services/aiAgent/intentParser';

console.log('--- Agent browser tools ---');
let passed = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) { passed++; console.log(`[PASS] [AgentTools] ${name}`); }
  else { console.log(`[FAIL] [AgentTools] ${name} ${extra}`); process.exitCode = 1; }
}

// --- MCP content ------------------------------------------------------------
const png = 'data:image/png;base64,iVBORw0KGgo=';
const imageContent = toMcpContent(png);
check('a screenshot data URL becomes an image block',
  imageContent.length === 1 && imageContent[0].type === 'image' &&
  (imageContent[0] as any).data === 'iVBORw0KGgo=' && (imageContent[0] as any).mimeType === 'image/png');
check('ordinary text stays a text block', toMcpContent('Navigated to https://example.com')[0].type === 'text');
check('text that merely mentions a data URL stays text', toMcpContent(`see ${png}`)[0].type === 'text');
check('formatToolError never doubles the prefix',
  formatToolError(new Error('Error: Agent action blocked')) === 'Error: Agent action blocked' &&
  formatToolError('Error: Error: x') === 'Error: x' &&
  formatToolError(new Error('plain')) === 'Error: plain');

// --- console buffer -----------------------------------------------------------
clearConsoleMessages('t1');
recordConsoleMessage('t1', { level: 0, message: 'hello', source: 'https://a.test/app.js?session=abc#x', line: 3 });
recordConsoleMessage('t1', { level: 'warning', message: 'slow' });
recordConsoleMessage('t1', { level: 3, message: 'failed token=abc123 Bearer xyz.987' });
const all = getConsoleMessages('t1');
check('console keeps messages in order', all.map(m => m.message[0]).join('') === 'hsf');
check('console source drops the query string', all[0].source === 'https://a.test/app.js');
check('console redacts tokens and bearer values',
  all[2].message.includes('token=[redacted]') && all[2].message.includes('Bearer [redacted]') && !all[2].message.includes('abc123'));
check('console level filter', getConsoleMessages('t1', 'error').length === 1 && getConsoleMessages('t1', 'warning').length === 2);
check('console level names and numbers agree',
  normalizeConsoleLevel(2) === 'warning' && normalizeConsoleLevel('error') === 'error' && normalizeConsoleLevel(1) === 'log');
for (let i = 0; i < 300; i++) recordConsoleMessage('t1', { level: 0, message: `m${i}` });
check('console keeps at most 200 per tab', getConsoleMessages('t1', 'all', 1000).length === 200);
check('console limit returns the newest', getConsoleMessages('t1', 'all', 1)[0].message === 'm299');
check('console is per tab', getConsoleMessages('t2').length === 0);
clearConsoleMessages('t1');
check('console clears', getConsoleMessages('t1').length === 0);

// --- policy and refs ----------------------------------------------------------
for (const tool of ['browser_wait_for', 'browser_console_messages', 'browser_element_screenshot']) {
  check(`${tool} is classified as a read-only/passive action`,
    classifyAction({ toolName: tool, args: {} } as any).risk === 'safe');
}
check('browser_element_screenshot accepts a snapshot ref',
  typeof resolveElementRef('browser_element_screenshot', { ref: 'e3' }).selector === 'string');

// --- workspace name -----------------------------------------------------------
seedDictionary?.('ar', {});
setLanguage('ar');
check('default workspace is translated', displayWorkspaceName({ id: 'default', name: 'Personal' }) === 'شخصي');
check('a renamed default workspace keeps its name', displayWorkspaceName({ id: 'default', name: 'Home' }) === 'Home');
check('a user workspace called Personal is not translated', displayWorkspaceName({ id: 'w2', name: 'Personal' }) === 'Personal');
setLanguage('en');
check('English shows Personal', displayWorkspaceName({ id: 'default', name: 'Personal' }) === 'Personal');

// --- agent reply language -----------------------------------------------------
// German shares ü/ö with Turkish; it used to be answered in Turkish.
setLanguage('en');
check('Arabic text gets Arabic replies', replyLanguage('افتح يوتيوب') === 'ar');
check('German with umlauts is not Turkish', replyLanguage('Öffne bitte die Seite für Nachrichten') === 'de');
check('German "über" is not Turkish', replyLanguage('Suche über Electron') === 'de');
check('Turkish-only letters are Turkish', replyLanguage('sayfayı aşağı kaydır') === 'tr');
check('plain English stays English', replyLanguage('open youtube') === 'en');
check('say falls back to English', say('de', { en: 'x', tr: 't', ar: 'a', de: '' } as any) === '' && say('xx' as any, { en: 'x', tr: 't', ar: 'a', de: 'd' }) === 'x');
const agentSource = readFileSync(join(__dirname, '..', 'src', 'services', 'aiAgent.ts'), 'utf8');
check('no agent message is left Turkish/English only', !/\bisTr\b/.test(agentSource));
check('the goal report labels are not Turkish for everyone', !agentSource.includes('**Baglanti:**') && !agentSource.includes('**Detay:**'));

// --- bridge source guarantees -------------------------------------------------
const bridge = readFileSync(join(__dirname, '..', 'src', 'hooks', 'useBrowserAgentBridge.ts'), 'utf8');
const caseBody = (name: string) => {
  const start = bridge.indexOf(`case '${name}'`);
  const next = bridge.indexOf('\n        case ', start + 10);
  return start === -1 ? '' : bridge.slice(start, next === -1 ? undefined : next);
};
for (const tool of ['browser_click', 'browser_type', 'browser_select_option', 'browser_press_key']) {
  check(`${tool} runs through executeAction (user gesture, no post-navigation failure)`,
    caseBody(tool).includes('executeAction(') && !caseBody(tool).includes('executeJavaScript(`'));
}
check('executeAction passes userGesture=true', /key === 'executeAction'[\s\S]{0,700}?,\s*true\s*\)/.test(bridge));
const trustedInput = readFileSync(join(__dirname, '..', 'src', 'utils', 'trustedInput.ts'), 'utf8');
check('browser_click hit-tests the element and sends a real mouse click',
  caseBody('browser_click').includes('buildLocateScript(') && caseBody('browser_click').includes('nativeClickAt(') &&
  // The press/release events are built by clickEventSequence (trustedInput.ts), which the bridge sends.
  bridge.includes('clickEventSequence(') && bridge.includes('sendInputEvent(event)') && trustedInput.includes("type: 'mouseDown'") && trustedInput.includes('elementFromPoint'));
check('browser_click never clicks a covered element through el.click()',
  !caseBody('browser_click').includes('el.click()') && caseBody('browser_click').includes('covered by'));
// Real keys replace the old synthetic events: the browser itself performs the
// implicit form submission, so no manual requestSubmit() is needed (or wanted:
// it skipped the page's own Enter handling).
check('browser_type types with native input, not el.value',
  caseBody('browser_type').includes('insertText(') && !caseBody('browser_type').includes('el.value ='));
check('pressEnter sends a real Enter key', caseBody('browser_type').includes("keyCode: 'Enter'") && !caseBody('browser_type').includes('requestSubmit'));
check('press_key sends real key events', caseBody('browser_press_key').includes('sendKeyCombo(') &&
  !caseBody('browser_press_key').includes('new KeyboardEvent') && !caseBody('browser_press_key').includes('requestSubmit'));
check('scroll uses a real mouse wheel', caseBody('browser_scroll').includes("type: 'mouseWheel'"));
check('hover moves the real pointer', caseBody('browser_hover').includes("type: 'mouseMove'") && !caseBody('browser_hover').includes("new MouseEvent('mouseover'"));
check('insertText goes through the guarded proxy', /\['executeJavaScript', 'capturePage', 'sendInputEvent', 'insertText'/.test(bridge));
check('close_tab refuses unknown tabs', caseBody('browser_close_tab').includes('not found'));
check('screenshot explains internal pages', caseBody('browser_screenshot').includes('king://'));

console.log(`--- Agent browser tools: ${passed} checks passed ---`);
