import type { Section, Song } from '../audio/song';
import type { LevelDef } from './level';

/**
 * The rhythm campaign: eight original songs (composed for this game, synthesized live) and the
 * charts played over them. Each level adds one idea, in this order:
 *   1 spikes · 2 blocks and gaps · 3 triple spikes, wide gaps, raised floors · 4 launch pads ·
 *   5 rings (mid-air presses) · 6-8 everything, faster and denser.
 *
 * Charts follow a few spacing rules so that a jump has always landed before the next note asks
 * for one (checked when the level is compiled and by the tests): ≥ 0.6 s between ground jumps,
 * a ring two 16ths after the jump that carries the runner to it, and some room after rings and pads.
 */

// ---- shared grooves (one bar, 16 steps)
const K4 = 'x...x...x...x...';
const K2 = 'x.......x.......';
const KB = 'x.....x...x.....';
const KS = 'x..x..x...x..x..';
const SN = '....x.......x...';
const SNH = '........x.......';
const H8 = '..x...x...x...x.';
const H8F = 'x.x.x.x.x.x.x.x.';
const H16 = 'xgxgxgxgxgxgxgxg';
const OH = '..x...x...x...x.';

const sec = (name: string, bars: number, energy: number, o: Omit<Section, 'name' | 'bars' | 'energy'>): Section => ({ name, bars, energy, ...o });

// ------------------------------------------------------------------ 1 · Primer Pulso
const primerPulso: Song = {
  id: 'primer-pulso',
  name: 'Primer Pulso',
  bpm: 100,
  root: 69,
  scale: 'minor',
  lead: 'square',
  bass: 'sawtooth',
  sections: [
    sec('intro', 4, 0.2, {
      chords: [1, 6, 3, 7], kick: K2, hat: H8, pad: true, fill: true,
      chart: '................|................|s...............|s.......s.......',
    }),
    sec('verso', 8, 0.45, {
      chords: [1, 6, 3, 7], kick: K4, snare: SN, hat: H8, bass: 'r.r.r.r.r.r.r.o.', arp: 'up', arpRate: 8, crash: true,
      chart:
        's.......s.......|s.......d.......|s.......s.......|d.......s.......|' +
        's.D.....s.......|s.......d.......|s...s...s.......|d...............',
    }),
    sec('estribillo', 8, 0.85, {
      chords: [1, 6, 3, 7], kick: K4, clap: SN, hat: H16, open: OH, bass: 'r.o.r.o.r.o.r.o.', crash: true, fill: true,
      lead: '5 . . 3 . . 1 . 3 . . . 5 . 6 . | 6 . . 5 . . 3 . 1 . . . 3 . . . | 5 . . 3 . . 5 . 8 . . . 7 . 5 . | 7 . . 4 . . 2 . 4 . . . 5 - - -',
      chart:
        's...s...d.......|s...s...s.......|d.......d.......|s...s...s...s...|' +
        's...s...d.......|s...d.D.s.......|d.......d.......|s...s...s...d...',
    }),
    sec('puente', 4, 0.3, {
      chords: [6, 7, 3, 5], kick: K2, hat: H8, pad: true, arp: 'updown', fill: true, riser: true,
      lead: '8 - - - - - - - 6 - - - - - - - | 7 - - - - - - - 5 - - - 4 - - -',
      chart: 's...............|d...............|s.......s.......|d.......d.......',
    }),
    sec('final', 4, 1, {
      chords: [1, 6, 3, 7], kick: K4, clap: SN, hat: H16, open: OH, bass: 'r.o.r.o.r.o.r.o.', arp: 'up', crash: true,
      lead: '5 . . 3 . . 1 . 3 . . . 5 . 6 . | 6 . . 5 . . 3 . 1 . . . 3 . . . | 5 . . 3 . . 5 . 8 . . . 7 . 5 . | 7 . . 4 . . 2 . 4 . . . 5 - - -',
      chart: 's...s...d...s...|s...s.D.d.......|s...s...s...s...|d...d...s.......',
    }),
    sec('outro', 2, 0.2, { chords: [1], pad: true, kick: 'x...............', crash: true, lead: '8 - - - - - - - - - - - - - - -' }),
  ],
};

