import type { Rng } from '../../core/Rng';
import type { Mechanic } from '../Difficulty';
import type { SegmentBuilder } from '../SegmentBuilder';

/**
 * A reusable chunk of level. `build` lays out obstacles (small random variations allowed, scaled
 * by difficulty `d`) and must set `b.width`. Every prefab is verified solvable by the solver
 * tests across its whole [minD, maxD] range, so authors can't ship an impossible one.
 */
export interface Prefab {
  id: string;
  mechanic: Mechanic;
  /** Difficulty window in which this prefab may be picked. */
  minD: number;
  maxD: number;
  build(b: SegmentBuilder, r: Rng, d: number): void;
}
