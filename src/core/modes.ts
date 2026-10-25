/**
 * Game modes: the kind of run the player picks in the menu. Endless is the original runner. Each mode
 * brings its own rules and records, but they share the character, skins, coins and audio.
 *
 * Adding a mode: extend `GameMode`, add an entry to `GAME_MODES` (flip `available` on once it is
 * playable) and branch on `Game.mode` where its rules differ. Difficulty (see world/Difficulty.ts) is
 * a property of the endless mode only; the rhythm mode is a campaign of fixed levels (rhythm/levels.ts)
 * that brings its own notion of challenge.
 */
export type GameMode = 'endless' | 'rhythm' | 'gravity' | 'secret';

export interface ModeInfo {
  id: GameMode;
  name: string;
  blurb: string;
  /** Main-menu card for the modes without a difficulty selector. */
  detail: string;
  /** Short tab label in the main menu. */
  tab: string;
  available: boolean;
}

export const GAME_MODES: readonly ModeInfo[] = [
  { id: 'endless', name: 'Sin fin', tab: 'Sin fin', blurb: 'Corré lo más lejos', detail: '', available: true },
  { id: 'rhythm', name: 'Ritmo', tab: 'Ritmo', blurb: 'Niveles musicales', detail: '8 canciones originales: saltá al compás.', available: true },
  { id: 'gravity', name: 'Gravedad', tab: 'Gravedad', blurb: 'Clásicos al revés', detail: 'Clásicos con portales, nave y piso al revés.', available: true },
  /** Shown once earned by finishing the whole game, or while the easter egg is on (Game.secretOpen). */
  { id: 'secret', name: 'Ω Secreto', tab: 'Ω', blurb: 'Infinito, con todo', detail: 'Infinito y al azar, con todas las mecánicas.', available: true },
];

export const DEFAULT_MODE: GameMode = 'endless';

export function isGameMode(v: unknown): v is GameMode {
  return v === 'endless' || v === 'rhythm' || v === 'gravity' || v === 'secret';
}

/** Menu copy for each endless difficulty. */
export const DIFFICULTY_INFO = {
  easy: { name: 'Fácil', blurb: 'Más margen · no suma metros para aspectos.' },
  normal: { name: 'Normal', blurb: 'La experiencia de siempre.' },
  hard: { name: 'Difícil', blurb: 'Más rápido y con menos respiro.' },
} as const;