// ------------------------------------------------------------------ 2 · Hora Dorada
const horaDorada: Song = {
  id: 'hora-dorada',
  name: 'Hora Dorada',
  bpm: 108,
  root: 62,
  scale: 'dorian',
  lead: 'square',
  bass: 'square',
  sections: [
    sec('intro', 4, 0.2, {
      chords: [1, 4], kick: K2, hat: H8, pad: true, fill: true,
      chart: '................|................|s...............|p...............',
    }),
    sec('verso', 8, 0.5, {
      chords: [1, 4], kick: KB, snare: SN, hat: H16, bass: 'r..r..r.r..r..o.', arp: 'pulse', arpRate: 8, crash: true,
      chart:
        's.......b.......|........p.......|s.....s.........|b...............|' +
        's.D.....p.......|s.......p.......|b.......s.......|p.....s.........',
    }),
    sec('estribillo', 8, 0.9, {
      chords: [1, 4, 3, 7], kick: K4, clap: SN, hat: H16, open: OH, bass: 'r.o.r.o.r.o.r.o.', arp: 'up', crash: true, fill: true,
      lead: '1 . 3 . 5 . 3 . 6 . 5 . 3 . 2 . | 4 . 6 . 8 . 6 . 7 . 6 . 4 . 2 . | 3 . 5 . 7 . 5 . 6 - 5 . 3 . . . | 7 . 6 . 5 . 4 . 2 - - - 1 . . .',
      chart:
        's.....s.........|b.......p.......|s.....d.........|p.......s.......|' +
        's.....s.........|b.......p.D.....|s.....d.........|p.......b.......',
    }),
    sec('puente', 4, 0.3, {
      chords: [3, 7, 4, 4], kick: K2, hat: H8, pad: true, arp: 'updown', fill: true, riser: true,
      chart: 'b...............|p...............|s.......s.......|d.......d.......',
    }),
    sec('final', 6, 1, {
      chords: [1, 4, 3, 7], kick: K4, clap: SN, hat: H16, open: OH, bass: 'r.o.r.o.r.o.r.o.', arp: 'up', crash: true,
      lead: '1 . 3 . 5 . 3 . 6 . 5 . 3 . 2 . | 4 . 6 . 8 . 6 . 7 . 6 . 4 . 2 . | 3 . 5 . 7 . 5 . 6 - 5 . 3 . . . | 7 . 6 . 5 . 4 . 2 - - - 1 . . .',
      chart: 's.....s.........|b.......s.......|p.....p.........|s.D...d.........|b.......p.......|s.....s.....s...',
    }),
    sec('outro', 2, 0.2, { chords: [1], pad: true, kick: 'x...............', crash: true, lead: '8 - - - - - - - - - - - - - - -' }),
  ],
};

// ------------------------------------------------------------------ 3 · Marea Alta
const mareaAlta: Song = {
  id: 'marea-alta',
  name: 'Marea Alta',
  bpm: 116,
  root: 64,
  scale: 'minor',
  lead: 'triangle',
  bass: 'sawtooth',
  sections: [
    sec('intro', 4, 0.25, {
      chords: [1, 7, 6, 7], kick: K2, hat: H8, pad: true, arp: 'updown', fill: true,
      chart: '................|................|s...............|t...............',
    }),
    sec('verso', 8, 0.5, {
      chords: [1, 7, 6, 7], kick: KS, snare: SN, hat: H8F, bass: 'r.r..r.rr.r..r.o', arp: 'up', crash: true,
      chart:
        's.......t.......|P...............|s.......u.......|s.......d.......|' +
        'b...........n...|s.D.....P.......|t.......s.......|p.......d.......',
    }),
    sec('estribillo', 8, 0.9, {
      chords: [6, 3, 7, 1], kick: K4, clap: SN, hat: H16, open: OH, bass: 'r.o.r.o.f.o.r.o.', arp: 'up', crash: true, fill: true,
      lead: '3 . . 5 . . 6 . 5 . . 3 . . 1 . | 2 . . 5 . . 7 . 5 . . 2 . . 7- . | 2 . . 4 . . 6 . 5 . . 4 . . 2 . | 1 . . 3 . . 5 . 8 - - - - - - .',
      chart:
        's.....s.........|t.......P.......|u.......s.......|d.......b.......|' +
        's.....n.s.......|p.......t.D.....|s.....s.........|P.......d.......',
    }),
    sec('puente', 4, 0.35, {
      chords: [6, 7, 1, 1], kick: K2, hat: H8, pad: true, arp: 'updown', fill: true, riser: true,
      lead: '3 - - - - - - - 4 - - - 5 - - - | 1 - - - - - - - - - - - - - - -',
      chart: 'u...............|s.......s.......|d...........n...|t...............',
    }),
    sec('final', 6, 1, {
      chords: [6, 3, 7, 1], kick: K4, clap: SN, hat: H16, open: OH, bass: 'r.o.r.o.f.o.r.o.', arp: 'up', crash: true,
      lead: '3 . . 5 . . 6 . 5 . . 3 . . 1 . | 2 . . 5 . . 7 . 5 . . 2 . . 7- . | 2 . . 4 . . 6 . 5 . . 4 . . 2 . | 1 . . 3 . . 5 . 8 - - - - - - .',
      chart: 's.....s.........|u.......t.......|b.......n.......|s.D...P.........|d.......u.......|s.......s.....n.',
    }),
    sec('outro', 2, 0.2, { chords: [1], pad: true, kick: 'x...............', crash: true, lead: '8 - - - - - - - - - - - - - - -' }),
  ],
};

