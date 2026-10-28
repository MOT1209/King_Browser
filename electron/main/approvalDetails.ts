/**
 * What the human sees before approving an agent action, beyond the site and
 * the one-line summary: the text that will be typed, the address that will be
 * opened, the key that will be pressed.
 *
 * Built only from the policy engine's REDACTED arguments (the engine masks
 * password fields using the live element description), never from the raw
 * request, so a secret cannot reach the approval screen through this path.
 * Output is plain, bounded text: no markup, no control or bidi-override
 * characters. The caller renders it as text only.
 *
 * Dependency-free so it can be unit-tested in plain Node.
 */

export type ApprovalDetailKind = 'type' | 'value' | 'url' | 'key' | 'option' | 'other';

export interface ApprovalDetailLine {
  kind: ApprovalDetailKind;
  /** For `other`, `key: value`; for the rest, the value alone. */
  text: string;
}

export const MAX_DETAIL_LINES = 6;
export const MAX_DETAIL_VALUE = 120;
const MAX_SELECTOR_LENGTH = 500;

/** Arguments already shown elsewhere in the approval, or that carry no meaning for the human. */
const SKIPPED_KEYS = new Set(['selector', 'ref', 'tabId', 'id']);

const KIND_BY_KEY: Record<string, ApprovalDetailKind> = {
  text: 'type',
  url: 'url',
  key: 'key',
  value: 'option',
  option: 'option',
  label: 'option',
};

/** Code point ranges removed from any text shown for approval: control characters, zero-width marks, bidi overrides and isolates. */
const UNSAFE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x00, 0x08], [0x0b, 0x0c], [0x0e, 0x1f], [0x7f, 0x7f],
  [0x200b, 0x200f], [0x202a, 0x202e], [0x2066, 0x2069],
];

function stripUnsafe(value: string): string {
  let out = '';
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (!UNSAFE_RANGES.some(([from, to]) => code >= from && code <= to)) out += ch;
  }
  return out;
}

function clip(value: string): string {
  const cleaned = stripUnsafe(value).replace(/\s+/g, ' ').trim();
  return cleaned.length > MAX_DETAIL_VALUE ? `${cleaned.slice(0, MAX_DETAIL_VALUE)}…` : cleaned;
}

function stringify(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return clip(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    const json = JSON.stringify(value);
    return json === undefined ? null : clip(json);
  } catch {
    return null;
  }
}

export function describeApprovalArgs(toolName: string, redactedArgs: unknown): ApprovalDetailLine[] {
  if (!redactedArgs || typeof redactedArgs !== 'object' || Array.isArray(redactedArgs)) return [];
  const lines: ApprovalDetailLine[] = [];
  for (const [key, value] of Object.entries(redactedArgs as Record<string, unknown>)) {
    if (lines.length >= MAX_DETAIL_LINES) break;
    if (SKIPPED_KEYS.has(key)) continue;
    const text = stringify(value);
    if (text === null || text === '') continue;
    const kind = KIND_BY_KEY[key];
    lines.push(kind ? { kind, text } : { kind: 'other', text: `${clip(key)}: ${text}` });
  }
  return lines;
}

/**
 * The element selector to highlight while the approval is pending. Only a
 * plain, bounded string is handed to the page; it is used with querySelector
 * (JSON-encoded), never evaluated.
 */
export function previewSelectorFor(args: unknown): string | undefined {
  if (!args || typeof args !== 'object') return undefined;
  const selector = (args as Record<string, unknown>).selector;
  if (typeof selector !== 'string') return undefined;
  const trimmed = selector.trim();
  if (!trimmed || trimmed.length > MAX_SELECTOR_LENGTH) return undefined;
  return trimmed;
}
