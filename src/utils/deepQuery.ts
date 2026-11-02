/**
 * Page-side helpers that let the agent reach elements inside open shadow roots
 * and same-origin iframes (plan.md, WP10 phase 2).
 *
 * `document.querySelector` stops at a shadow boundary and at an iframe. The
 * source below is prepended to every script the bridge runs in a guest, and
 * defines `__kingRoots()` (the document plus every open shadow root and
 * same-origin frame document, capped), `__kingQuery(selector)` (the light DOM
 * first, exactly as before, then the other roots) and `__kingOffset(el)` (the
 * viewport offset of the frame that holds `el`, so a point inside an iframe can
 * be turned into a point on the page for native mouse input).
 *
 * Closed shadow roots and cross-origin frames are not reachable from the page
 * and are skipped. It is plain `var` code so repeating it per script is
 * harmless.
 */
export const DEEP_QUERY_SOURCE = `var __kingRoots = function () {
  var out = [document], seen = 0;
  for (var i = 0; i < out.length && seen < 5000; i++) {
    var all = out[i].querySelectorAll('*');
    for (var j = 0; j < all.length && seen < 5000; j++) {
      seen++;
      var e = all[j];
      if (e.shadowRoot) out.push(e.shadowRoot);
      if (e.tagName === 'IFRAME' || e.tagName === 'FRAME') {
        var d = null;
        try { d = e.contentDocument; } catch (_) {}
        if (d && d.documentElement) out.push(d);
      }
    }
  }
  return out;
};
var __kingQuery = function (selector) {
  var first = document.querySelector(selector);
  if (first) return first;
  var roots = __kingRoots();
  for (var i = 1; i < roots.length; i++) {
    var found = roots[i].querySelector(selector);
    if (found) return found;
  }
  return null;
};
var __kingOffset = function (el) {
  var x = 0, y = 0, w = el.ownerDocument && el.ownerDocument.defaultView;
  while (w && w.frameElement) {
    var r = w.frameElement.getBoundingClientRect();
    x += r.left + w.frameElement.clientLeft;
    y += r.top + w.frameElement.clientTop;
    w = w.parent;
  }
  return { x: x, y: y };
};
`;

/** Prepends the helpers to a page script, keeping its completion value. */
export function withDeepQuery(code: string): string {
  return `${DEEP_QUERY_SOURCE}\n${code}`;
}
