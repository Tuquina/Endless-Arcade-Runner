import { Rng } from '../core/Rng';
import {
  MECHANICS,
  DIFFICULTIES,
  difficultyAt,
  focusAt,
  pressureAt,
  reactionTime,
  speedAt,
  unlockAt,
  type DifficultyProfile,
  type Mechanic,
} from './Difficulty';
import { SegmentBuilder } from './SegmentBuilder';
import { PREFABS } from './segments';
import type { Prefab } from './segments/types';
import { COIN, HAZARD, SOLID } from './Rect';
import { MIN_VARIANTS, bucketD, bucketOf, pickVariant, provenVariants, variantSeed } from './variants';
import { WORLD_START, type World } from './World';

/** Chance that a segment gets a coin arc, and the coin pickup radius (tiles). */
const COIN_CHANCE = 0.6;
const COIN_R = 0.3;
/** Segments of the current world's focus mechanics are this many times more likely. */
const FOCUS_BOOST = 2.5;
/** Extra weight of gauntlets as pressure builds. */
const GAUNTLET_PRESSURE_BOOST = 2;

/** Flat, obstacle-free runway after spawn. */
export const START_RUNWAY = 18;

/**
 * Appends prefab segments to a World on demand, forever. Between segments it always leaves flat
 * ground long enough to react (see reactionTime), introduces each new mechanic with its easiest
 * layout first, leans on a different mechanic mix in every world, and keeps tightening once the
 * speed ramp is over (pressure).
 *
 * Layouts with random timing (movers, ceilings, gauntlets) are drawn only from the table of
 * variants proven fair offline (variants.ts); everything else is plain prefab randomness.
 */
export class Generator {
  private readonly rng = new Rng();
  private readonly variantRng = new Rng();
  private readonly builder = new SegmentBuilder();
  private readonly introduced = new Set<Mechanic>();
  private last: Prefab | null = null;
  private introducedNow = false;
  private profile: DifficultyProfile = DIFFICULTIES.normal;

  constructor(private readonly world: World, private readonly prefabs: Prefab[] = PREFABS) {}

  /** Start a new level. `startAt` (metres) is only for debugging: begin the layout further along. */
  reset(seed: number, startAt = 0, profile: DifficultyProfile = DIFFICULTIES.normal): void {
    this.profile = profile;
    this.rng.seed(seed);
    this.introduced.clear();
    this.last = null;
    // Debugging far into a run: skip the "first appearance" ceremony of mechanics already unlocked.
    if (startAt > 0) for (const m of MECHANICS) if (unlockAt(m, profile) <= startAt) this.introduced.add(m);
    this.world.reset(startAt + WORLD_START);
    this.world.appendFlat(START_RUNWAY + 12);
  }

  /** Make sure geometry exists up to world x = `untilX`. */
  ensureAhead(untilX: number): void {
    while (this.world.cursor < untilX) this.appendNext();
  }

  private appendNext(): void {
    const dist = this.world.cursor;
    const pr = this.profile;
    const d = difficultyAt(dist, pr);
    const pressure = pressureAt(dist, pr);
    const speed = speedAt(d);

    // Flat breather: guaranteed reaction time plus a random extra that fades as difficulty rises.
    this.world.appendFlat(speed * reactionTime(d, pressure, pr) + this.rng.range(0, 5 * (1 - d) * (1 - pressure)));

    const prefab = this.choose(dist, d, pressure);
    const segStart = this.world.cursor;
    this.builder.begin(this.world);
    if (prefab.validate) {
      // Random-timing layouts: replay a variant that was proven fair for this difficulty bucket.
      const bucket = bucketOf(this.windowD(prefab, d));
      const v = pickVariant(provenVariants(prefab.id, bucket), this.rng, d, this.introducedNow);
      this.variantRng.seed(variantSeed(prefab.id, v));
      prefab.build(this.builder, this.variantRng, bucketD(bucket));
    } else {
      // First appearance of a mechanic uses the prefab's mildest parameters.
      prefab.build(this.builder, this.rng, Math.max(prefab.minD, Math.min(prefab.maxD, this.introducedNow ? prefab.minD : d)));
    }
    this.builder.commit();
    this.last = prefab;
    if (prefab.bonusCoins) this.placeCoins(segStart, this.world.cursor, 10);
    else if (this.rng.next() < COIN_CHANCE) this.placeCoins(segStart, this.world.cursor);
  }

  /** Difficulty clamped into the window where a prefab is allowed. */
  private windowD(p: Prefab, d: number): number {
    return Math.max(p.minD, Math.min(p.maxD, d));
  }

  /** Can this prefab be placed at difficulty `d` (random-timing ones need proven variants there)? */
  private usable(p: Prefab, d: number): boolean {
    return !p.validate || provenVariants(p.id, bucketOf(this.windowD(p, d))).length >= MIN_VARIANTS;
  }

  /**
   * Optional coin arc over a segment, following the natural jump path (low at the ends, peak
   * ≈ a tap jump). Coins never touch geometry (movers included, over their whole swept range)
   * and never affect solvability.
   */
  private placeCoins(start: number, end: number, count = 0): void {
    const n = count || Math.max(3, Math.min(8, Math.round(end - start) + 2));
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

  private choose(dist: number, d: number, pressure: number): Prefab {
    this.introducedNow = false;
    // Newly unlocked mechanic that hasn't been shown yet → show its easiest usable prefab.
    for (const m of MECHANICS) {
      if (dist >= unlockAt(m, this.profile) && !this.introduced.has(m)) {
        this.introduced.add(m);
        let easiest: Prefab | null = null;
        for (const p of this.prefabs) {
          if (p.mechanic === m && this.usable(p, d) && (!easiest || p.minD < easiest.minD)) easiest = p;
        }
        if (easiest) {
          this.introducedNow = true;
          return easiest;
        }
      }
    }

    const focus = focusAt(dist);
    let total = 0;
    const eligible: Prefab[] = [];
    const weights: number[] = [];
    for (const p of this.prefabs) {
      if (dist < unlockAt(p.mechanic, this.profile) || d < p.minD || d > p.maxD || !this.usable(p, d)) continue;
      if (p === this.last && this.prefabs.length > 1) continue;
      let w = p.weight ?? 1;
      if (focus.includes(p.mechanic)) w *= FOCUS_BOOST;
      if (p.mechanic === 'gauntlet') w *= 1 + (GAUNTLET_PRESSURE_BOOST - 1) * pressure;
      eligible.push(p);
      weights.push(w);
      total += w;
    }
    let pick = this.rng.next() * total;
    for (let i = 0; i < eligible.length; i++) {
      pick -= weights[i]!;
      if (pick < 0) return eligible[i]!;
    }
    return eligible[0] ?? this.prefabs[0]!;
  }
}
