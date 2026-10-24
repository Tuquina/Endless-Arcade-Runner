export const SOLID = 0;
export const HAZARD = 1;
export const COIN = 2;
export type RectKind = typeof SOLID | typeof HAZARD | typeof COIN;

/** Axis-aligned box in world tiles. Pooled by World. */
export class Rect {
  x0 = 0;
  y0 = 0;
  x1 = 0;
  y1 = 0;
  kind: RectKind = SOLID;
  /** Coins only: already collected this run (skipped by queries and drawing). */
  taken = false;
  /** Last grid column this rect is registered in (used for recycling). */
  lastCol = 0;
}
