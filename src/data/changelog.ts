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
