import { SPIKE_HIT_HEIGHT, SPIKE_HIT_INSET } from '../physics/constants';
import { HAZARD, SOLID } from './Rect';
import type { World } from './World';

/**
 * Helper handed to prefab functions. Coordinates are relative to the segment start (x) and the
 * ground surface (y). Pits are subtracted from the ground when the segment is committed.
 */
export class SegmentBuilder {
  /** Segment width in tiles; prefabs must set it. */
  width = 0;
  private base = 0;
  private world!: World;
  private readonly pits: number[] = [];

  begin(world: World): void {
    this.world = world;
    this.base = world.cursor;
    this.width = 0;
    this.pits.length = 0;
  }

  /** `n` adjacent spikes starting at x, standing on y. */
  spikes(x: number, n: number, y = 0): void {
    for (let i = 0; i < n; i++) {
      const sx = this.base + x + i;
      this.world.add(sx + SPIKE_HIT_INSET, y, sx + 1 - SPIKE_HIT_INSET, y + SPIKE_HIT_HEIGHT, HAZARD);
    }
  }

  /** Solid box whose bottom is at y (0 = on the ground). */
  block(x: number, w: number, h: number, y = 0): void {
    this.world.add(this.base + x, y, this.base + x + w, y + h, SOLID);
  }

  /** Thin floating platform whose top surface is at `top`. */
  platform(x: number, w: number, top: number): void {
    this.world.add(this.base + x, top - 0.3, this.base + x + w, top, SOLID);
  }

  pit(x: number, w: number): void {
    this.pits.push(x, x + w);
  }

  /** Lay the ground (minus pits) and advance the world cursor past this segment. */
  commit(): void {
    const end = this.base + this.width;
    let cur = this.base;
    // Pits are pushed in ascending order by every prefab.
    for (let i = 0; i < this.pits.length; i += 2) {
      const p0 = this.base + this.pits[i]!;
      const p1 = this.base + this.pits[i + 1]!;
      if (p0 > cur) this.world.add(cur, -50, p0, 0, SOLID);
      cur = p1;
    }
    if (end > cur) this.world.add(cur, -50, end, 0, SOLID);
    this.world.cursor = end;
  }
}
