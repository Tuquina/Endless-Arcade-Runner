/**
 * Character looks and the distance challenges that unlock them. Purely cosmetic: a skin never
 * changes the hitbox or the physics, and picking one is a menu action, not a gameplay control.
 */
export interface Skin {
  id: string;
  name: string;
  /** Metres to reach in a single run to unlock it (0 = available from the start). */
  goal: number;
  color: string;
  shade: string;
  accessory?: 'shades' | 'crown';
  /** Cycles through the hue wheel instead of using `color`. */
  rainbow?: boolean;
}

export const DEFAULT_SKIN = 'classic';

export const SKINS: readonly Skin[] = [
  { id: 'classic', name: 'Clásico', goal: 0, color: '#ffd23f', shade: '#c79a12' },
  { id: 'mint', name: 'Menta', goal: 250, color: '#2ee6a6', shade: '#12a574' },
  { id: 'rose', name: 'Rosa', goal: 500, color: '#ff6fa8', shade: '#c93d78' },
  { id: 'shades', name: 'Gafas', goal: 1000, color: '#6ec1ff', shade: '#3a8ed1', accessory: 'shades' },
  { id: 'rainbow', name: 'Arcoíris', goal: 2000, color: '#ff4d6d', shade: '#a82a45', rainbow: true },
  { id: 'king', name: 'Rey', goal: 5000, color: '#fff1b8', shade: '#e0b84a', accessory: 'crown' },
];

export const GOAL_SKIN_IDS: readonly string[] = SKINS.filter((s) => s.goal > 0).map((s) => s.id);

/** Distance goals in ascending order (for in-world checkpoint markers). */
export const GOALS: readonly number[] = SKINS.filter((s) => s.goal > 0).map((s) => s.goal);

export function findSkin(id: string): Skin {
  return SKINS.find((s) => s.id === id) ?? SKINS[0]!;
}

/** Skins whose goal is met by `distance` and that aren't unlocked yet. */
export function newlyUnlocked(distance: number, unlocked: readonly string[]): Skin[] {
  return SKINS.filter((s) => s.goal > 0 && distance >= s.goal && !unlocked.includes(s.id));
}

/** The easiest still-locked skin, or null when everything is unlocked. */
export function nextSkin(unlocked: readonly string[]): Skin | null {
  let best: Skin | null = null;
  for (const s of SKINS) {
    if (!unlocked.includes(s.id) && (!best || s.goal < best.goal)) best = s;
  }
  return best;
}

/** Drop unknown ids, always include the default, and add anything the best distance already earned. */
export function reconcileUnlocked(stored: readonly string[], maxDist: number): string[] {
  const out = new Set<string>([DEFAULT_SKIN]);
  for (const id of stored) if (SKINS.some((s) => s.id === id)) out.add(id);
  for (const s of SKINS) if (s.goal <= maxDist) out.add(s.id);
  return [...out];
}
