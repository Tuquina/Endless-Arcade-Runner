import { midiToFreq, noise, tone, voice } from './synth';
import type { SfxEnv } from './sfx';

/**
 * Original songs for the rhythm mode, written as data and synthesized live (no audio files, no
 * third-party music). A song is a list of sections; every pattern lives on the same 16th-note grid
 * as the level's obstacle chart, so the music and the jumps are authored side by side.
 *
 * Pattern strings are cycled to fill the section, so a one-bar groove can drive an eight-bar verse.
 * Spaces and `|` are ignored and only there for readability.
 */

export const STEPS_PER_BAR = 16;

export type ScaleName = 'minor' | 'major' | 'dorian' | 'phrygian' | 'harmonic' | 'mixolydian';

const SCALES: Record<ScaleName, readonly number[]> = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
};

export interface Section {
  name: string;
  bars: number;
  /** Chord per bar as a scale degree (1 = tonic), cycled. A triad is built on it. */
  chords: readonly number[];
  /** Drum lanes: `x` hit, `X` accent, `g` ghost, `.` rest. */
  kick?: string;
  snare?: string;
  clap?: string;
  hat?: string;
  open?: string;
  /** Bass: `r` root, `R` accented root, `o` octave, `f` fifth, `t` third, `-` tie, `.` rest. */
  bass?: string;
  /** Arpeggio over the chord, every 8th or 16th note. */
  arp?: 'up' | 'down' | 'updown' | 'pulse';
  arpRate?: 8 | 16;
  /** Sustained chord pad. */
  pad?: boolean;
  /** Lead melody: one token per 16th, a scale degree with optional `#`/`b` and `+`/`-` octave marks, `-` tie, `.` rest. */
  lead?: string;
  /** Obstacle chart (see rhythm/level.ts), cycled like the patterns. */
  chart?: string;
  /** 0..1, drives the visual pulse. */
  energy: number;
  /** Snare roll over the last bar, white-noise riser into the next section, crash on the first beat. */
  fill?: boolean;
  riser?: boolean;
  crash?: boolean;
}

export interface Song {
  id: string;
  name: string;
  bpm: number;
  /** MIDI note of the tonic used for the lead (bass plays two octaves lower). */
  root: number;
  scale: ScaleName;
  lead: OscillatorType;
  bass: OscillatorType;
  sections: readonly Section[];
}

/** Per-step lookups prepared once per song. */
export interface CompiledSong {
  song: Song;
  stepDur: number;
  totalSteps: number;
  /** First step of each section, plus a final entry = totalSteps. */
  sectionStart: number[];
  lanes: {
    kick: Lane;
    snare: Lane;
    clap: Lane;
    hat: Lane;
    open: Lane;
  }[];
  bass: Note[][];
  lead: Note[][];
}

/** 0 = silent, 1 = ghost, 2 = normal, 3 = accent; one entry per step of the section. */
type Lane = Uint8Array;
/** A note starting on a step: MIDI pitch and length in steps (0 = no note on this step). */
interface Note {
  midi: number;
  len: number;
}

const clean = (s: string | undefined): string => (s ?? '').replace(/[\s|]/g, '');

function lane(pattern: string | undefined, steps: number): Lane {
  const p = clean(pattern);
  const out = new Uint8Array(steps);
  if (!p) return out;
  for (let i = 0; i < steps; i++) {
    const c = p[i % p.length];
    out[i] = c === 'X' ? 3 : c === 'x' ? 2 : c === 'g' ? 1 : 0;
  }
  return out;
}

/** MIDI pitch of scale degree `d` (1-based, may run past 7 or below 1) above `root`. */
export function degreeToMidi(root: number, scale: ScaleName, d: number): number {
  const s = SCALES[scale];
  const i = d - 1;
  const oct = Math.floor(i / 7);
  return root + s[((i % 7) + 7) % 7]! + 12 * oct;
}

function chordAt(sec: Section, step: number): number {
  return sec.chords[Math.floor(step / STEPS_PER_BAR) % sec.chords.length]!;
}

