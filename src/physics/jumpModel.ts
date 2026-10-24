import { STEP } from '../core/Loop';
import { World } from '../world/World';
import { Player } from './Player';

export interface JumpStats {
  /** Peak height above the ground (tiles). */
  height: number;
  /** Seconds in the air on flat ground. */
  airtime: number;
  /** Horizontal distance covered while airborne at `speed` (tiles). */
  distance: number;
}

/** Measure a flat-ground jump by running the real physics (single source of truth). */
export function measureJump(holdSeconds: number, speed: number): JumpStats {
  const world = new World(64);
  world.appendFlat(40);
  const p = new Player();
  p.reset(0);
  p.speed = speed;
  const holdSteps = Math.max(1, Math.ceil(holdSeconds / STEP));
  let height = 0;
  let steps = 0;
  for (; steps < 2000; steps++) {
    p.step(STEP, steps === 0, steps < holdSteps, world);
    if (p.y > height) height = p.y;
    if (steps > 1 && p.grounded) break;
  }
  return { height, airtime: steps * STEP, distance: p.x };
}
