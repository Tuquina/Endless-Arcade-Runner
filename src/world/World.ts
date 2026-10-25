import { Pool } from '../core/Pool';
import { COIN, HAZARD, PAD, RING, Rect, SOLID, WAVE_SLAM, moverLift, type RectKind, type Wave } from './Rect';

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
  /**
   * Centre x and kind of every mover generated since the last reset, in increasing x. The game walks
   * it with a pointer to count obstacles the runner has dodged (a skin objective).
   */
  readonly moverX: number[] = [];
  readonly moverIsCrusher: boolean[] = [];
  /** True once a pad or ring has been added since the last reset (lets the runner skip those checks otherwise). */
  special = false;

  /** `ringCols` must be a power of two and larger than the generated span kept alive. */
  constructor(private readonly ringCols = 256) {
    this.mask = ringCols - 1;
    this.cols = Array.from({ length: ringCols }, () => []);
  }

  /** Empty the world; geometry will start at `origin` (a non-default origin is for debugging far into a run). */
  reset(origin = WORLD_START): void {
    this.prune(Infinity);
    this.moverX.length = 0;
    this.moverIsCrusher.length = 0;
    this.special = false;
    this.cursor = origin;
    this.colBase = Math.floor(origin);
  }

  add(x0: number, y0: number, x1: number, y1: number, kind: RectKind): Rect {
    const r = this.pool.acquire();
    r.x0 = x0;
    r.y0 = y0;
    r.x1 = x1;
    r.y1 = y1;
    r.kind = kind;
    r.taken = false;
    r.mover = false;
    if (kind === PAD || kind === RING) this.special = true;
    const c0 = Math.floor(x0);
    const c1 = Math.floor(x1);
    r.lastCol = c1;
    if (c1 - this.colBase >= this.ringCols) throw new Error('World ring buffer too small');
    for (let c = c0; c <= c1; c++) this.cols[c & this.mask]!.push(r);
    return r;
  }

  /** Hazard that slides up by `amp` tiles following `wave` (see Rect.moverLift). */
  addMover(x0: number, y0: number, x1: number, y1: number, amp: number, wavelength: number, phase: number, wave: Wave, railTop: number): Rect {
    const r = this.add(x0, y0, x1, y1, HAZARD);
    r.mover = true;
    r.amp = amp;
    r.wavelength = wavelength;
    r.phase = phase;
    r.wave = wave;
    r.railTop = railTop;
    this.moverX.push((x0 + x1) / 2);
    this.moverIsCrusher.push(wave === WAVE_SLAM);
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

  /**
   * First rect of `kind` overlapping the box, or null. Allocation-free.
   * `px` is the runner's x, which positions movers; omit it (NaN) to test against each mover's
   * whole swept range instead (used when placing coins).
   */
  overlap(x0: number, y0: number, x1: number, y1: number, kind: RectKind, px = NaN): Rect | null {
    const c1 = Math.floor(x1);
    for (let c = Math.floor(x0); c <= c1; c++) {
      const list = this.cols[c & this.mask]!;
      for (let i = 0; i < list.length; i++) {
        const r = list[i]!;
        if (r.kind !== kind || r.taken || !(r.x0 < x1 && r.x1 > x0)) continue;
        let ry0 = r.y0;
        let ry1 = r.y1;
        if (r.mover) {
          if (px === px) {
            const lift = r.amp * moverLift(r, px);
            ry0 += lift;
            ry1 += lift;
          } else {
            ry1 += r.amp;
          }
        }
        if (ry0 < y1 && ry1 > y0) return r;
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

  /** Append every rect intersecting [x0, x1] to `out` exactly once (reusable array → no garbage). */
  collect(x0: number, x1: number, out: Rect[]): void {
    out.length = 0;
    const first = Math.floor(x0);
    const c1 = Math.floor(x1);
    for (let c = first; c <= c1; c++) {
      const list = this.cols[c & this.mask]!;
      for (let i = 0; i < list.length; i++) {
        const r = list[i]!;
        if (Math.floor(r.x0) === c || c === first) out.push(r);
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
