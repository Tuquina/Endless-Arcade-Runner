/**
 * All gameplay tuning lives here. Units: tiles (1 tile = 1 world unit) and seconds.
 * The world's y axis points UP and the ground surface is y = 0.
 */

/** Gravity while rising without the button held, and base gravity while falling. */
export const GRAVITY = 64;
/** Initial upward speed of a jump. A tap (instant release) reaches V0² / 2G ≈ 1.5 tiles. */
export const JUMP_VELOCITY = 14;
/** While the button is held during the ascent, gravity is scaled by this factor… */
export const HOLD_GRAVITY_SCALE = 0.45;
/** …for at most this many seconds (sets the max jump height ≈ 2.75 tiles). */
export const HOLD_MAX = 0.2;
/** Falling is faster than rising: makes jumps feel snappy and weighty. */
export const FALL_MULTIPLIER = 1.4;
export const TERMINAL_VELOCITY = 30;

/** Seconds after leaving a ledge during which a jump is still allowed. */
export const COYOTE_TIME = 0.09;
/** Seconds a press is remembered before landing. */
export const JUMP_BUFFER = 0.12;

/** Player hitbox (tiles). x is the centre, y is the feet. Smaller than the 1x1 sprite on purpose. */
export const PLAYER_HALF_WIDTH = 0.4;
export const PLAYER_HEIGHT = 0.8;
/** Clipping a block's top edge by less than this snaps the player on top instead of killing. */
export const STEP_UP = 0.2;
/** Falling below this y means the player dropped into a pit. */
export const DEATH_Y = -4;

/**
 * Spike hitbox is a box that fits entirely inside the drawn triangle (the triangle is 0.5 wide at
 * 0.5 high, the box is 0.44 wide), so a hit is always visibly a hit and never a graze. Narrower and
 * lower than the old 0.56 × 0.6 on purpose: a run of three spikes was only passable inside a window
 * of a few milliseconds at low speed.
 */
export const SPIKE_HIT_INSET = 0.28;
export const SPIKE_HIT_HEIGHT = 0.5;

/** Horizontal speed (tiles/s) at difficulty 0 and 1. */
export const SPEED_MIN = 7;
export const SPEED_MAX = 13;
