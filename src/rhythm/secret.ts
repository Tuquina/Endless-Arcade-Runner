import { Rng } from '../core/Rng';
import { compileSong, type CompiledSong, type Section, type Song } from '../audio/song';
import { PORTAL_SPEED, TRIGGER } from '../world/Rect';
import { compileLevel, type CompiledLevel, type LevelDef, type Press, type RectSpec } from './level';

/**
 * The secret mode (unlocked by the easter egg): an endless run that uses everything the game has.
 *
 * It is built from *zones* of 10 bars, generated one after another with a seeded random generator:
 * an entry bar (portals: form, speed), seven bars of obstacles, an exit bar that brings the runner
 * back to a plain cube on the floor, and a bar to breathe. Each zone comes with its own music (same
 * key, faster and faster) and is compiled and proven completable by the same level compiler as the
 * campaign levels, then stitched onto the end of the run. Because every zone starts and ends in the
 * same state (cube, normal gravity, on the floor), any zone can follow any other.
 */

export type ZoneKind = 'cube' | 'gravity' | 'ball' | 'ship' | 'wave' | 'mix';

export const ZONE_NAMES: Record<ZoneKind, string> = {
  cube: 'SALTOS',
  gravity: 'GRAVEDAD',
  ball: 'BOLA',
  ship: 'NAVE',
  wave: 'ONDA',
  mix: 'MEZCLA',
};

const CEILING = 5;

// ---- obstacle bars (16 steps). Every bar keeps ≥ 8 steps between ground jumps and ends with room to land.
const CUBE_BARS = [
  's.......s.......', 'd.......s.......', 's.......d.......', 't.......s.......', 'b.......s.......',
  's.......b.......', 'p.......s.......', 'P.......d.......', 'z.......s.......', 's.......z.......',
  'k.......s.......', 'k.......z.......', 's.r.....s.......', 'd.r.....s.......', 'j.......s.......',
  'u.......s...n...', 'B.......s.......', 's.......t.......',
];
/** Bars that work right side up and upside down (under a ceiling). `G`/`O` flip gravity. */
const GRAVITY_BARS = [
  's.......s.......', 'd.......G.......', 's.......G.......', 's.O.....s.......', 'b.......G.......',
  't.......s.......', 'p.......s.......', 's.r.....d.......', 'G.......s.......', 'B.......s.......',
  's.O.....d.......', 'd.......s.......',
];
const BALL_BARS = ['f...f...f...f...', 'f.......f...f...', 'f...f.......f...', 'f.......f.......', 'f...f...f.......'];
/** At high tempo, back-to-back flips crowd each other's spikes: fast zones keep ≥ 6 steps between flips. */
const BALL_BARS_FAST = ['f.......f.......', 'f.........f.....', 'f.....f.........', 'f.......f.......'];
/** Flight bars: each bar lets go of the button before it ends, so any bar can follow any other. */
const SHIP_BARS = ['^.....v...^...v.', '^...v...^...v...', '^.......v.......', '^...v...^.....v.', '..^...v...^...v.'];
const WAVE_BARS = ['^..v..^..v..^..v', '^.v..^.v..^..v..', '^...v...^.v.^..v', '..^..v..^..v....', '^.....v...^..v..'];

