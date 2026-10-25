/**
 * Counts quick consecutive taps: a tap more than `gapMs` after the previous one starts a new series.
 * `tap` returns how many taps the current series has, so the caller can react at a target count.
 */
export class TapCounter {
  private count = 0;
  private last = -Infinity;

  constructor(private readonly gapMs = 650) {}

  tap(now: number): number {
    this.count = now - this.last <= this.gapMs ? this.count + 1 : 1;
    this.last = now;
    return this.count;
  }

  reset(): void {
    this.count = 0;
    this.last = -Infinity;
  }
}
