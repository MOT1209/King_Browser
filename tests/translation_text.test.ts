import assert from 'node:assert/strict';
import { escapeHtmlForTranslation, unescapeHtmlForTranslation } from '../electron/main/translationText';

console.log('\n--- Translation Text Helpers ---');

{
  const raw = `<a href="x">Tom & "Jerry"</a>`;
  const escaped = escapeHtmlForTranslation(raw);
  assert.equal(escaped, '&lt;a href=&quot;x&quot;&gt;Tom &amp; &quot;Jerry&quot;&lt;/a&gt;');
  assert.equal(unescapeHtmlForTranslation(escaped), raw, 'escape then unescape returns the original text');
  assert.equal(unescapeHtmlForTranslation('a&nbsp;b &#39;q&#39;'), "a b 'q'");
  assert.equal(unescapeHtmlForTranslation('&unknown; &amp;lt;'), '&unknown; &lt;', 'unknown entities are left alone and a double-escaped entity is decoded only once');
  console.log('[PASS] Translation text — escape and unescape round-trip and leave unknown entities alone');
}
