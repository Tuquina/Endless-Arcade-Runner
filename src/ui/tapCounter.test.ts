import { describe, expect, it } from 'vitest';
import { TapCounter } from './tapCounter';

describe('TapCounter', () => {
  it('counts a quick series and restarts after a pause', () => {
    const c = new TapCounter(650);
    let n = 0;
    for (let i = 0; i < 11; i++) n = c.tap(1000 + i * 300);
    expect(n).toBe(11);
    expect(c.tap(1000 + 10 * 300 + 2000)).toBe(1);
  });

  it('a slow tap in the middle breaks the series', () => {
    const c = new TapCounter(650);
    for (let i = 0; i < 6; i++) c.tap(i * 200);
    expect(c.tap(6 * 200 + 900)).toBe(1);
  });
});
