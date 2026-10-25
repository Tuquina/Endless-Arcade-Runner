import { describe, expect, it } from 'vitest';
import { UNLOCK_DISTANCE, difficultyAt } from './Difficulty';
import { PREFABS } from './segments';
import { VARIANT_FINGERPRINTS } from './variantTable';
import { bucketsOf, checkVariant, fingerprint } from './variantCheck';
import { BUCKETS, MIN_VARIANTS, VARIANTS, bucketD, bucketOf, pickVariant, provenVariants, variantSeed } from './variants';
import { Rng } from '../core/Rng';
import { World } from './World';

const validated = PREFABS.filter((p) => p.validate);

describe('proven variant table', () => {
  it('is up to date with the prefab definitions (run `npm run gen:variants` after editing one)', () => {
    for (const p of validated) {
      expect(VARIANT_FINGERPRINTS[p.id], `${p.id} has no generated variants; run npm run gen:variants`).toBeDefined();
      expect(fingerprint(p, VARIANTS), `${p.id} changed since the table was generated; run npm run gen:variants`).toBe(VARIANT_FINGERPRINTS[p.id]);
    }
  });

  it('has enough variants wherever a random-timing prefab can appear', () => {
    for (const p of validated) {
      // From the difficulty at which its mechanic unlocks, up to the end of its window.
      const firstD = Math.max(p.minD, difficultyAt(UNLOCK_DISTANCE[p.mechanic]));
      for (const bucket of bucketsOf(p)) {
        if (bucketD(bucket) < firstD - 0.05) continue;
        expect(provenVariants(p.id, bucket).length, `${p.id} @ bucket ${bucket}`).toBeGreaterThanOrEqual(MIN_VARIANTS);
      }
    }
  });

  it('every sampled entry still passes the strict check (the table is not hand-edited or stale)', () => {
    const scratch = new World(256);
    for (const p of validated) {
      for (const bucket of bucketsOf(p)) {
        const list = provenVariants(p.id, bucket);
        // First, middle and last entry of every bucket (widest, typical and narrowest window).
        for (const idx of new Set([0, list.length >> 1, list.length - 1])) {
          const entry = list[idx];
          if (!entry) continue;
          expect(checkVariant(p, entry[0], bucket, scratch).ok, `${p.id} bucket ${bucket} variant ${entry[0]}`).toBe(true);
        }
      }
    }
  }, 180000);

  it('lists are sorted easiest-first and contain distinct valid variant numbers', () => {
    for (const p of validated) {
      for (const bucket of bucketsOf(p)) {
        const list = provenVariants(p.id, bucket);
        expect(new Set(list.map((e) => e[0])).size).toBe(list.length);
        for (let i = 0; i < list.length; i++) {
          expect(list[i]![0]).toBeGreaterThanOrEqual(0);
          expect(list[i]![0]).toBeLessThan(VARIANTS);
          if (i > 0) expect(list[i]![1]).toBeLessThanOrEqual(list[i - 1]![1]);
        }
      }
    }
  });
});

describe('variant helpers', () => {
  it('seeds are stable and distinct', () => {
    expect(variantSeed('orbBob', 3)).toBe(variantSeed('orbBob', 3));
    expect(variantSeed('orbBob', 3)).not.toBe(variantSeed('orbBob', 4));
    expect(variantSeed('orbBob', 3)).not.toBe(variantSeed('crusher', 3));
  });

  it('buckets cover 0..1 and clamp', () => {
    expect(bucketOf(0)).toBe(0);
    expect(bucketOf(1)).toBe(BUCKETS - 1);
    expect(bucketOf(7)).toBe(BUCKETS - 1);
    expect(bucketOf(-1)).toBe(0);
    expect(bucketD(bucketOf(0.44))).toBeCloseTo(0.4);
  });

  it('picks easy variants early and spreads out later; the first appearance takes one of the easiest', () => {
    const list: [number, number][] = Array.from({ length: 30 }, (_, i) => [i, 30 - i]);
    const meanIdx = (d: number, easiest: boolean): number => {
      const rng = new Rng(5);
      let sum = 0;
      for (let i = 0; i < 4000; i++) sum += pickVariant(list, rng, d, easiest);
      return sum / 4000;
    };
    expect(meanIdx(0, false)).toBeLessThan(meanIdx(1, false) - 3);
    expect(meanIdx(0.5, true)).toBeLessThan(2.1);
    expect(meanIdx(1, false)).toBeGreaterThan(13); // roughly uniform at full difficulty
  });
});
