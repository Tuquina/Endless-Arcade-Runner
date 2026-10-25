import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioSystem, type AudioSettings } from './AudioSystem';
import { LOOP_STEPS, BPM_MAX, BPM_MIN, stepDuration } from './music';
import { midiToFreq } from './synth';

/** Minimal stand-in for the WebAudio API that records what gets created. */
class FakeParam {
  value = 0;
  setValueAtTime = vi.fn();
  linearRampToValueAtTime = vi.fn();
  exponentialRampToValueAtTime = vi.fn();
  setTargetAtTime = vi.fn();
}
class FakeNode {
  gain = new FakeParam();
  frequency = new FakeParam();
  type = '';
  buffer: unknown = null;
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}
class FakeContext {
  currentTime = 0;
  sampleRate = 8000;
  state: 'suspended' | 'running' = 'suspended';
  destination = new FakeNode();
  oscillators = 0;
  sources = 0;
  resume = vi.fn(async () => { this.state = 'running'; });
  suspend = vi.fn(async () => { this.state = 'suspended'; });
  close = vi.fn(async () => undefined);
  createGain = () => new FakeNode();
  createOscillator = () => { this.oscillators++; return new FakeNode(); };
  createBufferSource = () => { this.sources++; return new FakeNode(); };
  createBiquadFilter = () => new FakeNode();
  createBuffer = (_c: number, len: number) => ({ getChannelData: () => new Float32Array(len) });
}

function setup(settings: AudioSettings = { music: true, sfx: true }) {
  const target = new EventTarget();
  const created: FakeContext[] = [];
  const audio = new AudioSystem(
    () => settings,
    () => { const c = new FakeContext(); created.push(c); return c as unknown as AudioContext; },
    target,
  );
  const gesture = async (): Promise<void> => {
    target.dispatchEvent(new Event('pointerdown'));
    await Promise.resolve();
    await Promise.resolve();
  };
  return { audio, target, created, settings, gesture };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('AudioSystem and autoplay policy', () => {
  it('creates nothing and stays silent until the first user gesture', () => {
    const { audio, created } = setup();
    audio.sfx('jump');
    audio.setMusicMode('on');
    expect(created).toHaveLength(0);
    expect(audio.running).toBe(false);
  });

  it('creates and resumes the context inside the first gesture, then plays', async () => {
    const { audio, created, gesture } = setup();
    await gesture();
    expect(created).toHaveLength(1);
    expect(created[0]!.resume).toHaveBeenCalled();
    expect(audio.running).toBe(true);
    const before = created[0]!.oscillators;
    audio.sfx('jump');
    expect(created[0]!.oscillators).toBeGreaterThan(before);
  });

  it('stops listening for gestures once unlocked (no second context)', async () => {
    const { created, gesture } = setup();
    await gesture();
    await gesture();
    expect(created).toHaveLength(1);
  });

  it('effects switch is independent from music', async () => {
    const { audio, created, gesture, settings } = setup({ music: true, sfx: false });
    await gesture();
    const n = created[0]!.oscillators;
    audio.sfx('coin');
    audio.sfx('death');
    expect(created[0]!.oscillators).toBe(n);
    settings.sfx = true;
    audio.sfx('coin');
    expect(created[0]!.oscillators).toBeGreaterThan(n);
  });

  it('discos in the music modes follow their own setting (soft by default, quieter than coins)', async () => {
    const { audio, created, gesture, settings } = setup();
    await gesture();
    const c = created[0]!;
    const count = (f: () => void): number => {
      const n = c.oscillators;
      f();
      return c.oscillators - n;
    };
    const coin = count(() => audio.coin());
    vi.advanceTimersByTime(1000);
    expect(count(() => audio.disco())).toBeGreaterThan(0); // missing setting = soft bell
    settings.musicSfx = 'off';
    expect(count(() => audio.disco())).toBe(0);
    settings.musicSfx = 'full';
    vi.advanceTimersByTime(1000);
    expect(count(() => audio.disco())).toBe(coin);
    settings.musicSfx = 'soft';
    settings.sfx = false; // the master effects switch still wins
    expect(count(() => audio.disco())).toBe(0);
  });

  it('music only schedules notes while enabled and on, and stops when switched off', async () => {
    const { audio, created, gesture, settings } = setup();
    audio.setMusicMode('on');
    await gesture();
    const ctx = created[0]!;
    ctx.currentTime = 0.1;
    vi.advanceTimersByTime(100);
    const playing = ctx.oscillators;
    expect(playing).toBeGreaterThan(0);

    settings.music = false;
    audio.refresh();
    vi.advanceTimersByTime(100);
    const after = ctx.oscillators;
    ctx.currentTime = 5;
    vi.advanceTimersByTime(500);
    expect(ctx.oscillators).toBe(after); // nothing more scheduled
  });

  it('caps simultaneous effect voices so spam cannot overload the mixer', async () => {
    const { audio, created, gesture } = setup();
    await gesture();
    const base = created[0]!.oscillators;
    for (let i = 0; i < 100; i++) audio.sfx('click');
    const used = created[0]!.oscillators - base;
    expect(used).toBeLessThanOrEqual(14 * 1); // click = 1 oscillator per voice
    vi.advanceTimersByTime(200);
    audio.sfx('click');
    expect(created[0]!.oscillators - base).toBeGreaterThan(used);
  });

  it('coin pitch climbs with a streak and resets after a pause', async () => {
    const { audio, created, gesture } = setup();
    await gesture();
    const ctx = created[0]!;
    const spy = vi.spyOn(audio, 'sfx');
    audio.coin();
    ctx.currentTime = 0.3;
    audio.coin();
    ctx.currentTime = 0.6;
    audio.coin();
    ctx.currentTime = 5;
    audio.coin();
    expect(spy.mock.calls.map((c) => c[1])).toEqual([0, 1, 2, 0]);
  });
});

describe('music data', () => {
  it('tempo rises with difficulty within bounds', () => {
    expect(60 / stepDuration(0) / 4).toBeCloseTo(BPM_MIN);
    expect(60 / stepDuration(1) / 4).toBeCloseTo(BPM_MAX);
    expect(stepDuration(0.5)).toBeLessThan(stepDuration(0.1));
    expect(stepDuration(-3)).toBe(stepDuration(0));
    expect(stepDuration(9)).toBe(stepDuration(1));
  });

  it('loop length is 4 bars of 16 steps and A4 is 440 Hz', () => {
    expect(LOOP_STEPS).toBe(64);
    expect(midiToFreq(69)).toBe(440);
    expect(midiToFreq(81)).toBeCloseTo(880);
  });
});
