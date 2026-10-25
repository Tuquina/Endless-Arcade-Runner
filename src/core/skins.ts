/**
 * Character looks and the objectives that unlock them. Purely cosmetic: a skin never changes the
 * hitbox or the physics, and picking one is a menu action, not a gameplay control.
 *
 * A skin is described as data (colours, pattern, face, accessories, aura, trail) and drawn by
 * PlayerView, so adding one is a matter of adding an entry here.
 */

/** What the player has to do to earn a skin. */
export type GoalType = 'distance' | 'coins' | 'attempts' | 'saws' | 'crushers' | 'levels' | 'discos';

export interface Goal {
  type: GoalType;
  n: number;
}

export type Pattern = 'stripes' | 'dots' | 'checker' | 'circuit' | 'stars' | 'frost' | 'facets';
export type Face = 'default' | 'angry' | 'panda' | 'visor' | 'ghost' | 'astro' | 'ninja' | 'none';
export type Mouth = 'smile' | 'o' | 'fang' | 'grin';
export type Accessory =
  | 'shades'
  | 'crown'
  | 'catEars'
  | 'bearEars'
  | 'antenna'
  | 'bolts'
  | 'headband'
  | 'wizardHat'
  | 'beard'
  | 'flame'
  | 'crystals'
  | 'frogEyes'
  | 'headphones';
/** Whole-body effects drawn on top of the plain shape. */
export type Aura = 'ghost' | 'glitch' | 'sparkle';
/** Motion of the particles a skin leaves behind. */
export type TrailKind = 'shard' | 'ember' | 'bubble' | 'star' | 'pixel' | 'wisp' | 'flake';

export interface TrailStyle {
  kind: TrailKind;
  /** Up to 4 colours picked at random per particle. */
  colors: readonly string[];
  /** Also leave a trail while running on the ground (default: only while airborne). */
  ground?: boolean;
}

export interface Skin {
  id: string;
  name: string;
  /** One line of personality, shown in the skins screen. */
  blurb: string;
  goal: Goal;
  color: string;
  shade: string;
  /** Second colour for patterns and accessories. */
  accent?: string;
  pattern?: Pattern;
  face?: Face;
  mouth?: Mouth;
  accessories?: readonly Accessory[];
  aura?: Aura;
  /** Cycles through the hue wheel instead of using `color`. */
  rainbow?: boolean;
  trail?: TrailStyle;
}

export const DEFAULT_SKIN = 'classic';

const free: Goal = { type: 'distance', n: 0 };

