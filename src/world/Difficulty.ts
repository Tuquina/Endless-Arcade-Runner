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

/** Player-selectable difficulty. Normal is the reference tuning; the others reshape the same ramp. */
export type DifficultyId = 'easy' | 'normal' | 'hard';

export interface DifficultyProfile {
  id: DifficultyId;
  /** How fast the ramp advances per metre (1 = Normal). */
  pace: number;
  /** Difficulty 0..1 at the start of a run, and the most it ever reaches. */
  floor: number;
  ceil: number;
  /** Mechanics unlock at `UNLOCK_DISTANCE × unlockScale` metres. */
  unlockScale: number;
  /** Multiplier on the late-game pressure ramp (0 = none). */
  pressure: number;
  /** Seconds added to the guaranteed flat breather between segments. */
  breather: number;
  /** Whether metres in this mode count towards the distance skin objectives. */
  countsForSkins: boolean;
}

/**
 * Every profile only remaps *where along the proven ramp* a metre sits (difficulty, hence speed and
 * layout bucket, always come from the same fairness-checked relationship), and adds or trims
 * flat reaction time. That keeps every generated level solvable in every mode.
 */
export const DIFFICULTIES: Record<DifficultyId, DifficultyProfile> = {
  easy: { id: 'easy', pace: 0.55, floor: 0, ceil: 0.7, unlockScale: 1.6, pressure: 0, breather: 0.2, countsForSkins: false },
  normal: { id: 'normal', pace: 1, floor: 0, ceil: 1, unlockScale: 1, pressure: 1, breather: 0, countsForSkins: true },
  hard: { id: 'hard', pace: 1.5, floor: 0.2, ceil: 1, unlockScale: 0.6, pressure: 1.25, breather: -0.08, countsForSkins: true },
};

export const DIFFICULTY_IDS = Object.keys(DIFFICULTIES) as DifficultyId[];
export const DEFAULT_DIFFICULTY: DifficultyId = 'normal';

export function isDifficultyId(v: unknown): v is DifficultyId {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(DIFFICULTIES, v);
}

/** Distance (metres) at which a mechanic becomes available in the given difficulty. */
export function unlockAt(m: Mechanic, profile: DifficultyProfile = DIFFICULTIES.normal): number {
  return UNLOCK_DISTANCE[m] * profile.unlockScale;
}

/** Difficulty 0..1: rises quickly at first and flattens out; never a sudden jump. */
export function difficultyAt(distance: number, profile: DifficultyProfile = DIFFICULTIES.normal): number {
  const raw = 1 - Math.exp(-(Math.max(0, distance) * profile.pace) / 1500);
  return Math.min(profile.ceil, profile.floor + (1 - profile.floor) * raw);
}

/**
 * Extra pressure 0..1 after the main ramp is done: tighter breathers and more gauntlets, so a long
 * run keeps getting harder even though top speed has been reached.
 */
export function pressureAt(distance: number, profile: DifficultyProfile = DIFFICULTIES.normal): number {
  const p = (Math.max(0, distance) * profile.pace - 2400) / 4000;
  return Math.max(0, Math.min(1, p * profile.pressure));
}

export function speedAt(d: number): number {
  return SPEED_MIN + (SPEED_MAX - SPEED_MIN) * d;
}

/** Seconds of flat ground guaranteed between two segments (shrinks with difficulty and pressure). */
export function reactionTime(d: number, pressure = 0, profile: DifficultyProfile = DIFFICULTIES.normal): number {
  return 0.85 - 0.3 * d - 0.1 * pressure + profile.breather;
}