// ------------------------------------------------------------------ 4 · Bosque Binario
const bosqueBinario: Song = {
  id: 'bosque-binario',
  name: 'Bosque Binario',
  bpm: 122,
  root: 67,
  scale: 'dorian',
  lead: 'square',
  bass: 'sawtooth',
  sections: [
    sec('intro', 4, 0.25, {
      chords: [1, 4], kick: K2, hat: H8, pad: true, fill: true,
      chart: '................|................|s...............|j...............',
    }),
    sec('verso', 8, 0.55, {
      chords: [1, 4], kick: KB, snare: SN, hat: H16, bass: 'r..r..o.r..r..f.', arp: 'pulse', crash: true,
      chart:
        's.......j.......|s.......b.......|j.......d.......|p.......t.......|' +
        'j.D.....s.......|u.......s.......|j.......n.......|s.......P.......',
    }),
    sec('estribillo', 8, 0.9, {
      chords: [3, 4, 1, 7], kick: K4, clap: SN, hat: H16, open: OH, bass: 'r.o.r.o.r.o.f.o.', arp: 'up', crash: true, fill: true,
      lead: '5 . 3 . 5 . 6 . 8 . 6 . 5 . 3 . | 4 . 6 . 8 . 9 . 8 . 6 . 4 . . . | 5 . 3 . 1 . 3 . 5 . 6 . 5 - 3 . | 4 . 2 . 7- . 2 . 4 - - - . . . .',
      chart:
        's.....s.........|j.......s.......|b.......j.......|d.......t.......|' +
        'j.......j.......|s.....d.D.......|P.......j.......|s.......s.......',
    }),
    sec('puente', 4, 0.35, {
      chords: [3, 4, 7, 7], kick: K2, hat: H8, pad: true, arp: 'updown', fill: true, riser: true,
      chart: 'j...............|j...............|s.......s.......|t...............',
    }),
    sec('final', 6, 1, {
      chords: [3, 4, 1, 7], kick: K4, clap: SN, hat: H16, open: OH, bass: 'r.o.r.o.r.o.f.o.', arp: 'up', crash: true,
      lead: '5 . 3 . 5 . 6 . 8 . 6 . 5 . 3 . | 4 . 6 . 8 . 9 . 8 . 6 . 4 . . . | 5 . 3 . 1 . 3 . 5 . 6 . 5 - 3 . | 4 . 2 . 7- . 2 . 4 - - - . . . .',
      chart: 's.....s.........|j.......u.......|s.......b.......|j.D.....n.......|d.......P.......|j.......s.......',
    }),
    sec('outro', 2, 0.2, { chords: [1], pad: true, kick: 'x...............', crash: true, lead: '8 - - - - - - - - - - - - - - -' }),
  ],
};

