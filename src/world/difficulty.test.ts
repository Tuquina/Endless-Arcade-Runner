import { describe, expect, it } from 'vitest';
import { DIFFICULTIES, DIFFICULTY_IDS, MECHANICS, difficultyAt, pressureAt, reactionTime, unlockAt, speedAt } from './Difficulty';
import { Generator } from './Generator';
import { WAVE_SLAM } from './Rect';
import { solve } from './Solver';
import { World } from './World';

describe('difficulty profiles', () => {
  it('Normal is the reference tuning (unchanged by the profile machinery)', () => {
    const n = DIFFICULTIES.normal;
    expect(difficultyAt(1500)).toBeCloseTo(1 - Math.exp(-1), 10);
    expect(difficultyAt(1500, n)).toBe(difficultyAt(1500));
    expect(pressureAt(8000, n)).toBe(1);
    expect(reactionTime(0.5, 0.2, n)).toBeCloseTo(0.85 - 0.15 - 0.02, 10);
    for (const m of MECHANICS) expect(unlockAt(m, n)).toBe(unlockAt(m));
  });

  it('orders the modes: Easy < Normal < Hard at every distance', () => {
    for (const d of [0, 100, 500, 1500, 3000, 8000]) {
      const [e, n, h] = DIFFICULTY_IDS.map((id) => difficultyAt(d, DIFFICULTIES[id])) as [number, number, number];
      expect(e, `easy ≤ normal @${d}`).toBeLessThanOrEqual(n);
      expect(n, `normal ≤ hard @${d}`).toBeLessThanOrEqual(h);
      for (const x of [e, n, h]) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(1);
      }
    }
  });

  it('Easy never reaches top speed or late pressure; Hard starts faster and unlocks earlier', () => {
    const { easy, hard, normal } = DIFFICULTIES;
    expect(difficultyAt(1e6, easy)).toBeLessThanOrEqual(0.7);
    expect(speedAt(difficultyAt(1e6, easy))).toBeLessThan(speedAt(1));
    expect(pressureAt(1e6, easy)).toBe(0);
    expect(difficultyAt(0, hard)).toBeGreaterThan(difficultyAt(0, normal));
    expect(unlockAt('crusher', hard)).toBeLessThan(unlockAt('crusher', normal));
    expect(unlockAt('crusher', easy)).toBeGreaterThan(unlockAt('crusher', normal));
    expect(reactionTime(0.5, 0, easy)).toBeGreaterThan(reactionTime(0.5, 0, normal));
    expect(reactionTime(0.5, 0, hard)).toBeLessThan(reactionTime(0.5, 0, normal));
    // Even Hard keeps a human-sized breather at top difficulty.
    expect(reactionTime(1, 1, hard)).toBeGreaterThanOrEqual(0.35);
  });

  it('respects each mode’s own unlock distances', () => {
    for (const id of DIFFICULTY_IDS) {
      const p = DIFFICULTIES[id];
      const world = new World(8192);
      const gen = new Generator(world);
      gen.reset(11, 0, p);
      gen.ensureAhead(3000);
      let firstMover = Infinity;
      let firstCrusher = Infinity;
      world.forEachInRange(0, 3000, (r) => {
        if (!r.mover) return;
        if (r.wave === WAVE_SLAM) firstCrusher = Math.min(firstCrusher, r.x0);
        else firstMover = Math.min(firstMover, r.x0);
      });
      expect(firstMover, `${id} mover`).toBeGreaterThanOrEqual(unlockAt('mover', p) - 2);
      expect(firstCrusher, `${id} crusher`).toBeGreaterThanOrEqual(unlockAt('crusher', p) - 2);
      if (unlockAt('mover', p) + 150 < 3000) expect(firstMover, `${id} mover appears`).toBeLessThan(unlockAt('mover', p) + 150);
    }
  });

  it('is reproducible per mode and differs between modes', () => {
    const make = (id: keyof typeof DIFFICULTIES): number[] => {
      const world = new World(4096);
      const gen = new Generator(world);
      gen.reset(42, 0, DIFFICULTIES[id]);
      gen.ensureAhead(1200);
      const out: number[] = [];
      world.forEachInRange(0, 1200, (r) => out.push(Math.round(r.x0 * 100), Math.round(r.y0 * 100), r.kind));
      return out;
    };
    expect(make('hard')).toEqual(make('hard'));
    expect(make('easy')).not.toEqual(make('hard'));
  });
});

describe('generated runs are completable in every difficulty', () => {
  for (const id of ['easy', 'hard'] as const) {
    const p = DIFFICULTIES[id];
    for (const [seed, length] of id === 'easy' ? ([[1, 3200], [2, 3200], [3, 6000]] as const) : ([[1, 3200], [2, 3200], [3, 3200], [4, 5000]] as const)) {
      it(`${id}: seed ${seed}, 0..${length} m`, () => {
        const world = new World(8192);
        const gen = new Generator(world);
        gen.reset(seed, 0, p);
        gen.ensureAhead(length + 100);
        const res = solve(world, 0, length, (x) => speedAt(difficultyAt(x, p)));
        expect(res.ok, `stuck at x=${res.furthest.toFixed(1)}`).toBe(true);
      }, 180000);
    }
  }
});
