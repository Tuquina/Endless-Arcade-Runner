import type { Rng } from '../core/Rng';
import { VARIANT_TABLE } from './variantTable';

/** Candidate layouts tried per (prefab, difficulty bucket) when the table is generated. */
export const VARIANTS = 80;
/** Difficulty is bucketed in steps of 0.1 (11 buckets: 0.0 … 1.0). */
export const D_STEP = 0.1;
export const BUCKETS = 11;
/** A bucket needs at least this many proven variants for the prefab to be used there. */
export const MIN_VARIANTS = 4;

export const bucketOf = (d: number): number => Math.max(0, Math.min(BUCKETS - 1, Math.round(d / D_STEP)));
export const bucketD = (bucket: number): number => bucket * D_STEP;

/** FNV-1a: a stable seed per (prefab, variant) so a variant number always means the same layout. */
export function variantSeed(prefabId: string, variant: number): number {
  let h = 0x811c9dc5;
  const s = `${prefabId}#${variant}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Proven-fair variants of a prefab at a difficulty bucket: `[variant, widestSafePressWindow/10ms]`, easiest first. */
export function provenVariants(prefabId: string, bucket: number): readonly (readonly [number, number])[] {
  return VARIANT_TABLE[prefabId]?.[bucket] ?? [];
}

/**
 * Pick a proven variant. The list is sorted easiest-first (widest timing window); low difficulty
 * favours the front of the list, high difficulty is uniform, and `easiest` (a mechanic's first
 * appearance) takes one of the very easiest.
 */
export function pickVariant(list: readonly (readonly [number, number])[], rng: Rng, d: number, easiest: boolean): number {
  const n = list.length;
  const idx = easiest ? Math.min(n - 1, Math.floor(rng.next() * Math.min(3, n))) : Math.floor(Math.pow(rng.next(), 1 + 1.5 * (1 - d)) * n);
  return list[Math.min(n - 1, idx)]![0];
}
