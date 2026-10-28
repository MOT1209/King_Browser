import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  REDACTED_QUERY_VALUE,
  isSensitiveQueryParam,
  redactSnapshotUrls,
  redactUrlForAgent,
  redactUrlParamsInText
} from '../src/utils/urlRedaction';

// --- Values that must never leave the browser ------------------------------

const leaks: Array<[string, string]> = [
  ['https://example.com/reset?token=abc123&user=42', `https://example.com/reset?token=${REDACTED_QUERY_VALUE}&user=42`],
  ['https://example.com/login?accessToken=secret', `https://example.com/login?accessToken=${REDACTED_QUERY_VALUE}`],
  ['https://example.com/cb?ACCESS-TOKEN=secret', `https://example.com/cb?ACCESS-TOKEN=${REDACTED_QUERY_VALUE}`],
  ['https://example.com/cb?access%5Ftoken=secret', `https://example.com/cb?access%5Ftoken=${REDACTED_QUERY_VALUE}`],
  ['https://example.com/?api_key=k&apiKey=k2&apikey=k3', `https://example.com/?api_key=${REDACTED_QUERY_VALUE}&apiKey=${REDACTED_QUERY_VALUE}&apikey=${REDACTED_QUERY_VALUE}`],
  ['https://example.com/?client_secret=s&password=p&passwd=p2&pwd=p3', `https://example.com/?client_secret=${REDACTED_QUERY_VALUE}&password=${REDACTED_QUERY_VALUE}&passwd=${REDACTED_QUERY_VALUE}&pwd=${REDACTED_QUERY_VALUE}`],
  ['https://example.com/oauth?code=abc&state=xyz', `https://example.com/oauth?code=${REDACTED_QUERY_VALUE}&state=xyz`],
  ['https://example.com/?id_token=a&refresh_token=b', `https://example.com/?id_token=${REDACTED_QUERY_VALUE}&refresh_token=${REDACTED_QUERY_VALUE}`],
  ['https://files.example.com/a?X-Amz-Signature=sig&X-Amz-Credential=c', `https://files.example.com/a?X-Amz-Signature=${REDACTED_QUERY_VALUE}&X-Amz-Credential=${REDACTED_QUERY_VALUE}`],
  ['https://example.com/?PHPSESSID=abc', `https://example.com/?PHPSESSID=${REDACTED_QUERY_VALUE}`],
  ['https://example.com/form?authenticity_token=t', `https://example.com/form?authenticity_token=${REDACTED_QUERY_VALUE}`],
  ['https://example.com/?otp=123456&one_time_code=1', `https://example.com/?otp=${REDACTED_QUERY_VALUE}&one_time_code=${REDACTED_QUERY_VALUE}`],
  ['https://example.com/?key=k&sig=s&auth=a&ticket=t', `https://example.com/?key=${REDACTED_QUERY_VALUE}&sig=${REDACTED_QUERY_VALUE}&auth=${REDACTED_QUERY_VALUE}&ticket=${REDACTED_QUERY_VALUE}`],
  ['/reset?token=abc', `/reset?token=${REDACTED_QUERY_VALUE}`],
  ['?token=abc', `?token=${REDACTED_QUERY_VALUE}`],
  ['https://example.com/cb#access_token=abc&token_type=bearer&state=1', `https://example.com/cb#access_token=${REDACTED_QUERY_VALUE}&token_type=bearer&state=1`],
  ['https://example.com/app#/route?session=abc&view=1', `https://example.com/app#/route?session=${REDACTED_QUERY_VALUE}&view=1`]
];

for (const [input, expected] of leaks) {
  assert.equal(redactUrlForAgent(input), expected, `redacted form of ${input}`);
}

// Redaction is idempotent: output boundaries may apply it more than once.
for (const [input] of leaks) {
  const once = redactUrlForAgent(input);
  assert.equal(redactUrlForAgent(once), once, `redacting ${input} twice is stable`);
}

// --- URLs that must survive untouched --------------------------------------

