import { Pool } from '../core/Pool';
import { COIN, HAZARD, Rect, SOLID, type RectKind } from './Rect';

/** Where the world starts (behind the player's spawn at x = 0). */
export const WORLD_START = -12;

/**
 * Static level geometry, stored in a ring buffer of 1-tile-wide columns so that collision
 * queries only touch the few rects near the player. Rects are pooled and recycled as the
 * camera moves on, so an endless run doesn't grow memory or allocate in the loop.
 */
export class World {
  /** Everything left of `cursor` has been generated. */
  cursor = WORLD_START;
  private readonly cols: Rect[][];
  private readonly mask: number;
  private colBase = Math.floor(WORLD_START);
  private readonly pool = new Pool(() => new Rect());

  /** `ringCols` must be a power of two and larger than the generated span kept alive. */
  constructor(private readonly ringCols = 256) {
    this.mask = ringCols - 1;
    this.cols = Array.from({ length: ringCols }, () => []);
  }

  reset(): void {
    this.prune(Infinity);
    this.cursor = WORLD_START;
    this.colBase = Math.floor(WORLD_START);
  }

  add(x0: number, y0: number, x1: number, y1: number, kind: RectKind): Rect {
    const r = this.pool.acquire();
    r.x0 = x0;
    r.y0 = y0;
    r.x1 = x1;
    r.y1 = y1;
    r.kind = kind;
    r.taken = false;
    const c0 = Math.floor(x0);
    const c1 = Math.floor(x1);
    r.lastCol = c1;
    if (c1 - this.colBase >= this.ringCols) throw new Error('World ring buffer too small');
    for (let c = c0; c <= c1; c++) this.cols[c & this.mask]!.push(r);
    return r;
  }

  /** Drop all geometry in columns left of `x`. */
  prune(x: number): void {
    const newBase = Math.min(Math.floor(x), this.colBase + this.ringCols);
    for (let c = this.colBase; c < newBase; c++) {
      const list = this.cols[c & this.mask]!;
      for (let i = 0; i < list.length; i++) {
        const r = list[i]!;
        if (r.lastCol === c) this.pool.release(r);
      }
      list.length = 0;
    }
    if (newBase > this.colBase) this.colBase = newBase;
  }

  /** First rect of `kind` overlapping the box, or null. Allocation-free. */
  overlap(x0: number, y0: number, x1: number, y1: number, kind: RectKind): Rect | null {
    const c1 = Math.floor(x1);
    for (let c = Math.floor(x0); c <= c1; c++) {
      const list = this.cols[c & this.mask]!;
      for (let i = 0; i < list.length; i++) {
        const r = list[i]!;
        if (r.kind === kind && !r.taken && r.x0 < x1 && r.x1 > x0 && r.y0 < y1 && r.y1 > y0) return r;
      }
    }
    return null;
  }

  /** Visit every rect intersecting the column range (renderer; may visit a rect more than once). */
  forEachInRange(x0: number, x1: number, fn: (r: Rect) => void): void {
    const c1 = Math.floor(x1);
    for (let c = Math.floor(x0); c <= c1; c++) {
      const list = this.cols[c & this.mask]!;
      for (let i = 0; i < list.length; i++) {
        const r = list[i]!;
        // Draw each rect once: only from the column where it starts (or the first visible one).
        if (Math.floor(r.x0) === c || c === Math.floor(x0)) fn(r);
      }
    }
  }

  /** Lay flat ground from the cursor to cursor + length. */
  appendFlat(length: number): void {
    this.add(this.cursor, -50, this.cursor + length, 0, SOLID);
    this.cursor += length;
  }
}

export { COIN, HAZARD, SOLID };
