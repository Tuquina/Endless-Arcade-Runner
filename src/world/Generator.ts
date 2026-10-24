import { Rng } from '../core/Rng';
import { MECHANICS, UNLOCK_DISTANCE, difficultyAt, reactionTime, speedAt, type Mechanic } from './Difficulty';
import { SegmentBuilder } from './SegmentBuilder';
import { PREFABS } from './segments';
import type { Prefab } from './segments/types';
import { COIN, SOLID, HAZARD } from './Rect';
import type { World } from './World';

/** Chance that a segment gets a coin arc, and the coin pickup radius (tiles). */
const COIN_CHANCE = 0.6;
const COIN_R = 0.3;

/** Flat, obstacle-free runway after spawn. */
export const START_RUNWAY = 18;

/**
 * Appends prefab segments to a World on demand, forever. Between segments it always leaves flat
 * ground long enough to react (see reactionTime), and it introduces each new mechanic with its
 * easiest prefab first.
 */
export class Generator {
  private readonly rng = new Rng();
  private readonly builder = new SegmentBuilder();
  private readonly introduced = new Set<Mechanic>();
  private last: Prefab | null = null;

  constructor(private readonly world: World, private readonly prefabs: Prefab[] = PREFABS) {}

  reset(seed: number): void {
    this.rng.seed(seed);
    this.introduced.clear();
    this.last = null;
    this.world.reset();
    this.world.appendFlat(-this.world.cursor + START_RUNWAY);
  }

  /** Make sure geometry exists up to world x = `untilX`. */
  ensureAhead(untilX: number): void {
    while (this.world.cursor < untilX) this.appendNext();
  }

  private appendNext(): void {
    const dist = this.world.cursor;
    const d = difficultyAt(dist);
    const speed = speedAt(d);

    // Flat breather: guaranteed reaction time plus a random extra that fades as difficulty rises.
    this.world.appendFlat(speed * reactionTime(d) + this.rng.range(0, 5 * (1 - d)));

    const prefab = this.choose(dist, d);
    // First appearance of a mechanic uses the prefab's mildest parameters.
    const buildD = this.introducedNow ? prefab.minD : d;
    const segStart = this.world.cursor;
    this.builder.begin(this.world);
    prefab.build(this.builder, this.rng, Math.max(prefab.minD, Math.min(prefab.maxD, buildD)));
    this.builder.commit();
    this.last = prefab;
    if (this.rng.next() < COIN_CHANCE) this.placeCoins(segStart, this.world.cursor);
  }

  /**
   * Optional coin arc over a segment, following the natural jump path (low at the ends, peak
   * ≈ a tap jump). Coins never touch geometry and never affect solvability.
   */
  private placeCoins(start: number, end: number): void {
    const n = Math.max(3, Math.min(8, Math.round(end - start) + 2));
    const x0 = start - 1;
    const span = end - start + 2;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const x = x0 + span * t;
      const y = 0.9 + 0.9 * Math.sin(Math.PI * t);
      const w = this.world;
      if (w.overlap(x - COIN_R, y - COIN_R, x + COIN_R, y + COIN_R, SOLID)) continue;
      if (w.overlap(x - COIN_R, y - COIN_R, x + COIN_R, y + COIN_R, HAZARD)) continue;
      w.add(x - COIN_R, y - COIN_R, x + COIN_R, y + COIN_R, COIN);
    }
  }

  private introducedNow = false;

  private choose(dist: number, d: number): Prefab {
    this.introducedNow = false;
    // Newly unlocked mechanic that hasn't been shown yet → show its easiest prefab.
    for (const m of MECHANICS) {
      if (dist >= UNLOCK_DISTANCE[m] && !this.introduced.has(m)) {
        this.introduced.add(m);
        let easiest: Prefab | null = null;
        for (const p of this.prefabs) {
          if (p.mechanic === m && (!easiest || p.minD < easiest.minD)) easiest = p;
        }
        if (easiest) {
          this.introducedNow = true;
          return easiest;
        }
      }
    }

    let total = 0;
    const eligible: Prefab[] = [];
    for (const p of this.prefabs) {
      if (dist < UNLOCK_DISTANCE[p.mechanic] || d < p.minD || d > p.maxD) continue;
      if (p === this.last && this.prefabs.length > 1) continue;
      eligible.push(p);
      total += 1;
    }
    let pick = this.rng.next() * total;
    for (const p of eligible) {
      pick -= 1;
      if (pick < 0) return p;
    }
    return eligible[0] ?? this.prefabs[0]!;
  }
}
