/**
 * The page address handed to the agent when the human gives the browser back.
 *
 * Only a page the agent could already see is named: never a private tab, and
 * with the isolated agent profile on, never a tab the agent did not open.
 * The main process still strips the query and fragment before the agent sees it.
 */
export interface HandoffTabLike {
  url?: string;
  isIncognito?: boolean;
  isAgentOwned?: boolean;
}

export function handoffUrlForAgent(tab: HandoffTabLike | null | undefined, isolatedProfile: boolean): string | undefined {
  if (!tab || typeof tab.url !== 'string' || !tab.url) return undefined;
  if (tab.isIncognito) return undefined;
  if (isolatedProfile && !tab.isAgentOwned) return undefined;
  return tab.url;
}
