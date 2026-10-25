import { describe, expect, it } from 'vitest';
import {
  DISTANCE_GOALS,
  EMPTY_PROGRESS,
  SKINS,
  findSkin,
  goalText,
  goalValue,
  isEarned,
  newlyUnlocked,
  nextSkin,
  reconcileUnlocked,
  type Progress,
} from './skins';

const prog = (p: Partial<Progress>): Progress => ({ ...EMPTY_PROGRESS, ...p });
const ids = (skins: readonly { id: string }[]): string[] => skins.map((s) => s.id);

describe('skin catalogue', () => {
  it('has unique ids, a free default first, and a sensible number of skins', () => {
    expect(new Set(ids(SKINS)).size).toBe(SKINS.length);
    expect(SKINS[0]!.goal.n).toBe(0);
    expect(SKINS.length).toBeGreaterThanOrEqual(18);
  });

  it('every other skin has a positive objective and a description', () => {
    for (const s of SKINS.slice(1)) {
      expect(s.goal.n, s.id).toBeGreaterThan(0);
      expect(s.name.length, s.id).toBeGreaterThan(0);
      expect(s.blurb.length, s.id).toBeGreaterThan(0);
      expect(goalText(s.goal), s.id).toContain(String(s.goal.n));
    }
  });

  it('mixes different kinds of objectives, not only distance', () => {
    const types = new Set(SKINS.map((s) => s.goal.type));
    for (const t of ['distance', 'coins', 'attempts', 'saws', 'crushers'] as const) expect(types.has(t), t).toBe(true);
  });

  it('trail colour lists fit the particle palette (max 4)', () => {
    for (const s of SKINS) expect(s.trail?.colors.length ?? 0, s.id).toBeLessThanOrEqual(4);
  });

  it('keeps the original six skin ids so existing saves stay valid', () => {
    for (const id of ['classic', 'mint', 'rose', 'shades', 'rainbow', 'king']) expect(ids(SKINS)).toContain(id);
  });

  it('distance markers are ascending and only come from distance skins', () => {
    const ns = DISTANCE_GOALS.map((g) => g.n);
    expect(ns).toEqual([...ns].sort((a, b) => a - b));
    for (const g of DISTANCE_GOALS) expect(findSkin(g.id).goal).toEqual({ type: 'distance', n: g.n });
  });
});

describe('earning skins', () => {
  it('reads the right quantity for each objective', () => {
    const p = prog({ distance: 11, coins: 22, attempts: 33, saws: 44, crushers: 55 });
    expect(goalValue({ type: 'distance', n: 1 }, p)).toBe(11);
    expect(goalValue({ type: 'coins', n: 1 }, p)).toBe(22);
    expect(goalValue({ type: 'attempts', n: 1 }, p)).toBe(33);
    expect(goalValue({ type: 'saws', n: 1 }, p)).toBe(44);
    expect(goalValue({ type: 'crushers', n: 1 }, p)).toBe(55);
  });

  it('unlocks exactly the skins whose objective is met', () => {
    expect(ids(newlyUnlocked(prog({ distance: 249 }), ['classic']))).toEqual([]);
    expect(ids(newlyUnlocked(prog({ distance: 250 }), ['classic']))).toEqual(['mint']);
    expect(ids(newlyUnlocked(prog({ coins: 100 }), ['classic']))).toEqual(['panda']);
    expect(ids(newlyUnlocked(prog({ attempts: 40 }), ['classic']))).toEqual(['robot']);
    expect(ids(newlyUnlocked(prog({ saws: 40 }), ['classic']))).toEqual(['ice']);
    expect(ids(newlyUnlocked(prog({ crushers: 25 }), ['classic']))).toEqual(['pixel']);
    // several at once, and already-unlocked ones are not repeated
    expect(ids(newlyUnlocked(prog({ distance: 600, coins: 150 }), ['classic', 'mint']))).toEqual(['rose', 'panda']);
  });

  it('everything is earned with big enough numbers, nothing without', () => {
    const all = prog({ distance: 99999, coins: 99999, attempts: 99999, saws: 99999, crushers: 99999, levels: 99, discos: 999 });
    expect(newlyUnlocked(all, ['classic']).length).toBe(SKINS.length - 1);
    expect(newlyUnlocked(EMPTY_PROGRESS, ['classic'])).toEqual([]);
    expect(SKINS.every((s) => isEarned(s, all))).toBe(true);
  });

  it('suggests the skin that is closest to done, and finishes with null', () => {
    const p = prog({ distance: 100, coins: 90 }); // 100/250 m = 40%, 90/100 coins = 90%
    expect(nextSkin(['classic'], p)!.id).toBe('panda');
    expect(nextSkin(SKINS.map((s) => s.id), p)).toBeNull();
    expect(nextSkin(['classic', 'panda'], p)!.id).toBe('mint');
  });

  it('reconciles stored data: drops junk, keeps default, grants what the stats already earned', () => {
    expect(reconcileUnlocked([], EMPTY_PROGRESS)).toEqual(['classic']);
    expect(reconcileUnlocked(['nope', 'rose'], EMPTY_PROGRESS).sort()).toEqual(['classic', 'rose']);
    expect(reconcileUnlocked([], prog({ distance: 600, attempts: 60 })).sort()).toEqual(['classic', 'mint', 'robot', 'rose']);
  });

  it('falls back to the default skin for unknown ids', () => {
    expect(findSkin('???').id).toBe('classic');
  });
});
