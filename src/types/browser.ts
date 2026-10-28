import { normalizeLanguage } from '../services/language';
import { buildDefaultShortcuts } from '../utils/shortcutCatalog';

export interface Tab {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  isMuted?: boolean;
  isPinned?: boolean;
  isIncognito?: boolean;
  /** Opened by the agent while the isolated agent profile is on; uses its own cookies and storage. */
  isAgentOwned?: boolean;
  /** Agent tab that keeps its cookies and logins on disk (persistent agent profile). */
  agentPersistent?: boolean;
  thumbnail?: string;
  workspaceId?: string;
  folderId?: string;
  zoomFactor?: number;
  isPlayingAudio?: boolean;
  blockedAdsCount?: number;
  webContentsId?: number;
  isSuspended?: boolean;
  lastAccessed?: number;
  splitWith?: string;
  isTranslated?: boolean;
  translatedLang?: string;
}

/**
 * Soft-delete column carried by every synced collection.
 *
 * `deletedAt` is the wall-clock time the row was deleted; absent (rows written
 * before tombstones existed) or null means the row is live. A tombstoned row
 * stays in the store and in the sync payload so the deletion can be replayed
 * on the user's other devices — see `mergeSyncedCollection()` in syncService.
 */
export interface Tombstoneable {
  deletedAt?: number | null;
}

export interface Folder extends Tombstoneable {
  id: string;
  name: string;
  isExpanded: boolean;
  workspaceId: string;
  /** A palette key from utils/folderColors.ts; absent on folders saved before colors existed. */
  color?: string;
}

export interface Workspace extends Tombstoneable {
  id: string;
  name: string;
  color: string;
  icon?: string;
}

export interface Extension {
  id: string;
  name: string;
  description?: string;
  version?: string;
  enabled?: boolean;
  iconData?: string;
  popupUrl?: string;
  optionsUrl?: string;
  homepageUrl?: string;
}

export interface Bookmark extends Tombstoneable {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  timestamp: number;
}

export interface SavedPassword {
  hostname: string;
  username: string;
  password?: string;
  createdAt?: number;
}

export interface DownloadItem {
  id: string;
  url: string;
  filename: string;
  state: 'progressing' | 'completed' | 'cancelled' | 'interrupted';
  receivedBytes: number;
  totalBytes: number;
  startTime?: number;
  savePath?: string;
  isPaused?: boolean;
}

export interface ShortcutConfig {
  key: string;
  shift?: boolean;
  meta?: boolean;
  alt?: boolean;
}

export interface UserSettings {
  searchEngine: 'google' | 'duckduckgo' | 'bing' | 'brave' | 'ecosia' | 'yahoo';
  privacyShield: boolean;
  theme: 'light' | 'dark' | 'system';
  fontSize: 'small' | 'medium' | 'large';
  accentColor: 'blue' | 'emerald' | 'purple' | 'rose' | 'amber' | 'custom';
  customAccentColor?: string;
  browserColor?: 'default' | 'midnight' | 'cyberpunk' | 'forest' | 'crimson' | 'warm' | 'ocean' | 'sunset' | 'custom';
  customBrowserColor?: string;
  showBookmarksBar: boolean;
  useVerticalTabs: boolean;
  mcpServerEnabled: boolean;
  /** Agent tabs get their own session, and the agent may only act on tabs it opened. */
  agentIsolatedProfile?: boolean;
  /** With the isolated profile on, keep the agent's logins on disk until you clear them. */
  agentPersistentProfile?: boolean;
  showTasksWidget?: boolean;
  newTabBackground: 'default' | 'gradient' | 'mesh' | 'glass' | 'unsplash' | 'custom_url' | 'aurora_waves' | 'cyber_grid' | 'hyper_space' | 'fireflies' | 'nebula' | 'matrix';
  backgroundCustomUrl?: string;
  startupBehavior: 'newTab' | 'continue' | 'specificPages';
  tabStyle: 'rounded' | 'square' | 'floating';
  tabAnimation?: 'chrome' | 'smooth' | 'snappy' | 'none';
  doNotTrack: boolean;
  /** Opt-in: present a Firefox user agent on accounts.google.com so Google allows sign-in. */
  googleSigninCompat: boolean;
  clearOnExit: boolean;
  hardwareAcceleration: boolean;
  developerMode: boolean;
  tabHibernationEnabled?: boolean;
  hibernationTimeoutMinutes?: number;
  shortcuts?: Record<string, ShortcutConfig>;
  /** Hide the floating agent status pill while the agent is idle. */
  agentPillHideWhenIdle?: boolean;
  /** The user closed the agent status pill. A pending approval still shows it. */
  agentPillHidden?: boolean;
  aiLinkPreviewEnabled?: boolean;
  energySaverMode?: boolean;
  preloadDnsEnabled?: boolean;
  smoothScrollingEnabled?: boolean;
  passwordManagerEnabled?: boolean;
  defaultTranslationLanguage?: string;
  language?: 'en' | 'tr' | 'ar' | 'de';
}