// ------------------------------------------------------------------ 5 · Eclipse
const eclipse: Song = {
  id: 'eclipse',
  name: 'Eclipse',
  bpm: 128,
  root: 72,
  scale: 'harmonic',
  lead: 'sawtooth',
  bass: 'sawtooth',
  sections: [
    sec('intro', 4, 0.25, {
      chords: [1, 6, 4, 5], kick: K2, hat: H8, pad: true, fill: true,
      chart: '................|................|s...............|s.r.............',
    }),
    sec('verso', 8, 0.55, {
      chords: [1, 6, 4, 5], kick: K4, snare: SN, hat: H16, bass: '..r...r...r...r.', arp: 'up', crash: true,
      chart:
        's.r.....d.......|s.......s.r.....|b.......p.......|s.r.r...........|' +
        's.D.....s.r.....|t.......j.......|s.r.....P.......|u.......s.r..n..',
    }),
    sec('estribillo', 8, 0.95, {
      chords: [1, 6, 4, 5], kick: K4, clap: SN, hat: H16, open: OH, bass: 'r.o.r.o.r.o.r.o.', arp: 'up', crash: true, fill: true,
      lead: '8 . 7 . 8 . 5 . 3 . 5 . 6 . 5 . | 6 . 5 . 3 . 1 . 3 . 4 . 6 . 8 . | 4 . 6 . 8 . 6 . 4 . 3 . 4 . 6 . | 7 . 5 . 2 . 5 . 7 - - - 5 . . .',
      chart:
        's.r.r.r.........|d.......s.r.....|j.......t.......|s.r.r...........|' +
        'p.......s.r.....|d.D.....j.......|s.r.....s.r.....|P.......d.......',
    }),
    sec('puente', 4, 0.35, {
      chords: [6, 4, 5, 5], kick: K2, hat: H8, pad: true, arp: 'updown', fill: true, riser: true,
      lead: '8 - - - 7 - - - 6 - - - 5 - - - | 7 - - - - - - - - - - - - - - -',
      chart: 's.r.r.r.r.......|j...............|s.......s.......|t...............',
    }),
    sec('final', 6, 1, {
      chords: [1, 6, 4, 5], kick: K4, clap: SN, hat: H16, open: OH, bass: 'r.o.r.o.r.o.r.o.', arp: 'up', crash: true,
      lead: '8 . 7 . 8 . 5 . 3 . 5 . 6 . 5 . | 6 . 5 . 3 . 1 . 3 . 4 . 6 . 8 . | 4 . 6 . 8 . 6 . 4 . 3 . 4 . 6 . | 7 . 5 . 2 . 5 . 7 - - - 5 . . .',
      chart: 's.r.r...........|u.......s.r.....|n.......d.......|s.D.....s.r.....|j.......P.......|s.r.r.r.........',
    }),
    sec('outro', 2, 0.2, { chords: [1], pad: true, kick: 'x...............', crash: true, lead: '1 - - - - - - - - - - - - - - -' }),
  ],
};

// ------------------------------------------------------------------ 6 · Neón Salvaje
const neonSalvaje: Song = {
  id: 'neon-salvaje',
  name: 'Neón Salvaje',
  bpm: 136,
  root: 66,
  scale: 'minor',
  lead: 'sawtooth',
  bass: 'square',
  sections: [
    sec('intro', 4, 0.3, {
      chords: [1, 6, 7, 5], kick: K4, hat: H8, pad: true, fill: true,
      chart: '................|................|s.....s.........|j.r.............',
    }),
    sec('verso', 8, 0.6, {
      chords: [1, 6, 7, 5], kick: KS, snare: SN, hat: H16, bass: 'r.rr.r.rr.rr.r.o', arp: 'down', crash: true,
      chart:
        's.r.r.....s.....|d.......j.r.....|t.......s.r.....|p.....s.........|' +
        'u.......b.......|s.D.....s.r.r...|n.......j.r.....|P.......d.......',
    }),
    sec('estribillo', 8, 1, {
      chords: [1, 6, 7, 5], kick: K4, clap: SN, hat: H16, open: OH, bass: 'r.o.r.o.r.o.r.o.', arp: 'up', crash: true, fill: true,
      lead: '1 1 . 3 . 5 . 3 8 . 7 . 5 . 3 . | 6 6 . 8 . 10 . 8 6 . 5 . 3 . 1 . | 7 7 . 9 . 11 . 9 7 . 5 . 4 . 2 . | 5 5 . 7 . 9 . 7 5 - - - 7 - - -',
      chart:
        's.r.r.r.........|j.r.r.....s.....|t.......s.r.....|B.......p.......|' +
        's.r.r.r.r.......|j.D.....d.......|s.r.....P.......|b.......s.r.....',
    }),
    sec('puente', 4, 0.35, {
      chords: [6, 7, 1, 1], kick: K2, hat: H8, pad: true, arp: 'updown', fill: true, riser: true,
      chart: 'j.r.r.r.........|................|s.....s.........|t...............',
    }),
    sec('final', 8, 1, {
      chords: [1, 6, 7, 5], kick: K4, clap: SN, hat: H16, open: OH, bass: 'r.o.r.o.r.o.r.o.', arp: 'up', crash: true,
      lead: '1 1 . 3 . 5 . 3 8 . 7 . 5 . 3 . | 6 6 . 8 . 10 . 8 6 . 5 . 3 . 1 . | 7 7 . 9 . 11 . 9 7 . 5 . 4 . 2 . | 5 5 . 7 . 9 . 7 5 - - - 7 - - -',
      chart:
        's.r.r.r.........|u.......s.r.....|b.......t.......|n.......j.r.....|' +
        's.D.....s.r.....|p.......B.......|s.r.r.r.........|j.r.r.....d.....',
    }),
    sec('outro', 2, 0.2, { chords: [1], pad: true, kick: 'x...............', crash: true, lead: '8 - - - - - - - - - - - - - - -' }),
  ],
};

