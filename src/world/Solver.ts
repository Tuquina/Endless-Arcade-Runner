import { STEP } from '../core/Loop';
import { HOLD_MAX } from '../physics/constants';
import { Player } from '../physics/Player';
import type { World } from './World';

/** Button-hold durations (s) tried for each jump: from a tap to a full-height hold. */
const HOLDS = [0, 0.05, 0.1, 0.15, HOLD_MAX];
const MAX_AIR_STEPS = 400;

export interface SolveResult {
  ok: boolean;
  /** Furthest x any survivable route reached (useful to locate an impossible spot). */
  furthest: number;
}

/**
 * Exhaustive search for a way through the level using the real Player physics. States are
 * ground/coyote positions; moves are "keep running one step" or "jump with hold time h".
 * `margin` inflates the hitbox so only routes with some timing slack count as solutions.
 */
export function solve(
  world: World,
  startX: number,
  endX: number,
  speedAt: (x: number) => number,
  margin = 0.15,
  holds: readonly number[] = HOLDS,
): SolveResult {
  const start = new Player();
  start.reset(startX);
  start.margin = margin;
  start.speed = speedAt(startX);
  return solveFrom(world, start, endX, speedAt, holds);
}

/** Same search, starting from an arbitrary (alive) player state, which is not modified. */
export function solveFrom(
  world: World,
  from: Player,
  endX: number,
  speedAt: (x: number) => number,
  holds: readonly number[] = HOLDS,
): SolveResult {
  const visited = new Set<number>();
  const stack: Player[] = [];
  let furthest = from.x;

  const start = new Player();
  start.copyFrom(from);
  stack.push(start);

  // Positions are bucketed at 0.005 tiles, far finer than one step (~0.06–0.11 tiles), so only states
  // that are genuinely identical share a key; coarser buckets let a lucky/unlucky sub-step alignment
  // decide a whole bucket and made results depend on where the search happened to start.
  const key = (p: Player): number =>
    (Math.round(p.x * 200) * 128 + Math.round(p.y * 8) + 32) * 16 + Math.round(p.coyoteLeft * 100);

  while (stack.length) {
    const s = stack.pop()!;
    const k = key(s);
    if (visited.has(k)) continue;
    visited.add(k);
    if (s.x > furthest) furthest = s.x;
    if (s.x >= endX) return { ok: true, furthest: s.x };

    // Option A: jump now, holding for each candidate duration.
    if (s.canJump) {
      for (const hold of holds) {
        const c = new Player();
        c.copyFrom(s);
        if (flyUntilLanding(c, world, hold, endX, speedAt)) stack.push(c);
      }
    }

    // Option B: keep running without pressing.
    const w = new Player();
    w.copyFrom(s);
    w.speed = speedAt(w.x);
    w.step(STEP, false, false, world);
    if (w.dead) continue;
    if (w.x >= endX) return { ok: true, furthest: w.x };
    if (w.canJump) {
      stack.push(w);
    } else if (fall(w, world, endX, speedAt)) {
      stack.push(w);
    }
  }
  return { ok: false, furthest };
}

/** Jump from `s` with a given hold time; returns the player once landed, or null if it dies/never lands. */
export function tryJump(s: Player, world: World, hold: number, endX: number, speedAt: (x: number) => number): Player | null {
  const c = new Player();
  c.copyFrom(s);
  return flyUntilLanding(c, world, hold, endX, speedAt) ? c : null;
}

export { HOLDS };

/** Jump from `c`, hold for `hold` seconds, then coast until it lands. false if it dies. */
function flyUntilLanding(c: Player, world: World, hold: number, endX: number, speedAt: (x: number) => number): boolean {
  const holdSteps = Math.ceil(hold / STEP);
  for (let i = 0; i < MAX_AIR_STEPS; i++) {
    c.speed = speedAt(c.x);
    c.step(STEP, i === 0, i < Math.max(1, holdSteps), world);
    if (c.dead) return false;
    if (c.x >= endX) return true;
    if (i > 1 && c.grounded) return true;
  }
  return false;
}

/** Coast (no input) until grounded. */
export function fall(c: Player, world: World, endX: number, speedAt: (x: number) => number): boolean {
  for (let i = 0; i < MAX_AIR_STEPS; i++) {
    c.speed = speedAt(c.x);
    c.step(STEP, false, false, world);
    if (c.dead) return false;
    if (c.x >= endX || c.grounded) return true;
  }
  return false;
}
