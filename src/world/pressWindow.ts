import { Rng } from '../core/Rng';
import { reactionTime, speedAt } from './Difficulty';
import { SegmentBuilder } from './SegmentBuilder';
import type { Prefab } from './segments/types';
import { HOLDS, solveFrom } from './Solver';
import { bucketD, bucketOf, provenVariants, variantSeed } from './variants';
import { criticalWindowMs, type Cluster } from './windows';
import { World } from './World';

/**
 * The narrowest decisive jump window (ms) of a prefab at difficulty `d`, measured with the real
 * physics and the true hitbox (no margin). Random-timing prefabs are taken from their proven
 * variants (the `seed`-th one). Infinity if nothing in the prefab needs timing.
 * Shared by the fairness tests and by tuning scripts; see windows.ts for what "decisive" means.
 */
export function pressWindow(prefab: Prefab, d: number, seed: number, detail?: (cluster: Cluster, ms: number) => void): number {
  const speed = speedAt(d);
  const world = new World(512);
  const gap = speed * reactionTime(d);
  world.appendFlat(gap + 4);
  const startX = world.cursor - gap;
  const b = new SegmentBuilder();
  b.begin(world);
  if (prefab.validate) {
    const bucket = bucketOf(d);
    const list = provenVariants(prefab.id, bucket);
    prefab.build(b, new Rng(variantSeed(prefab.id, list[seed % list.length]![0])), bucketD(bucket));
  } else {
    prefab.build(b, new Rng(seed), d);
  }
  b.commit();
  const end = world.cursor;
  world.appendFlat(gap + 4);
  return criticalWindowMs(world, startX, end + 1, speed, 0, HOLDS, (l) => solveFrom(world, l, end + 1, () => speed).ok, detail);
}
