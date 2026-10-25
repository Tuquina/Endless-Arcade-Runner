import { SFX, type SfxEnv, type SfxName } from './sfx';
import { LOOP_STEPS, scheduleStep, stepDuration } from './music';
import { makeNoise } from './synth';
import { scheduleSongStep, stepAtTime, type CompiledSong, type SongEnv } from './song';

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
const SONG_LEVEL = 0.75;
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
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;

  // Rhythm-mode song playback: a fresh bus per playback so stopping silences everything already scheduled.
  private song: CompiledSong | null = null;
  private songBus: GainNode | null = null;
  private songEnv: SongEnv | null = null;
  private songTimer: ReturnType<typeof setInterval> | null = null;
  private songStep = 0;
  /** Audio time at which song time `songOffset` is played. */
  private songAnchor = 0;
  private songOffset = 0;
  /** Player-calibrated extra delay between scheduling a sound and hearing it (ms, from settings). */
  latencyMs = 0;

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
    this.master = master;
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0;
    this.musicBus.connect(master);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 1;
    this.sfxBus.connect(master);
    const noise = makeNoise(ctx);
    this.noiseBuf = noise;
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
    if (this.songBus && this.ctx) this.songBus.gain.setTargetAtTime(this.settings().music ? SONG_LEVEL : 0, this.ctx.currentTime, 0.05);
  }

  // ------------------------------------------------------------------ rhythm songs

  /**
   * Start `song` from song time `offset` (seconds) shortly from now. Returns false if there is no
   * audio context yet (no user gesture); the game then keeps time on its own.
   */
  playSong(song: CompiledSong, offset: number): boolean {
    this.stopSong();
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noiseBuf) return false;
    const bus = ctx.createGain();
    bus.gain.value = this.settings().music ? SONG_LEVEL : 0;
    // Gentle bus compression: glues the mix and keeps the louder choruses from clipping.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 3;
    comp.attack.value = 0.005;
    comp.release.value = 0.15;
    bus.connect(comp);
    comp.connect(this.master);
    // Dotted-8th echo with a darkening feedback loop, for leads and arpeggios.
    const echo = ctx.createDelay(1);
    echo.delayTime.value = song.stepDur * 3;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 2400;
    echo.connect(tone);
    tone.connect(fb);
    fb.connect(echo);
    tone.connect(bus);
    this.song = song;
    this.songBus = bus;
    this.songEnv = { ctx, out: bus, noise: this.noiseBuf, echo };
    this.songOffset = offset;
    this.songAnchor = ctx.currentTime + 0.1;
    this.songStep = Math.max(0, Math.ceil(stepAtTime(song, offset) - 1e-6));
    this.songTimer = setInterval(this.songTick, TICK_MS);
    this.songTick();
    return true;
  }

  stopSong(): void {
    if (this.songTimer) clearInterval(this.songTimer);
    this.songTimer = null;
    const bus = this.songBus;
    const ctx = this.ctx;
    if (bus && ctx) {
      bus.gain.cancelScheduledValues(ctx.currentTime);
      bus.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
      setTimeout(() => bus.disconnect(), 400);
    }
    this.songBus = null;
    this.songEnv = null;
    this.song = null;
  }

  /**
   * Song time the player is hearing right now (seconds), or null when it can't be known (no song,
   * or the audio clock isn't running). Output latency and the player's calibration are subtracted.
   */
  songTime(): number | null {
    const ctx = this.ctx;
    if (!ctx || !this.song || ctx.state !== 'running') return null;
    const out = (ctx as AudioContext & { outputLatency?: number }).outputLatency || ctx.baseLatency || 0;
    return this.songOffset + (ctx.currentTime - this.songAnchor) - out - this.latencyMs / 1000;
  }

  private songTick = (): void => {
    const ctx = this.ctx;
    const song = this.song;
    if (!ctx || !song || !this.songEnv) return;
    for (let guard = 0; guard < 64; guard++) {
      if (this.songStep >= song.totalSteps) break;
      const t = this.songAnchor + (song.stepTimes[this.songStep]! - this.songOffset);
      if (t > ctx.currentTime + LOOKAHEAD || this.songStep >= song.totalSteps) break;
      if (t >= ctx.currentTime - 0.02) scheduleSongStep(this.songEnv, song, this.songStep, Math.max(t, ctx.currentTime));
      this.songStep++;
    }
  };

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
    this.stopSong();
    void this.ctx?.close();
    this.ctx = null;
  }
}
