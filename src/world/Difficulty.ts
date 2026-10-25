import { SPEED_MAX, SPEED_MIN } from '../physics/constants';

/** Obstacle families, introduced one at a time as the run goes on. */
export type Mechanic =
  | 'spike'
  | 'block'
  | 'pit'
  | 'rest'
  | 'platform'
  | 'mover'
  | 'ceiling'
  | 'combo'
  | 'crusher'
  | 'gauntlet';

/** Distance (tiles ≈ metres) at which each mechanic becomes available (key order = introduction order). */
export const UNLOCK_DISTANCE: Record<Mechanic, number> = {
  spike: 0,
  block: 150,
  pit: 300,
  rest: 350,
  platform: 500,
  mover: 800,
  ceiling: 1000,
  combo: 1200,
  crusher: 1600,
  gauntlet: 2400,
};

export const MECHANICS = Object.keys(UNLOCK_DISTANCE) as Mechanic[];

/** Each world (same length as a visual theme) leans on a couple of mechanics, so runs feel different as they go. */
export const WORLD_LENGTH = 400;
export const WORLD_FOCUS: readonly (readonly Mechanic[])[] = [
  ['spike'], //                      Neón
  ['block', 'pit'], //               Atardecer
  ['mover'], //                      Océano
  ['platform', 'ceiling', 'combo'], // Bosque
  ['crusher', 'combo'], //           Vacío
];

/** Mechanics a world emphasises (weights ×FOCUS_BOOST when picking segments). */
export function focusAt(distance: number): readonly Mechanic[] {
  const idx = Math.floor(Math.max(0, distance) / WORLD_LENGTH) % WORLD_FOCUS.length;
  return WORLD_FOCUS[idx]!;
}

/** Difficulty 0..1: rises quickly at first and flattens out; never a sudden jump. */
export function difficultyAt(distance: number): number {
  return 1 - Math.exp(-Math.max(0, distance) / 1500);
}

/**
 * Extra pressure 0..1 after the main ramp is done: tighter breathers and more gauntlets, so a long
 * run keeps getting harder even though top speed has been reached.
 */
export function pressureAt(distance: number): number {
  return Math.max(0, Math.min(1, (distance - 2400) / 4000));
}

export function speedAt(d: number): number {
  return SPEED_MIN + (SPEED_MAX - SPEED_MIN) * d;
}

/** Seconds of flat ground guaranteed between two segments (shrinks with difficulty and pressure). */
export function reactionTime(d: number, pressure = 0): number {
  return 0.85 - 0.3 * d - 0.1 * pressure;
}
