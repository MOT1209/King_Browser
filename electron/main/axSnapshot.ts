/**
 * Accessibility-tree snapshot for the agent (plan.md, WP10 phase 3).
 *
 * `browser_snapshot` with `mode: "accessibility"` asks Chromium for the page's
 * accessibility tree (CDP `Accessibility.getFullAXTree`) instead of scanning the
 * DOM. The tree already reflects roles, accessible names, disabled and hidden
 * state the way assistive technology sees the page, and it includes open shadow
 * roots. This module picks the interactive nodes from the raw tree and builds
 * the same text listing as the DOM snapshot; the caller stamps each chosen
 * node's `backendNodeId` with its ref so every element tool keeps working.
 *
 * Page names are untrusted text: capped and stripped of quotes and newlines.
 * Typed values are never listed, and protected (password) fields are only
 * marked as such. Dependency-free (no Electron imports).
 */

export const AX_MAX_ELEMENTS = 150;

const INTERACTIVE_ROLES: ReadonlySet<string> = new Set([
  'button', 'link', 'textbox', 'searchbox', 'checkbox', 'radio', 'switch', 'combobox', 'menuitem',
  'menuitemcheckbox', 'menuitemradio', 'tab', 'option', 'slider', 'spinbutton', 'treeitem', 'listbox'
]);

export interface AxEntry {
  ref: string;
  backendNodeId: number;
  role: string;
  name: string;
  checked: boolean;
  protectedField: boolean;
  href: string;
}

function str(v: any): string {
  return v && typeof v === 'object' && typeof v.value === 'string' ? v.value : '';
}

function props(node: any): Record<string, any> {
  const out: Record<string, any> = {};
  if (Array.isArray(node?.properties)) {
    for (const p of node.properties) {
      if (p && typeof p.name === 'string') out[p.name] = p.value && typeof p.value === 'object' ? p.value.value : undefined;
    }
  }
  return out;
}

function clean(text: string, max: number): string {
  return text.replace(/\s+/g, ' ').trim().replace(/"/g, "'").slice(0, max);
}

/** Chooses the interactive, visible, enabled nodes of a raw `getFullAXTree` result. */
export function selectInteractiveNodes(rawNodes: unknown, max: number = AX_MAX_ELEMENTS): { entries: AxEntry[]; truncated: boolean } {
  const entries: AxEntry[] = [];
  let truncated = false;
  if (!Array.isArray(rawNodes)) return { entries, truncated };
  for (const node of rawNodes) {
    if (!node || node.ignored === true) continue;
    const role = str(node.role);
    if (!INTERACTIVE_ROLES.has(role)) continue;
    if (!Number.isInteger(node.backendDOMNodeId) || node.backendDOMNodeId <= 0) continue;
    const p = props(node);
    if (p.disabled === true || p.hidden === true) continue;
    if (entries.length >= max) { truncated = true; break; }
    const protectedField = p.protected === true;
    entries.push({
      ref: `e${entries.length + 1}`,
      backendNodeId: node.backendDOMNodeId,
      role: protectedField ? 'textbox(password)' : role,
      name: clean(str(node.name), 80),
      checked: p.checked === true || p.checked === 'true',
      protectedField,
      href: role === 'link' ? clean(str(node.properties?.find?.((x: any) => x?.name === 'url')?.value), 120).split('#')[0] : ''
    });
  }
  return { entries, truncated };
}

export function formatAxSnapshot(url: string, title: string, entries: AxEntry[], truncated: boolean): string {
  const lines = entries.map(e => {
    let line = `${e.ref} ${e.role} "${e.name}"`;
    if (e.checked) line += ' [checked]';
    if (e.href) line += ` -> ${e.href}`;
    return line;
  });
  return `URL: ${url}\nTitle: ${clean(title, 120)}\nElements: ${entries.length}${truncated ? ' (more not shown)' : ''}\n${lines.join('\n')}`;
}
