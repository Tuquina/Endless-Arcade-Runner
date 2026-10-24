import { Input } from '../input/Input';
import { Player } from '../physics/Player';
import { Save } from '../storage/Save';
import { difficultyAt, speedAt } from '../world/Difficulty';
import { Generator } from '../world/Generator';
import { COIN } from '../world/Rect';
import { World } from '../world/World';
import { Loop } from './Loop';
import { Renderer } from '../render/Renderer';

export type GameState = 'ready' | 'playing' | 'dead';

/** How far ahead of the player geometry is generated, and how far behind it is kept (tiles). */
const GEN_AHEAD = 60;
const KEEP_BEHIND = 20;
/** Ignore taps this long after dying so a panicked double-tap doesn't skip the result. */
const RETRY_DELAY = 0.2;
/** Score awarded per coin, on top of metres travelled. */
export const COIN_VALUE = 10;
/** Difficulty is shown to the player as a level from 1 to this value. */
export const MAX_LEVEL = 10;

/** Owns the simulation and wires input → physics → world → renderer. */
export class Game {
  state: GameState = 'ready';
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
      },
    );
    // Persist coins/attempts if the tab is closed mid-run.
    window.addEventListener('pagehide', () => this.save.flush());
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
    this.state = 'ready';
  }

  private beginRun(): void {
    this.bestAtStart = this.save.data.best;
    this.save.data.attempts++;
    this.state = 'playing';
  }

  /** Reset and start immediately (retry after dying: no extra tap needed). */
  restart(): void {
    this.resetRun();
    this.beginRun();
  }

  private update(dt: number): void {
    this.input.poll(this.poll);
    const { pressed, held } = this.poll;

    if (this.state === 'ready') {
      if (pressed) this.beginRun();
      return;
    }
    if (this.state === 'dead') {
      this.deadTime += dt;
      if (pressed && this.deadTime > RETRY_DELAY) this.restart();
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
    this.state = 'dead';
    this.deadTime = 0;
    const d = this.save.data;
    d.coins += this.coins;
    if (this.score > d.best) {
      d.best = this.score;
      d.bestDist = this.distance;
    }
    this.save.flush();
  }
}