// ---- music (A minor throughout, so zones flow into each other)
const HOOKS = [
  '5 . 5 . 8 . 5 . 7 - 5 . 3 . 5 . | 6 . 6 . 8 . 6 . 5 - 3 . 1 . 3 . | 3 . 3 . 5 . 7 . 8 - 7 . 5 . 7 . | 7 . 7 . 9 . 7 . 5 - - - . . . .',
  '1 . . 3 . . 5 . 8 . . 7 . . 5 . | 6 . . 4 . . 3 . 1 . . 2 . . 3 . | 3 . . 5 . . 7 . 10 . . 9 . . 7 . | 5 - - - 7 - - - 5 - - - . . . .',
  '8 - 7 - 5 - 3 - 5 - 7 - 8 - 10 - | 9 - 8 - 6 - 4 - 6 - 8 - 9 - . - | 10 - 8 - 7 - 5 - 7 - 8 - 10 - 12 - | 11 - - - 9 - - - 7 - - - . - . -',
  '5 . . 5 . . 5 . 4 . 3 . 4 . 5 . | 3 . . 3 . . 3 . 2 . 1 . 2 . 3 . | 6 . . 6 . . 6 . 5 . 4 . 5 . 6 . | 5 - - - 7- - - - 1 - - - . . . .',
];
const PROGRESSIONS = [[1, 6, 3, 7], [1, 4, 6, 5], [6, 7, 1, 1], [1, 7, 6, 7], [4, 5, 1, 1], [1, 6, 4, 5]];
const DRUMS: Record<ZoneKind, Pick<Section, 'kick' | 'snare' | 'clap' | 'hat' | 'open'>> = {
  cube: { kick: 'x...x...x...x...', clap: '....x.......x...', hat: 'xgxgxgxgxgxgxgxg', open: '..x...x...x...x.' },
  gravity: { kick: 'x...x...x...x...', clap: '....x.......x...', hat: '..x...x...x...x.', open: '..x...x...x...x.' },
  ball: { kick: 'x...x...x...x...', snare: '..x...x...x...x.', hat: 'xgxgxgxgxgxgxgxg' },
  ship: { kick: 'x.....x...x...x.', snare: '........x.......', hat: 'xgxgxgxgxxxxxgxgxgxgxgxgxgxgxxxx' },
  wave: { kick: 'x.........x.....', snare: '....x.......x...', hat: 'xgxgxgxgxgxgxgxg', open: '..x...x...x...x.' },
  mix: { kick: 'x...x...x...x...', clap: '....x.......x...', hat: 'xgxgxgxgxgxgxgxg' },
};
const BASSES = ['r.o.r.o.r.o.r.o.', '.rr.o.r..rr.o.r.', 'r-r-o-r-r-o-r-f-', 'r.r.o.r.r.r.o.r.', 'r.f.r.f.r.f.r.f.'];

export interface Zone {
  index: number;
  kind: ZoneKind;
  def: LevelDef;
}

/** Tempo and run speed climb with every zone, then hold. */
export function zoneTempo(index: number): { bpm: number; speed: number } {
  return { bpm: Math.min(172, 124 + 4 * index), speed: Math.min(13.5, 10 + 0.35 * index) };
}

/** Which kind of zone comes `index`-th: a fixed introduction, then random (never twice in a row). */
function zoneKind(index: number, prev: ZoneKind | null, rng: Rng): ZoneKind {
  const intro: ZoneKind[] = ['cube', 'gravity', 'ball', 'cube', 'ship', 'mix', 'wave'];
  if (index < intro.length) return intro[index]!;
  const all: ZoneKind[] = ['cube', 'gravity', 'ball', 'ship', 'wave', 'mix'];
  let k: ZoneKind;
  do k = all[rng.int(0, all.length - 1)]!;
  while (k === prev);
  return k;
}

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;

/** Gravity flips a bar causes (each `G`, `O` and `f` toggles it). */
const flips = (bar: string): number => [...bar].filter((c) => c === 'G' || c === 'O' || c === 'f').length;

/** Put `ch` on step `at` of a 16-step bar. */
const put = (bar: string, at: number, ch: string): string => bar.slice(0, at) + ch + bar.slice(at + 1);