for (const safe of [
  'https://example.com/cart?x=1',
  '/cart?x=1',
  'https://example.com/search?q=shoes&page=2',
  'https://example.com/?author=john&keyword=shoes&monkey=1&zipcode=12345',
  'https://example.com/?token_type=bearer&expires_in=3600',
  'https://example.com/path#section',
  'https://example.com/path#/route?view=1',
  'https://example.com/?a=1&&b=2',
  'https://example.com/?token',
  'mailto:someone@example.com?subject=hi',
  'king://newtab',
  ''
]) {
  assert.equal(redactUrlForAgent(safe), safe, `${safe} must not be rewritten`);
}

assert.equal(redactUrlForAgent('https://example.com/?=x'), 'https://example.com/?=x', 'a nameless parameter is left alone');
assert.equal(isSensitiveQueryParam('token'), true);
assert.equal(isSensitiveQueryParam('author'), false);
assert.equal(isSensitiveQueryParam(''), false);

// --- Free text --------------------------------------------------------------

assert.equal(
  redactUrlParamsInText('GET https://api.example.com/v1?token=abc failed.'),
  `GET https://api.example.com/v1?token=${REDACTED_QUERY_VALUE} failed.`
);
assert.equal(
  redactUrlParamsInText('see (https://example.com/reset?key=k).'),
  `see (https://example.com/reset?key=${REDACTED_QUERY_VALUE}).`
);
assert.equal(redactUrlParamsInText('no urls here'), 'no urls here');
assert.equal(redactUrlParamsInText('https://example.com/cart?x=1'), 'https://example.com/cart?x=1');

// --- Snapshot output --------------------------------------------------------

const snapshot = [
  'URL: https://shop.example.com/reset?token=abc&lang=en',
  'Title: Reset',
  'Elements: 2',
  'e1 link "Cart" -> /cart?x=1',
  'e2 link "Continue" -> https://shop.example.com/continue?access_token=abc'
].join('\n');

assert.equal(
  redactSnapshotUrls(snapshot),
  [
    `URL: https://shop.example.com/reset?token=${REDACTED_QUERY_VALUE}&lang=en`,
    'Title: Reset',
    'Elements: 2',
    'e1 link "Cart" -> /cart?x=1',
    `e2 link "Continue" -> https://shop.example.com/continue?access_token=${REDACTED_QUERY_VALUE}`
  ].join('\n'),
  'snapshot header and element hrefs are redacted, element names are not'
);
assert.equal(redactSnapshotUrls('URL: https://example.com/cart?x=1'), 'URL: https://example.com/cart?x=1');

// --- Total behaviour -------------------------------------------------------

for (const value of [undefined, null, 42, {}, []] as unknown[]) {
  assert.equal(redactUrlForAgent(value as string), value, 'non-string input is returned unchanged');
  assert.equal(redactSnapshotUrls(value as string), value, 'non-string snapshot is returned unchanged');
  assert.equal(redactUrlParamsInText(value as string), value, 'non-string text is returned unchanged');
}
assert.equal(redactUrlForAgent('%%%not a url%%%'), '%%%not a url%%%');

// --- Wiring ----------------------------------------------------------------
// The helpers above only help if the agent boundary actually calls them. Pin
// the wiring so a refactor cannot quietly start echoing raw tab URLs again.
const hookSource = readFileSync('src/hooks/useBrowserAgentBridge.ts', 'utf8');
assert.match(hookSource, /from '\.\.\/utils\/urlRedaction'/, 'the agent bridge must import the redaction helpers');

const rawEcho = /(?:return|=>)[^\n]*\$\{(?:safeArgs\.url|newUrl|currentTab\.url|activeTab\.url)\}/;
assert.equal(rawEcho.test(hookSource), false, 'no agent-facing result may interpolate a raw tab URL');

for (const call of [
  'redactUrlForAgent(safeArgs.url)',          // browser_navigate
  'redactUrlForAgent(newUrl)',                // browser_new_tab
  'redactUrlForAgent(t.url)',                 // browser_list_tabs
  'redactUrlForAgent(activeTab.url)',         // browser_get_url
  'redactUrlForAgent(currentTab.url)',        // browser_duplicate_tab
  'redactSnapshotUrls(snapshot)',             // browser_snapshot
  'redactReadPageResult('                     // browser_read_page
]) {
  assert.ok(hookSource.includes(call), `agent bridge must call ${call}`);
}

console.log('[PASS] Agent-facing URL redaction strips credential query values and keeps everything else');
