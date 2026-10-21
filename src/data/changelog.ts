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