// ------------------------------------------------------------------ 7 · Tormenta Solar
const tormentaSolar: Song = {
  id: 'tormenta-solar',
  name: 'Tormenta Solar',
  bpm: 144,
  root: 71,
  scale: 'minor',
  lead: 'square',
  bass: 'sawtooth',
  sections: [
    sec('intro', 4, 0.3, {
      chords: [1, 7, 6, 7], kick: K4, hat: H8, pad: true, arp: 'up', fill: true,
      chart: '................|................|s.......s.r.....|j.r.r...........',
    }),
    sec('verso', 8, 0.65, {
      chords: [1, 7, 6, 7], kick: KS, snare: SN, hat: H16, bass: 'r.r.o.r.r.r.o.f.', arp: 'up', crash: true,
      chart:
        's.r.r.r.........|t.......s.r.....|j.r.r.....d.....|P.......u.......|' +
        's.r.....b.......|s.D.....n.......|j.r.r.r.........|B.......s.r.....',
    }),
    sec('estribillo', 8, 1, {
      chords: [1, 6, 3, 7], kick: K4, clap: SN, hat: H16, open: OH, bass: 'r.o.r.o.r.o.r.o.', arp: 'up', crash: true, fill: true,
      lead: '5 . 8 . 7 . 5 . 3 . 5 . 6 . 5 . | 6 . 8 . 10 . 8 . 6 . 5 . 3 . . . | 5 . 7 . 10 . 9 . 7 . 5 . 3 . 5 . | 7 . 9 . 11 . 9 . 7 - - - 5 . . .',
      chart:
        's.r.r.r.r.......|j.r.r.....s.....|t.......s.r.....|p.......B.......|' +
        'u.......s.r.....|s.......n.......|j.D.r.....t.....|s.r.r.r.........',
    }),
    sec('puente', 4, 0.4, {
      chords: [6, 7, 1, 1], kick: K2, hat: H8, pad: true, arp: 'updown', fill: true, riser: true,
      chart: 'j.r.r.r.r.......|................|s.......s.......|t.......P.......',
    }),
    sec('final', 8, 1, {
      chords: [1, 6, 3, 7], kick: K4, clap: SN, hat: H16, open: OH, bass: 'r.o.r.o.r.o.r.o.', arp: 'up', crash: true,
      lead: '5 . 8 . 7 . 5 . 3 . 5 . 6 . 5 . | 6 . 8 . 10 . 8 . 6 . 5 . 3 . . . | 5 . 7 . 10 . 9 . 7 . 5 . 3 . 5 . | 7 . 9 . 11 . 9 . 7 - - - 5 . . .',
      chart:
        's.r.r.r.........|u.......t.......|s.r.....b.......|n.......j.r.....|' +
        's.D.r.r.........|P.......d.......|j.r.r.r.r.......|s.......t.......',
    }),
    sec('outro', 2, 0.2, { chords: [1], pad: true, kick: 'x...............', crash: true, lead: '8 - - - - - - - - - - - - - - -' }),
  ],
};

