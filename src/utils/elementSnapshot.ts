/**
 * The page-side script behind `browser_snapshot` (plan.md, WP2).
 *
 * It runs inside the guest page, so it is built as a string. It clears any
 * earlier `data-king-ref` stamps, stamps the interactive elements it finds with
 * `e1`, `e2`, ... and returns a compact text listing: one line per element with
 * its ref, role and accessible name. Typed values are never listed; password
 * fields are only marked as such.
 */

import { DEEP_QUERY_SOURCE } from './deepQuery';

export const SNAPSHOT_MAX_ELEMENTS = 150;

export interface SnapshotScriptOptions {
  /** Skip elements with no layout box. Off only in tests, where jsdom has no layout. */
  requireVisible?: boolean;
  maxElements?: number;
}

export function buildSnapshotScript(options: SnapshotScriptOptions = {}): string {
  const requireVisible = options.requireVisible !== false;
  const max = Math.max(1, Math.min(options.maxElements ?? SNAPSHOT_MAX_ELEMENTS, 500));
  return `${DEEP_QUERY_SOURCE}
  (() => {
    const MAX = ${max};
    const REQUIRE_VISIBLE = ${requireVisible};
    // Open shadow roots and same-origin iframes are part of the page a person sees.
    const ROOTS = __kingRoots();
    for (const root of ROOTS) root.querySelectorAll('[data-king-ref]').forEach(el => el.removeAttribute('data-king-ref'));
    const SELECTOR = [
      'a[href]', 'button', 'input:not([type="hidden"])', 'select', 'textarea', 'summary',
      '[contenteditable=""]', '[contenteditable="true"]',
      '[role="button"]', '[role="link"]', '[role="checkbox"]', '[role="radio"]', '[role="switch"]',
      '[role="tab"]', '[role="menuitem"]', '[role="option"]', '[role="combobox"]', '[role="textbox"]'
    ].join(',');
    const clean = (s) => String(s || '').replace(/\\s+/g, ' ').trim();
    const visible = (el) => {
      if (!REQUIRE_VISIBLE) return true;
      const rects = el.getClientRects();
      if (!rects.length || (rects[0].width === 0 && rects[0].height === 0)) return false;
      const style = (el.ownerDocument.defaultView || window).getComputedStyle(el);
      return style.visibility !== 'hidden' && style.display !== 'none';
    };
    const roleOf = (el) => {
      const explicit = el.getAttribute('role');
      if (explicit) return explicit;
      const tag = el.tagName.toLowerCase();
      if (tag === 'a') return 'link';
      if (tag === 'button' || tag === 'summary') return 'button';
      if (tag === 'select') return 'combobox';
      if (tag === 'textarea') return 'textbox';
      if (tag === 'input') {
        const type = (el.getAttribute('type') || 'text').toLowerCase();
        if (type === 'checkbox' || type === 'radio') return type;
        if (type === 'submit' || type === 'button' || type === 'reset' || type === 'image') return 'button';
        if (type === 'password') return 'textbox(password)';
        if (type === 'file') return 'file-input';
        return 'textbox';
      }
      return el.isContentEditable ? 'textbox' : 'generic';
    };
    const nameOf = (el) => {
      const aria = el.getAttribute('aria-label');
      if (aria) return clean(aria);
      const labelledBy = el.getAttribute('aria-labelledby');
      if (labelledBy) {
        const text = labelledBy.split(/\\s+/).map(id => { const rootNode = el.getRootNode();
          const n = rootNode && rootNode.getElementById ? rootNode.getElementById(id) : document.getElementById(id); return n ? n.textContent : ''; }).join(' ');
        if (clean(text)) return clean(text);
      }
      if (el.labels && el.labels.length) {
        const text = Array.from(el.labels).map(l => l.textContent).join(' ');
        if (clean(text)) return clean(text);
      }
      const tag = el.tagName.toLowerCase();
      if (tag === 'input') {
        const type = (el.getAttribute('type') || 'text').toLowerCase();
        if (type === 'submit' || type === 'button' || type === 'reset') return clean(el.getAttribute('value')) || type;
        if (type === 'image') return clean(el.getAttribute('alt'));
        return clean(el.getAttribute('placeholder')) || clean(el.getAttribute('name')) || clean(el.getAttribute('title'));
      }
      const text = clean(el.innerText || el.textContent);
      return text || clean(el.getAttribute('title')) || clean(el.getAttribute('placeholder')) || clean(el.getAttribute('alt'));
    };
    const lines = [];
    let count = 0;
    let truncated = false;
    const found = [];
    for (const root of ROOTS) for (const el of root.querySelectorAll(SELECTOR)) found.push(el);
    for (const el of found) {
      if (el.disabled || el.getAttribute('aria-hidden') === 'true' || !visible(el)) continue;
      if (count >= MAX) { truncated = true; break; }
      count++;
      const ref = 'e' + count;
      el.setAttribute('data-king-ref', ref);
      let line = ref + ' ' + roleOf(el) + ' "' + nameOf(el).slice(0, 80).replace(/"/g, "'") + '"';
      const type = (el.getAttribute('type') || '').toLowerCase();
      if ((type === 'checkbox' || type === 'radio') && el.checked) line += ' [checked]';
      if (el.tagName.toLowerCase() === 'a') {
        const href = el.getAttribute('href') || '';
        if (href) line += ' -> ' + href.split('#')[0].slice(0, 120);
      }
      lines.push(line);
    }
    return 'URL: ' + location.href + '\\nTitle: ' + clean(document.title).slice(0, 120) + '\\nElements: ' + count + (truncated ? ' (more not shown)' : '') + '\\n' + lines.join('\\n');
  })()`;
}
