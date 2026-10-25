import { Input } from '../input/Input';
import { Player } from '../physics/Player';
import { Save, type BestRecord, type LevelRecord } from '../storage/Save';
import { DIFFICULTIES, difficultyAt, speedAt, type DifficultyId, type DifficultyProfile } from '../world/Difficulty';
import { type GameMode } from './modes';
import { RhythmRun, popcount, type Judgement } from '../rhythm/RhythmRun';
import { LEVELS } from '../rhythm/levels';
import { GRAVITY_LEVELS } from '../rhythm/gravityLevels';
import { SecretStream, ZONE_NAMES, type ZoneSpan } from '../rhythm/secret';
import type { LevelDef } from '../rhythm/level';
import { Generator } from '../world/Generator';
import { COIN } from '../world/Rect';
import { World } from '../world/World';
import { Loop } from './Loop';
import { DEFAULT_SKIN, SKINS, findSkin, goalValue, newlyUnlocked, nextSkin, reconcileUnlocked, type Progress, type Skin } from './skins';
import { Renderer } from '../render/Renderer';
import { AudioSystem } from '../audio/AudioSystem';
import { Particles } from '../render/Particles';
import { PlayerView } from '../render/PlayerView';

export type GameState = 'menu' | 'playing' | 'paused' | 'countdown' | 'dead' | 'complete';

/** How far ahead of the player geometry is generated, and how far behind it is kept (tiles). */
const GEN_AHEAD = 60;
const KEEP_BEHIND = 20;
/** Ignore taps this long after dying so a panicked double-tap doesn't skip the result. */
const RETRY_DELAY = 0.2;
/** Seconds of 3-2-1 after resuming from pause, so the player can get their thumb ready. */
const RESUME_COUNTDOWN = 1.8;
/** Score awarded per coin, on top of metres travelled. */
export const COIN_VALUE = 10;
/** Difficulty is shown to the player as a level from 1 to this value. */
export const MAX_LEVEL = 10;
/** sessionStorage key of the easter egg (see Game.setCheats). */
const CHEAT_KEY = 'onebutton.secret';
/** Practice mode: pause between dying and reappearing at the last checkpoint. */
const RESPAWN_DELAY = 0.7;
/** After finishing a rhythm level, the runner keeps going this far past the finish line. */
const VICTORY_LAP = 40;

/** Owns the simulation and wires input → physics → world → renderer. */
export class Game {
  state: GameState = 'menu';
  readonly player = new Player();
  readonly world = new World(256);
  readonly save = new Save();
  readonly audio = new AudioSystem(() => this.save.data);
  /** Rhythm mode: the level being played and everything about the current attempt. */
  readonly rhythm = new RhythmRun();
  /** Rhythm mode: progress (%) of the last attempt, and whether it beat the best. */
  rhythmProgress = 0;
  rhythmNewBest = false;
  /** Secret mode: the endless run being played (zones are generated as the runner gets close). */
  stream: SecretStream | null = null;
  private growing = false;
  difficulty = 0;
  /** Metres travelled this run (floor of x). */
  distance = 0;
  /** Coins picked up this run. */
  coins = 0;
  /** Total score = metres + coin bonus. */
  score = 0;
  /** Best score before this run began (the number to beat). */
  bestAtStart = 0;
  /** True once this run has beaten a previous, non-zero best. */
  newRecord = false;
  /** One-shot flag the renderer consumes to fire the record celebration. */
  celebrate = false;
  readonly debug: boolean;
  /** Visual-only state: effects, character animation, shake/flash intensity, animation clock. */
  readonly fx = new Particles();
  readonly view = new PlayerView();
  /** Debug (`?theme=N`): start the background palette N worlds in, without changing gameplay. */
  readonly themeOffset: number;
  /** Debug (`?at=N`): begin the run N metres in, to look at late-game layouts without playing there. */
  private readonly startAt: number;
  shake = 0;
  flash = 0;
  time = 0;
  /** Seconds left in the resume countdown. */
  countdown = 0;
  /** UI hooks: called when the state changes, and once per rendered frame. */
  /** Skins unlocked during the current/last run (shown on the game-over screen). */
  readonly unlockedNow: Skin[] = [];
  onUnlock: ((skin: Skin) => void) | null = null;
  /** Fired once, when finishing the whole game earns the secret level. */
  onSecretEarned: (() => void) | null = null;
  onState: (() => void) | null = null;
  onFrame: (() => void) | null = null;

