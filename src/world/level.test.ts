import { describe, expect, it } from 'vitest';
import { Rng } from '../core/Rng';
import {
  MECHANICS,
  UNLOCK_DISTANCE,
  WORLD_LENGTH,
  difficultyAt,
  focusAt,
  pressureAt,
  reactionTime,
  speedAt,
} from './Difficulty';
import { Generator } from './Generator';
import { COIN, HAZARD, SOLID, WAVE_SINE, WAVE_SLAM, moverLift } from './Rect';
import { SegmentBuilder } from './SegmentBuilder';
import { PREFABS } from './segments';
import { solve } from './Solver';
import { bucketD, bucketOf, provenVariants, variantSeed } from './variants';
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

  it('understands movers: a crusher that is down blocks the way, one that is up lets the runner pass', () => {
    const run = (phase: number): boolean => {
      const w = new World(128);
      w.appendFlat(30); // runway from x = -12 to 18
      const b = new SegmentBuilder();
      b.begin(w);
      b.crusher(2, 1.6, 2.4, 10, phase); // centred at x = 20
      b.width = 4;
      b.commit();
      w.appendFlat(20);
      return solve(w, 0, 40, () => 8).ok;
    };
    expect(run(0)).toBe(true); // raised while the runner passes
    expect(run(0.6)).toBe(false); // slammed down on the runner, too tall to jump
  });
});

describe('mover motion', () => {
  it('sine and slam profiles stay in 0..1 and start/end where expected', () => {
    const w = new World(64);
    const r = w.addMover(0, 0, 1, 1, 2, 10, 0, WAVE_SINE, 5);
    for (let x = -20; x < 20; x += 0.37) {
      const l = moverLift(r, x);
      expect(l).toBeGreaterThanOrEqual(0);
      expect(l).toBeLessThanOrEqual(1);
    }
    expect(moverLift(r, 0.5)).toBeCloseTo(0, 5); // phase 0 at the runner directly below → rest height
    const s = w.addMover(0, 0, 1, 1, 2, 10, 0, WAVE_SLAM, 5);
    expect(moverLift(s, 0.5)).toBe(1); // raised
    s.phase = 0.64;
    expect(moverLift(s, 0.5)).toBe(0); // slammed
  });

  it('collides at its current height and covers its whole swept range when asked without a runner', () => {
    const w = new World(64);
    w.addMover(5, 0, 5.6, 0.6, 2, 8, 0, WAVE_SINE, 4);
    // Phase 0 at the runner under it: at rest height → overlaps a box at y 0..0.8.
    expect(w.overlap(5.1, 0, 5.5, 0.8, HAZARD, 5.3)).not.toBeNull();
    // Half a wavelength away it is lifted by `amp` → the same box is clear.
    expect(w.overlap(5.1, 0, 5.5, 0.8, HAZARD, 5.3 + 4)).toBeNull();
    // No runner position: any height it can reach counts (coins must avoid the whole path).
    expect(w.overlap(5.1, 2.1, 5.5, 2.3, HAZARD)).not.toBeNull();
    expect(w.overlap(5.1, 2.7, 5.5, 3.0, HAZARD)).toBeNull();
  });
});

describe('every prefab is solvable (with timing margin)', () => {
  for (const prefab of PREFABS) {
    it(prefab.id, () => {
      let checked = 0;
      for (const speedD of D_SAMPLES) {
        if (speedD < prefab.minD) continue;
        const speed = speedAt(speedD);
        const gap = speed * reactionTime(speedD);
        // Random-timing prefabs are only ever built from their proven variants; static ones from any seed.
        const builds: { rng: Rng; d: number }[] = [];
        if (prefab.validate) {
          const bucket = bucketOf(speedD);
          for (const [v] of provenVariants(prefab.id, bucket)) builds.push({ rng: new Rng(variantSeed(prefab.id, v)), d: bucketD(bucket) });
        } else {
          for (const buildD of [prefab.minD, speedD]) {
            if (buildD > prefab.maxD) continue;
            for (let seed = 1; seed <= SEEDS; seed++) builds.push({ rng: new Rng(seed), d: buildD });
          }
        }
        for (const { rng, d } of builds) {
          const world = new World(512);
          const b = new SegmentBuilder();
          world.appendFlat(gap + 4);
          const startX = world.cursor - gap;
          b.begin(world);
          prefab.build(b, rng, d);
          b.commit();
          const end = world.cursor;
          world.appendFlat(gap + 4);
          const res = solve(world, startX, end + 1, () => speed);
          expect(res.ok, `${prefab.id} unsolvable: buildD=${d} speedD=${speedD} stuck at x=${res.furthest.toFixed(2)}`).toBe(true);
          checked++;
        }
      }
      expect(checked, `${prefab.id}: nothing was checked`).toBeGreaterThan(0);
    }, 120000);
  }
});