function bassLine(song: Song, sec: Section, steps: number): Note[] {
  const p = clean(sec.bass);
  const out: Note[] = Array.from({ length: steps }, () => ({ midi: 0, len: 0 }));
  if (!p) return out;
  const base = song.root - 24;
  let last = -1;
  for (let i = 0; i < steps; i++) {
    const c = p[i % p.length]!;
    if (c === '-') {
      if (last >= 0) out[last]!.len++;
      continue;
    }
    last = -1;
    if (c === '.') continue;
    const ch = chordAt(sec, i);
    const off = c === 'f' ? 4 : c === 't' ? 2 : 0;
    let midi = degreeToMidi(base, song.scale, ch + off);
    if (c === 'o') midi += 12;
    out[i] = { midi, len: 1 };
    last = i;
  }
  return out;
}

function leadLine(song: Song, sec: Section, steps: number): Note[] {
  const tokens = (sec.lead ?? '').replace(/\|/g, ' ').split(/\s+/).filter(Boolean);
  const out: Note[] = Array.from({ length: steps }, () => ({ midi: 0, len: 0 }));
  if (tokens.length === 0) return out;
  let last = -1;
  for (let i = 0; i < steps; i++) {
    const t = tokens[i % tokens.length]!;
    if (t === '-') {
      if (last >= 0) out[last]!.len++;
      continue;
    }
    last = -1;
    if (t === '.') continue;
    const m = /^(-?\d+)([#b]?)([+-]*)$/.exec(t);
    if (!m) throw new Error(`${song.id}/${sec.name}: bad lead token "${t}"`);
    let midi = degreeToMidi(song.root, song.scale, Number(m[1])) + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    for (const c of m[3]!) midi += c === '+' ? 12 : -12;
    out[i] = { midi, len: 1 };
    last = i;
  }
  return out;
}

export function compileSong(song: Song): CompiledSong {
  const sectionStart: number[] = [];
  let total = 0;
  for (const s of song.sections) {
    sectionStart.push(total);
    total += s.bars * STEPS_PER_BAR;
  }
  sectionStart.push(total);
  return {
    song,
    stepDur: 60 / song.bpm / 4,
    totalSteps: total,
    sectionStart,
    lanes: song.sections.map((s) => {
      const n = s.bars * STEPS_PER_BAR;
      return { kick: lane(s.kick, n), snare: lane(s.snare, n), clap: lane(s.clap, n), hat: lane(s.hat, n), open: lane(s.open, n) };
    }),
    bass: song.sections.map((s) => bassLine(song, s, s.bars * STEPS_PER_BAR)),
    lead: song.sections.map((s) => leadLine(song, s, s.bars * STEPS_PER_BAR)),
  };
}

/** Section index containing a global step. */
export function sectionAt(c: CompiledSong, step: number): number {
  let i = 0;
  while (i < c.song.sections.length - 1 && c.sectionStart[i + 1]! <= step) i++;
  return i;
}

const VOL = [0, 0.35, 0.75, 1];

/** Everything the song needs from the audio system: outputs for the dry mix and the echo send. */
export interface SongEnv extends SfxEnv {
  echo: AudioNode;
}

/** Schedule every sound that starts on global step `step` at audio time `t`. */
export function scheduleSongStep(e: SongEnv, c: CompiledSong, step: number, t: number): void {
  if (step < 0 || step >= c.totalSteps) return;
  const si = sectionAt(c, step);
  const sec = c.song.sections[si]!;
  const local = step - c.sectionStart[si]!;
  const secSteps = sec.bars * STEPS_PER_BAR;
  const s16 = local % STEPS_PER_BAR;
  const dur = c.stepDur;
  const { ctx, out } = e;
  const L = c.lanes[si]!;
  const song = c.song;

  // ---- drums
  const k = L.kick[local]!;
  if (k) {
    tone(ctx, out, { type: 'sine', freq: 170, freqEnd: 44, start: t, dur: 0.2, gain: 0.62 * VOL[k]! });
    noise(ctx, out, e.noise, { start: t, dur: 0.012, gain: 0.12 * VOL[k]!, filter: 'highpass', freq: 3000 });
  }
  const lastBar = local >= secSteps - STEPS_PER_BAR;
  let sn = L.snare[local]!;
  if (sec.fill && lastBar && s16 >= 8) sn = Math.max(sn, s16 >= 12 ? 2 : 1);
  if (sn) {
    noise(ctx, out, e.noise, { start: t, dur: 0.15, gain: 0.26 * VOL[sn]!, filter: 'bandpass', freq: 1900 });
    tone(ctx, out, { type: 'triangle', freq: 220, freqEnd: 140, start: t, dur: 0.08, gain: 0.2 * VOL[sn]! });
  }
  const cl = L.clap[local]!;
  if (cl) {
    for (let i = 0; i < 3; i++) {
      noise(ctx, out, e.noise, { start: t + i * 0.011, dur: i === 2 ? 0.14 : 0.02, gain: 0.2 * VOL[cl]!, filter: 'bandpass', freq: 1300 });
    }
  }
  const hh = L.hat[local]!;
  if (hh) noise(ctx, out, e.noise, { start: t, dur: 0.035, gain: 0.08 * VOL[hh]!, filter: 'highpass', freq: 8000 });
  const oh = L.open[local]!;
  if (oh) noise(ctx, out, e.noise, { start: t, dur: 0.22, gain: 0.07 * VOL[oh]!, filter: 'highpass', freq: 6500 });
  if (sec.crash && local === 0) noise(ctx, out, e.noise, { start: t, dur: 1.4, gain: 0.12, filter: 'highpass', freq: 5000 });
  if (sec.riser && local === secSteps - STEPS_PER_BAR) {
    noise(ctx, out, e.noise, { start: t, dur: dur * STEPS_PER_BAR, gain: 0.07, filter: 'bandpass', freq: 400, freqEnd: 7000 });
  }

  // ---- harmony
  const ch = chordAt(sec, local);
  const bar0 = s16 === 0;
  if (sec.pad && bar0) {
    for (let i = 0; i < 3; i++) {
      voice(ctx, out, {
        type: 'sawtooth', freq: midiToFreq(degreeToMidi(song.root - 12, song.scale, ch + i * 2)), start: t, dur: dur * STEPS_PER_BAR,
        gain: 0.035, attack: 0.25, shape: 'hold', release: 0.3, cutoff: 1400, detune: 9,
      });
    }
  }
  if (sec.arp) {
    const rate = sec.arpRate ?? 16;
    if (rate === 16 || s16 % 2 === 0) {
      const i = rate === 16 ? s16 : s16 / 2;
      const order = sec.arp === 'up' ? [0, 1, 2, 3] : sec.arp === 'down' ? [3, 2, 1, 0] : sec.arp === 'updown' ? [0, 1, 2, 3, 2, 1] : [0, 2, 0, 3];
      const tone4 = order[i % order.length]!;
      const deg = ch + (tone4 === 3 ? 7 : tone4 * 2);
      voice(ctx, out, {
        type: 'square', freq: midiToFreq(degreeToMidi(song.root, song.scale, deg)), start: t, dur: dur * (rate === 16 ? 1 : 2) * 0.9,
        gain: 0.04, cutoff: 3200, cutoffEnd: 900, send: e.echo, sendGain: 0.35,
      });
    }
  }
  const b = c.bass[si]![local]!;
  if (b.len) {
    voice(ctx, out, {
      // A sine bass (808) carries much more low end than a filtered saw: keep it level with the others.
      type: song.bass, freq: midiToFreq(b.midi), start: t, dur: dur * b.len * 0.95, gain: song.bass === 'sine' ? 0.13 : 0.2,
      shape: b.len > 1 ? 'hold' : 'pluck', cutoff: 900, cutoffEnd: 260, q: 3,
    });
  }
  const n = c.lead[si]![local]!;
  if (n.len) {
    voice(ctx, out, {
      type: song.lead, freq: midiToFreq(n.midi), start: t, dur: dur * n.len * 0.92, gain: 0.075,
      shape: 'hold', release: 0.06, detune: song.lead === 'sawtooth' ? 7 : 4, cutoff: 4200, send: e.echo, sendGain: 0.4,
    });
  }
}
