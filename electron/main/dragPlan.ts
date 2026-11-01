/**
 * Geometry and validation for `browser_drag` (plan.md, WP10 phase 2).
 *
 * The renderer locates both ends of the drag in page coordinates; main performs
 * the gesture with real mouse input over CDP. This module turns two untrusted
 * points into the list of intermediate pointer positions, and refuses anything
 * that is not a finite point on a plausible viewport. Dependency-free.
 */

export interface DragPoint { x: number; y: number }

export const MAX_DRAG_COORD = 20000;
export const DRAG_STEPS = 8;

export function parseDragPoint(value: unknown): DragPoint | null {
  if (!value || typeof value !== 'object') return null;
  const { x, y } = value as Record<string, unknown>;
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (x < 0 || y < 0 || x > MAX_DRAG_COORD || y > MAX_DRAG_COORD) return null;
  return { x, y };
}

/** Positions after the press and up to the target, evenly spaced; the last one is the target. */
export function dragPath(from: DragPoint, to: DragPoint, steps: number = DRAG_STEPS): DragPoint[] {
  const n = Math.max(1, Math.min(Math.floor(steps) || 1, 50));
  const out: DragPoint[] = [];
  for (let i = 1; i <= n; i++) {
    out.push({ x: from.x + ((to.x - from.x) * i) / n, y: from.y + ((to.y - from.y) * i) / n });
  }
  return out;
}
