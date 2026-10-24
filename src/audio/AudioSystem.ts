import { SFX, type SfxEnv, type SfxName } from './sfx';
import { LOOP_STEPS, scheduleStep, stepDuration } from './music';
import { makeNoise } from './synth';

export interface AudioSettings {
  music: boolean;
  sfx: boolean;
}

/** What the music should be doing: playing, quieter (paused), or faded out (game over). */
export type MusicMode = 'on' | 'duck' | 'off';

/** Builds the AudioContext. Injectable so tests don't need a browser. */
export type ContextFactory = () => AudioContext;

const defaultFactory: ContextFactory = () => {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  return new Ctor({ latencyHint: 'interactive' });
};

const LOOKAHEAD = 0.14; // seconds of music scheduled ahead
const TICK_MS = 25;
const MAX_VOICES = 14;
const MUSIC_LEVEL = 0.4;
const GESTURES = ['pointerdown', 'keydown', 'touchend', 'click'] as const;

/**
 * All sound for the game: synthesized effects and a chiptune loop, with separate switches.
 * Browsers only allow audio after a user gesture, so the AudioContext is created and resumed
 * on the first gesture and nothing plays (or throws) before that.
 */
export class AudioSystem {
  private ctx: AudioContext | null = null;
  private env: SfxEnv | null = null;
  private musicEnv: SfxEnv | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;

  private mode: MusicMode = 'off';
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextTime = 0;
  private step = 0;
  /** Difficulty 0..1: set by the game every step; speeds up the music. */
  intensity = 0;

  private voices = 0;
  private lastCoinAt = -10;
  private coinStreak = 0;

  constructor(
    private readonly settings: () => AudioSettings,
    private readonly factory: ContextFactory = defaultFactory,
    private readonly target: EventTarget | null = typeof window !== 'undefined' ? window : null,
  ) {
    for (const ev of GESTURES) this.target?.addEventListener(ev, this.onGesture, { capture: true });
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisibility);
  }

  get running(): boolean {
    return this.ctx?.state === 'running';
  }

  // ------------------------------------------------------------------ unlocking

  private onGesture = (): void => {
    if (!this.ctx) this.create();
    const ctx = this.ctx!;
    // Resume must be called inside the gesture handler to satisfy autoplay policies.
    void ctx.resume().then(() => {
      if (ctx.state === 'running') {
        this.dropGestureListeners();
        this.applyMusic();
      }
    }).catch(() => undefined);
  };

  private dropGestureListeners(): void {
    for (const ev of GESTURES) this.target?.removeEventListener(ev, this.onGesture, { capture: true });
  }

  private create(): void {
    const ctx = this.factory();
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0;
    this.musicBus.connect(master);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 1;
    this.sfxBus.connect(master);
    const noise = makeNoise(ctx);
    this.env = { ctx, out: this.sfxBus, noise };
    this.musicEnv = { ctx, out: this.musicBus, noise };
    // iOS: a silent one-sample buffer played inside the gesture fully unlocks output.
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    src.connect(ctx.destination);
    src.start(0);
  }

  private onVisibility = (): void => {
    const ctx = this.ctx;
    if (!ctx) return;
    if (document.hidden) void ctx.suspend();
    else void ctx.resume();
  };

  // ------------------------------------------------------------------ effects

  /** Play an effect if enabled and unlocked. `amount` is intensity (land) or semitones (coin). */
  sfx(name: SfxName, amount = 1): void {
    if (!this.settings().sfx || !this.running || !this.env || this.voices >= MAX_VOICES) return;
    const len = SFX[name](this.env, this.ctx!.currentTime + 0.005, amount);
    this.voices++;
    setTimeout(() => this.voices--, len * 1000);
  }

  /** Coin pickup: consecutive coins within 0.7 s climb the scale (up to an octave). */
  coin(): void {
    const now = this.ctx?.currentTime ?? 0;
    this.coinStreak = now - this.lastCoinAt < 0.7 ? Math.min(this.coinStreak + 1, 12) : 0;
    this.lastCoinAt = now;
    this.sfx('coin', this.coinStreak);
  }

  // ------------------------------------------------------------------ music

  setMusicMode(mode: MusicMode): void {
    this.mode = mode;
    this.applyMusic();
  }

  /** Call after the music/sfx switches change. */
  refresh(): void {
    this.applyMusic();
  }

  private applyMusic(): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicBus) return;
    const wantPlaying = this.settings().music && this.mode !== 'off' && ctx.state === 'running';
    const level = !this.settings().music ? 0 : this.mode === 'on' ? MUSIC_LEVEL : this.mode === 'duck' ? MUSIC_LEVEL * 0.25 : 0;
    this.musicBus.gain.setTargetAtTime(level, ctx.currentTime, this.mode === 'off' ? 0.12 : 0.08);

    if (wantPlaying && !this.timer) {
      this.step = 0;
      this.nextTime = ctx.currentTime + 0.06;
      this.timer = setInterval(this.tick, TICK_MS);
    } else if (!wantPlaying && this.timer) {
      // Let the fade-out finish, then stop scheduling (unless something re-enabled it).
      const stop = (): void => {
        if (this.timer && !(this.settings().music && this.mode !== 'off')) {
          clearInterval(this.timer);
          this.timer = null;
        }
      };
      if (this.mode === 'off' && this.settings().music) setTimeout(stop, 600);
      else stop();
    }
  }

  private tick = (): void => {
    const ctx = this.ctx;
    if (!ctx || !this.env || ctx.state !== 'running') return;
    // After a suspend (tab hidden) the clock has moved on: don't burst-schedule the past.
    if (this.nextTime < ctx.currentTime) this.nextTime = ctx.currentTime + 0.05;
    const musicEnv = this.musicEnv!;
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      const dur = stepDuration(this.intensity);
      scheduleStep(musicEnv, this.step, this.nextTime, dur, this.intensity);
      this.nextTime += dur;
      this.step = (this.step + 1) % LOOP_STEPS;
    }
  };

  destroy(): void {
    this.dropGestureListeners();
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisibility);
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    void this.ctx?.close();
    this.ctx = null;
  }
}
