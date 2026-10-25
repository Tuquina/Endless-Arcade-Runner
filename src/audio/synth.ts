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

export interface VoiceOpts {
  type: OscillatorType;
  freq: number;
  start: number;
  dur: number;
  gain: number;
  attack?: number;
  /** 'pluck' decays over the whole note; 'hold' sustains and releases over the last `release` seconds. */
  shape?: 'pluck' | 'hold';
  release?: number;
  /** Optional low-pass filter (Hz), swept to `cutoffEnd` over the note. */
  cutoff?: number;
  cutoffEnd?: number;
  q?: number;
  /** Adds a second oscillator detuned by this many cents (fat leads and pads). */
  detune?: number;
  /** Extra destination (e.g. an echo send) fed at this level. */
  send?: AudioNode;
  sendGain?: number;
}

/** Richer instrument voice for the rhythm songs: optional filter, detuned pair, pluck or sustain envelope. */
export function voice(ctx: BaseAudioContext, out: AudioNode, o: VoiceOpts): void {
  const end = o.start + o.dur;
  const g = ctx.createGain();
  const attack = o.attack ?? 0.004;
  g.gain.setValueAtTime(0.0001, o.start);
  g.gain.linearRampToValueAtTime(o.gain, o.start + attack);
  if (o.shape === 'hold') {
    const rel = Math.min(o.release ?? 0.08, o.dur * 0.5);
    g.gain.setValueAtTime(o.gain, Math.max(o.start + attack, end - rel));
  }
  g.gain.exponentialRampToValueAtTime(0.0001, end);
  let input: AudioNode = g;
  if (o.cutoff) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = o.q ?? 1;
    f.frequency.setValueAtTime(o.cutoff, o.start);
    if (o.cutoffEnd) f.frequency.exponentialRampToValueAtTime(o.cutoffEnd, end);
    f.connect(g);
    input = f;
  }
  g.connect(out);
  if (o.send) {
    const s = ctx.createGain();
    s.gain.value = o.sendGain ?? 0.3;
    g.connect(s);
    s.connect(o.send);
  }
  const n = o.detune ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const osc = ctx.createOscillator();
    osc.type = o.type;
    osc.frequency.setValueAtTime(o.freq, o.start);
    if (o.detune) osc.detune.value = i === 0 ? -o.detune : o.detune;
    osc.connect(input);
    osc.start(o.start);
    osc.stop(end + 0.02);
  }
}
