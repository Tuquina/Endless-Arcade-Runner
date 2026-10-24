export const SOLID = 0;
export const HAZARD = 1;
export const COIN = 2;
export type RectKind = typeof SOLID | typeof HAZARD | typeof COIN;

/** Motion profiles of a mover, as a function of u ∈ [0, 1) (position inside one wavelength). */
export const WAVE_SINE = 0;
export const WAVE_SLAM = 1;
export type Wave = typeof WAVE_SINE | typeof WAVE_SLAM;

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

  /**
   * Movers are hazards that slide vertically. `y0..y1` is the box at its lowest (rest) position;
   * it is lifted by `amp * profile(u)` where u = (runnerX - centre) / wavelength + phase.
   * Driving the motion from the runner's x (instead of a wall clock) keeps every run identical and
   * lets the level solver reason about it exactly: the runner's x is part of the solver state.
   */
  mover = false;
  amp = 0;
  wavelength = 1;
  phase = 0;
  wave: Wave = WAVE_SINE;
  /** Rail drawn behind the mover so its path is readable (world y of the rail's top). */
  railTop = 0;
}

/** Position inside the mover's cycle, 0..1, at runner position `px`. */
export function moverCycle(r: Rect, px: number): number {
  const u = (px - (r.x0 + r.x1) / 2) / r.wavelength + r.phase;
  return u - Math.floor(u);
}

/** 0..1 lift of a mover at runner position `px`. */
export function moverLift(r: Rect, px: number): number {
  const u = moverCycle(r, px);
  if (r.wave === WAVE_SINE) return 0.5 - 0.5 * Math.cos(u * 6.283185307179586);
  // Slam: held up, drops fast, stays down briefly, then rises back up.
  if (u < 0.5) return 1;
  if (u < 0.58) return 1 - (u - 0.5) / 0.08;
  if (u < 0.7) return 0;
  return (u - 0.7) / 0.3;
}
