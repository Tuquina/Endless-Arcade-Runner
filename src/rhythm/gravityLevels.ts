import type { Section, Song } from '../audio/song';
import type { LevelDef } from './level';

/**
 * The gravity campaign: three famous melodies whose composers died well over a century ago, so the
 * compositions are in the public domain everywhere. The arrangements (drums, bass, harmony, tempo,
 * style) are original to this game and synthesized live, so there is no recording to license either.
 *
 *   Himno de la Alegría — Ludwig van Beethoven, 9th Symphony (1824) · festival house
 *   Can-Can (Galop infernal) — Jacques Offenbach, Orphée aux enfers (1858) · electro galop
 *   En la gruta del rey de la montaña — Edvard Grieg, Peer Gynt (1875) · trap
 *
 * Each level teaches one way of bending gravity: portals and blue rings, then the ball (a press flips
 * to the other surface), then the ship (hold to fly). Melody notes are scale degrees of the song's key
 * (`#`/`b` for the chromatic ones); see audio/song.ts and rhythm/level.ts for the notation.
 */

const K4 = 'x...x...x...x...';
const K2 = 'x.......x.......';
const SN = '....x.......x...';
const OFF = '..x...x...x...x.';
const H16 = 'xgxgxgxgxgxgxgxg';
const TRAP_K = 'x.....x...x...x.';
const TRAP_SN = '........x.......';
const TRAP_H = 'xgxgxgxgxxxxxgxgxgxgxgxgxgxgxxxx';

const sec = (name: string, bars: number, energy: number, o: Omit<Section, 'name' | 'bars' | 'energy'>): Section => ({ name, bars, energy, ...o });