describe('generated runs are completable end to end', () => {
  for (const [seed, length] of [[1, 3200], [2, 3200], [3, 3200], [4, 3200], [5, 3200], [6, 3200], [7, 6500]] as const) {
    it(`seed ${seed}, 0..${length} m`, () => {
      const world = new World(8192);
      const gen = new Generator(world);
      gen.reset(seed);
      gen.ensureAhead(length + 100);
      const res = solve(world, 0, length, (x) => speedAt(difficultyAt(x)));
      expect(res.ok, `stuck at x=${res.furthest.toFixed(1)}`).toBe(true);
    }, 180000);
  }

  it('is reproducible: same seed, same level', () => {
    const make = (): number[] => {
      const world = new World(4096);
      const gen = new Generator(world);
      gen.reset(42);
      gen.ensureAhead(1500);
      const out: number[] = [];
      world.forEachInRange(0, 1500, (r) => out.push(Math.round(r.x0 * 100), Math.round(r.y0 * 100), r.kind));
      return out;
    };
    expect(make()).toEqual(make());
  });

  it('never introduces a mechanic before its unlock distance', () => {
    for (const seed of [1, 2, 3]) {
      const world = new World(4096);
      const gen = new Generator(world);
      gen.reset(seed);
      gen.ensureAhead(3000);
      world.forEachInRange(0, 3000, (r) => {
        if (r.mover) expect(r.x0, 'mover before 800 m').toBeGreaterThanOrEqual(UNLOCK_DISTANCE.mover - 2);
        if (r.kind === SOLID && r.y0 >= 0 && !r.mover) expect(r.x0, 'block/platform before 150 m').toBeGreaterThanOrEqual(UNLOCK_DISTANCE.block - 2);
      });
    }
  });

  it('introduces movers and crushers with a visible, easy first example', () => {
    const world = new World(4096);
    const gen = new Generator(world);
    gen.reset(9);
    gen.ensureAhead(2000);
    let firstMover = Infinity;
    let firstCrusher = Infinity;
    world.forEachInRange(0, 2000, (r) => {
      if (!r.mover) return;
      if (r.wave === WAVE_SLAM) firstCrusher = Math.min(firstCrusher, r.x0);
      else firstMover = Math.min(firstMover, r.x0);
    });
    expect(firstMover).toBeGreaterThanOrEqual(UNLOCK_DISTANCE.mover - 2);
    expect(firstMover).toBeLessThan(UNLOCK_DISTANCE.mover + 120);
    expect(firstCrusher).toBeGreaterThanOrEqual(UNLOCK_DISTANCE.crusher - 2);
    expect(firstCrusher).toBeLessThan(UNLOCK_DISTANCE.crusher + 120);
  });

  it('each world leans on its focus mechanics', () => {
    // Count segment kinds per world over many seeds; the focus mechanic must be over-represented.
    const count = (worldIdx: number, pred: (r: import('./Rect').Rect) => boolean): number => {
      let n = 0;
      for (let seed = 1; seed <= 6; seed++) {
        const world = new World(8192);
        const gen = new Generator(world);
        gen.reset(seed);
        const from = worldIdx * WORLD_LENGTH + 40;
        gen.ensureAhead(from + WORLD_LENGTH + 50);
        world.forEachInRange(from, from + WORLD_LENGTH - 80, (r) => { if (pred(r)) n++; });
      }
      return n;
    };
    expect(focusAt(0)).toContain('spike');
    // Océano (world 2) is the mover world: it must contain clearly more movers than Atardecer (world 1) does.
    expect(count(2, (r) => r.mover)).toBeGreaterThan(count(1, (r) => r.mover) + 3);
    // Vacío (world 4) is the crusher world.
    expect(count(4, (r) => r.mover && r.wave === WAVE_SLAM)).toBeGreaterThan(count(3, (r) => r.mover && r.wave === WAVE_SLAM));
  });

  it('keeps getting tighter after the speed ramp (pressure)', () => {
    expect(pressureAt(2000)).toBe(0);
    expect(pressureAt(8000)).toBe(1);
    expect(reactionTime(1, 1)).toBeLessThan(reactionTime(1, 0));
    expect(MECHANICS.length).toBe(Object.keys(UNLOCK_DISTANCE).length);
  });
});

describe('coins', () => {
  it('appear, and never overlap solids or hazards (movers over their whole path)', () => {
    const world = new World(8192);
    const gen = new Generator(world);
    gen.reset(3);
    gen.ensureAhead(3000);
    let coins = 0;
    world.forEachInRange(0, 3000, (r) => {
      if (r.kind !== COIN) return;
      coins++;
      expect(world.overlap(r.x0, r.y0, r.x1, r.y1, SOLID)).toBeNull();
      expect(world.overlap(r.x0, r.y0, r.x1, r.y1, HAZARD)).toBeNull();
      expect(r.y1).toBeLessThan(2.3); // reachable with a normal jump
    });
    expect(coins).toBeGreaterThan(80);
  });

  it('collected coins are skipped by queries', () => {
    const world = new World(64);
    const c = world.add(1, 1, 1.6, 1.6, COIN);
    expect(world.overlap(0, 0, 3, 3, COIN)).toBe(c);
    c.taken = true;
    expect(world.overlap(0, 0, 3, 3, COIN)).toBeNull();
  });
});