  private readonly reducedMotion: boolean = false;
  /** Smallest distance goal (m) not reached yet; the per-step check is one comparison. */
  private nextDistanceGoal = Infinity;
  /** Obstacles dodged in this run (skin objectives), and how far through the world's mover list we are. */
  saws = 0;
  crushers = 0;
  private moverIdx = 0;
  private current: Skin = findSkin(DEFAULT_SKIN);
  /** The skin shown in the HUD progress pill: the one closest to being earned, counting this run. */
  goalTarget: Skin | null = null;
  private trailTick = 0;
  private runTick = 0;
  private readonly generator = new Generator(this.world);
  private readonly input: Input;
  readonly renderer: Renderer;
  private readonly loop: Loop;
  private readonly poll = { pressed: false, held: false };
  deadTime = 0;
  private fps = 60;
  private seedCounter: number;

  constructor(canvas: HTMLCanvasElement) {
    const params = new URLSearchParams(location.search);
    this.debug = params.has('debug');
    this.themeOffset = (Number(params.get('theme')) || 0) * 400;
    this.startAt = this.debug ? Math.max(0, Number(params.get('at')) || 0) : 0;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      this.reducedMotion = true;
      this.fx.density = 0.4;
    }
    this.seedCounter = Number(params.get('seed')) || (Date.now() & 0xffff);
    this.input = new Input(canvas);
    this.renderer = new Renderer(canvas);
    this.loop = new Loop(
      (dt) => {
        const prof = this.renderer.prof;
        if (!prof) return this.update(dt);
        const t = performance.now();
        this.update(dt);
        prof.update = (prof.update ?? 0) + performance.now() - t;
      },
      (alpha, frameDt) => {
        this.syncClock();
        this.fps += (1 / Math.max(frameDt, 1e-4) - this.fps) * 0.05;
        this.renderer.render(this, alpha, frameDt, this.fps);
        this.onFrame?.();
      },
    );
    // Persist coins/attempts if the tab is closed mid-run.
    window.addEventListener('pagehide', () => this.save.flush());
    // Never lose a run to a notification or tab switch.
    document.addEventListener('visibilitychange', () => document.hidden && this.pause());
    window.addEventListener('blur', () => this.pause());
    this.audio.latencyMs = this.save.data.latency;
    this.cheats = Game.readCheatFlag();
    this.reconcileSkins();
    this.checkSecretEarned(true); // saves that finished everything before this existed
    // The secret level only exists once earned, or while the easter egg is on.
    if (this.save.data.mode === 'secret' && !this.secretOpen) this.save.data.mode = 'endless';
    this.resetRun();
    this.audio.setMusicMode('on'); // takes effect after the first user gesture
  }

  /** Selected game mode and endless difficulty. */
  get mode(): GameMode {
    return this.save.data.mode;
  }

  /** Menu action: switch between the endless runner and the rhythm campaign. */
  setMode(mode: GameMode): void {
    if (this.state !== 'menu' || mode === this.save.data.mode) return;
    if (mode === 'secret' && !this.secretOpen) return;
    this.save.data.mode = mode;
    if (mode === 'secret' && this.save.data.secretEarned) this.save.data.secretSeen = true;
    this.save.flush();
    this.resetRun();
    this.refreshGoalTarget();
    this.onState?.();
  }

  /** Metres only count for distance skins in the endless mode, and not in Easy. */
  private get countsDistance(): boolean {
    return this.mode === 'endless' && this.profile.countsForSkins;
  }

  // ---------------------------------------------------------------- rhythm campaign

  /** Music modes (rhythm, gravity) share the level machinery; each has its own list of levels. */
  get musical(): boolean {
    return this.mode !== 'endless';
  }

  get levels(): readonly LevelDef[] {
    return this.mode === 'gravity' ? GRAVITY_LEVELS : this.mode === 'secret' ? [] : LEVELS;
  }

  /** The secret run's current zone (for the HUD and banners). */
  get zone(): ZoneSpan | null {
    return this.stream?.zoneAt(this.player.x) ?? null;
  }

  /** Name of what is being played: level name, or the secret run's current zone. */
  get trackName(): string {
    if (this.mode === 'secret') {
      const z = this.zone;
      return z ? `Ω Zona ${z.index + 1} · ${ZONE_NAMES[z.kind]}` : 'Ω';
    }
    return this.levels[this.rhythm.index]?.name ?? '';
  }

  get secretBest(): number {
    return this.save.data.secretBest;
  }

  /** Index of the level last chosen in the current campaign. */
  private get levelIndex(): number {
    return this.mode === 'gravity' ? this.save.data.gravityLevel : this.save.data.rhythmLevel;
  }

  private set levelIndex(i: number) {
    if (this.mode === 'gravity') this.save.data.gravityLevel = i;
    else this.save.data.rhythmLevel = i;
  }

  private recordOf(def: LevelDef): LevelRecord {
    return (this.save.data.rhythm[def.id] ??= { best: 0, done: false, acc: 0, discos: 0, attempts: 0 });
  }

  levelRecord(i: number): LevelRecord {
    const id = this.levels[i]!.id;
    return (this.save.data.rhythm[id] ??= { best: 0, done: false, acc: 0, discos: 0, attempts: 0 });
  }

  /** The first level is always open; each further level opens when the previous one is completed. */
  isLevelUnlocked(i: number): boolean {
    if (i < 0 || i >= this.levels.length) return false;
    return this.cheats || i === 0 || this.levelRecord(i - 1).done;
  }

  // ---------------------------------------------------------------- easter egg

  /**
   * Secret: tapping the character in the main menu 11 times unlocks every skin and level for this
   * browser session (and the hidden mode). Nothing is written to the save: turning it off, or a new
   * session, brings back exactly what was earned. Real progress made meanwhile is still recorded.
   */
  cheats = false;

  private static readCheatFlag(): boolean {
    try {
      return sessionStorage.getItem(CHEAT_KEY) === '1';
    } catch {
      return false;
    }
  }

  setCheats(on: boolean): void {
    if (on === this.cheats) return;
    this.cheats = on;
    try {
      if (on) sessionStorage.setItem(CHEAT_KEY, '1');
      else sessionStorage.removeItem(CHEAT_KEY);
    } catch {
      /* private mode: the flag just lives in memory */
    }
    if (!on) {
      if (this.save.data.mode === 'secret' && !this.secretOpen) {
        this.save.data.mode = 'endless';
        this.save.flush();
      }
      // Back to what was really earned: drop a borrowed skin and leave any borrowed level.
      if (!this.isUnlocked(this.save.data.skin)) this.selectSkinUnchecked(DEFAULT_SKIN);
      if (this.musical && !this.isLevelUnlocked(this.levelIndex)) this.levelIndex = 0;
      if (this.state === 'menu') this.resetRun();
    } else {
      this.audio.sfx('record');
    }
    this.refreshGoalTarget();
    this.onState?.();
  }

  // ---------------------------------------------------------------- secret level

  /** The secret level is playable once earned for real, or borrowed through the easter egg. */
  get secretOpen(): boolean {
    return this.cheats || this.save.data.secretEarned;
  }

  /** Earned but never opened yet: the menu marks its tab as new. */
  get secretIsNew(): boolean {
    return this.save.data.secretEarned && !this.save.data.secretSeen;
  }

  /** The whole game, earned for real: every skin owned and every level of both campaigns completed. */
  get gameComplete(): boolean {
    return SKINS.every((s) => this.owns(s.id)) && [...LEVELS, ...GRAVITY_LEVELS].every((d) => this.recordOf(d).done);
  }

  /** Grant the secret level the moment the game is complete (silently when just loading a save). */
  private checkSecretEarned(silent = false): void {
    const d = this.save.data;
    if (d.secretEarned || !this.gameComplete) return;
    d.secretEarned = true;
    this.save.flush();
    if (!silent) {
      this.audio.sfx('record');
      this.onSecretEarned?.();
    }
  }

  /** Completed levels and collected discos across both music campaigns (skin objectives). */
  get levelsDone(): number {
    return [...LEVELS, ...GRAVITY_LEVELS].reduce((n, d) => n + (this.recordOf(d).done ? 1 : 0), 0);
  }

  get discosTotal(): number {
    return [...LEVELS, ...GRAVITY_LEVELS].reduce((n, d) => n + popcount(this.recordOf(d).discos), 0);
  }

  /** Completed levels and discos in the current campaign (menu summary). */
  get campaignDone(): number {
    return this.levels.reduce((n, d) => n + (this.recordOf(d).done ? 1 : 0), 0);
  }

  get campaignDiscos(): number {
    return this.levels.reduce((n, d) => n + popcount(this.recordOf(d).discos), 0);
  }

  setPractice(on: boolean): void {
    this.save.data.practice = on;
    this.save.flush();
  }

  setLatency(ms: number): void {
    this.save.data.latency = Math.max(-250, Math.min(250, Math.round(ms)));
    this.audio.latencyMs = this.save.data.latency;
    this.save.flush();
  }

  /** Start (or restart) rhythm level `i`. */
  playLevel(i: number): void {
    if (!this.isLevelUnlocked(i) || (this.state !== 'menu' && this.state !== 'dead' && this.state !== 'complete')) return;
    if (this.mode === 'endless') this.save.data.mode = 'rhythm';
    this.levelIndex = i;
    this.resetRun();
    this.beginRun();
  }

  nextLevel(): void {
    const i = this.rhythm.index + 1;
    if (i < this.levels.length && this.isLevelUnlocked(i)) this.playLevel(i);
  }

  /** Song time the run is at, and whether a practice respawn is pending (for the renderer). */
  get inRhythm(): boolean {
    return this.musical && this.rhythm.level !== null;
  }

  private startSong(): void {
    const r = this.rhythm;
    this.audio.playSong(r.level!.song, r.songTime);
    r.waiting = true;
    r.waitSince = performance.now();
  }

  /**
   * Keep the simulation locked to the music the player hears: hold still until the song reaches the
   * run's clock (start, resume, respawn), then nudge the fixed-step loop so neither drifts.
   */
  private syncClock(): void {
    if (!this.musical || this.state !== 'playing') return;
    const r = this.rhythm;
    if (r.respawnT > 0) return;
    const heard = this.audio.songTime();
    if (heard === null) {
      // No audio clock (blocked or muted device): run on the frame clock.
      if (r.waiting && performance.now() - r.waitSince > 300) r.waiting = false;
      return;
    }
    const d = heard - r.songTime;
    if (r.waiting) {
      if (d >= 0) {
        r.waiting = false;
        this.loop.shift(Math.min(d, 0.05));
      }
      this.clockErr = 0;
      return;
    }
    // A big jump (tab hiccup, audio glitch) is fixed at once…
    if (Math.abs(d) > 0.08) {
      this.loop.shift(Math.max(-0.1, Math.min(0.1, d)));
      this.clockErr = 0;
      return;
    }
    // …but everyday drift is filtered and corrected by at most 1.5 ms a frame. The audio clock advances
    // in coarse ticks; chasing every tick made the scrolling stutter by a few pixels.
    this.clockErr += (d - this.clockErr) * 0.08;
    if (Math.abs(this.clockErr) > 0.004) this.loop.shift(Math.max(-0.0015, Math.min(0.0015, this.clockErr * 0.15)));
  }

  /** Filtered difference between the music and the simulation (s). */
  private clockErr = 0;

  get difficultyId(): DifficultyId {
    return this.save.data.difficulty;
  }

  get profile(): DifficultyProfile {
    return DIFFICULTIES[this.save.data.difficulty];
  }

  /** Menu action: pick the endless difficulty. The idle level is rebuilt so the menu matches. */
  setDifficulty(id: DifficultyId): void {
    if (this.state !== 'menu' || id === this.save.data.difficulty) return;
    this.save.data.difficulty = id;
    this.save.flush();
    this.resetRun();
    this.refreshGoalTarget();
    this.onState?.();
  }

  /** Record of the selected difficulty. */
  get record(): BestRecord {
    return this.save.data.records[this.save.data.difficulty];
  }

  /** Currently selected skin. */
  get skin(): Skin {
    return this.current;
  }

  /** The locked skin closest to being earned, or null when all are unlocked. */
  get nextReward(): Skin | null {
    return nextSkin(this.save.data.unlocked, this.savedProgress());
  }

  get maxDist(): number {
    return this.save.data.maxDist;
  }

  isUnlocked(id: string): boolean {
    return this.cheats || this.owns(id);
  }

  /** Earned for real (the save), regardless of the easter egg. */
  private owns(id: string): boolean {
    return this.save.data.unlocked.includes(id);
  }

  private selectSkinUnchecked(id: string): void {
    this.save.data.skin = id;
    this.save.flush();
    this.applySkin();
  }

  /** How far along a skin's objective the player is, from what is saved (for menus). */
  progressOf(skin: Skin): number {
    return goalValue(skin.goal, this.savedProgress());
  }

  /** Menu action: wear an unlocked skin. */
  selectSkin(id: string): void {
    if (!this.isUnlocked(id)) return;
    this.save.data.skin = id;
    this.save.flush();
    this.applySkin();
  }

  private applySkin(): void {
    this.current = findSkin(this.save.data.skin);
    this.view.setSkin(this.current);
    this.fx.setSkin(this.current.color, this.current.trail);
  }

  /** Saved totals: best single run for distance, lifetime for everything else. */
  private savedProgress(): Progress {
    const d = this.save.data;
    return { distance: d.maxDist, coins: d.coins, attempts: d.attempts, saws: d.saws, crushers: d.crushers, levels: this.levelsDone, discos: this.discosTotal };
  }

  /** Pick the skin for the HUD progress pill (called when a run starts and whenever one is unlocked). */
  private refreshGoalTarget(): void {
    const unlocked = this.save.data.unlocked;
    // Where metres do not count, distance skins are not candidates for the pill.
    const skip = this.countsDistance ? unlocked : unlocked.concat(SKINS.filter((s) => s.goal.type === 'distance').map((s) => s.id));
    this.goalTarget = nextSkin(skip, this.liveProgress());
  }

  /** Live value of the HUD target's objective (this run included), without allocating. */
  get goalProgress(): number {
    const t = this.goalTarget;
    if (!t) return 0;
    const d = this.save.data;
    switch (t.goal.type) {
      case 'distance': return this.countsDistance ? this.distance : 0;
      case 'coins': return d.coins + this.coins;
      case 'attempts': return d.attempts;
      case 'saws': return d.saws + this.saws;
      case 'crushers': return d.crushers + this.crushers;
      case 'levels': return this.levelsDone;
      case 'discos': return this.discosTotal;
    }
  }

  /** Saved totals plus the run in progress, so objectives complete the moment they are met. */
  private liveProgress(): Progress {
    const d = this.save.data;
    return {
      distance: this.countsDistance ? this.distance : 0,
      coins: d.coins + (this.mode === 'endless' ? this.coins : 0),
      attempts: d.attempts,
      saws: d.saws + this.saws,
      crushers: d.crushers + this.crushers,
      levels: this.levelsDone,
      discos: this.discosTotal,
    };
  }

  private reconcileSkins(): void {
    const d = this.save.data;
    d.unlocked = reconcileUnlocked(d.unlocked, this.savedProgress());
    if (!this.isUnlocked(d.skin)) d.skin = DEFAULT_SKIN;
    this.refreshDistanceGoal();
    this.refreshGoalTarget();
    this.applySkin();
  }

  private refreshDistanceGoal(): void {
    let next = Infinity;
    for (const s of SKINS) {
      if (s.goal.type === 'distance' && s.goal.n > 0 && !this.owns(s.id)) next = Math.min(next, s.goal.n);
    }
    this.nextDistanceGoal = next;
  }

  /** Unlock every skin whose objective the run in progress has just met. */
  private checkUnlocks(): void {
    const d = this.save.data;
    const earned = newlyUnlocked(this.liveProgress(), d.unlocked);
    if (earned.length === 0) return;
    for (const skin of earned) {
      d.unlocked.push(skin.id);
      if (skin.goal.type === 'distance') d.maxDist = Math.max(d.maxDist, skin.goal.n);
      this.unlockedNow.push(skin);
      this.audio.sfx('record');
      this.onUnlock?.(skin);
    }
    this.refreshDistanceGoal();
    this.refreshGoalTarget();
    this.save.flush(); // don't lose the reward if the tab is closed mid-run
    this.checkSecretEarned(); // ...or the last skin
  }

  get best(): number {
    return this.record.best;
  }

  /** Distance of the best run in the selected difficulty (for the in-world marker). */
  get bestDist(): number {
    return this.record.bestDist;
  }

  get attempts(): number {
    return this.save.data.attempts;
  }

  /** Difficulty as the 1..MAX_LEVEL number shown in the HUD. */
  get level(): number {
    return 1 + Math.floor(this.difficulty * (MAX_LEVEL - 1));
  }

  start(): void {
    this.loop.start();
  }

  /** Build a fresh layout and put the player at the start, waiting for the first press. */
  private resetRun(): void {
    this.audio.stopSong();
    if (this.mode === 'secret') {
      this.stream = new SecretStream(this.seedCounter++);
      this.rhythm.loadLevel(this.stream.level);
      this.rhythm.practice = false;
      this.rhythm.begin(this.world, this.player, null);
      this.player.speed = this.stream.level.speed;
      this.difficulty = 0;
      this.distance = this.coins = this.score = 0;
      this.deadTime = 0;
      this.rhythmNewBest = false;
      this.fx.clear();
      this.view.reset();
      this.shake = this.flash = 0;
      return;
    }
    this.stream = null;
    if (this.musical) {
      const lv = this.rhythm.load(this.levels, this.levelIndex);
      this.rhythm.practice = this.save.data.practice;
      this.rhythm.begin(this.world, this.player, null);
      this.player.speed = lv.speed;
      this.difficulty = 0;
      this.distance = this.coins = this.score = 0;
      this.saws = this.crushers = 0;
      this.deadTime = 0;
      this.newRecord = false;
      this.rhythmProgress = 0;
      this.rhythmNewBest = false;
      this.fx.clear();
      this.view.reset();
      this.shake = this.flash = 0;
      return;
    }
    this.generator.reset(this.seedCounter++, this.startAt, this.profile);
    this.generator.ensureAhead(this.startAt + GEN_AHEAD);
    this.player.reset(this.startAt);
    this.difficulty = difficultyAt(this.startAt, this.profile);
    this.player.speed = speedAt(this.difficulty);
    this.distance = this.coins = this.score = 0;
    this.saws = this.crushers = 0;
    this.moverIdx = 0;
    this.deadTime = 0;
    this.newRecord = false;
    this.fx.clear();
    this.view.reset();
    this.shake = this.flash = 0;
  }

  private setState(next: GameState): void {
    this.state = next;
    // The chiptune loop belongs to the endless runner and the menus; rhythm levels bring their own song.
    const rhythmRun = this.musical && next !== 'menu';
    this.audio.setMusicMode(next === 'dead' || rhythmRun ? 'off' : next === 'paused' ? 'duck' : 'on');
    if (next === 'paused' || next === 'menu') this.audio.stopSong();
    this.onState?.();
  }

  private beginRun(): void {
    this.unlockedNow.length = 0;
    if (this.musical) {
      if (!this.rhythm.practice && this.mode !== 'secret') this.levelRecord(this.rhythm.index).attempts++;
      this.save.flush();
      this.setState('playing');
      this.startSong();
      this.refreshGoalTarget();
      return;
    }
    this.bestAtStart = this.record.best;
    this.save.data.attempts++;
    this.setState('playing');
    this.checkUnlocks(); // "play N games" objectives
    this.refreshGoalTarget();
  }

  /** Start a new run right away (from the menu or after dying). */
  play(): void {
    if (this.state !== 'menu' && this.state !== 'dead' && this.state !== 'complete') return;
    this.resetRun();
    this.beginRun();
  }

  pause(): void {
    if (this.state === 'playing') this.setState('paused');
  }

  resume(): void {
    if (this.state !== 'paused') return;
    this.countdown = RESUME_COUNTDOWN;
    this.setState('countdown');
  }

  /** Tap on the game-over screen: same guard as the in-canvas retry. */
  retry(): void {
    if ((this.state === 'dead' || this.state === 'complete') && this.deadTime > RETRY_DELAY) this.play();
  }

  togglePause(): void {
    if (this.state === 'playing') this.pause();
    else if (this.state === 'paused') this.resume();
  }

  /** Back to the main menu; an abandoned run still banks its coins and score. */
  toMenu(): void {
    if ((this.state === 'paused' || this.state === 'countdown') && this.mode === 'endless') this.commitRun();
    this.resetRun();
    this.setState('menu');
  }

  private update(dt: number): void {
    this.input.poll(this.poll);
    const { pressed, held } = this.poll;

    if (this.state === 'paused' || this.state === 'countdown') {
      // Visuals freeze with the game; only the countdown advances.
      if (this.state === 'countdown') {
        this.countdown -= dt;
        if (this.countdown <= 0) {
          this.setState('playing');
          if (this.musical) this.startSong();
        }
      }
      return;
    }

    // Purely cosmetic state keeps animating in the menu and on the death screen.
    this.time += dt;
    this.shake *= Math.exp(-dt * 7);
    this.flash = Math.max(0, this.flash - dt * 4);
    this.fx.update(dt);
    this.view.update(dt, this.player.grounded, this.player.vy);

    if (this.state === 'menu') {
      // In rhythm mode a level is picked from the level list, not by tapping the menu.
      if (pressed && this.mode === 'endless') this.play();
      return;
    }
    if (this.state === 'dead') {
      this.deadTime += dt;
      if (pressed && this.deadTime > RETRY_DELAY) this.play();
      return;
    }
    if (this.state === 'complete') {
      this.deadTime += dt;
      this.victoryLap(dt);
      return;
    }
    if (this.musical) {
      this.rhythmStep(dt, pressed, held);
      return;
    }

    const p = this.player;
    this.difficulty = difficultyAt(p.x, this.profile);
    p.speed = speedAt(this.difficulty);
    this.audio.intensity = this.difficulty;
    p.step(dt, pressed, held, this.world);
    this.playEffects(p);
    this.collectCoins();
    this.distance = Math.max(0, Math.floor(p.x));
    this.score = this.distance + this.coins * COIN_VALUE;
    this.checkRecord();
    if ((this.distance >= this.nextDistanceGoal && this.profile.countsForSkins) || this.countDodged()) this.checkUnlocks();
    this.generator.ensureAhead(p.x + GEN_AHEAD);
    this.world.prune(p.x - KEEP_BEHIND);
    if (p.dead) this.die();
  }

  /** One fixed step of a rhythm level. */
  private rhythmStep(dt: number, pressed: boolean, held: boolean): void {
    const r = this.rhythm;
    const lv = r.level!;
    const p = this.player;
    if (r.respawnT > 0) {
      r.respawnT -= dt;
      if (r.respawnT <= 0) this.respawn();
      return;
    }
    if (r.waiting) return;
    // Presses are judged against the time at the start of the step, like the level compiler does.
    if (pressed) this.onJudged(r.press(r.songTime, p.x, p.y, this.time));
    r.songTime += dt;
    r.expire(r.songTime);
    // Speed is set at the start and changed only by speed portals.
    p.step(dt, pressed, held, this.world);
    this.playEffects(p);
    this.collectCoins();
    this.distance = Math.max(0, Math.floor(p.x));
    this.rhythmProgress = r.progressAt(p.x);
    // The secret run is generated a few zones ahead (between frames, so building one never stalls a
    // frame mid-jump); the song grows with it. Only if it somehow falls far behind is it built right here.
    const st = this.stream;
    if (st && st.generatedX < p.x + 200) {
      if (st.generatedX < p.x + 90) {
        if (st.ensure(p.x, 200)) this.audio.extendSong(st.level.song);
      } else if (!this.growing) {
        this.growing = true;
        setTimeout(() => {
          this.growing = false;
          if (this.stream === st && st.ensure(this.player.x, 200)) this.audio.extendSong(st.level.song);
        }, 0);
      }
    }
    r.feed(this.world, p.x + GEN_AHEAD);
    this.world.prune(p.x - KEEP_BEHIND);
    if (p.dead) this.die();
    else if (p.x >= lv.endX) this.completeLevel();
  }

  private onJudged(j: Judgement | null): void {
    if (j === 'perfect') this.fx.coin(this.player.x, this.player.y + 0.4);
  }

  /** After the finish line the runner keeps going on its own for a moment. */
  private victoryLap(dt: number): void {
    const p = this.player;
    const lv = this.rhythm.level;
    if (!lv || p.dead || p.x > lv.endX + VICTORY_LAP) return;
    p.step(dt, false, false, this.world);
    this.rhythm.songTime += dt;
    this.rhythm.feed(this.world, p.x + GEN_AHEAD);
    this.world.prune(p.x - KEEP_BEHIND);
    this.playEffects(p);
  }

  /** Practice mode: reappear at the last checkpoint passed, with the music from that point. */
  private respawn(): void {
    const r = this.rhythm;
    r.begin(this.world, this.player, r.checkpointBefore(r.songTime));
    this.view.reset();
    this.startSong();
  }

  private completeLevel(): void {
    const r = this.rhythm;
    this.rhythmProgress = 100;
    this.deadTime = 0;
    if (!r.practice) {
      const rec = this.levelRecord(r.index);
      this.rhythmNewBest = !rec.done;
      rec.best = 100;
      rec.done = true;
      rec.acc = Math.max(rec.acc, r.accuracy);
      rec.discos |= r.discoMask;
      this.save.flush();
      this.checkUnlocks(); // "complete N levels" / "collect N discos"
      this.checkSecretEarned(); // the last level can complete the game without unlocking a skin
    }
    this.celebrate = true;
    this.audio.sfx('record');
    this.setState('complete');
  }

  /** Count movers the runner has just passed; true if any were. */
  private countDodged(): boolean {
    const w = this.world;
    const x = this.player.x - 0.6;
    let any = false;
    while (this.moverIdx < w.moverX.length && w.moverX[this.moverIdx]! < x) {
      if (w.moverIsCrusher[this.moverIdx]) this.crushers++;
      else this.saws++;
      this.moverIdx++;
      any = true;
    }
    return any;
  }

  /** Turn this step's physics events into particles and character animation. */
  private playEffects(p: Player): void {
    // In rhythm levels the song is the feedback: no jump/land blips on top of it.
    const quiet = this.musical;
    if (p.jumped) {
      if (!quiet) this.audio.sfx('jump');
      this.fx.jump(p.x, p.y);
      this.view.jump();
    }
    if (p.landed) {
      if (!quiet) this.audio.sfx('land', p.landSpeed / 20);
      this.fx.land(p.x, p.y, p.landSpeed);
      this.view.land(p.landSpeed);
    }
    if ((!p.grounded || this.current.trail?.ground) && ++this.trailTick % 5 === 0) this.fx.trail(p.x - 0.2, p.y + (p.grounded ? 0.15 : 0.4));
    // Skins that already leave a ground trail don't need the plain dust on top of it.
    if (p.grounded && !this.current.trail?.ground && ++this.runTick % 8 === 0) this.fx.run(p.x - 0.35, p.y);
  }

  private collectCoins(): void {
    const p = this.player;
    for (let guard = 0; guard < 4; guard++) {
      const c = this.world.overlap(p.x - 0.4, p.y, p.x + 0.4, p.y + 0.8, COIN);
      if (!c) return;
      c.taken = true;
      if (this.musical) this.rhythm.takeDisco(c);
      this.coins++;
      // Over a song the endless-runner coin is too loud and off-key: the music modes use the disco sound.
      if (this.musical) this.audio.disco();
      else this.audio.coin();
      this.fx.coin((c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2);
      this.checkUnlocks(); // "collect N coins" objectives
    }
  }

  private checkRecord(): void {
    if (!this.newRecord && this.bestAtStart > 0 && this.score > this.bestAtStart) {
      this.newRecord = true;
      this.celebrate = true;
      this.audio.sfx('record');
    }
  }

  private die(): void {
    this.deadTime = 0;
    if (this.musical) {
      this.audio.stopSong();
      this.audio.sfx('death');
      this.fx.death(this.player.x, Math.max(this.player.y, -1));
      if (!this.reducedMotion) this.shake = 1;
      this.flash = 0.6;
      const r = this.rhythm;
      if (r.practice) {
        r.respawnT = RESPAWN_DELAY;
        return;
      }
      if (this.mode === 'secret') {
        const d = this.save.data;
        this.rhythmNewBest = this.distance > d.secretBest;
        d.secretBest = Math.max(d.secretBest, this.distance);
        this.save.flush();
        this.setState('dead');
        return;
      }
      const rec = this.levelRecord(r.index);
      this.rhythmNewBest = this.rhythmProgress > rec.best;
      rec.best = Math.max(rec.best, this.rhythmProgress);
      this.save.flush();
      this.setState('dead');
      return;
    }
    this.commitRun();
    // Burst at the body's last position (clamped so a fall into a pit is still visible).
    this.audio.sfx('death');
    this.fx.death(this.player.x, Math.max(this.player.y, -1));
    if (!this.reducedMotion) this.shake = 1;
    this.flash = 0.6;
    this.setState('dead');
  }

  /** Bank this run's coins and best score, and persist. */
  private commitRun(): void {
    const d = this.save.data;
    d.coins += this.coins;
    d.saws += this.saws;
    d.crushers += this.crushers;
    if (this.profile.countsForSkins) d.maxDist = Math.max(d.maxDist, this.distance);
    const rec = this.record;
    if (this.score > rec.best) {
      rec.best = this.score;
      rec.bestDist = this.distance;
    }
    this.save.flush();
  }
}
