import { Input } from '../input/Input';
import { Player } from '../physics/Player';
import { Save } from '../storage/Save';
import { difficultyAt, speedAt } from '../world/Difficulty';
import { Generator } from '../world/Generator';
import { COIN } from '../world/Rect';
import { World } from '../world/World';
import { Loop } from './Loop';
import { Renderer } from '../render/Renderer';

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
  /** Seconds left in the resume countdown. */
  countdown = 0;
  /** UI hooks: called when the state changes, and once per rendered frame. */
  onState: (() => void) | null = null;
  onFrame: (() => void) | null = null;

  private readonly generator = new Generator(this.world);
  private readonly input: Input;
  private readonly renderer: Renderer;
  private readonly loop: Loop;
  private readonly poll = { pressed: false, held: false };
  private deadTime = 0;
  private fps = 60;
  private seedCounter: number;

  constructor(canvas: HTMLCanvasElement) {
    const params = new URLSearchParams(location.search);
    this.debug = params.has('debug');
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
    this.resetRun();
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
    this.generator.reset(this.seedCounter++);
    this.generator.ensureAhead(GEN_AHEAD);
    this.player.reset(0);
    this.player.speed = speedAt(0);
    this.difficulty = 0;
    this.distance = this.coins = this.score = 0;
    this.deadTime = 0;
    this.newRecord = false;
  }

  private setState(next: GameState): void {
    this.state = next;
    this.onState?.();
  }

  private beginRun(): void {
    this.bestAtStart = this.save.data.best;
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

    if (this.state === 'menu') {
      if (pressed) this.play();
      return;
    }
    if (this.state === 'paused') return;
    if (this.state === 'countdown') {
      this.countdown -= dt;
      if (this.countdown <= 0) this.setState('playing');
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
    p.step(dt, pressed, held, this.world);
    this.collectCoins();
    this.distance = Math.max(0, Math.floor(p.x));
    this.score = this.distance + this.coins * COIN_VALUE;
    this.checkRecord();
    this.generator.ensureAhead(p.x + GEN_AHEAD);
    this.world.prune(p.x - KEEP_BEHIND);
    if (p.dead) this.die();
  }

  private collectCoins(): void {
    const p = this.player;
    for (let guard = 0; guard < 4; guard++) {
      const c = this.world.overlap(p.x - 0.4, p.y, p.x + 0.4, p.y + 0.8, COIN);
      if (!c) return;
      c.taken = true;
      this.coins++;
    }
  }

  private checkRecord(): void {
    if (!this.newRecord && this.bestAtStart > 0 && this.score > this.bestAtStart) {
      this.newRecord = true;
      this.celebrate = true;
    }
  }

  private die(): void {
    this.deadTime = 0;
    this.commitRun();
    this.setState('dead');
  }

  /** Bank this run's coins and best score, and persist. */
  private commitRun(): void {
    const d = this.save.data;
    d.coins += this.coins;
    if (this.score > d.best) {
      d.best = this.score;
      d.bestDist = this.distance;
    }
    this.save.flush();
  }
}
