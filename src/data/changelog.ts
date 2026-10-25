export interface ChangelogItem {
  category: 'feature' | 'improvement' | 'fix' | 'security' | 'performance';
  text: string;
}

/** A real product screenshot shipped in /public/screenshots. */
export interface ReleaseMedia {
  src: string;
  alt: string;
  caption?: string;
}

export interface ReleaseStat {
  value: string;
  label: string;
}

/**
 * One editorial chapter of a release. Text-first, at most one screenshot.
 * Every stat/point is a restatement of a real change note - nothing invented.
 */
export interface ReleaseSection {
  eyebrow: string;
  title: string;
  body: string;
  media?: ReleaseMedia;
  points?: string[];
  stats?: ReleaseStat[];
}

export interface ReleaseVersion {
  version: string;
  date: string;
  title: string;
  badge?: string;
  lede?: string;
  hero?: ReleaseMedia;
  highlights: string[];
  changes: ChangelogItem[];
  sections?: ReleaseSection[];
}

/**
 * King Browser's own releases. King is derived from Nova Browser 1.5.1
 * (see docs/UPSTREAM.md); Nova's release history stays upstream at
 * https://github.com/unitybtw/nova-browser/releases and is not repeated here.
 */
export const CHANGELOG_DATA: ReleaseVersion[] = [
  {
    version: '0.0.8',
    date: 'October 2026',
    title: 'Security dependency updates',
    badge: 'Pre-release',
    lede: 'Updated runtime dependencies to close known vulnerabilities. No behaviour changes.',
    highlights: [
      'Electron, undici, body-parser and ip-address updated to patched versions; the runtime dependency audit now reports no known vulnerabilities.',
    ],
    changes: [
      { category: 'security', text: 'Patched known denial-of-service and integrity-check advisories in runtime dependencies.' },
      { category: 'improvement', text: 'Stray report files removed from the repository root; benchmark and audit documents moved to docs/.' },
    ],
  },
  {
    version: '0.0.7',
    date: 'October 2026',
    title: 'The whole interface in Arabic, English and German',
    badge: 'Pre-release',
    lede: 'Phase two of the translation: every remaining screen now follows the language you pick in Settings > General.',
    highlights: [
      'Translated: all settings sections (Advanced, Sync, Shortcuts, Passwords, Extensions, MCP), Help, Reader Mode, the AI side panel, account and sign-in, extensions, sharing, screenshots, site info, toasts and error screens.',
      'The AI side panel no longer shows hard-coded Turkish text.',
    ],
    changes: [
      { category: 'feature', text: 'About 1,000 interface strings are available in Arabic and German, checked by a test for missing translations and placeholders.' },
      { category: 'improvement', text: 'MCP tool descriptions stay in English; they are technical names for AI clients.' },
    ],
  },
  {
    version: '0.0.6',
    date: 'October 2026',
    title: 'Arabic, English and German',
    badge: 'Pre-release',
    lede: 'Choose the interface language in Settings > General. Arabic uses a right-to-left layout.',
    highlights: [
      'Interface language picker (Settings > General): Arabic, English or German, applied immediately. First run follows the system language.',
      'Translated: the toolbar, tabs, main menu, page right-click menu, settings (General, Appearance, Privacy, updates), first-run setup, downloads and permission prompts.',
      'Websites receive the chosen language in Accept-Language, so they can answer in it too.',
    ],
    changes: [
      { category: 'feature', text: 'Arabic (right-to-left) and German interface, alongside English.' },
      { category: 'improvement', text: 'Turkish interface removed; old settings that still say Turkish fall back to English.' },
      { category: 'improvement', text: 'Help, MCP, Advanced and Reader screens are still English; they follow in a later release.' },
    ],
  },
  {
    version: '0.0.5',
    date: 'October 2026',
    title: 'Google sign-in compatibility',
    badge: 'Pre-release',
    lede: 'An opt-in setting lets you sign in to Google, YouTube and Gmail, and use "Sign in with Google", inside King Browser.',
    highlights: [
      'Google sign-in compatibility (Settings > Privacy): presents a Firefox user agent on accounts.google.com only. Off by default; Google can stop accepting it at any time.',
      'The "Google blocked sign-in" dialog also appears in sign-in popup windows and points to the new setting.',
    ],
    changes: [
      { category: 'feature', text: 'Opt-in Google sign-in compatibility mode, limited to accounts.google.com.' },
      { category: 'fix', text: 'Google sign-in rejection is handled in popup windows as well as tabs.' },
    ],
  },
  {
    version: '0.0.4',
    date: 'October 2026',
    title: 'Record and replay, a persistent agent profile and automatic releases',
    badge: 'Pre-release',
    lede: 'Record what an agent does and replay it without a model, let the agent keep its own logins if you choose, and every version bump on main now publishes a release by itself.',
    highlights: [
      'Record and replay (Settings > MCP): every replayed step still asks for approval, and text typed into password fields is never stored.',
      'Optional persistent agent profile: sign in once in an agent tab; the agent never sees the password, and one button clears it.',
      'Releases are now published automatically when a pull request that bumps the version is merged.',
    ],
    changes: [
      { category: 'feature', text: 'Record and replay for agent actions, with the approval gate on every replayed step.' },
      { category: 'security', text: 'Optional persistent agent profile; cannot be switched on through sync, with a clear button.' },
      { category: 'improvement', text: 'Release workflow runs when package.json changes on main and the version has no tag yet.' },
      { category: 'improvement', text: 'macOS test job in CI (non-blocking).' },
    ],
  },
  {
    version: '0.0.3',
    date: 'October 2026',
    title: 'Element refs, strict approval mode and an honest injection check',
    badge: 'Pre-release',
    lede: 'The agent can now name page elements by short refs instead of guessing CSS selectors, you can make it ask before every action, and the activity log is visible in settings.',
    highlights: [
      'browser_snapshot lists the page\'s interactive elements with refs such as e12; click, type and the other element tools accept a ref.',
      'Strict approval mode asks before every agent action (sensitive actions always ask, in both modes).',
      'Settings > MCP shows the latest saved agent actions with a status filter.',
      'The prompt-injection check is a tripwire that catches about two thirds of our own test attacks; the approval gate is the real protection.',
    ],
    changes: [
      { category: 'feature', text: 'browser_snapshot tool and element refs for the element tools.' },
      { category: 'security', text: 'Strict approval mode (no looser mode exists).' },
      { category: 'improvement', text: 'Agent activity table with a status filter in Settings > MCP.' },
      { category: 'security', text: 'Prompt-injection corpus test (13 of 20 attack texts caught); limits documented in SECURITY.md.' },
    ],
  },
  {
    version: '0.0.2',
    date: 'October 2026',
    title: 'Agent control: site rules, activity log and isolated profile',
    badge: 'Pre-release',
    lede: 'More ways to stay in charge of the agent: rules per site, a saved and exportable activity log, a warning when a page tries to instruct the agent, and an opt-in separate session for agent tabs.',
    highlights: [
      'Site rules: mark a site "always ask" or "block" in Settings > MCP.',
      'The agent activity log is saved to disk and can be exported from the control panel.',
      'Pages that look like they instruct the agent trigger a warning and one extra approval.',
      'The approval dialog shows the page and the target element.',
      'Optional isolated agent profile: agent tabs use their own session and the agent cannot use your tabs.',
      'One-click OpenCode configuration in Settings > MCP.',
    ],
    changes: [
      { category: 'feature', text: 'Per-site rules (always ask / block) for the agent.' },
      { category: 'feature', text: 'Persistent, redacted agent activity log with export button.' },
      { category: 'security', text: 'Prompt-injection tripwire on page text returned to the agent (a warning, not a guarantee).' },
      { category: 'security', text: 'Opt-in isolated agent profile with its own in-memory session.' },
      { category: 'improvement', text: 'Approval dialog shows page and target element text.' },
      { category: 'improvement', text: 'Copy a ready opencode.json from Settings > MCP.' },
      { category: 'fix', text: 'Release workflow publishes the release, so the website download links resolve.' },
    ],
  },
  {
    version: '0.0.1',
    date: 'October 2026',
    title: 'First King Browser build, derived from Nova Browser 1.5.1',
    badge: 'Pre-release',
    lede: 'King Browser starts from the Nova Browser 1.5.1 codebase and focuses on letting coding agents such as OpenCode drive a visible browser while you stay in control.',
    hero: {
      src: './screenshots/newtab.png',
      alt: 'King Browser new tab page.',
    },
    highlights: [
      'MCP agents can click, type and select again: the main-process execution engine is the single approval authority.',
      'Approval decisions now use the real page URL and the target element, and ask you whenever that context cannot be read.',
      'The in-app assistant shows an approval card for actions that need your consent.',
      'Updates, installer and security links point at the King Browser repository.',
    ],
    changes: [
      { category: 'fix', text: 'MCP click/type/select actions no longer wait on an approval queue that no screen displayed.' },
      { category: 'security', text: 'Approval policy receives page URL and element description; missing context fails closed.' },
      { category: 'fix', text: 'MCP bridge waits for the full approval window instead of timing out after 60 seconds.' },
      { category: 'feature', text: 'Approval card for pending in-app assistant actions.' },
      { category: 'security', text: 'Auto-updater only trusts releases from MOT1209/King_Browser.' },
      { category: 'improvement', text: 'Ad blocking moved to the maintained @ghostery/adblocker packages.' },
    ],
  },
];
