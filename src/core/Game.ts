import { Input } from '../input/Input';
import { Player } from '../physics/Player';
import { Save } from '../storage/Save';
import { difficultyAt, speedAt } from '../world/Difficulty';
import { Generator } from '../world/Generator';
import { COIN } from '../world/Rect';
import { World } from '../world/World';
import { Loop } from './Loop';
import { DEFAULT_SKIN, findSkin, newlyUnlocked, nextSkin, reconcileUnlocked, type Skin } from './skins';
import { Renderer } from '../render/Renderer';
import { AudioSystem } from '../audio/AudioSystem';
import { Particles } from '../render/Particles';
import { PlayerView } from '../render/PlayerView';

export type GameState = 'menu' | 'playing' | 'paused' | 'countdown' | 'dead';

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

/** Owns the simulation and wires input → physics → world → renderer. */
export class Game {
  state: GameState = 'menu';
  readonly player = new Player();
  readonly world = new World(256);
  readonly save = new Save();
  readonly audio = new AudioSystem(() => this.save.data);
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
  onState: (() => void) | null = null;
  onFrame: (() => void) | null = null;

  private readonly reducedMotion: boolean = false;
  /** Smallest goal (m) not reached yet; the per-step check is one comparison. */
  private nextGoal = Infinity;
  private trailTick = 0;
  private readonly generator = new Generator(this.world);
  private readonly input: Input;
  private readonly renderer: Renderer;
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
      (dt) => this.update(dt),
      (alpha, frameDt) => {
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
    this.reconcileSkins();
    this.resetRun();
    this.audio.setMusicMode('on'); // takes effect after the first user gesture
  }

  /** Currently selected skin. */
  get skin(): Skin {
    return findSkin(this.save.data.skin);
  }

  /** Next locked skin and its distance goal, or null when all are unlocked. */
  get nextReward(): Skin | null {
    return nextSkin(this.save.data.unlocked);
  }

  get maxDist(): number {
    return this.save.data.maxDist;
  }

  isUnlocked(id: string): boolean {
    return this.save.data.unlocked.includes(id);
  }

  /** Menu action: wear an unlocked skin. */
  selectSkin(id: string): void {
    if (!this.isUnlocked(id)) return;
    this.save.data.skin = id;
    this.save.flush();
    this.applySkin();
  }

  private applySkin(): void {
    const skin = this.skin;
    this.view.setSkin(skin);
    this.fx.setSkinColor(skin.color);
  }

  private reconcileSkins(): void {
    const d = this.save.data;
    d.unlocked = reconcileUnlocked(d.unlocked, d.maxDist);
    if (!d.unlocked.includes(d.skin)) d.skin = DEFAULT_SKIN;
    this.nextGoal = this.nextReward?.goal ?? Infinity;
    this.applySkin();
  }

  /** Unlock every skin whose distance goal this run just reached. */
  private checkGoals(): void {
    const d = this.save.data;
    for (const skin of newlyUnlocked(this.distance, d.unlocked)) {
      d.unlocked.push(skin.id);
      d.maxDist = Math.max(d.maxDist, skin.goal);
      this.unlockedNow.push(skin);
      this.audio.sfx('record');
      this.onUnlock?.(skin);
    }
    this.nextGoal = this.nextReward?.goal ?? Infinity;
    this.save.flush(); // don't lose the reward if the tab is closed mid-run
  }

  get best(): number {
    return this.save.data.best;
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
    this.generator.reset(this.seedCounter++, this.startAt);
    this.generator.ensureAhead(this.startAt + GEN_AHEAD);
    this.player.reset(this.startAt);
    this.player.speed = speedAt(0);
    this.difficulty = 0;
    this.distance = this.coins = this.score = 0;
    this.deadTime = 0;
    this.newRecord = false;
    this.fx.clear();
    this.view.reset();
    this.shake = this.flash = 0;
  }

  private setState(next: GameState): void {
    this.state = next;
    this.audio.setMusicMode(next === 'dead' ? 'off' : next === 'paused' ? 'duck' : 'on');
    this.onState?.();
  }

  private beginRun(): void {
    this.bestAtStart = this.save.data.best;
    this.unlockedNow.length = 0;
    this.save.data.attempts++;
    this.setState('playing');
  }

  /** Start a new run right away (from the menu or after dying). */
  play(): void {
    if (this.state !== 'menu' && this.state !== 'dead') return;
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
    if (this.state === 'dead' && this.deadTime > RETRY_DELAY) this.play();
  }

  togglePause(): void {
    if (this.state === 'playing') this.pause();
    else if (this.state === 'paused') this.resume();
  }

  /** Back to the main menu; an abandoned run still banks its coins and score. */
  toMenu(): void {
    if (this.state === 'paused' || this.state === 'countdown') this.commitRun();
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
        if (this.countdown <= 0) this.setState('playing');
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
      if (pressed) this.play();
      return;
    }
    if (this.state === 'dead') {
      this.deadTime += dt;
      if (pressed && this.deadTime > RETRY_DELAY) this.play();
      return;
    }

    const p = this.player;
    this.difficulty = difficultyAt(p.x);
    p.speed = speedAt(this.difficulty);
    this.audio.intensity = this.difficulty;
    p.step(dt, pressed, held, this.world);
    this.playEffects(p);
    this.collectCoins();
    this.distance = Math.max(0, Math.floor(p.x));
    this.score = this.distance + this.coins * COIN_VALUE;
    this.checkRecord();
    if (this.distance >= this.nextGoal) this.checkGoals();
    this.generator.ensureAhead(p.x + GEN_AHEAD);
    this.world.prune(p.x - KEEP_BEHIND);
    if (p.dead) this.die();
  }

  /** Turn this step's physics events into particles and character animation. */
  private playEffects(p: Player): void {
    if (p.jumped) {
      this.audio.sfx('jump');
      this.fx.jump(p.x, p.y);
      this.view.jump();
    }
    if (p.landed) {
      this.audio.sfx('land', p.landSpeed / 20);
      this.fx.land(p.x, p.y, p.landSpeed);
      this.view.land(p.landSpeed);
    }
    if (!p.grounded && ++this.trailTick % 5 === 0) this.fx.trail(p.x - 0.2, p.y + 0.4);
  }

  private collectCoins(): void {
    const p = this.player;
    for (let guard = 0; guard < 4; guard++) {
      const c = this.world.overlap(p.x - 0.4, p.y, p.x + 0.4, p.y + 0.8, COIN);
      if (!c) return;
      c.taken = true;
      this.coins++;
      this.audio.coin();
      this.fx.coin((c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2);
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
    d.maxDist = Math.max(d.maxDist, this.distance);
    if (this.score > d.best) {
      d.best = this.score;
      d.bestDist = this.distance;
    }
    this.save.flush();
  }
}