// ------------------------------------------------------------------ 8 · Último Beat
const ultimoBeat: Song = {
  id: 'ultimo-beat',
  name: 'Último Beat',
  bpm: 152,
  root: 69,
  scale: 'phrygian',
  lead: 'sawtooth',
  bass: 'sawtooth',
  sections: [
    sec('intro', 4, 0.35, {
      chords: [1, 2, 1, 7], kick: K4, hat: H16, pad: true, fill: true, riser: true,
      chart: '................|................|s.r.r...........|j.r.r.r.........',
    }),
    sec('verso', 8, 0.7, {
      chords: [1, 2, 1, 7], kick: KS, snare: SN, hat: H16, open: OH, bass: 'rrorrorrorrorror', arp: 'down', crash: true,
      chart:
        's.r.r.r.........|t.......s.r.....|P.......j.r.....|u.......B.......|' +
        's.r.r...n.......|s.D.r.r.r.......|j.r.......t.....|p.......s.r.....',
    }),
    sec('estribillo', 8, 1, {
      chords: [1, 2, 1, 7], kick: K4, clap: SN, hat: H16, open: OH, bass: 'r.o.r.o.r.o.r.o.', arp: 'up', crash: true, fill: true,
      lead: '1 . 2 . 1 . 5 . 6 . 5 . 2 . 1 . | 2 . 3 . 2 . 6 . 7 . 6 . 3 . 2 . | 1 . 2 . 1 . 5 . 8 . 7 . 6 . 5 . | 7 . 6 . 5 . 2 . 1 - - - - - - .',
      chart:
        's.r.r.r.r.......|j.r.r.r.........|t.......s.r.....|B.......P.......|' +
        'u.......s.r.....|t.......n.......|j.D.r.r.r.......|s.r.r.r.........',
    }),
    sec('puente', 4, 0.45, {
      chords: [2, 1, 7, 7], kick: SNH, hat: H8, pad: true, arp: 'updown', fill: true, riser: true,
      chart: 'j.r.r.r.r.......|s.......s.......|t.......P.......|s.r.r.r.r.......',
    }),
    sec('final', 8, 1, {
      chords: [1, 2, 1, 7], kick: K4, clap: SN, hat: H16, open: OH, bass: 'r.o.r.o.r.o.r.o.', arp: 'up', crash: true,
      lead: '1 . 2 . 1 . 5 . 6 . 5 . 2 . 1 . | 2 . 3 . 2 . 6 . 7 . 6 . 3 . 2 . | 1 . 2 . 1 . 5 . 8 . 7 . 6 . 5 . | 7 . 6 . 5 . 2 . 1 - - - - - - .',
      chart:
        's.r.r.r.r.......|u.......t.......|s.r.....B.......|n.......j.r.r...|' +
        '....s.D.r.......|P.......t.......|j.r.r.r.r.......|s.r.r.r.r.......',
    }),
    sec('outro', 2, 0.2, { chords: [1], pad: true, kick: 'x...............', crash: true, lead: '1 - - - - - - - - - - - - - - -' }),
  ],
};

export const LEVELS: readonly LevelDef[] = [
  { id: 'primer-pulso', name: 'Primer Pulso', blurb: 'Saltá con el bombo.', song: primerPulso, speed: 9, theme: 0, tier: 1, guides: true },
  { id: 'hora-dorada', name: 'Hora Dorada', blurb: 'Bloques y huecos al compás.', song: horaDorada, speed: 9.25, theme: 1, tier: 1, guides: true },
  { id: 'marea-alta', name: 'Marea Alta', blurb: 'Pisos que suben y pinchos triples.', song: mareaAlta, speed: 9.5, theme: 2, tier: 2 },
  { id: 'bosque-binario', name: 'Bosque Binario', blurb: 'Plataformas de impulso.', song: bosqueBinario, speed: 9.75, theme: 3, tier: 2 },
  { id: 'eclipse', name: 'Eclipse', blurb: 'Anillos: saltá en el aire.', song: eclipse, speed: 10, theme: 4, tier: 3 },
  { id: 'neon-salvaje', name: 'Neón Salvaje', blurb: 'Todo junto y más rápido.', song: neonSalvaje, speed: 10.5, theme: 0, tier: 4 },
  { id: 'tormenta-solar', name: 'Tormenta Solar', blurb: 'Cadenas de anillos a 144 BPM.', song: tormentaSolar, speed: 11, theme: 1, tier: 4 },
  { id: 'ultimo-beat', name: 'Último Beat', blurb: 'Solo para los que no fallan.', song: ultimoBeat, speed: 11.5, theme: 4, tier: 5 },
];

export const TIER_NAMES = ['', 'Fácil', 'Normal', 'Difícil', 'Muy difícil', 'Extremo'];
