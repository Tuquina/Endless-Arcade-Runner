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
function fall(c: Player, world: World, endX: number, speedAt: (x: number) => number): boolean {
  for (let i = 0; i < MAX_AIR_STEPS; i++) {
    c.speed = speedAt(c.x);
    c.step(STEP, false, false, world);
    if (c.dead) return false;
    if (c.x >= endX || c.grounded) return true;
  }
  return false;
}

export interface Analysis {
  /** Every grounded position from the start up to `leadEnd` can still finish (arrival state doesn't matter). */
  allStartsOk: boolean;
  /** Simply running through (never pressing) survives. */
  walkFinish: boolean;
  /** Longest contiguous stretch (ms) in which pressing jump still leads to a finished segment. */
  windowMs: number;
}

/**
 * Exhaustive analysis of one segment with the real physics, memoised so the whole state graph is
 * explored once. It answers the questions the generator needs before it trusts a variant that has
 * random timing: can the runner finish from *wherever* it lands in the lead-in, and how wide is the
 * moment in which a jump works (the same "press window" the fairness tests measure)?
 */
export function analyze(
  world: World,
  startX: number,
  leadEnd: number,
  endX: number,
  speed: number,
  margin: number,
  holds: readonly number[],
): Analysis {
  const memo = new Map<number, boolean>();
  const sp = (): number => speed;
  // With a constant speed, x is exactly startX + n * speed * STEP, so the step index n identifies a
  // position with no rounding at all.
  const stepLen = speed * STEP;
  const key = (p: Player): number =>
    (Math.round((p.x - startX) / stepLen) * 128 + Math.round(p.y * 8) + 32) * 16 + Math.round(p.coyoteLeft * 100);

  const canFinish = (s: Player): boolean => {
    if (s.x >= endX) return true;
    const k = key(s);
    const hit = memo.get(k);
    if (hit !== undefined) return hit;
    memo.set(k, false);
    let ok = false;
    const w = new Player();
    w.copyFrom(s);
    w.speed = speed;
    w.step(STEP, false, false, world);
    if (!w.dead) {
      if (w.x >= endX) ok = true;
      else if (w.canJump) ok = canFinish(w);
      else if (fall(w, world, endX, sp)) ok = canFinish(w);
    }
    if (!ok && s.canJump) {
      for (const h of holds) {
        const l = tryJump(s, world, h, endX, sp);
        if (l && canFinish(l)) {
          ok = true;
          break;
        }
      }
    }
    memo.set(k, ok);
    return ok;
  };

  const p = new Player();
  p.reset(startX);
  p.margin = margin;
  p.speed = speed;

  const walker = new Player();
  walker.copyFrom(p);
  while (!walker.dead && walker.x < endX) walker.step(STEP, false, false, world);
  const walkFinish = !walker.dead;

  let allStartsOk = true;
  let best = 0;
  let run = 0;
  while (!p.dead && p.x < endX) {
    if (p.canJump) {
      if (p.x <= leadEnd && !canFinish(p)) allStartsOk = false;
      let jumpOk = false;
      for (const h of holds) {
        const l = tryJump(p, world, h, endX, sp);
        if (l && canFinish(l)) {
          jumpOk = true;
          break;
        }
      }
      if (jumpOk) {
        run++;
        best = Math.max(best, run);
      } else run = 0;
    }
    p.step(STEP, false, false, world);
  }
  return { allStartsOk, walkFinish, windowMs: best * STEP * 1000 };
}
