/** Small WebAudio helpers shared by effects and music. Pure functions of (context, output, time). */

export const midiToFreq = (m: number): number => 440 * 2 ** ((m - 69) / 12);

/** One second of white noise, reused by every percussive sound. */
export function makeNoise(ctx: BaseAudioContext): AudioBuffer {
  const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

export interface ToneOpts {
  type?: OscillatorType;
  /** Start frequency (Hz). */
  freq: number;
  /** If set, glides (exponentially) to this frequency over the note. */
  freqEnd?: number;
  start: number;
  dur: number;
  gain: number;
  /** Seconds of fade-in (default 3 ms, avoids clicks). */
  attack?: number;
}

/** Oscillator with a click-free attack and an exponential decay to silence at the end of `dur`. */
export function tone(ctx: BaseAudioContext, out: AudioNode, o: ToneOpts): void {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = o.type ?? 'square';
  osc.frequency.setValueAtTime(o.freq, o.start);
  if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(o.freqEnd, o.start + o.dur);
  const attack = o.attack ?? 0.003;
  g.gain.setValueAtTime(0.0001, o.start);
  g.gain.linearRampToValueAtTime(o.gain, o.start + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, o.start + o.dur);
  osc.connect(g);
  g.connect(out);
  osc.start(o.start);
  osc.stop(o.start + o.dur + 0.02);
}

export interface NoiseOpts {
  start: number;
  dur: number;
  gain: number;
  filter: BiquadFilterType;
  freq: number;
  /** Optional sweep of the filter cutoff over the burst. */
  freqEnd?: number;
}

/** Filtered noise burst (hats, snares, landing thumps, explosions). */
export function noise(ctx: BaseAudioContext, out: AudioNode, buffer: AudioBuffer, o: NoiseOpts): void {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const f = ctx.createBiquadFilter();
  f.type = o.filter;
  f.frequency.setValueAtTime(o.freq, o.start);
  if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(o.freqEnd, o.start + o.dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(o.gain, o.start);
  g.gain.exponentialRampToValueAtTime(0.0001, o.start + o.dur);
  src.connect(f);
  f.connect(g);
  g.connect(out);
  src.start(o.start, Math.random() * 0.5);
  src.stop(o.start + o.dur + 0.02);
}