/** The same melody an octave higher. */
const up = (lead: string): string => lead.replace(/(-?\d+[#b]?)([+-]*)/g, (_, n: string, o: string) => `${n}${o}+`);

/** Distance between ground jumps the chart has to respect is checked by the compiler; the ceiling sits 5 tiles up. */
const CEILING = 5;

// ------------------------------------------------------------------ 1 · Himno de la Alegría (Beethoven)
const ODE_A =
  '3 - - - 3 - - - 4 - - - 5 - - - | 5 - - - 4 - - - 3 - - - 2 - - - | 1 - - - 1 - - - 2 - - - 3 - - - | 3 - - - - - 2 - 2 - - - - - - - |' +
  '3 - - - 3 - - - 4 - - - 5 - - - | 5 - - - 4 - - - 3 - - - 2 - - - | 1 - - - 1 - - - 2 - - - 3 - - - | 2 - - - - - 1 - 1 - - - - - - -';
const ODE_B =
  '2 - - - 2 - - - 3 - - - 1 - - - | 2 - - - 3 - 4 - 3 - - - 1 - - - | 2 - - - 3 - 4 - 3 - - - 2 - - - | 1 - - - 2 - - - 5- - - - - - - - |' +
  '3 - - - 3 - - - 4 - - - 5 - - - | 5 - - - 4 - - - 3 - - - 2 - - - | 1 - - - 1 - - - 2 - - - 3 - - - | 2 - - - - - 1 - 1 - - - - - - -';

const himno: Song = {
  id: 'himno-alegria',
  name: 'Himno de la Alegría',
  bpm: 128,
  root: 74,
  scale: 'major',
  lead: 'square',
  bass: 'sawtooth',
  sections: [
    sec('intro', 4, 0.25, {
      chords: [1, 5, 6, 5], kick: K2, hat: OFF, pad: true, fill: true, lead: ODE_A.split('|').slice(0, 4).join('|'),
      chart: '................|................|s.......s.......|d...............',
    }),
    sec('verso', 8, 0.6, {
      chords: [1, 5, 6, 5, 1, 5, 6, 1], kick: K4, clap: SN, hat: OFF, bass: 'r.o.r.o.r.o.r.o.', arp: 'up', crash: true, lead: ODE_A,
      chart:
        's.......s.......|d.......b.......|s.......G.......|s.......s.......|' +
        'd.D.....s.......|s.O.............|s.......p.......|s.O.............',
    }),
    sec('estribillo', 8, 1, {
      chords: [5, 1, 5, 5, 1, 5, 6, 1], kick: K4, clap: SN, hat: H16, open: OFF, bass: 'r.o.r.o.r.o.r.o.', arp: 'up', crash: true, fill: true, lead: up(ODE_B),
      chart:
        's.......d.......|G.......s.......|s.O.....s.......|d.......G.......|' +
        's.......s.......|b.......s.O.....|s.D.....d.......|G.......s.......',
    }),
    sec('puente', 4, 0.35, {
      chords: [6, 4, 5, 5], kick: K2, hat: OFF, pad: true, arp: 'updown', fill: true, riser: true, lead: ODE_B.split('|').slice(0, 4).join('|'),
      chart: 's...............|G...............|s.......s.......|d.......d.......',
    }),
    sec('final', 8, 1, {
      chords: [1, 5, 6, 5, 1, 5, 6, 1], kick: K4, clap: SN, hat: H16, open: OFF, bass: 'r.o.r.o.r.o.r.o.', arp: 'up', crash: true, lead: up(ODE_A),
      chart:
        's.O.....s.......|d.......G.......|s.......s.O.....|s.......d.......|' +
        'G.......s.......|s.D.....b.......|s.......s.O.....|d.......G.......',
    }),
    sec('outro', 2, 0.2, { chords: [1], pad: true, kick: 'x...............', crash: true, lead: '8 - - - - - - - - - - - - - - -' }),
  ],
};

// ------------------------------------------------------------------ 2 · Can-Can (Offenbach)
const CANCAN =
  '1 - - - - - - - 2 - 4 - 3 - 2 - | 5 - - - 5 - - - 5 - 6 - 3 - 4 - | 2 - - - 2 - - - 2 - 4 - 3 - 2 - | 1 - 8 - 7 - 6 - 5 - 4 - 3 - 2 - |' +
  '1 - - - - - - - 2 - 4 - 3 - 2 - | 5 - - - 5 - - - 5 - 6 - 3 - 4 - | 2 - - - 2 - - - 2 - 4 - 3 - 2 - | 1 - 5- - 2 - 7- - 1 - - - . . . .';
const GALOP_BASS = 'r.f.r.f.r.f.r.f.';

const cancan: Song = {
  id: 'can-can',
  name: 'Can-Can',
  bpm: 150,
  root: 72,
  scale: 'major',
  lead: 'square',
  bass: 'square',
  sections: [
    sec('intro', 4, 0.3, {
      chords: [1, 5, 5, 1], kick: K2, hat: OFF, pad: true, fill: true, riser: true,
      chart: '................|................|s.......s.......|L...............',
    }),
    sec('verso', 8, 0.7, {
      chords: [1, 5, 5, 1, 1, 5, 5, 1], kick: K4, snare: OFF, hat: H16, bass: GALOP_BASS, crash: true, lead: CANCAN,
      chart:
        'f.......f...f...|f...f...f...f...|f...f...f...f...|f.......f.......|' +
        'f.D.....f...f...|f...f...f...f...|f...f...f...f...|f.......C.......',
    }),
    sec('estribillo', 8, 1, {
      chords: [1, 5, 5, 1, 1, 5, 5, 1], kick: K4, clap: SN, snare: OFF, hat: H16, open: OFF, bass: GALOP_BASS, arp: 'up', crash: true, fill: true, lead: up(CANCAN),
      chart:
        's.......s.......|G.......d.......|s.....s.........|b.......s.O.....|' +
        's.......d.......|G.......s.D.....|s.....s.........|L...............',
    }),
    sec('puente', 4, 0.4, {
      chords: [4, 5, 1, 5], kick: K2, hat: OFF, pad: true, arp: 'updown', fill: true, riser: true,
      chart: 'f.......f.......|f.......f.......|f...f...f...f...|f...f...f...f...',
    }),
    sec('final', 8, 1, {
      chords: [1, 5, 5, 1, 1, 5, 5, 1], kick: K4, clap: SN, snare: OFF, hat: H16, open: OFF, bass: GALOP_BASS, arp: 'up', crash: true, lead: up(CANCAN),
      chart:
        'f...f...f...f...|f...f...f...f...|f.......f...f...|f.D.f...f...f...|' +
        'f...f...f...f...|f...f...f...f...|f.......f...f...|f...f...f.......',
    }),
    sec('outro', 2, 0.2, { chords: [1], pad: true, kick: 'x...............', crash: true, lead: '8 - - - - - - - - - - - - - - -' }),
  ],
};

// ------------------------------------------------------------------ 3 · En la gruta del rey de la montaña (Grieg)
const KING =
  '1 - 2 - 3 - 4 - 5 - 3 - 5 - - - | 4# - 2 - 4# - - - 4 - 2b - 4 - - - | 1 - 2 - 3 - 4 - 5 - 3 - 5 - 8 - | 7b - 5 - 3 - 5 - 7b - - - - - - -';
const BASS_808 = 'r-----r-r-------';

const reyMontana: Song = {
  id: 'rey-montana',
  name: 'Rey de la Montaña',
  bpm: 140,
  root: 71,
  scale: 'harmonic',
  lead: 'square',
  bass: 'sine',
  sections: [
    sec('intro', 4, 0.3, {
      chords: [1, 5, 1, 1], kick: K2, hat: OFF, pad: true, fill: true, lead: KING.replace(/(\d[#b]?)/g, '$1-'),
      chart: '................|................|s.......s.......|d.......V.......',
    }),
    sec('subida', 8, 0.65, {
      chords: [1, 5, 1, 1], kick: TRAP_K, snare: TRAP_SN, hat: TRAP_H, bass: BASS_808, crash: true, riser: true, lead: KING,
      chart:
        '^.....v.....^...|..v.....^...v...|^...v...^...v...|^.......v.......|' +
        '^...v.D.^...v...|^.....v.^...v...|^...v...^...v...|^.....v.C.......',
    }),
    sec('caida', 8, 1, {
      chords: [1, 5, 1, 1], kick: TRAP_K, snare: TRAP_SN, clap: TRAP_SN, hat: TRAP_H, open: OFF, bass: BASS_808, arp: 'up', crash: true, fill: true, lead: up(KING),
      chart:
        's.......s.......|d.......G.......|s.......s.O.....|s.......L.......|' +
        'f...f...f...f...|f.D.f...f...f...|f...f...f...f...|f.......V.......',
    }),
    sec('puente', 4, 0.45, {
      chords: [1, 5, 1, 1], kick: K2, hat: TRAP_H, pad: true, arp: 'updown', fill: true, riser: true, lead: KING,
      chart: '^.......v.......|^...v...^...v...|^...v...^...v...|^.....v.C.......',
    }),
    sec('final', 8, 1, {
      chords: [1, 5, 1, 1], kick: TRAP_K, snare: TRAP_SN, clap: TRAP_SN, hat: TRAP_H, open: OFF, bass: BASS_808, arp: 'up', crash: true, lead: up(KING),
      chart:
        's.......s.......|G.......s.......|s.O.....d.......|s.......L.......|' +
        'f...f...f...f...|f.D.f...f...f...|f...f...f...C...|s.......s.......',
    }),
    sec('outro', 2, 0.2, { chords: [1], pad: true, kick: 'x...............', crash: true, lead: '1 - - - - - - - - - - - - - - -' }),
  ],
};

// ------------------------------------------------------------------ 4 · Voltaje (original)
// Electro house / complextro in F minor. The hook is a 3-3-2 syncopation that climbs over i–VI–III–VII.
const VOLT_HOOK =
  '8 - - 8 - - 7 - 5 - - 5 - - 3 - | 6 - - 6 - - 5 - 3 - - 4 - - 5 - | 10 - - 10 - - 9 - 8 - - 7 - - 8 - | 7 - - 7 - - 8 - 9 - - - - - . .';
const VOLT_HOOK_B =
  '8 - - 8 - - 7 - 5 - - 5 - - 3 - | 6 - - 6 - - 5 - 3 - - 4 - - 5 - | 10 - - 10 - - 9 - 8 - - 7 - - 8 - | 9 - - 9 - - 10 - 12 - - - 11 - 10 -';
const VOLT_VERSE =
  '1 . . 3 . . 5 . 4 . 3 . 1 . . . | 6- . . 1 . . 3 . 2 . 1 . 7- . . . | 3 . . 5 . . 7 . 6 . 5 . 3 . . . | 7- . . 2 . . 4 . 5 - - - . . . .';

const voltaje: Song = {
  id: 'voltaje',
  name: 'Voltaje',
  bpm: 150,
  root: 65,
  scale: 'minor',
  lead: 'sawtooth',
  bass: 'sawtooth',
  sections: [
    sec('intro', 4, 0.3, {
      chords: [1, 6, 3, 7], kick: K2, hat: OFF, pad: true, arp: 'up', riser: true, fill: true,
      chart: '................|................|s.......s.......|d.......s.O.....',
    }),
    sec('verso', 8, 0.65, {
      chords: [1, 6, 3, 7], kick: K4, clap: SN, hat: H16, bass: 'r.r.o.r.r.r.o.r.', arp: 'down', crash: true, lead: VOLT_VERSE,
      chart:
        '>.......s.......|d.......G.......|s.....s.........|b.......s.O.....|' +
        's.......d.D.....|G.......s.r.....|s.......t.......|s.O.........L...',
    }),
    sec('subida', 4, 0.8, {
      chords: [6, 7, 1, 1], kick: K4, snare: OFF, hat: H16, bass: 'r.r.r.r.r.r.r.r.', arp: 'up', fill: true, riser: true,
      chart: 'f...f...f...f...|f...f...f...f...|f.......f...f...|f...f...V.......',
    }),
    sec('drop', 8, 1, {
      chords: [1, 6, 3, 7], kick: K4, clap: SN, hat: H16, open: OFF, bass: '.rr.o.r..rr.o.r.', arp: 'up', crash: true, lead: VOLT_HOOK,
      chart:
        '^.....v...^...v.|..^...v...^...v.|^.....v...^.v...|^...v...^.v.W...|' +
        '^..v..^..v..^..v|..^.v...^..v.^.v|^...v..D^..v..^.|.v..^..v....C...',
    }),
    sec('pausa', 4, 0.35, {
      bpm: 120, chords: [6, 7, 1, 1], kick: K2, hat: OFF, pad: true, arp: 'updown', riser: true, fill: true,
      lead: '8 - - - - - - - 7 - - - 5 - - - | 6 - - - - - - - - - - - . . . .',
      chart: '<...............|s.......s.......|d.......s.r.....|p.......G.......',
    }),
    sec('drop 2', 8, 1, {
      bpm: 160, chords: [1, 6, 3, 7], kick: K4, clap: SN, hat: H16, open: OFF, bass: '.rr.o.r..rr.o.r.', arp: 'up', crash: true, lead: VOLT_HOOK_B,
      chart:
        '>.......s.......|G.......L.......|f...f...f...f...|f...f.D.f...f...|' +
        'f...f...W.......|^..v.^..v..^..v.|^.v..^.v..^..v..|^...v...C.......',
    }),
    sec('final', 4, 1, {
      bpm: 160, chords: [1, 6, 3, 7], kick: K4, clap: SN, hat: H16, open: OFF, bass: 'r.o.r.o.r.o.r.o.', arp: 'up', crash: true, lead: VOLT_HOOK,
      chart: '}.......s.......|s.r.....d.......|G.......s.O.....|s.......s.......',
    }),
    sec('outro', 2, 0.2, { bpm: 160, chords: [1], pad: true, kick: 'x...............', crash: true, lead: '8 - - - - - - - - - - - - - - -' }),
  ],
};

// ------------------------------------------------------------------ 5 · Hipervelocidad (original)
// Drum & bass in D minor that keeps speeding up: 140 → 160 → 174 → 180 BPM, with a half-time drop.
const HYPER_HOOK =
  '8 . 7 . 5 . 7 . 8 - - . 10 . 9 . | 8 . 7 . 4 . 7 . 8 - - . 11 . 10 . | 10 . 9 . 6 . 9 . 10 - - . 12 . 11 . | 9 - - - 7 - - - 8 - 9 - 10 - 12 -';
const DNB_K = 'x.........x.....';
const DNB_S = '....x.......x...';

const hipervelocidad: Song = {
  id: 'hipervelocidad',
  name: 'Hipervelocidad',
  bpm: 140,
  root: 62,
  scale: 'minor',
  lead: 'square',
  bass: 'sawtooth',
  sections: [
    sec('intro', 4, 0.3, {
      chords: [1, 4, 6, 7], kick: K2, hat: OFF, pad: true, fill: true, lead: HYPER_HOOK.replace(/(\d+)/g, '$1-'),
      chart: '................|................|s.......s.......|L...............',
    }),
    sec('carga', 8, 0.7, {
      bpm: 160, chords: [1, 4, 6, 7], kick: K4, snare: OFF, hat: H16, bass: 'r.r.r.r.r.r.r.r.', arp: 'up', riser: true, fill: true, crash: true, lead: HYPER_HOOK,
      chart:
        'f.......f.......|f.......f...f...|f...f...f...f...|f...f...f...f...|' +
        'f.D.f...f...f...|f...f...f...f...|f...f...f...f...|f...f...W.......',
    }),
    sec('drop', 8, 1, {
      bpm: 174, chords: [1, 4, 6, 7], kick: DNB_K, snare: DNB_S, hat: H16, open: OFF, bass: 'r-r-o-r-r-o-r-f-', arp: 'up', crash: true, lead: up(HYPER_HOOK),
      chart:
        '>..^..v..^..v..^|..v.^..v..^..v..|^..v.^.v.^..v...|^...v...^.v.^..v|' +
        '..^..v..^..v..^.|.v..^...v...V...|^.....v...^.....|v.D.^...v...C...',
    }),
    sec('medio tiempo', 4, 0.6, {
      bpm: 174, chords: [6, 7, 1, 1], kick: 'x...............', snare: TRAP_SN, hat: OFF, bass: 'r-o-r-o-r-o-r-o-', pad: true, fill: true, riser: true,
      lead: '8 - - - - - - - 10 - - - 9 - - - | 8 - - - - - - - - - - - . . . .',
      chart: '....s.......s...|....d.......G...|....s.......s.O.|....b.......s...',
    }),
    sec('sprint', 8, 1, {
      bpm: 180, chords: [1, 4, 6, 7], kick: DNB_K, snare: DNB_S, clap: DNB_S, hat: H16, open: OFF, bass: 'r-r-o-r-r-o-r-f-', arp: 'up', crash: true, lead: up(HYPER_HOOK),
      chart:
        '}...............|s.......s.r.....|d.......L.......|f...f...f...f...|' +
        'f...f.D.f...f...|f...f...W.......|^..v..^..v..^..v|..^..v..C.......',
    }),
    sec('final', 4, 1, {
      bpm: 180, chords: [1, 4, 6, 7], kick: DNB_K, snare: DNB_S, hat: H16, open: OFF, bass: 'r.o.r.o.r.o.r.o.', arp: 'up', crash: true, lead: HYPER_HOOK,
      chart: 's.......s.......|d.......s.O.....|s.......d.......|G.......s.......',
    }),
    sec('outro', 2, 0.2, { bpm: 180, chords: [1], pad: true, kick: 'x...............', crash: true, lead: '1 - - - - - - - - - - - - - - -' }),
  ],
};

export const GRAVITY_LEVELS: readonly LevelDef[] = [
  { id: 'himno-alegria', name: 'Himno de la Alegría', blurb: 'Beethoven · portales de gravedad.', song: himno, speed: 10, theme: 3, tier: 2, guides: true, ceiling: CEILING },
  { id: 'can-can', name: 'Can-Can', blurb: 'Offenbach · la bola que salta de piso a techo.', song: cancan, speed: 11, theme: 1, tier: 3, ceiling: CEILING },
  { id: 'rey-montana', name: 'Rey de la Montaña', blurb: 'Grieg en trap · volá con la nave.', song: reyMontana, speed: 11.5, theme: 4, tier: 4, ceiling: CEILING },  { id: 'voltaje', name: 'Voltaje', blurb: 'Electro house · velocidad, onda y todo a la vez.', song: voltaje, speed: 11.5, theme: 0, tier: 5, ceiling: CEILING },
  { id: 'hipervelocidad', name: 'Hipervelocidad', blurb: 'Drum & bass que acelera hasta 180 BPM.', song: hipervelocidad, speed: 12, theme: 2, tier: 5, ceiling: CEILING },
];

/** Composer credits shown in the level list (public-domain works, original arrangements). */
export const GRAVITY_CREDITS: Record<string, string> = {
  'himno-alegria': 'L. v. Beethoven (1824)',
  'can-can': 'J. Offenbach (1858)',
  'rey-montana': 'E. Grieg (1875)',
  voltaje: 'Original (2026)',
  hipervelocidad: 'Original (2026)',
};
