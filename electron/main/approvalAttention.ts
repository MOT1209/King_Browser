/**
 * Gets the human's attention when the agent waits for an approval while King
 * is in the background: one system notification per pending action and a
 * flashing taskbar entry until the window is focused again.
 *
 * An approval that nobody sees times out as a rejection, so the agent stalls
 * without the human knowing why. This module only decides when to alert; the
 * approval itself still happens in the window. The notification names the tool
 * and the site, never the action summary, which can contain typed text.
 *
 * Dependency-free (host-injected) so it can be unit-tested in plain Node.
 */

export interface ApprovalNotificationStrings {
  title: string;
  body: (tool: string, domain: string | undefined) => string;
}

export interface ApprovalAttentionHost {
  isWindowFocused: () => boolean;
  flashWindow: (on: boolean) => void;
  focusWindow: () => void;
  showNotification: (title: string, body: string, onClick: () => void) => void;
  strings: () => ApprovalNotificationStrings;
}

interface EngineEventLike {
  type?: unknown;
  approval?: { actionId?: unknown; toolName?: unknown; domain?: unknown } | null;
}

const MAX_FIELD_LENGTH = 80;

function clip(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (!trimmed) return undefined;
  return trimmed.length > MAX_FIELD_LENGTH ? `${trimmed.slice(0, MAX_FIELD_LENGTH - 1)}…` : trimmed;
}

export function createApprovalAttention(host: ApprovalAttentionHost) {
  let lastNotifiedActionId: string | null = null;
  let flashing = false;

  const stopFlashing = () => {
    if (!flashing) return;
    flashing = false;
    host.flashWindow(false);
  };

  return {
    handleEngineEvent(event: EngineEventLike): void {
      if (!event || event.type !== 'approval_needed' || !event.approval) return;
      const actionId = typeof event.approval.actionId === 'string' ? event.approval.actionId : null;
      if (!actionId || actionId === lastNotifiedActionId) return;
      if (host.isWindowFocused()) return;
      lastNotifiedActionId = actionId;

      flashing = true;
      host.flashWindow(true);
      const strings = host.strings();
      const tool = clip(event.approval.toolName) ?? 'browser';
      host.showNotification(strings.title, strings.body(tool, clip(event.approval.domain)), () => {
        host.focusWindow();
        stopFlashing();
      });
    },

    handleWindowFocus(): void {
      stopFlashing();
    },
  };
}
