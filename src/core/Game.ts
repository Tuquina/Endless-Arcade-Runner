import { Input } from '../input/Input';
import { Player } from '../physics/Player';
import { difficultyAt, speedAt } from '../world/Difficulty';
import { Generator } from '../world/Generator';
import { World } from '../world/World';
import { Loop } from './Loop';
import { Renderer } from '../render/Renderer';

export type GameState = 'ready' | 'playing' | 'dead';

/** How far ahead of the player geometry is generated, and how far behind it is kept (tiles). */
const GEN_AHEAD = 60;
const KEEP_BEHIND = 20;
/** Ignore taps this long after dying so a panicked double-tap doesn't skip the result. */
const RETRY_DELAY = 0.2;

/** Owns the simulation and wires input → physics → world → renderer. */
export class Game {
  state: GameState = 'ready';
  readonly player = new Player();
  readonly world = new World(256);
  difficulty = 0;
  score = 0;
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
        this.renderer.render(this, alpha, this.fps);
      },
    );
    this.restart();
    this.state = 'ready';
  }

  start(): void {
    this.loop.start();
  }

  /** Reset the run with a fresh layout. Cheap enough to feel instant. */
  restart(): void {
    this.generator.reset(this.seedCounter++);
    this.generator.ensureAhead(GEN_AHEAD);
    this.player.reset(0);
    this.player.speed = speedAt(0);
    this.difficulty = 0;
    this.score = 0;
    this.deadTime = 0;
    this.state = 'playing';
  }

  private update(dt: number): void {
    this.input.poll(this.poll);
    const { pressed, held } = this.poll;

    if (this.state === 'ready') {
      if (pressed) this.state = 'playing';
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
    this.score = Math.max(0, Math.floor(p.x));
    this.generator.ensureAhead(p.x + GEN_AHEAD);
    this.world.prune(p.x - KEEP_BEHIND);
    if (p.dead) this.state = 'dead';
  }
}
