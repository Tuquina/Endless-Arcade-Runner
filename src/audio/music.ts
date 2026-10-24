import { midiToFreq, noise, tone } from './synth';
import type { SfxEnv } from './sfx';

/** 16th-note steps per bar and bars per loop. */
export const STEPS_PER_BAR = 16;
export const BARS = 4;
export const LOOP_STEPS = STEPS_PER_BAR * BARS;

export const BPM_MIN = 118;
export const BPM_MAX = 152;

/** Seconds per 16th note for a given difficulty (0..1): the song speeds up as the run does. */
export function stepDuration(difficulty: number): number {
  const d = Math.max(0, Math.min(1, difficulty));
  const bpm = BPM_MIN + (BPM_MAX - BPM_MIN) * d;
  return 60 / bpm / 4;
}

// A minor, i – VI – III – VII.
const BASS_ROOT = [45, 41, 48, 43];
const CHORDS = [
  [57, 60, 64],
  [53, 57, 60],
  [60, 64, 67],
  [55, 59, 62],
];
const BASS_PATTERN = [0, 0, 12, 0, 0, 7, 12, 0];
const ARP_ORDER = [0, 1, 2, 1];
/** 0 = rest. Pentatonic hooks, one bar per chord. */
const LEAD: readonly (readonly number[])[] = [
  [76, 0, 0, 72, 0, 0, 69, 0, 72, 0, 0, 0, 76, 0, 0, 0],
  [77, 0, 0, 72, 0, 0, 69, 0, 72, 0, 0, 0, 69, 0, 0, 0],
  [76, 0, 0, 72, 0, 0, 67, 0, 72, 0, 0, 0, 76, 0, 79, 0],
  [74, 0, 0, 71, 0, 0, 67, 0, 71, 0, 74, 0, 79, 0, 0, 0],
];

/**
 * Schedule everything that sounds on one 16th-note step of the loop.
 * `intensity` (difficulty 0..1) adds hi-hat 16ths and a louder lead as the run heats up.
 */
export function scheduleStep(e: SfxEnv, step: number, t: number, stepDur: number, intensity: number): void {
  const s = step % STEPS_PER_BAR;
  const bar = Math.floor(step / STEPS_PER_BAR) % BARS;
  const { ctx, out } = e;

  // Drums.
  if (s % 4 === 0) {
    tone(ctx, out, { type: 'sine', freq: 160, freqEnd: 42, start: t, dur: 0.16, gain: 0.5 });
  }
  if (s === 4 || s === 12) {
    noise(ctx, out, e.noise, { start: t, dur: 0.12, gain: 0.2, filter: 'bandpass', freq: 1800 });
  }
  if (s % 4 === 2 || (intensity > 0.5 && s % 2 === 1)) {
    noise(ctx, out, e.noise, { start: t, dur: 0.04, gain: s % 4 === 2 ? 0.09 : 0.045, filter: 'highpass', freq: 7000 });
  }

  // Bass on every 8th note.
  if (s % 2 === 0) {
    const note = BASS_ROOT[bar]! + BASS_PATTERN[(s / 2) % BASS_PATTERN.length]!;
    tone(ctx, out, { type: 'square', freq: midiToFreq(note), start: t, dur: stepDur * 1.8, gain: 0.17 });
  }

  // Arpeggio on every 16th, an octave up in the second half of each bar.
  const chord = CHORDS[bar]!;
  const arp = chord[ARP_ORDER[s % 4]!]! + (s >= 8 ? 12 : 0);
  tone(ctx, out, { type: 'square', freq: midiToFreq(arp), start: t, dur: stepDur * 0.9, gain: 0.045 });

  // Lead hook.
  const lead = LEAD[bar]![s]!;
  if (lead) {
    tone(ctx, out, { type: 'triangle', freq: midiToFreq(lead), start: t, dur: stepDur * 3, gain: 0.1 + 0.08 * intensity, attack: 0.01 });
  }
}
