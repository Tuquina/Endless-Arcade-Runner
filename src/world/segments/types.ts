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
  /** Relative pick frequency (default 1). */
  weight?: number;
  /**
   * Layouts whose fairness depends on random timing (movers, ceilings, gauntlets) are not drawn
   * freely: each is a numbered *variant* (its own seed), and `npm run gen:variants` records which
   * variants are provably fair at each difficulty (see variants.ts). The generator only uses those.
   */
  validate?: boolean;
  /** Reward segment: forces a generous coin arc over it. */
  bonusCoins?: boolean;
  build(b: SegmentBuilder, r: Rng, d: number): void;
}
