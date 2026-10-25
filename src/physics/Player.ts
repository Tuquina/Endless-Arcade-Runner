import {
  COYOTE_TIME,
  DEATH_Y,
  FALL_MULTIPLIER,
  GRAVITY,
  HOLD_GRAVITY_SCALE,
  HOLD_MAX,
  JUMP_BUFFER,
  JUMP_VELOCITY,
  PAD_VELOCITY,
  RING_VELOCITY,
  PLAYER_HALF_WIDTH,
  PLAYER_HEIGHT,
  STEP_UP,
  TERMINAL_VELOCITY,
} from './constants';
import { HAZARD, PAD, RING, SOLID } from '../world/Rect';
import type { World } from '../world/World';

/**
 * The runner. Position is the horizontal centre (x) and the feet (y), in tiles, y up.
 * `step` is deterministic and allocation-free; the level solver relies on both properties.
 */
export class Player {
  x = 0;
  y = 0;
  vy = 0;
  speed = 0;
  grounded = true;
  dead = false;
  /** Extra hitbox slack used by the solver to demand solutions with some timing margin. */
  margin = 0;

  // Interpolation snapshot for rendering.
  prevX = 0;
  prevY = 0;

  // Per-step events (reset at the start of every step) for particles/audio.
  jumped = false;
  landed = false;
  /** Vertical speed just before landing, for squash intensity. */
  landSpeed = 0;

  private coyote = COYOTE_TIME;
  private buffer = 0;
  private holdT = 0;
  private jumping = false;
  /** Left edge of the last ring used, so holding a press inside one ring cannot fire it twice. */
  private lastRing = NaN;

  reset(x = 0, y = 0): void {
    this.x = this.prevX = x;
    this.y = this.prevY = y;
    this.vy = 0;
    this.grounded = true;
    this.dead = false;
    this.coyote = COYOTE_TIME;
    this.buffer = 0;
    this.holdT = 0;
    this.jumping = false;
    this.lastRing = NaN;
    this.jumped = this.landed = false;
  }

  copyFrom(o: Player): void {
    this.x = o.x;
    this.y = o.y;
    this.vy = o.vy;
    this.speed = o.speed;
    this.grounded = o.grounded;
    this.dead = o.dead;
    this.margin = o.margin;
    this.coyote = o.coyote;
    this.buffer = o.buffer;
    this.holdT = o.holdT;
    this.jumping = o.jumping;
    this.lastRing = o.lastRing;
  }

  /** True while a jump is still allowed (on ground, or within coyote time). */
  get canJump(): boolean {
    return this.coyote > 0;
  }

  /** Remaining coyote time, quantised for solver state keys. */
  get coyoteLeft(): number {
    return this.coyote;
  }

  /**
   * Advance one fixed step.
   * @param pressed true on the step in which the button went down (edge)
   * @param held true while the button is down
   */
  step(dt: number, pressed: boolean, held: boolean, world: World): void {
    if (this.dead) return;
    this.prevX = this.x;
    this.prevY = this.y;
    this.jumped = this.landed = false;

    this.buffer = pressed ? JUMP_BUFFER : Math.max(0, this.buffer - dt);

    // --- Horizontal: constant auto-run; side hits on solids kill unless it's a tiny ledge. ---
    this.x += this.speed * dt;
    const hw = PLAYER_HALF_WIDTH + this.margin;
    const h = PLAYER_HEIGHT + this.margin;
    for (let guard = 0; guard < 4; guard++) {
      const r = world.overlap(this.x - hw, this.y, this.x + hw, this.y + h, SOLID);
      if (!r) break;
      if (r.y1 - this.y <= STEP_UP) {
        this.y = r.y1;
        if (this.vy < 0) this.vy = 0;
      } else {
        this.dead = true;
        return;
      }
    }

    // --- Jump (with jump buffer + coyote time). ---
    if (this.buffer > 0 && this.coyote > 0) {
      this.vy = JUMP_VELOCITY;
      this.jumping = true;
      this.holdT = 0;
      this.grounded = false;
      this.coyote = 0;
      this.buffer = 0;
      this.jumped = true;
    } else if (world.special && this.buffer > 0) {
      // Rhythm rings: a press while touching one jumps again in mid-air (each ring works once).
      const ring = world.overlap(this.x - hw, this.y, this.x + hw, this.y + h, RING);
      if (ring && ring.x0 !== this.lastRing) {
        this.lastRing = ring.x0;
        // Fixed height (holding does not raise it), so a chain of rings always follows the same arc.
        this.vy = RING_VELOCITY;
        this.jumping = false;
        this.holdT = 0;
        this.buffer = 0;
        this.jumped = true;
      }
    }
    // Rhythm pads: running onto one launches the runner without a press.
    if (world.special && this.vy <= 0 && world.overlap(this.x - hw, this.y, this.x + hw, this.y + h, PAD)) {
      this.vy = PAD_VELOCITY;
      this.jumping = false;
      this.grounded = false;
      this.coyote = 0;
      this.buffer = 0;
      this.jumped = true;
    }

    // --- Vertical: variable-height jump via reduced gravity while the button is held. ---
    let g: number;
    if (this.vy > 0 && this.jumping && held && this.holdT < HOLD_MAX) {
      g = GRAVITY * HOLD_GRAVITY_SCALE;
      this.holdT += dt;
    } else {
      this.jumping = false;
      g = this.vy < 0 ? GRAVITY * FALL_MULTIPLIER : GRAVITY;
    }
    const wasGrounded = this.grounded;
    const impact = this.vy;
    this.vy = Math.max(this.vy - g * dt, -TERMINAL_VELOCITY);
    this.y += this.vy * dt;
    this.grounded = false;

    const r = world.overlap(this.x - hw, this.y, this.x + hw, this.y + h, SOLID);
    if (r) {
      if (this.vy <= 0) {
        this.y = r.y1;
        this.grounded = true;
        this.vy = 0;
        if (!wasGrounded) {
          this.landed = true;
          this.landSpeed = -impact;
        }
      } else {
        this.y = r.y0 - h;
        this.vy = 0;
        this.jumping = false;
      }
    }

    this.coyote = this.grounded ? COYOTE_TIME : Math.max(0, this.coyote - dt);

    if (this.y < DEATH_Y || world.overlap(this.x - hw, this.y, this.x + hw, this.y + h, HAZARD, this.x)) {
      this.dead = true;
    }
  }
}
