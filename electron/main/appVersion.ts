/**
 * Version string the MCP server reports (initialize serverInfo and /health).
 *
 * Electron's app.getVersion() is the only source of truth. When it is missing
 * or throws (plain Node tests, a half-initialised app) the server says
 * 'unknown' instead of inventing a number: the old hard-coded '1.5.0' looked
 * like a real release to MCP clients while King was at 0.0.x.
 *
 * Dependency-free (no Electron imports).
 */

export const UNKNOWN_APP_VERSION = 'unknown';

export function resolveAppVersion(getVersion: (() => unknown) | undefined): string {
  try {
    const version = getVersion?.();
    if (typeof version === 'string' && version.trim()) return version.trim();
  } catch (_) {
    // fall through
  }
  return UNKNOWN_APP_VERSION;
}
