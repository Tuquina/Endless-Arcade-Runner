/** Fixed physics step (seconds). 120 Hz keeps jump timing finer than one display frame. */
export const STEP = 1 / 120;
/** Never simulate more than this many steps per rendered frame (avoids the "spiral of death"). */
const MAX_STEPS_PER_FRAME = 6;

/**
 * requestAnimationFrame loop with a fixed-step accumulator.
 * `update` runs at exactly STEP; `render` runs once per frame with the interpolation factor
 * (0..1) between the previous and the current simulation state.
 */
export class Loop {
  private raf = 0;
  private last = 0;
  private acc = 0;
  private running = false;

  constructor(
    private readonly update: (dt: number) => void,
    private readonly render: (alpha: number, frameDt: number) => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = 0;
    this.acc = 0;
    this.raf = requestAnimationFrame(this.frame);
  }

  /**
   * Move the simulation clock by `seconds` relative to the frame clock (positive: catch up with extra
   * steps on the next frames; negative: hold back). Used to stay locked to the music in rhythm mode.
   */
  shift(seconds: number): void {
    this.acc = Math.max(-0.1, this.acc + seconds);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private frame = (now: number): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);
    if (this.last === 0) this.last = now;
    // Clamp so returning from a background tab doesn't fast-forward the game.
    const frameDt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    this.acc += frameDt;

    let steps = 0;
    while (this.acc >= STEP && steps < MAX_STEPS_PER_FRAME) {
      this.update(STEP);
      this.acc -= STEP;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) this.acc = 0;
    this.render(Math.max(0, this.acc) / STEP, frameDt);
  };
}
