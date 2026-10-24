import { describe, expect, it } from 'vitest';
import { Rng } from '../core/Rng';
import { difficultyAt, reactionTime, speedAt } from './Difficulty';
import { Generator } from './Generator';
import { SegmentBuilder } from './SegmentBuilder';
import { PREFABS } from './segments';
import { solve } from './Solver';
import { World } from './World';

const D_SAMPLES = [0, 0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 1];
const SEEDS = 25;

describe('solver sanity', () => {
  it('rejects genuinely impossible levels', () => {
    const wall = new World(128);
    wall.appendFlat(30);
    wall.add(20, 0, 21, 4, 0);
    expect(solve(wall, 0, 28, () => 8).ok).toBe(false);

    const pit = new World(128);
    pit.appendFlat(20);
    const b = new SegmentBuilder();
    b.begin(pit);
    b.pit(0, 14);
    b.width = 14;
    b.commit();
    pit.appendFlat(20);
    expect(solve(pit, 0, 40, () => 8).ok).toBe(false);
  });
});

describe('every prefab is solvable (with timing margin)', () => {
  for (const prefab of PREFABS) {
    it(prefab.id, () => {
      for (const speedD of D_SAMPLES) {
        if (speedD < prefab.minD) continue;
        const speed = speedAt(speedD);
        // Build at the speed's own difficulty, and at the mildest parameters (mechanic intro).
        for (const buildD of [prefab.minD, speedD]) {
          if (buildD > prefab.maxD) continue;
          for (let seed = 1; seed <= SEEDS; seed++) {
            const world = new World(512);
            const b = new SegmentBuilder();
            const gap = speed * reactionTime(speedD);
            world.appendFlat(gap + 4);
            const startX = world.cursor - gap;
            b.begin(world);
            prefab.build(b, new Rng(seed), buildD);
            b.commit();
            const end = world.cursor;
            world.appendFlat(gap + 4);
            const res = solve(world, startX, end + 1, () => speed);
            expect(
              res.ok,
              `${prefab.id} unsolvable: buildD=${buildD} speedD=${speedD} seed=${seed} stuck at x=${res.furthest.toFixed(2)} (segment ${(end - b.width).toFixed(1)}..${end.toFixed(1)})`,
            ).toBe(true);
          }
        }
      }
    });
  }
});

describe('generated runs are completable end to end', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    it(`seed ${seed}, 0..2500 m`, () => {
      const world = new World(4096);
      const gen = new Generator(world);
      gen.reset(seed);
      gen.ensureAhead(2600);
      const res = solve(world, 0, 2500, (x) => speedAt(difficultyAt(x)));
      expect(res.ok, `stuck at x=${res.furthest.toFixed(1)}`).toBe(true);
    });
  }

  it('introduces mechanics in order and never before their unlock distance', () => {
    const world = new World(4096);
    const gen = new Generator(world);
    gen.reset(7);
    gen.ensureAhead(400);
    // Within the first 150 m only spikes exist: no solid rect other than ground (y0 < 0).
    let nonGroundSolid = 0;
    world.forEachInRange(0, 149, (r) => { if (r.kind === 0 && r.y0 >= 0) nonGroundSolid++; });
    expect(nonGroundSolid).toBe(0);
  });
});
