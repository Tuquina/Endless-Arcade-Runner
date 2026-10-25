import { STEP } from '../core/Loop';
import { Player } from '../physics/Player';
import { HAZARD, SOLID } from './Rect';
import { fall, tryJump } from './Solver';
import type { Rect } from './Rect';
import type { World } from './World';

/** Obstacles closer than this belong to the same cluster (they are jumped as one). */
const CLUSTER_GAP = 1.5;
/**
 * A jump counts only if the runner lands with its centre at least this far past the start of the
 * cluster: on top of a block or platform, in the middle of a pit, or beyond it. Landing earlier
 * is a hop that never got near the obstacle (0.4 is the runner's half width).
 */
const LAND_PAST_START = 0.45;

export interface Cluster {
  /** Horizontal extent of the obstacle(s), in tiles. */
  a: number;
  b: number;
}

/**
 * Groups the obstacles of a stretch of level into clusters: hazards, blocks, platforms, movers and
 * pits. Adjacent spikes or a staircase of blocks form one cluster, because the runner jumps them
 * in one go.
 */
export function obstacleClusters(world: World, from: number, to: number): Cluster[] {
  const rects: Rect[] = [];
  world.collect(from, to, rects);
  const spans: Cluster[] = [];
  const slabs: Rect[] = [];
  for (const r of rects) {
    if (r.y0 <= -1 && r.kind === SOLID) slabs.push(r);
    else if (r.kind === HAZARD || r.kind === SOLID) spans.push({ a: r.x0, b: r.x1 });
  }
  slabs.sort((p, q) => p.x0 - q.x0);
  for (let i = 0; i + 1 < slabs.length; i++) {
    if (slabs[i + 1]!.x0 - slabs[i]!.x1 > 0.01) spans.push({ a: slabs[i]!.x1, b: slabs[i + 1]!.x0 }); // a pit
  }
  spans.sort((p, q) => p.a - q.a);
  const out: Cluster[] = [];
  for (const s of spans) {
    const last = out[out.length - 1];
    if (last && s.a - last.b < CLUSTER_GAP) last.b = Math.max(last.b, s.b);
    else out.push({ a: s.a, b: s.b });
  }
  return out.filter((c) => c.b > from && c.a < to);
}

/**
 * The narrowest *decisive* jump window of a stretch of level, in ms. For every obstacle cluster
 * that cannot simply be run through, it measures how long a stretch of take-off moments lets the
 * runner clear the cluster (take off before it, land on or beyond it) and still finish the level, for the
 * best way of holding the button. A harmless hop that lands before the obstacle proves nothing and
 * is not counted; that mistake once made three spikes look easy when they needed a nearly
 * pixel-exact press. Infinity means no cluster needs timing.
 *
 * `finish` says whether the level can still be completed from a landing state.
 */
export function criticalWindowMs(
  world: World,
  startX: number,
  endX: number,
  speed: number,
  margin: number,
  holds: readonly number[],
  finish: (landed: Player) => boolean,
  /** Optional hook with each cluster's own window (for tuning). */
  detail?: (cluster: Cluster, ms: number) => void,
): number {
  const sp = (): number => speed;
  let narrowest = Infinity;
  let prevB = startX;
  for (const { a, b } of obstacleClusters(world, startX, endX)) {
    const from = Math.max(startX, prevB + 0.5, a - 10); // 0.5 = player half width + a little air
    prevB = b;
    const p = new Player();
    p.reset(from);
    p.margin = margin;
    p.speed = speed;

    // Running straight through needs no timing at all.
    const walker = new Player();
    walker.copyFrom(p);
    while (!walker.dead && walker.x < b + 1) walker.step(STEP, false, false, world);
    if (!walker.dead) continue;

    const best = holds.map(() => 0);
    const run = holds.map(() => 0);
    while (!p.dead && p.x < b) {
      if (p.canJump) {
        for (let i = 0; i < holds.length; i++) {
          const l = tryJump(p, world, holds[i]!, endX, sp);
          if (l && l.x >= a + LAND_PAST_START && finish(l)) {
            run[i]!++;
            if (run[i]! > best[i]!) best[i] = run[i]!;
          } else run[i] = 0;
        }
      }
      p.step(STEP, false, false, world);
    }
    const ms = Math.max(...best) * STEP * 1000;
    detail?.({ a, b }, ms);
    narrowest = Math.min(narrowest, ms);
  }
  return narrowest;
}

export interface Analysis {
  /** Every grounded position from the start up to `leadEnd` can still finish (arrival state doesn't matter). */
  allStartsOk: boolean;
  /** Simply running through (never pressing) survives. */
  walkFinish: boolean;
  /** Narrowest decisive jump window (ms) over the obstacle clusters that need one; see windows.ts. */
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
  while (!p.dead && p.x < endX) {
    if (p.canJump && p.x <= leadEnd && !canFinish(p)) allStartsOk = false;
    p.step(STEP, false, false, world);
  }
  const windowMs = walkFinish ? Infinity : criticalWindowMs(world, startX, endX, speed, margin, holds, canFinish);
  return { allStartsOk, walkFinish, windowMs };
}
