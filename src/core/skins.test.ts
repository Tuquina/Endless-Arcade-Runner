import { describe, expect, it } from 'vitest';
import { GOALS, SKINS, findSkin, newlyUnlocked, nextSkin, reconcileUnlocked } from './skins';

describe('skins and challenges', () => {
  it('has unique ids, ascending goals and a free default', () => {
    expect(new Set(SKINS.map((s) => s.id)).size).toBe(SKINS.length);
    expect(SKINS[0]!.goal).toBe(0);
    expect([...GOALS]).toEqual([...GOALS].sort((a, b) => a - b));
    expect(GOALS).toEqual([250, 500, 1000, 2000, 5000]);
  });

  it('unlocks exactly the skins whose goal was reached', () => {
    expect(newlyUnlocked(249, ['classic']).map((s) => s.id)).toEqual([]);
    expect(newlyUnlocked(250, ['classic']).map((s) => s.id)).toEqual(['mint']);
    expect(newlyUnlocked(1200, ['classic', 'mint']).map((s) => s.id)).toEqual(['rose', 'shades']);
    expect(newlyUnlocked(9999, SKINS.map((s) => s.id))).toEqual([]);
  });

  it('reports the next target and finishes with null', () => {
    expect(nextSkin(['classic'])!.id).toBe('mint');
    expect(nextSkin(['classic', 'mint', 'rose'])!.id).toBe('shades');
    expect(nextSkin(SKINS.map((s) => s.id))).toBeNull();
  });

  it('reconciles stored data: drops junk, keeps default, grants earned skins', () => {
    expect(reconcileUnlocked([], 0)).toEqual(['classic']);
    expect(reconcileUnlocked(['nope', 'rose'], 0).sort()).toEqual(['classic', 'rose']);
    expect(reconcileUnlocked([], 600).sort()).toEqual(['classic', 'mint', 'rose']);
  });

  it('falls back to the default skin for unknown ids', () => {
    expect(findSkin('???').id).toBe('classic');
  });
});
