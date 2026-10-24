import { SPEED_MAX, SPEED_MIN } from '../physics/constants';

/** Obstacle families, introduced one at a time as the run goes on. */
export type Mechanic = 'spike' | 'block' | 'pit' | 'platform' | 'combo';

/** Distance (tiles ≈ metres) at which each mechanic becomes available. */
export const UNLOCK_DISTANCE: Record<Mechanic, number> = {
  spike: 0,
  block: 150,
  pit: 300,
  platform: 500,
  combo: 1200,
};

export const MECHANICS = Object.keys(UNLOCK_DISTANCE) as Mechanic[];

/** Difficulty 0..1: rises quickly at first and flattens out; never a sudden jump. */
export function difficultyAt(distance: number): number {
  return 1 - Math.exp(-Math.max(0, distance) / 1500);
}

export function speedAt(d: number): number {
  return SPEED_MIN + (SPEED_MAX - SPEED_MIN) * d;
}

/** Seconds of flat ground guaranteed between two segments (shrinks with difficulty). */
export function reactionTime(d: number): number {
  return 0.85 - 0.3 * d;
}
