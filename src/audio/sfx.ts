import { midiToFreq, noise, tone } from './synth';

export type SfxName = 'jump' | 'land' | 'coin' | 'disco' | 'death' | 'record' | 'click';

/** Everything an effect needs to make sound. */
export interface SfxEnv {
  ctx: BaseAudioContext;
  out: AudioNode;
  noise: AudioBuffer;
}

/**
 * Procedural effects (no sample files). Each takes the start time and an optional
 * `amount` (0..1 intensity, or semitones for coins) and returns its length in seconds.
 */
export const SFX: Record<SfxName, (e: SfxEnv, t: number, amount: number) => number> = {
  jump(e, t) {
    tone(e.ctx, e.out, { type: 'square', freq: 250, freqEnd: 640, start: t, dur: 0.15, gain: 0.2 });
    tone(e.ctx, e.out, { type: 'triangle', freq: 125, freqEnd: 320, start: t, dur: 0.15, gain: 0.25 });
    return 0.17;
  },

  land(e, t, amount) {
    const a = Math.max(0.15, Math.min(1, amount));
    noise(e.ctx, e.out, e.noise, { start: t, dur: 0.07 + 0.05 * a, gain: 0.3 * a, filter: 'lowpass', freq: 900, freqEnd: 200 });
    tone(e.ctx, e.out, { type: 'sine', freq: 130, freqEnd: 55, start: t, dur: 0.1, gain: 0.35 * a });
    return 0.14;
  },

  /** `amount` = semitones above the base pitch, so a streak of coins climbs the scale. */
  coin(e, t, amount) {
    const k = 2 ** (Math.round(amount) / 12);
    tone(e.ctx, e.out, { type: 'square', freq: 988 * k, start: t, dur: 0.07, gain: 0.22 });
    tone(e.ctx, e.out, { type: 'square', freq: 1319 * k, start: t + 0.065, dur: 0.2, gain: 0.22 });
    return 0.3;
  },

  /**
   * Disco pickup in the music modes: a soft, short bell (pure sines, quiet, fixed pitch) that sits under
   * the song instead of cutting through it like the square-wave coin of the endless runner.
   */
  disco(e, t) {
    tone(e.ctx, e.out, { type: 'sine', freq: 1568, start: t, dur: 0.22, gain: 0.07, attack: 0.006 });
    tone(e.ctx, e.out, { type: 'sine', freq: 3136, start: t, dur: 0.12, gain: 0.02, attack: 0.006 });
    return 0.25;
  },

  death(e, t) {
    noise(e.ctx, e.out, e.noise, { start: t, dur: 0.5, gain: 0.3, filter: 'lowpass', freq: 3200, freqEnd: 120 });
    tone(e.ctx, e.out, { type: 'sawtooth', freq: 440, freqEnd: 45, start: t, dur: 0.5, gain: 0.2 });
    tone(e.ctx, e.out, { type: 'sine', freq: 110, freqEnd: 30, start: t, dur: 0.35, gain: 0.38 });
    return 0.55;
  },

  /** Bright rising arpeggio with a sparkle on top. */
  record(e, t) {
    const notes = [72, 76, 79, 84, 88];
    notes.forEach((m, i) => {
      tone(e.ctx, e.out, { type: 'square', freq: midiToFreq(m), start: t + i * 0.085, dur: 0.16, gain: 0.14 });
      tone(e.ctx, e.out, { type: 'triangle', freq: midiToFreq(m + 12), start: t + i * 0.085, dur: 0.2, gain: 0.1 });
    });
    noise(e.ctx, e.out, e.noise, { start: t + 0.34, dur: 0.5, gain: 0.08, filter: 'highpass', freq: 6000 });
    return 0.9;
  },

  click(e, t) {
    tone(e.ctx, e.out, { type: 'triangle', freq: 520, freqEnd: 760, start: t, dur: 0.06, gain: 0.22 });
    return 0.08;
  },
};
