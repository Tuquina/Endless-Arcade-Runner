import { STEP } from '../core/Loop';
import { Rng } from '../core/Rng';
import { reactionTime, speedAt } from './Difficulty';
import { SegmentBuilder } from './SegmentBuilder';
import type { Prefab } from './segments/types';
import { analyze, solve } from './Solver';
import { BUCKETS, D_STEP, bucketD, variantSeed } from './variants';
import { World } from './World';

/**
 * Hitbox inflation used when proving a variant fair. It is larger than the 0.15 used by the
 * end-to-end tests on purpose: a layout that only survives by a hair can pass or fail depending
 * on which sub-step the runner lands on, so such knife-edge variants must be rejected.
 */
export const CHECK_MARGIN = 0.3;
/** Narrowest acceptable jump window (ms) measured with the inflated hitbox (true windows are wider). */
export const MIN_WINDOW_MS = 100;
const HOLDS = [0, 0.1, 0.2];
/**
 * Landing spots closer than this to the first obstacle are excused: from there nothing could be
 * done about an obstacle that needs a jump already under way (the flat gap before every segment
 * is long enough that the runner normally lands well before this point).
 */
const LEAD_MARGIN = 1.5;
/** Sub-step alignments of the runner relative to the geometry a variant must survive. */
const ALIGNMENTS = [0, 0.34, 0.67];
/** A bucket is valid for the whole interval of speeds it covers, not just its centre. */
const SPEED_OFFSETS = [0, -0.5, 0.5];

export interface VariantVerdict {
  ok: boolean;
  /** Narrowest press window seen across speeds/alignments, ms (Infinity if no timing is needed). */
  windowMs: number;
}

/** Build one variant of `prefab` into a fresh scratch world: lead-in, segment, trail. */
export function buildVariant(prefab: Prefab, variant: number, bucket: number, world: World, gap: number) {
  world.reset();
  world.appendFlat(gap + 4);
  const startX = world.cursor - gap;
  const b = new SegmentBuilder();
  b.begin(world);
  prefab.build(b, new Rng(variantSeed(prefab.id, variant)), bucketD(bucket));
  b.commit();
  const end = world.cursor;
  world.appendFlat(gap + 4);
  return { startX, segStart: end - b.width, end };
}

/** Is variant `variant` of `prefab` fair for every speed inside difficulty bucket `bucket`? */
export function checkVariant(prefab: Prefab, variant: number, bucket: number, scratch: World): VariantVerdict {
  let minWindow = Infinity;
  const dCentre = bucketD(bucket);
  for (const off of SPEED_OFFSETS) {
    const dSpeed = Math.max(0, Math.min(1, dCentre + off * D_STEP));
    const speed = speedAt(dSpeed);
    const gap = speed * reactionTime(dSpeed); // pressure 0 → the longest lead-in, a superset of any real one
    const { startX, segStart, end } = buildVariant(prefab, variant, bucket, scratch, gap);
    for (const frac of ALIGNMENTS) {
      const a = analyze(scratch, startX + frac * speed * STEP, segStart - LEAD_MARGIN, end + 1, speed, CHECK_MARGIN, HOLDS);
      if (!a.allStartsOk || !(a.walkFinish || a.windowMs >= MIN_WINDOW_MS)) return { ok: false, windowMs: 0 };
      if (!a.walkFinish) minWindow = Math.min(minWindow, a.windowMs);
    }
    // Cross-check with the plain solver the end-to-end tests use (real hitbox margin, all holds).
    if (!solve(scratch, startX, end + 1, () => speed, 0.15).ok) return { ok: false, windowMs: 0 };
  }
  return { ok: true, windowMs: minWindow };
}

/** Buckets in which a prefab may be used. */
export function bucketsOf(prefab: Prefab): number[] {
  const out: number[] = [];
  for (let b = 0; b < BUCKETS; b++) {
    const d = bucketD(b);
    if (d >= prefab.minD - 1e-9 && d <= prefab.maxD + 1e-9) out.push(b);
  }
  return out;
}

/** Hash of every variant's geometry, so editing a prefab invalidates the generated table loudly. */
export function fingerprint(prefab: Prefab, variants: number): string {
  const w = new World(256);
  let h = 0x811c9dc5;
  const mix = (n: number): void => {
    h ^= Math.round(n * 1000) & 0xffffffff;
    h = Math.imul(h, 0x01000193);
  };
  for (const bucket of bucketsOf(prefab)) {
    for (let v = 0; v < variants; v++) {
      buildVariant(prefab, v, bucket, w, 6);
      const rs: import('./Rect').Rect[] = [];
      w.collect(-20, 80, rs);
      for (const r of rs) {
        if (r.y0 < -1) continue; // ground slabs are implied by the pits
        mix(r.x0); mix(r.y0); mix(r.x1); mix(r.y1); mix(r.kind);
        if (r.mover) { mix(r.amp); mix(r.wavelength); mix(r.phase); mix(r.wave); }
      }
      mix(w.cursor);
    }
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
