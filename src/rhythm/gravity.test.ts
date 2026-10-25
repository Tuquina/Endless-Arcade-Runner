import { describe, expect, it } from 'vitest';
import { STEP } from '../core/Loop';
import { Player } from '../physics/Player';
import { PORTAL_BALL, PORTAL_GRAVITY_DOWN, PORTAL_SHIP, RING, RING_FLIP, SOLID, TRIGGER } from '../world/Rect';
import { World } from '../world/World';
import { chartEvents, compileLevel, pressWindow, runPerfect } from './level';
import { GRAVITY_CREDITS, GRAVITY_LEVELS } from './gravityLevels';

const CEIL = 5;

/** Floor at y = 0 and a ceiling slab from y = CEIL up. */
function corridor(): World {
  const w = new World(512);
  w.reset(-20);
  w.add(-20, -50, 300, 0, SOLID);
  w.add(-20, CEIL, 300, CEIL + 12, SOLID);
  return w;
}

describe('gravity physics', () => {
  it('a jump with flipped gravity is the exact mirror of a normal one', () => {
    const w = corridor();
    const a = new Player();
    a.reset(0);
    a.speed = 9;
    const b = new Player();
    b.reset(0, CEIL - 0.8);
    b.speed = 9;
    b.g = -1;
    for (let n = 0; n < 90; n++) {
      const pressed = n === 3;
      const held = n >= 3 && n < 15;
      a.step(STEP, pressed, held, w);
      b.step(STEP, pressed, held, w);
      // Feet of the normal runner vs. head-room of the flipped one, measured from their surfaces.
      expect(CEIL - (b.y + 0.8)).toBeCloseTo(a.y, 9);
      expect(b.grounded).toBe(a.grounded);
    }
  });

  it('a gravity portal sends the runner to the ceiling, and it keeps running there', () => {
    const w = corridor();
    w.add(4, -3, 4.6, CEIL + 3, TRIGGER).code = PORTAL_GRAVITY_DOWN;
    const p = new Player();
    p.reset(0);
    p.speed = 9;
    for (let n = 0; n < 120; n++) p.step(STEP, false, false, w);
    expect(p.g).toBe(-1);
    expect(p.grounded).toBe(true);
    expect(p.y).toBeCloseTo(CEIL - 0.8, 6);
    expect(p.dead).toBe(false);
  });

  it('the ball flips to the other surface on a press, only from a surface', () => {
    const w = corridor();
    w.add(1, -3, 1.6, CEIL + 3, TRIGGER).code = PORTAL_BALL;
    const p = new Player();
    p.reset(0);
    p.speed = 9;
    for (let n = 0; n < 20; n++) p.step(STEP, false, false, w);
    expect(p.form).toBe('ball');
    p.step(STEP, true, true, w);
    expect(p.g).toBe(-1);
    for (let n = 0; n < 6; n++) p.step(STEP, false, false, w);
    p.step(STEP, true, true, w); // mid-air press: ignored (no surface)
    for (let n = 0; n < 60; n++) p.step(STEP, false, false, w);
    expect(p.g).toBe(-1);
    expect(p.grounded).toBe(true);
    expect(p.y).toBeCloseTo(CEIL - 0.8, 6);
  });

  it('the ship climbs while held and sinks when released, sliding on surfaces without dying', () => {
    const w = corridor();
    w.add(1, -3, 1.6, CEIL + 3, TRIGGER).code = PORTAL_SHIP;
    const p = new Player();
    p.reset(0);
    p.speed = 9;
    for (let n = 0; n < 20; n++) p.step(STEP, false, false, w);
    expect(p.form).toBe('ship');
    for (let n = 0; n < 40; n++) p.step(STEP, true, true, w);
    const high = p.y;
    expect(high).toBeGreaterThan(1.5);
    for (let n = 0; n < 200; n++) p.step(STEP, true, true, w); // pinned against the ceiling
    expect(p.dead).toBe(false);
    expect(p.y).toBeCloseTo(CEIL - 0.8, 6);
    for (let n = 0; n < 60; n++) p.step(STEP, false, false, w);
    expect(p.y).toBeLessThan(high);
  });

  it('a blue ring flips gravity on a mid-air press', () => {
    const w = corridor();
    w.add(1.5, 0.9, 2.5, 2.7, RING).code = RING_FLIP;
    const p = new Player();
    p.reset(0);
    p.speed = 8;
    p.step(STEP, true, true, w);
    for (let n = 1; n < 30; n++) p.step(STEP, false, n < 3, w);
    p.step(STEP, true, true, w);
    for (let n = 0; n < 80; n++) p.step(STEP, false, false, w);
    expect(p.g).toBe(-1);
    expect(p.y).toBeCloseTo(CEIL - 0.8, 6);
  });
});

describe('gravity campaign', () => {
  const compiled = GRAVITY_LEVELS.map((d) => compileLevel(d));

  it('has three public-domain songs, credited, each with a ceiling', () => {
    expect(GRAVITY_LEVELS).toHaveLength(3);
    for (const d of GRAVITY_LEVELS) {
      expect(GRAVITY_CREDITS[d.id]).toMatch(/\(1[78]\d\d\)$/);
      expect(d.ceiling).toBeGreaterThan(4);
    }
  });

  it('teaches one idea per level: portals and blue rings, then the ball, then the ship', () => {
    const kinds = GRAVITY_LEVELS.map((d) => new Set(chartEvents(d.song).map((e) => e.kind)));
    expect(kinds[0]!.has('G') && kinds[0]!.has('O')).toBe(true);
    expect(kinds[0]!.has('f') || kinds[0]!.has('^')).toBe(false);
    expect(kinds[1]!.has('f')).toBe(true);
    expect(kinds[1]!.has('^')).toBe(false);
    expect(kinds[2]!.has('^') && kinds[2]!.has('f')).toBe(true);
  });

  it('ball flips have a human-sized window', () => {
    for (const lv of compiled) expect(pressWindow('f', lv.speed, lv.def.ceiling).ms).toBeGreaterThanOrEqual(150);
  });

  for (const lv of compiled) {
    it(`${lv.def.id}: completable on the beat (all discos), with sloppy timing and any hold length`, () => {
      const perfect = runPerfect(lv);
      expect(perfect.ok).toBe(true);
      expect(perfect.discos).toBe(3);
      for (let seed = 1; seed <= 8; seed++) {
        const r = runPerfect(lv, { jitterMs: 40, seed });
        expect(r.ok, `±40 ms, seed ${seed}: dies at ${r.t.toFixed(2)} s`).toBe(true);
      }
      for (const holdMode of ['short', 'long'] as const) expect(runPerfect(lv, { holdMode }).ok, holdMode).toBe(true);
      for (const shiftMs of [-40, 40]) expect(runPerfect(lv, { shiftMs }).ok, `shift ${shiftMs}`).toBe(true);
      const idle = runPerfect({ ...lv, presses: [] });
      expect(idle.ok).toBe(false);
    });
  }
});