export function makeZone(index: number, seed: number, prev: ZoneKind | null, attempt = 0): Zone {
  const rng = new Rng((seed * 7919 + index * 104729 + attempt * 31337) >>> 0);
  const kind = attempt >= 3 ? 'cube' : zoneKind(index, prev, rng);
  const { bpm, speed } = zoneTempo(index);
  const ceiling = kind === 'cube' ? undefined : CEILING;

  // Entry bar: the form portal on step 0, sometimes a speed portal on step 8.
  let entry = '................';
  if (kind === 'ball' || kind === 'mix') entry = put(entry, 0, kind === 'ball' ? 'L' : '.');
  if (kind === 'ship') entry = put(entry, 0, 'V');
  if (kind === 'wave') entry = put(entry, 0, 'W');
  if (index >= 2 && rng.next() < 0.6) entry = put(entry, 8, speed <= 12 && rng.next() < 0.35 ? '}' : '>');

  // Body: seven bars from the zone's pool.
  const body: string[] = [];
  let flipped = false;
  for (let b = 0; b < 7; b++) {
    let bar: string;
    if (kind === 'cube') bar = pick(rng, CUBE_BARS);
    else if (kind === 'gravity') bar = pick(rng, GRAVITY_BARS);
    else if (kind === 'ball') bar = pick(rng, bpm >= 148 ? BALL_BARS_FAST : BALL_BARS);
    else if (kind === 'ship') bar = pick(rng, SHIP_BARS);
    else if (kind === 'wave') bar = pick(rng, WAVE_BARS);
    else bar = b < 3 ? pick(rng, GRAVITY_BARS) : b === 3 ? 'L.......f...f...' : pick(rng, bpm >= 148 ? BALL_BARS_FAST : BALL_BARS);
    // Right after the portal, give the new form a moment: the first bar starts on step 2 or later.
    if (b === 0 && kind === 'ball') bar = put(bar, 0, '.');
    if (b === 0 && kind === 'ship') bar = '..^...v...^...v.';
    if (b === 0 && kind === 'wave') bar = '..^..v..^..v....';
    flipped = flipped !== (flips(bar) % 2 === 1);
    body.push(bar);
  }

  // Exit bar: back to a cube (step 0) and to normal gravity (step 8).
  let exit = '................';
  const formed = kind === 'ball' || kind === 'ship' || kind === 'wave' || kind === 'mix';
  if (formed) exit = put(exit, 0, 'C');
  if (flipped) exit = put(exit, 8, 'G');

  const prog = pick(rng, PROGRESSIONS);
  const hook = pick(rng, HOOKS);
  const bass = pick(rng, BASSES);
  const drums = DRUMS[kind];
  const sec = (name: string, bars: number, energy: number, o: Omit<Section, 'name' | 'bars' | 'energy' | 'bpm'>): Section => ({ name, bars, energy, bpm, ...o });
  const song: Song = {
    id: `secret-${index}`,
    name: `Zona ${index + 1}`,
    bpm,
    root: 69,
    scale: 'minor',
    lead: index % 2 ? 'sawtooth' : 'square',
    bass: kind === 'ship' ? 'sine' : 'sawtooth',
    sections: [
      sec('entrada', 1, 0.6, { chords: [prog[0]!], kick: 'x...x...x...x...', hat: '..x...x...x...x.', crash: true, pad: true, chart: entry }),
      sec(ZONE_NAMES[kind].toLowerCase(), 7, 1, { chords: prog, ...drums, bass, arp: 'up', lead: hook, chart: body.join('') }),
      sec('salida', 1, 0.5, { chords: [prog[3]!], kick: 'x.......x.......', hat: '..x...x...x...x.', pad: true, fill: true, chart: exit }),
      sec('respiro', 1, 0.4, { chords: [1], kick: 'x...............', pad: true, riser: true, chart: '................' }),
    ],
  };
  return {
    index,
    kind,
    def: { id: song.id, name: `${ZONE_NAMES[kind]}`, blurb: '', song, speed, theme: index % 5, tier: 5, ceiling, fullLength: true, tunnelBonus: 0.35 },
  };
}

/** Run-specific record of where each zone sits, for banners and the HUD. */
export interface ZoneSpan {
  index: number;
  kind: ZoneKind;
  x0: number;
  x1: number;
  t0: number;
}

const SECRET_SONG: Song = { id: 'secret', name: 'Ω', bpm: 124, root: 69, scale: 'minor', lead: 'square', bass: 'sawtooth', sections: [] };

/**
 * The endless secret run: zones are compiled on demand and appended to one growing level (rects,
 * presses, beats) and one growing song, so the regular rhythm machinery (RhythmRun, the audio clock,
 * the renderer) plays it as if it were a single, never-ending level.
 */
