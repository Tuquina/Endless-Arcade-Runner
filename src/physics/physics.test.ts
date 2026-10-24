import { describe, expect, it } from 'vitest';
import { STEP } from '../core/Loop';
import { World } from '../world/World';
import { measureJump } from './jumpModel';
import { Player } from './Player';
import { COYOTE_TIME } from './constants';

function flat(len = 60): World {
  const w = new World(128);
  w.appendFlat(len);
  return w;
}

describe('jump physics', () => {
  it('tap is lower than hold, both within the intended envelope', () => {
    const tap = measureJump(0, 8);
    const hold = measureJump(1, 8);
    expect(tap.height).toBeGreaterThan(1.3);
    expect(tap.height).toBeLessThan(1.8);
    expect(hold.height).toBeGreaterThan(2.4);
    expect(hold.height).toBeLessThan(3.0);
  });

  it('is deterministic', () => {
    expect(measureJump(0.1, 9)).toEqual(measureJump(0.1, 9));
  });

  it('coyote time allows a jump just after leaving a ledge, but not too late', () => {
    for (const [delay, shouldJump] of [[COYOTE_TIME * 0.6, true], [COYOTE_TIME * 2, false]] as const) {
      const w = new World(128);
      w.appendFlat(10); // ledge at x = 10
      const p = new Player();
      p.reset(9);
      p.speed = 8;
      while (p.grounded) p.step(STEP, false, false, w); // run off the edge
      for (let t = 0; t < delay; t += STEP) p.step(STEP, false, false, w);
      p.step(STEP, true, true, w);
      expect(p.jumped).toBe(shouldJump);
    }
  });

  it('jump buffer: a press just before landing triggers a jump on touchdown', () => {
    const w = flat();
    const p = new Player();
    p.reset(0);
    p.speed = 8;
    p.step(STEP, true, true, w); // jump
    while (p.y > 0.15 || p.vy > 0) p.step(STEP, false, false, w); // falling, near ground
    p.step(STEP, true, true, w); // early press
    let jumpedAgain = false;
    for (let i = 0; i < 40; i++) {
      p.step(STEP, false, true, w);
      if (p.jumped) jumpedAgain = true;
    }
    expect(jumpedAgain).toBe(true);
  });

  it('dies on a side hit against a tall block', () => {
    const w = flat();
    w.add(10, 0, 11, 1.5, 0);
    const p = new Player();
    p.reset(0);
    p.speed = 8;
    for (let i = 0; i < 400 && !p.dead; i++) p.step(STEP, false, false, w);
    expect(p.dead).toBe(true);
    expect(p.x).toBeLessThan(10);
  });
});
