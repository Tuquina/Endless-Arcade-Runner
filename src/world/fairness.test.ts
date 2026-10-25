import { describe, expect, it } from 'vitest';
import { Rng } from '../core/Rng';
import { STEP } from '../core/Loop';
import { Player } from '../physics/Player';
import { reactionTime, speedAt } from './Difficulty';
import { SegmentBuilder } from './SegmentBuilder';
import { MIN_VARIANTS, bucketD, bucketOf, provenVariants, variantSeed } from './variants';
import { PREFABS } from './segments';
import { HOLDS, solveFrom, tryJump } from './Solver';
import { World } from './World';

/** Longest contiguous run (seconds) of "walk k steps, then jump" that still leads to a finished segment. */
function pressWindow(prefabIdx: number, d: number, seed: number): number {
  const prefab = PREFABS[prefabIdx]!;
  const speed = speedAt(d);
  const world = new World(512);
  const gap = speed * reactionTime(d);
  world.appendFlat(gap + 4);
  const startX = world.cursor - gap;
  const b = new SegmentBuilder();
  const segStart = world.cursor;
  b.begin(world);
  if (prefab.validate) {
    // Random-timing prefabs only exist as proven variants; take the seed-th one at this difficulty.
    const bucket = bucketOf(d);
    const list = provenVariants(prefab.id, bucket);
    prefab.build(b, new Rng(variantSeed(prefab.id, list[seed % list.length]![0])), bucketD(bucket));
  } else {
    prefab.build(b, new Rng(seed), d);
  }
  b.commit();
  const end = world.cursor;
  world.appendFlat(gap + 4);
  const sp = () => speed;
  const p = new Player();
  p.reset(startX);
  p.speed = speed;

  // A segment that can be crossed by simply running needs no timing at all.
  const walker = new Player();
  walker.copyFrom(p);
  while (!walker.dead && walker.x < end + 1) walker.step(STEP, false, false, world);
  if (!walker.dead) return Infinity;

  let best = 0, run = 0;
  for (let k = 0; k < 4000 && p.x < end; k++) {
    let ok = false;
    if (p.canJump) {
      for (const h of HOLDS) {
        const l = tryJump(p, world, h, end + 1, sp);
        if (l && solveFrom(world, l, end + 1, sp).ok) { ok = true; break; }
      }
    }
    if (ok) { run++; best = Math.max(best, run); } else run = 0;
    p.step(STEP, false, false, world);
    if (p.dead) break;
    if (p.x > segStart + 0.1 && !ok && run === 0 && best > 0) break;
  }
  return best * STEP * 1000;
}

/**
 * Human-fairness gate. A person can't press with frame-perfect precision, so for every prefab, at
 * every speed, the range of press moments that still lets the run continue must be wide enough.
 * 150 ms is roughly ±75 ms of tolerance: demanding at top speed, but not a coin flip.
 */
const MIN_WINDOW_MS = 150;

describe('timing windows are human-sized', () => {
  for (let i = 0; i < PREFABS.length; i++) {
    const prefab = PREFABS[i]!;
    it(prefab.id, () => {
      for (const d of [0, 0.5, 1]) {
        if (d < prefab.minD) continue;
        // Random-timing prefabs are simply not used where no variant is proven fair (see variants.test.ts).
        if (prefab.validate && provenVariants(prefab.id, bucketOf(d)).length < MIN_VARIANTS) continue;
        for (let seed = 1; seed <= 6; seed++) {
          const w = pressWindow(i, d, prefab.validate ? seed * 7 : seed); // spread over the variants
          expect(w, `${prefab.id} d=${d} seed=${seed}: only ${w.toFixed(0)} ms to press`).toBeGreaterThanOrEqual(MIN_WINDOW_MS);
        }
      }
    }, 120000);
  }
});