export class SecretStream {
  readonly level: CompiledLevel;
  readonly zones: ZoneSpan[] = [];
  private readonly sections: Section[] = [];
  private endX = 0;
  private endT = 0;
  private prev: ZoneKind | null = null;
  private baseBpm = 0;
  /** Zone rolls that could not be built (and were replaced), for diagnostics. */
  readonly failures: string[] = [];

  constructor(readonly seed: number) {
    this.level = {
      def: { id: 'secret', name: 'Ω', blurb: '', song: SECRET_SONG, speed: zoneTempo(0).speed, theme: 0, tier: 5 },
      song: compileSong({ ...SECRET_SONG, sections: [{ name: 'vacío', bars: 1, energy: 0, chords: [1] }] }),
      speed: zoneTempo(0).speed,
      rects: [],
      presses: [],
      checkpoints: [],
      endX: Infinity,
      endT: Infinity,
      discos: 0,
      startT: -0.6,
      beatX: [],
    };
    this.append();
    this.append();
  }

  /** Generated up to here (x and song time). */
  get generatedX(): number {
    return this.endX;
  }

  get generatedT(): number {
    return this.endT;
  }

  /** Keep at least `ahead` tiles generated in front of `x`. Returns true if the song grew. */
  ensure(x: number, ahead = 260): boolean {
    let grew = false;
    while (this.endX < x + ahead) {
      this.append();
      grew = true;
    }
    return grew;
  }

  zoneAt(x: number): ZoneSpan | null {
    for (let i = this.zones.length - 1; i >= 0; i--) if (this.zones[i]!.x0 <= x) return this.zones[i]!;
    return this.zones[0] ?? null;
  }

  private append(): void {
    const index = this.zones.length;
    let zone: Zone | null = null;
    let lv: CompiledLevel | null = null;
    for (let attempt = 0; attempt < 6 && !lv; attempt++) {
      zone = makeZone(index, this.seed, this.prev, attempt);
      try {
        const c = compileLevel(zone.def);
        const e = c.endState!;
        // Every zone must hand over a plain cube on the floor, so any zone can follow.
        if (e.g === 1 && e.form === 'cube' && e.grounded && Math.abs(e.y) < 1e-6 && !e.dead) lv = c;
      } catch (e) {
        // Try another roll of the dice (the reason is kept for the tests' diagnostics).
        this.failures.push(`${zone.kind}#${index}: ${(e as Error).message}`);
      }
    }
    if (!lv || !zone) throw new Error(`secret zone ${index} could not be built`);
    const X = this.endX;
    const T = this.endT;
    const out: RectSpec[] = [];
    // Set this zone's speed exactly when the runner's centre reaches its start.
    // (A hair before the zone's own entry portals, which sit at +0.4: one portal acts per step.)
    if (index > 0) out.push({ x0: X + 0.2, y0: -3, x1: X + 0.35, y1: 11, kind: TRIGGER, code: PORTAL_SPEED, value: lv.speed });
    for (const r of lv.rects) {
      // The first zone keeps its run-up; later ones start where the previous one ended.
      const from = index === 0 ? -Infinity : 0;
      if (r.x1 <= from || r.x0 >= lv.endX) continue;
      const clip = !r.mover && r.kind !== TRIGGER;
      out.push({ ...r, x0: (clip ? Math.max(from, r.x0) : r.x0) + X, x1: (clip ? Math.min(lv.endX, r.x1) : r.x1) + X });
    }
    out.sort((a, b) => a.x0 - b.x0);
    this.level.rects.push(...out);
    this.level.presses.push(...lv.presses.map((p): Press => ({ ...p, t: p.t + T, x: p.x + X, until: p.until === undefined ? undefined : p.until + T })));
    for (const bx of lv.beatX) if (bx >= 0 && bx < lv.endX) this.level.beatX.push(bx + X);
    this.sections.push(...zone.def.song.sections);
    this.baseBpm ||= zone.def.song.bpm;
    this.level.song = compileSong({ ...SECRET_SONG, bpm: this.baseBpm, sections: this.sections }) as CompiledSong;
    this.zones.push({ index, kind: zone.kind, x0: X, x1: X + lv.endX, t0: T });
    this.endX += lv.endX;
    this.endT += lv.endT;
    this.prev = zone.kind;
  }
}