/** Ordered roughly from easiest to hardest objective: this is the order of the skins screen. */
export const SKINS: readonly Skin[] = [
  { id: 'classic', name: 'Clásico', blurb: 'El de siempre.', goal: free, color: '#ffd23f', shade: '#c79a12' },
  { id: 'mint', name: 'Menta', blurb: 'Fresco y tranquilo.', goal: { type: 'distance', n: 250 }, color: '#2ee6a6', shade: '#12a574', mouth: 'smile' },
  { id: 'rose', name: 'Rosa', blurb: 'Dulce y con lunares.', goal: { type: 'distance', n: 500 }, color: '#ff6fa8', shade: '#c93d78', accent: '#ffd0e4', pattern: 'dots', mouth: 'smile' },
  {
    id: 'panda', name: 'Panda', blurb: 'Come bambú y junta monedas.', goal: { type: 'coins', n: 100 },
    color: '#f4f4f4', shade: '#c9c9c9', accent: '#23232b', face: 'panda', accessories: ['bearEars'], mouth: 'smile',
  },
  {
    id: 'tiger', name: 'Tigre', blurb: 'Rayas, garras y mal humor.', goal: { type: 'distance', n: 750 },
    color: '#ff9a1f', shade: '#cc6a00', accent: '#2a1606', pattern: 'stripes', face: 'angry', accessories: ['catEars'], mouth: 'fang',
  },
  {
    id: 'robot', name: 'Robot', blurb: 'Iteración 40 y sigue sin fallar.', goal: { type: 'attempts', n: 40 },
    color: '#9fb0c4', shade: '#6d7f95', accent: '#35e0ff', pattern: 'circuit', face: 'visor', accessories: ['antenna', 'bolts'],
    trail: { kind: 'pixel', colors: ['#35e0ff', '#ffffff'] },
  },
  {
    id: 'frog', name: 'Rana', blurb: 'Salta más por vocación.', goal: { type: 'coins', n: 300 },
    color: '#7ddc4a', shade: '#4fa02a', accent: '#3b7a1c', pattern: 'dots', face: 'none', accessories: ['frogEyes'], mouth: 'grin',
    trail: { kind: 'bubble', colors: ['#d9ffe0', '#ffffff'] },
  },
  { id: 'shades', name: 'Gafas', blurb: 'Demasiado cool para morir.', goal: { type: 'distance', n: 1000 }, color: '#6ec1ff', shade: '#3a8ed1', accessories: ['shades'], mouth: 'smile' },
  {
    id: 'ninja', name: 'Ninja', blurb: 'Nadie lo vio llegar.', goal: { type: 'distance', n: 1500 },
    color: '#243059', shade: '#141b36', accent: '#ff4d4d', face: 'ninja', accessories: ['headband'],
    trail: { kind: 'wisp', colors: ['#3a4a85', '#6a7ac0'], ground: true },
  },
  {
    id: 'ghost', name: 'Fantasma', blurb: 'Ya perdió la cuenta de sus vidas.', goal: { type: 'attempts', n: 150 },
    color: '#f2f7ff', shade: '#c4d3ea', accent: '#9fb6e0', face: 'ghost', mouth: 'o', aura: 'ghost',
    trail: { kind: 'wisp', colors: ['#ffffff', '#cfe3ff'], ground: true },
  },
  {
    id: 'ice', name: 'Hielo', blurb: 'Esquiva sierras sin derretirse.', goal: { type: 'saws', n: 40 },
    color: '#bdeeff', shade: '#7cc5e6', accent: '#ffffff', pattern: 'frost', accessories: ['crystals'], mouth: 'smile',
    trail: { kind: 'flake', colors: ['#ffffff', '#cdf3ff'] },
  },
  {
    id: 'wizard', name: 'Mago', blurb: 'Su magia: no pisar los pinchos.', goal: { type: 'coins', n: 800 },
    color: '#8a5cff', shade: '#5a32c4', accent: '#ffd23f', pattern: 'stars', accessories: ['wizardHat', 'beard'],
    trail: { kind: 'star', colors: ['#ffd23f', '#ffffff', '#c9b3ff'] },
  },
  { id: 'rainbow', name: 'Arcoíris', blurb: 'Todos los colores a la vez.', goal: { type: 'distance', n: 2000 }, color: '#ff4d6d', shade: '#a82a45', rainbow: true, mouth: 'smile' },
  {
    id: 'fire', name: 'Fuego', blurb: 'Deja brasas por donde pasa.', goal: { type: 'distance', n: 3000 },
    color: '#ff6a1a', shade: '#c62a00', accent: '#ffd23f', face: 'angry', accessories: ['flame'], mouth: 'fang',
    trail: { kind: 'ember', colors: ['#ff7a1a', '#ffd23f', '#ff3d00'], ground: true },
  },
  {
    id: 'pixel', name: 'Glitch', blurb: 'Un bug que sortea prensas.', goal: { type: 'crushers', n: 25 },
    color: '#12d68a', shade: '#0a8a5a', accent: '#0a6a45', pattern: 'checker', aura: 'glitch',
    trail: { kind: 'pixel', colors: ['#00ff9c', '#ff00aa', '#00d4ff'] },
  },
  {
    id: 'astro', name: 'Astronauta', blurb: 'Corre como si no hubiera gravedad.', goal: { type: 'distance', n: 4000 },
    color: '#f1f4fa', shade: '#b9c2d6', accent: '#ff6b3d', face: 'astro', accessories: ['antenna'],
    trail: { kind: 'star', colors: ['#ffffff', '#9fd8ff'] },
  },
  { id: 'king', name: 'Rey', blurb: 'Larga vida al rey.', goal: { type: 'distance', n: 5000 }, color: '#fff1b8', shade: '#e0b84a', accessories: ['crown'], mouth: 'smile' },
  {
    id: 'diamond', name: 'Diamante', blurb: 'Casi nadie llega a verlo.', goal: { type: 'distance', n: 8000 },
    color: '#aef0ff', shade: '#67c7e8', accent: '#ffffff', pattern: 'facets', aura: 'sparkle', mouth: 'smile',
    trail: { kind: 'star', colors: ['#ffffff', '#9cf0ff', '#d9c9ff'] },
  },
  // Rhythm mode rewards.
  {
    id: 'dj', name: 'DJ', blurb: 'Pone el ritmo y nunca pierde el compás.', goal: { type: 'levels', n: 2 },
    color: '#ff3d81', shade: '#b8195a', accent: '#35e0ff', accessories: ['headphones', 'shades'], mouth: 'grin',
    trail: { kind: 'pixel', colors: ['#ff3d81', '#35e0ff', '#ffffff'], ground: true },
  },
  {
    id: 'discoball', name: 'Bola disco', blurb: 'Brilla con cada beat.', goal: { type: 'discos', n: 12 },
    color: '#dfe6f2', shade: '#9aa6bb', accent: '#ffffff', pattern: 'facets', aura: 'sparkle', mouth: 'smile',
    trail: { kind: 'star', colors: ['#ff3d81', '#35e0ff', '#ffd23f', '#9cff6b'] },
  },
  {
    id: 'maestro', name: 'Maestro', blurb: 'Terminó toda la gira sin perder un beat.', goal: { type: 'levels', n: 8 },
    color: '#ffd23f', shade: '#c79a12', accent: '#8a5cff', accessories: ['headphones', 'crown'], aura: 'sparkle', mouth: 'grin',
    trail: { kind: 'star', colors: ['#ffd23f', '#ffffff', '#c9b3ff'], ground: true },
  },
];

