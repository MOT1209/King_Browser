/**
 * Placement and visibility of the floating agent status pill.
 *
 * The pill is the human's handle on a running agent, so the user may move it,
 * hide it while idle, or close it. One rule is not negotiable: while an
 * action waits for approval the pill is always shown, whatever the user chose,
 * because hiding it would hide the approval gate.
 *
 * Kept free of React and DOM so it can be unit-tested in plain Node.
 */

export interface PillPoint {
  x: number;
  y: number;
}

export interface PillSize {
  width: number;
  height: number;
}

export const PILL_MARGIN = 16;

/** Keeps the pill fully inside the viewport with a small margin. */
export function clampPillPosition(point: PillPoint, pill: PillSize, viewport: PillSize): PillPoint {
  const maxX = Math.max(PILL_MARGIN, viewport.width - pill.width - PILL_MARGIN);
  const maxY = Math.max(PILL_MARGIN, viewport.height - pill.height - PILL_MARGIN);
  const x = Number.isFinite(point.x) ? point.x : maxX;
  const y = Number.isFinite(point.y) ? point.y : maxY;
  return {
    x: Math.min(Math.max(PILL_MARGIN, x), maxX),
    y: Math.min(Math.max(PILL_MARGIN, y), maxY),
  };
}

/**
 * Default spot: bottom corner on the inline-start side. The assistant side
 * panel opens on the inline-end side (right in English, left in Arabic), and
 * the old fixed bottom-end pill sat on top of its chat input.
 */
export function defaultPillPosition(pill: PillSize, viewport: PillSize, isRtl: boolean): PillPoint {
  const x = isRtl ? viewport.width - pill.width - PILL_MARGIN : PILL_MARGIN;
  return clampPillPosition({ x, y: viewport.height - pill.height - PILL_MARGIN }, pill, viewport);
}

/** Parses a stored position; anything malformed means "use the default". */
export function parseStoredPillPosition(raw: string | null): PillPoint | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    if (value && typeof value === 'object') {
      const { x, y } = value as Record<string, unknown>;
      if (typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)) {
        return { x, y };
      }
    }
  } catch {
    // Corrupt value: fall back to the default position.
  }
  return null;
}

export interface PillVisibilityInput {
  state: string;
  hasPendingApproval: boolean;
  queueLength: number;
  panelOpen: boolean;
  hiddenByUser: boolean;
  hideWhenIdle: boolean;
}

export function shouldShowPill(input: PillVisibilityInput): boolean {
  if (input.hasPendingApproval || input.state === 'awaiting_approval') return true;
  if (input.panelOpen) return true;
  if (input.hiddenByUser) return false;
  if (input.hideWhenIdle && input.state === 'idle' && input.queueLength === 0) return false;
  return true;
}

/** A pointer that moved less than this is a click, not a drag. */
export const DRAG_THRESHOLD_PX = 4;

export function isDragGesture(start: PillPoint, current: PillPoint): boolean {
  return Math.abs(current.x - start.x) > DRAG_THRESHOLD_PX || Math.abs(current.y - start.y) > DRAG_THRESHOLD_PX;
}
