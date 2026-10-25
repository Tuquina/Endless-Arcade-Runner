import { describe, expect, it } from 'vitest';
import { PREFABS } from './segments';
import { MIN_VARIANTS, bucketOf, provenVariants } from './variants';
import { pressWindow } from './pressWindow';

/**
 * Human-fairness gate. For every obstacle that has to be jumped, the stretch of take-off moments
 * that clears it (and still lets the level be finished) must be wide enough for a person: with the
 * true hitbox and the best way of holding the button, at least 150 ms, i.e. about ±75 ms of
 * tolerance. Measured on the *decisive* jump only (see windows.ts): a harmless early hop does not
 * count, which is what hid a nearly pixel-exact three-spike jump behind a comfortable-looking number.
 */
const MIN_WINDOW_MS = 150;

describe('decisive jump windows are human-sized', () => {
  for (const prefab of PREFABS) {
    it(prefab.id, () => {
      const span = prefab.maxD - prefab.minD;
      // The easiest, the hardest and two points in between of the range where the prefab is used.
      for (const d of [prefab.minD, prefab.minD + span / 3, prefab.minD + (2 * span) / 3, prefab.maxD]) {
        // Random-timing prefabs are simply not used where no variant is proven fair (see variants.test.ts).
        if (prefab.validate && provenVariants(prefab.id, bucketOf(d)).length < MIN_VARIANTS) continue;
        for (let seed = 1; seed <= 3; seed++) {
          const w = pressWindow(prefab, d, prefab.validate ? seed * 7 : seed); // spread over the variants
          expect(w, `${prefab.id} d=${d.toFixed(2)} seed=${seed}: only ${w.toFixed(0)} ms to press`).toBeGreaterThanOrEqual(MIN_WINDOW_MS);
        }
      }
    }, 120000);
  }
});
