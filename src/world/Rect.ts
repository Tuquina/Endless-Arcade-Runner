export const SOLID = 0;
export const HAZARD = 1;
export type RectKind = typeof SOLID | typeof HAZARD;

/** Axis-aligned box in world tiles. Pooled by World. */
export class Rect {
  x0 = 0;
  y0 = 0;
  x1 = 0;
  y1 = 0;
  kind: RectKind = SOLID;
  /** Last grid column this rect is registered in (used for recycling). */
  lastCol = 0;
}
