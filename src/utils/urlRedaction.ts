/**
 * Agent-facing URL redaction.
 *
 * A page URL can carry a credential in its query string or fragment
 * (`?access_token=...`, signed download links, `?session=`), and every URL King
 * returns to an MCP client is read by a model and written into that client's
 * transcript. Keep the parameter name so the agent still understands the URL,
 * drop the value.
 *
 * This module is dependency-free and total: input that is not a string with a
 * sensitive parameter comes back unchanged, so it is safe to apply at every
 * output boundary (and safe to apply twice).
 */

export const REDACTED_QUERY_VALUE = '[redacted]';

// Compared against the lowercased name with every non-alphanumeric character
// removed, so access_token / accessToken / ACCESS-TOKEN all normalise to
// "accesstoken".
const SENSITIVE_PARAM_MARKERS = [
  'password',
  'passwd',
  'passphrase',
  'secret',
  'token',
  'apikey',
  'accesskey',
  'privatekey',
  'session',
  'sessid',
  'signature',
  'credential',
  'authorization',
  'oauth',
  'authenticity',
  'bearer',
  'jwt',
  'otp',
  'onetime',
  'recoverycode'
];

// Short or ambiguous names only match exactly, so "?author=john" and
// "?keyword=shoes" survive while "?key=..." and "?code=..." do not.
const SENSITIVE_PARAM_EXACT = new Set([
  'pwd',
  'auth',
  'key',
  'sig',
  'code',
  'pin',
  'ticket',
  'sso',
  'saml',
  'assertion'
]);

// OAuth token responses label the token scheme in a parameter that is not
// itself secret; redacting it would hide useful information for no gain.
const NON_SECRET_PARAM_NAMES = new Set(['tokentype']);

function normaliseParamName(rawName: string): string {
  let name = rawName;
  try {
    name = decodeURIComponent(rawName.replace(/\+/g, ' '));
  } catch (_) {
    // A malformed escape stays as written; matching is still worth a try.
  }
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function isSensitiveQueryParam(rawName: string): boolean {
  const name = normaliseParamName(rawName);
  if (!name || NON_SECRET_PARAM_NAMES.has(name)) return false;
  if (SENSITIVE_PARAM_EXACT.has(name)) return true;
  return SENSITIVE_PARAM_MARKERS.some(marker => name.includes(marker));
}

function redactParamList(list: string): string {
  if (!list) return list;

  // A fragment can carry its own path and query string (#/route?token=...).
  const question = list.indexOf('?');
  if (question >= 0) {
    return list.slice(0, question + 1) + redactParamList(list.slice(question + 1));
  }

  let changed = false;
  const parts = list.split('&').map(part => {
    if (!part) return part;
    const equals = part.indexOf('=');
    // A bare flag ("?token", "?debug") carries no value to leak.
    if (equals <= 0) return part;
    if (!isSensitiveQueryParam(part.slice(0, equals))) return part;
    changed = true;
    return `${part.slice(0, equals)}=${REDACTED_QUERY_VALUE}`;
  });

  return changed ? parts.join('&') : list;
}

/**
 * Redacts the values of sensitive query parameters in a URL. Accepts absolute
 * URLs, relative hrefs ("/cart?token=x") and bare query strings, and preserves
 * every other parameter byte for byte.
 */
export function redactUrlForAgent(raw: string): string {
  if (typeof raw !== 'string' || raw.length === 0) return raw;

  const hashIndex = raw.indexOf('#');
  const beforeHash = hashIndex === -1 ? raw : raw.slice(0, hashIndex);
  const fragment = hashIndex === -1 ? '' : raw.slice(hashIndex + 1);

  const queryIndex = beforeHash.indexOf('?');
  const redactedFragment = fragment ? redactParamList(fragment) : '';

  if (queryIndex === -1) {
    if (redactedFragment === fragment) return raw;
    return `${beforeHash}#${redactedFragment}`;
  }

  const base = beforeHash.slice(0, queryIndex);
  const query = beforeHash.slice(queryIndex + 1);
  const redactedQuery = redactParamList(query);

  if (redactedQuery === query && redactedFragment === fragment) return raw;
  return `${base}?${redactedQuery}${fragment ? `#${redactedFragment}` : ''}`;
}

const URL_IN_TEXT = /\bhttps?:\/\/[^\s"'<>\\]+/g;
const TRAILING_PUNCTUATION = /[.,;:!)\]]+$/;

/**
 * Redacts every absolute URL embedded in free text (console messages, error
 * strings). Text without a URL is returned unchanged.
 */
export function redactUrlParamsInText(text: string): string {
  if (typeof text !== 'string' || text.length === 0) return text;
  return text.replace(URL_IN_TEXT, match => {
    const suffix = TRAILING_PUNCTUATION.exec(match)?.[0] ?? '';
    const url = suffix ? match.slice(0, -suffix.length) : match;
    return redactUrlForAgent(url) + suffix;
  });
}

/**
 * Applies URL redaction to a `browser_snapshot` payload. The snapshot is line
 * based: the header carries the page URL and each element line ends with
 * " -> <href>", so both can be rewritten without touching element names.
 */
export function redactSnapshotUrls(snapshot: string): string {
  if (typeof snapshot !== 'string' || snapshot.length === 0) return snapshot;
  return snapshot
    .split('\n')
    .map(line => {
      if (line.startsWith('URL: ')) {
        return `URL: ${redactUrlForAgent(line.slice('URL: '.length))}`;
      }
      const arrow = line.lastIndexOf(' -> ');
      if (arrow < 0) return line;
      return `${line.slice(0, arrow + 4)}${redactUrlForAgent(line.slice(arrow + 4))}`;
    })
    .join('\n');
}
