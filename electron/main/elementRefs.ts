/**
 * Element references for the agent (plan.md, WP2).
 *
 * `browser_snapshot` stamps every interactive element of the page with a
 * `data-king-ref="e<number>"` attribute and lists them. The agent can then act
 * on `ref: "e12"` instead of guessing a CSS selector. The main process turns the
 * ref into the matching selector BEFORE the action is classified, so approval
 * policy, site rules and the activity log see exactly what they saw for
 * selectors; nothing downstream knows refs exist.
 *
 * Dependency-free (no Electron imports).
 */

/** Tools whose target element the agent may name with `ref`. */
export const REF_TOOLS: ReadonlySet<string> = new Set([
  'browser_click',
  'browser_type',
  'browser_select_option',
  'browser_hover',
  'browser_focus',
  'browser_get_element_text',
  'browser_scroll_to_element'
]);

const REF_PATTERN = /^e[1-9][0-9]{0,4}$/;

export function isElementRef(value: unknown): value is string {
  return typeof value === 'string' && REF_PATTERN.test(value);
}

export function refToSelector(ref: string): string {
  if (!REF_PATTERN.test(ref)) throw new Error(`Invalid element ref "${String(ref).slice(0, 20)}": expected a value like e12 from browser_snapshot.`);
  return `[data-king-ref="${ref}"]`;
}

/**
 * Returns the arguments with `ref` replaced by the equivalent `selector`.
 * Throws on a malformed ref or when a tool needs a target and got neither.
 */
export function resolveElementRef(toolName: string, args: Record<string, any>): Record<string, any> {
  if (!REF_TOOLS.has(toolName)) return args;
  const hasRef = args.ref !== undefined && args.ref !== null && args.ref !== '';
  if (hasRef) {
    const { ref, ...rest } = args;
    return { ...rest, selector: refToSelector(String(ref)) };
  }
  if (typeof args.selector !== 'string' || !args.selector) {
    throw new Error(`${toolName} needs a "ref" from browser_snapshot or a CSS "selector".`);
  }
  return args;
}
