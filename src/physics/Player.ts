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
  BALL_KICK,
  FLIP_KICK,
  SHIP_ACCEL,
  SHIP_MAX_SPEED,
  DEATH_TOP,
  PLAYER_HALF_WIDTH,
  PLAYER_HEIGHT,
  STEP_UP,
  TERMINAL_VELOCITY,
} from './constants';
import { HAZARD, PAD, PORTAL_BALL, PORTAL_CUBE, PORTAL_GRAVITY_DOWN, PORTAL_GRAVITY_UP, PORTAL_SHIP, RING, RING_FLIP, SOLID, TRIGGER } from '../world/Rect';

/** How the button acts: jump (cube), flip gravity on a surface (ball), or fly while held (ship). */
export type Form = 'cube' | 'ball' | 'ship';
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
  /** Same for portals. */
  private lastTrigger = NaN;
  /** Direction of "up": 1 normally, -1 with flipped gravity (gravity mode only). */
  g = 1;
  form: Form = 'cube';

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
    this.lastTrigger = NaN;
    this.g = 1;
    this.form = 'cube';
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
    this.lastTrigger = o.lastTrigger;
    this.g = o.g;
    this.form = o.form;
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
    // `g` is the direction of "up": +1 normally, -1 when gravity is flipped (the ceiling is the floor).
    // Every vertical rule below is written relative to it, so flipped play is an exact mirror.
    const g = this.g;

    this.buffer = pressed ? JUMP_BUFFER : Math.max(0, this.buffer - dt);

    // --- Horizontal: constant auto-run; side hits on solids kill unless it's a tiny ledge. ---
    this.x += this.speed * dt;
    const hw = PLAYER_HALF_WIDTH + this.margin;
    const h = PLAYER_HEIGHT + this.margin;
    for (let guard = 0; guard < 4; guard++) {
      const r = world.overlap(this.x - hw, this.y, this.x + hw, this.y + h, SOLID);
      if (!r) break;
      if (g > 0 ? r.y1 - this.y <= STEP_UP : this.y + h - r.y0 <= STEP_UP) {
        this.y = g > 0 ? r.y1 : r.y0 - h;
        if (this.vy * g < 0) this.vy = 0;
      } else {
        this.dead = true;
        return;
      }
    }

    if (world.special) this.touchSpecials(world, hw, h);

    // --- The button: jump (cube), flip gravity (ball); the ship reads `held` below. ---
    if (this.form !== 'ship' && this.buffer > 0 && this.coyote > 0) {
      if (this.form === 'ball') {
        this.g = -g;
        this.vy = -this.g * BALL_KICK;
        this.jumping = false;
      } else {
        this.vy = JUMP_VELOCITY * g;
        this.jumping = true;
        this.holdT = 0;
      }
      this.grounded = false;
      this.coyote = 0;
      this.buffer = 0;
      this.jumped = true;
    } else if (world.special && this.buffer > 0) {
      // Rings: a press while touching one jumps again in mid-air (each ring works once).
      const ring = world.overlap(this.x - hw, this.y, this.x + hw, this.y + h, RING);
      if (ring && ring.x0 !== this.lastRing) {
        this.lastRing = ring.x0;
        if (ring.code === RING_FLIP) {
          // Blue ring: gravity flips and the runner is nudged towards its new floor.
          this.g = -this.g;
          this.vy = -this.g * FLIP_KICK;
        } else {
          // Fixed height (holding does not raise it), so a chain of rings always follows the same arc.
          this.vy = RING_VELOCITY * this.g;
        }
        this.jumping = false;
        this.holdT = 0;
        this.buffer = 0;
        this.jumped = true;
      }
    }
    // Pads: running onto one launches the runner without a press.
    if (world.special && this.vy * this.g <= 0 && world.overlap(this.x - hw, this.y, this.x + hw, this.y + h, PAD)) {
      this.vy = PAD_VELOCITY * this.g;
      this.jumping = false;
      this.grounded = false;
      this.coyote = 0;
      this.buffer = 0;
      this.jumped = true;
    }

    // --- Vertical ---
    const up = this.g;
    const wasGrounded = this.grounded;
    const impact = this.vy;
    if (this.form === 'ship') {
      // Flight: holding pushes up, releasing lets it sink, both with a capped speed.
      this.vy += (held ? 1 : -1) * up * SHIP_ACCEL * dt;
      this.vy = Math.max(-SHIP_MAX_SPEED, Math.min(SHIP_MAX_SPEED, this.vy));
      this.jumping = false;
    } else {
      // Variable-height jump via reduced gravity while the button is held.
      const rising = this.vy * up;
      let acc: number;
      if (rising > 0 && this.jumping && held && this.holdT < HOLD_MAX) {
        acc = GRAVITY * HOLD_GRAVITY_SCALE;
        this.holdT += dt;
      } else {
        this.jumping = false;
        acc = rising < 0 ? GRAVITY * FALL_MULTIPLIER : GRAVITY;
      }
      this.vy = up * Math.max(rising - acc * dt, -TERMINAL_VELOCITY);
    }
    this.y += this.vy * dt;
    this.grounded = false;

    const r = world.overlap(this.x - hw, this.y, this.x + hw, this.y + h, SOLID);
    if (r) {
      if (this.vy * up <= 0) {
        this.y = up > 0 ? r.y1 : r.y0 - h;
        this.grounded = true;
        this.vy = 0;
        if (!wasGrounded) {
          this.landed = true;
          this.landSpeed = Math.abs(impact);
        }
      } else {
        this.y = up > 0 ? r.y0 - h : r.y1;
        this.vy = 0;
        this.jumping = false;
      }
    }

    this.coyote = this.grounded ? COYOTE_TIME : Math.max(0, this.coyote - dt);

    if (this.y < DEATH_Y || this.y > DEATH_TOP || world.overlap(this.x - hw, this.y, this.x + hw, this.y + h, HAZARD, this.x)) {
      this.dead = true;
    }
  }

  /** Portals: change gravity or form when the runner passes through one (each portal acts once). */
  private touchSpecials(world: World, hw: number, h: number): void {
    const t = world.overlap(this.x - hw, this.y, this.x + hw, this.y + h, TRIGGER);
    if (!t || t.x0 === this.lastTrigger) return;
    this.lastTrigger = t.x0;
    switch (t.code) {
      case PORTAL_GRAVITY_UP:
        if (this.g !== 1) this.g = 1;
        break;
      case PORTAL_GRAVITY_DOWN:
        if (this.g !== -1) this.g = -1;
        break;
      case PORTAL_CUBE:
        this.form = 'cube';
        break;
      case PORTAL_BALL:
        this.form = 'ball';
        this.jumping = false;
        break;
      case PORTAL_SHIP:
        this.form = 'ship';
        this.jumping = false;
        break;
    }
    if (this.form !== 'ship' && Math.abs(this.vy) > TERMINAL_VELOCITY) this.vy = Math.sign(this.vy) * TERMINAL_VELOCITY;
  }
}