/** Everything an objective can be measured against. */
export interface Progress {
  /** Metres in the current run (for unlock checks) or the best single run (for display). */
  distance: number;
  /** Lifetime totals, including the current run. */
  coins: number;
  attempts: number;
  saws: number;
  crushers: number;
  /** Rhythm levels completed, and discos collected in completed runs. */
  levels: number;
  discos: number;
}

export const EMPTY_PROGRESS: Progress = { distance: 0, coins: 0, attempts: 0, saws: 0, crushers: 0, levels: 0, discos: 0 };

/** Current value of the quantity a goal measures. */
export function goalValue(goal: Goal, p: Progress): number {
  switch (goal.type) {
    case 'distance': return p.distance;
    case 'coins': return p.coins;
    case 'attempts': return p.attempts;
    case 'saws': return p.saws;
    case 'crushers': return p.crushers;
    case 'levels': return p.levels;
    case 'discos': return p.discos;
  }
}

export const GOAL_UNIT: Record<GoalType, string> = {
  distance: 'm',
  coins: 'monedas',
  attempts: 'partidas',
  saws: 'sierras',
  crushers: 'prensas',
  levels: 'niveles',
  discos: 'discos',
};

/** Short objective, e.g. "Llegá a 750 m" / "Juntá 100 monedas". */
export function goalText(goal: Goal): string {
  switch (goal.type) {
    case 'distance': return `Llegá a ${goal.n} m en una partida`;
    case 'coins': return `Juntá ${goal.n} monedas`;
    case 'attempts': return `Jugá ${goal.n} partidas`;
    case 'saws': return `Esquivá ${goal.n} sierras`;
    case 'crushers': return `Pasá ${goal.n} prensas`;
    case 'levels': return `Completá ${goal.n} niveles de Ritmo`;
    case 'discos': return `Juntá ${goal.n} discos en Ritmo`;
  }
}

/** Distance goals in ascending order (for in-world checkpoint markers). */
export const DISTANCE_GOALS: readonly { n: number; id: string }[] = SKINS.filter((s) => s.goal.type === 'distance' && s.goal.n > 0)
  .map((s) => ({ n: s.goal.n, id: s.id }))
  .sort((a, b) => a.n - b.n);

export function findSkin(id: string): Skin {
  return SKINS.find((s) => s.id === id) ?? SKINS[0]!;
}

export function isEarned(skin: Skin, p: Progress): boolean {
  return skin.goal.n <= 0 || goalValue(skin.goal, p) >= skin.goal.n;
}

/** Skins whose objective is met by `p` and that aren't unlocked yet. */
export function newlyUnlocked(p: Progress, unlocked: readonly string[]): Skin[] {
  return SKINS.filter((s) => !unlocked.includes(s.id) && isEarned(s, p));
}

/** The still-locked skin that is closest to being earned (largest fraction done), or null if none. */
export function nextSkin(unlocked: readonly string[], p: Progress): Skin | null {
  let best: Skin | null = null;
  let bestFraction = -1;
  for (const s of SKINS) {
    if (unlocked.includes(s.id)) continue;
    const fraction = Math.min(1, goalValue(s.goal, p) / s.goal.n);
    if (fraction > bestFraction || (fraction === bestFraction && best && s.goal.n < best.goal.n)) {
      best = s;
      bestFraction = fraction;
    }
  }
  return best;
}

/** Drop unknown ids, always include the default, and add anything the saved stats already earned. */
export function reconcileUnlocked(stored: readonly string[], p: Progress): string[] {
  const out = new Set<string>([DEFAULT_SKIN]);
  for (const id of stored) if (SKINS.some((s) => s.id === id)) out.add(id);
  for (const s of SKINS) if (isEarned(s, p)) out.add(s.id);
  return [...out];
}
