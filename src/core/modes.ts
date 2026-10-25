/**
 * Game modes: the kind of run the player picks in the menu. Endless is the original runner. Each mode
 * brings its own rules and records, but they share the character, skins, coins and audio.
 *
 * Adding a mode: extend `GameMode`, add an entry to `GAME_MODES` (flip `available` on once it is
 * playable) and branch on `Game.mode` where its rules differ. Difficulty (see world/Difficulty.ts) is
 * a property of the endless mode only; a level-based mode brings its own notion of challenge.
 */
export type GameMode = 'endless';

export interface ModeInfo {
  id: GameMode | 'rhythm';
  name: string;
  blurb: string;
  available: boolean;
}

export const GAME_MODES: readonly ModeInfo[] = [
  { id: 'endless', name: 'Sin fin', blurb: 'Corré lo más lejos posible', available: true },
  { id: 'rhythm', name: 'Ritmo', blurb: 'Niveles al compás de la música', available: false },
];

export const DEFAULT_MODE: GameMode = 'endless';

export function isGameMode(v: unknown): v is GameMode {
  return v === 'endless';
}

/** Menu copy for each endless difficulty. */
export const DIFFICULTY_INFO = {
  easy: { name: 'Fácil', blurb: 'Más lento y con más margen. No suma metros para aspectos de distancia.' },
  normal: { name: 'Normal', blurb: 'La experiencia de siempre.' },
  hard: { name: 'Difícil', blurb: 'Acelera antes, los obstáculos llegan antes y con menos respiro.' },
} as const;