/**
 * Best-effort interface-language detection for a first launch. Only the three
 * shipped languages are returned; every other system language, including
 * Turkish, starts in English.
 */
export function detectSystemLanguage(): 'en' | 'tr' | 'ar' | 'de' {
  try {
    if (typeof navigator !== 'undefined') {
      const candidates = [
        navigator.language,
        ...(Array.isArray(navigator.languages) ? navigator.languages : [])
      ];
      for (const candidate of candidates) {
        if (!candidate) continue;
        const base = candidate.toLowerCase().split(/[-_]/)[0];
        if (base === 'ar' || base === 'de' || base === 'en') return normalizeLanguage(candidate);
      }
    }
  } catch (_) {
    // Fall through to English when the environment has no navigator.
  }
  return 'en';
}

export const defaultSettings: UserSettings = {
  searchEngine: 'google',
  privacyShield: true,
  theme: 'dark',
  fontSize: 'medium',
  accentColor: 'blue',
  customAccentColor: '#3b82f6',
  browserColor: 'default',
  customBrowserColor: '#6366f1',
  showBookmarksBar: false,
  showTasksWidget: true,
  useVerticalTabs: false,
  mcpServerEnabled: false,
  agentIsolatedProfile: false,
  agentPersistentProfile: false,
  newTabBackground: 'default',
  backgroundCustomUrl: '',
  startupBehavior: 'newTab',
  tabStyle: 'floating',
  tabAnimation: 'chrome',
  doNotTrack: true,
  googleSigninCompat: false,
  clearOnExit: false,
  hardwareAcceleration: true,
  developerMode: false,
  tabHibernationEnabled: true,
  hibernationTimeoutMinutes: 10,
  energySaverMode: false,
  preloadDnsEnabled: true,
  smoothScrollingEnabled: true,
  passwordManagerEnabled: false,
  defaultTranslationLanguage: 'en',
  language: detectSystemLanguage(),
  agentPillHideWhenIdle: true,
  agentPillHidden: false,
  shortcuts: {
    ...buildDefaultShortcuts(typeof navigator !== 'undefined' && typeof navigator.userAgent === 'string' && navigator.userAgent.includes('Mac')),
    settings: { key: ',', shift: false, meta: true },
  }
};

export interface HistoryItem {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  timestamp: number;
}

export interface BrowserDemoOptions {
  isDemo?: boolean;
  feature?: string;
  bg?: string;
  theme?: 'dark' | 'light';
  tabs?: string;
  showTasksWidget?: boolean;
}

export interface VpnLocation {
  id: string;
  name: string;
  url: string;
  type: 'free' | 'custom';
}

export interface PermissionRequest {
  requestId: string;
  permission: string;
  url: string;
  origin: string;
  permissionName: string;
  mediaTypes?: string[];
  webContentsId?: number;
  timestamp: number;
}

