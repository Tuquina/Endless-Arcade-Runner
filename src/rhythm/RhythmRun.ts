import { STEP } from '../core/Loop';
import { stepAtTime } from '../audio/song';
import type { Player } from '../physics/Player';
import { COIN, type Rect } from '../world/Rect';
import type { World } from '../world/World';
import { compileLevel, type Checkpoint, type CompiledLevel, type LevelDef } from './level';

export type Judgement = 'perfect' | 'good' | 'ok' | 'miss';

/** Timing windows (ms) for judging a press against its note. */
export const JUDGE_MS = { perfect: 45, good: 90, ok: 150 } as const;
const WEIGHT: Record<Judgement, number> = { perfect: 1, good: 0.75, ok: 0.4, miss: 0 };
const GRADES: readonly [number, string][] = [[95, 'S'], [85, 'A'], [70, 'B'], [0, 'C']];

export function gradeOf(acc: number): string {
  return GRADES.find(([min]) => acc >= min)![1];
}

/** How many tiles of geometry behind the runner are kept when (re)starting. */
const BEHIND = 16;

/**
 * State of one rhythm-mode attempt: which level, the song clock, feeding the level's geometry into
 * the shared World as the runner advances, judging presses against the chart, and practice-mode
 * checkpoints. The Game owns the player, world, audio and state machine and calls into this.
 */
export class RhythmRun {
  private readonly cache = new Map<string, CompiledLevel>();
  level: CompiledLevel | null = null;
  index = 0;
  practice = false;
  /** Simulation clock in song seconds (advances one fixed step at a time). */
  songTime = 0;
  /** While true the simulation holds still until the music reaches `songTime` (start, resume, respawn). */
  waiting = false;
  waitSince = 0;
  /** Practice mode: seconds left before respawning at the last checkpoint. */
  respawnT = 0;
  counts: Record<Judgement, number> = { perfect: 0, good: 0, ok: 0, miss: 0 };
  combo = 0;
  maxCombo = 0;
  /** Latest judgement, for the on-screen popup (`at` is the game clock). */
  popup: { j: Judgement; x: number; y: number; at: number } | null = null;
  /** Discos collected in this attempt (bit i = i-th disco of the level). */
  discoMask = 0;
  private discoX: number[] = [];
  private feedIdx = 0;
  private pressIdx = 0;

  /** Compile (once, then cached) and select level `index` of a campaign. */
  load(levels: readonly LevelDef[], index: number): CompiledLevel {
    this.index = Math.max(0, Math.min(levels.length - 1, index));
    const def = levels[this.index]!;
    let lv = this.cache.get(def.id);
    if (!lv) {
      lv = compileLevel(def);
      this.cache.set(def.id, lv);
    }
    this.level = lv;
    this.discoX = lv.rects.filter((r) => r.kind === COIN).map((r) => r.x0);
    return lv;
  }

  /** Put the runner at the start of the level, or at a practice checkpoint. */
  begin(world: World, player: Player, cp: Checkpoint | null): void {
    const lv = this.level!;
    const t = cp ? cp.t : lv.startT;
    this.songTime = Math.round(t / STEP) * STEP;
    const x = cp ? cp.state.x : lv.speed * this.songTime;
    const origin = Math.floor(x - BEHIND);
    world.reset(origin);
    this.feedIdx = 0;
    this.feed(world, x + 60);
    if (cp) {
      player.copyFrom(cp.state);
      player.prevX = player.x;
      player.prevY = player.y;
    } else {
      player.reset(x);
      player.speed = lv.speed;
    }
    this.pressIdx = 0;
    while (this.pressIdx < lv.presses.length && lv.presses[this.pressIdx]!.t < this.songTime) this.pressIdx++;
    if (!cp) {
      this.counts = { perfect: 0, good: 0, ok: 0, miss: 0 };
      this.combo = this.maxCombo = 0;
      this.discoMask = 0;
    }
    this.popup = null;
    this.respawnT = 0;
    this.waiting = true;
    this.waitSince = performance.now();
  }

  /** Add the level's rects that start before `untilX` (rects are sorted by x0). */
  feed(world: World, untilX: number): void {
    const rects = this.level!.rects;
    const origin = world.cursor;
    while (this.feedIdx < rects.length && rects[this.feedIdx]!.x0 < untilX) {
      const r = rects[this.feedIdx++]!;
      if (r.x1 <= origin) continue;
      const rect = world.add(Math.max(r.x0, origin), r.y0, r.x1, r.y1, r.kind);
      rect.code = r.code ?? 0;
      if (r.value !== undefined) rect.amp = r.value;
    }
  }

  /** The last checkpoint at or before song time `t`. */
  checkpointBefore(t: number): Checkpoint | null {
    let best: Checkpoint | null = null;
    for (const cp of this.level!.checkpoints) if (cp.t <= t) best = cp;
    return best;
  }

  /** Judge a press made at song time `t` against the nearest note. */
  press(t: number, x: number, y: number, now: number): Judgement | null {
    this.expire(t);
    const ps = this.level!.presses;
    let pick = -1;
    let bestDt = Infinity;
    for (let i = this.pressIdx; i < Math.min(ps.length, this.pressIdx + 3); i++) {
      const dt = Math.abs(ps[i]!.t - t);
      if (dt < bestDt) {
        bestDt = dt;
        pick = i;
      }
    }
    if (pick < 0 || bestDt * 1000 > JUDGE_MS.ok) return null;
    for (let i = this.pressIdx; i < pick; i++) this.judge('miss');
    this.pressIdx = pick + 1;
    const ms = bestDt * 1000;
    const j: Judgement = ms <= JUDGE_MS.perfect ? 'perfect' : ms <= JUDGE_MS.good ? 'good' : 'ok';
    this.judge(j);
    this.popup = { j, x, y, at: now };
    return j;
  }

  /** Notes that went by without a press count as misses. */
  expire(t: number): void {
    const ps = this.level!.presses;
    while (this.pressIdx < ps.length && (t - ps[this.pressIdx]!.t) * 1000 > JUDGE_MS.ok) {
      this.pressIdx++;
      this.judge('miss');
    }
  }

  private judge(j: Judgement): void {
    this.counts[j]++;
    if (j === 'miss') this.combo = 0;
    else this.maxCombo = Math.max(this.maxCombo, ++this.combo);
  }

  /** Weighted accuracy of the notes judged so far, 0..100. */
  get accuracy(): number {
    const c = this.counts;
    const n = c.perfect + c.good + c.ok + c.miss;
    if (n === 0) return 100;
    return Math.round(((c.perfect * WEIGHT.perfect + c.good * WEIGHT.good + c.ok * WEIGHT.ok) / n) * 100);
  }

  /** Percentage of the level covered at runner position `x`. */
  progressAt(x: number): number {
    const lv = this.level;
    if (!lv) return 0;
    return Math.max(0, Math.min(100, Math.floor((x / lv.endX) * 100)));
  }

  /** Record a disco picked up by the runner. */
  takeDisco(r: Rect): void {
    const i = this.discoX.indexOf(r.x0);
    if (i >= 0) this.discoMask |= 1 << i;
  }

  /** Beat position (in beats) and the energy of the current section, for visuals. */
  beat(): { beats: number; energy: number } {
    const lv = this.level;
    if (!lv) return { beats: 0, energy: 0 };
    const song = lv.song;
    const at = stepAtTime(song, this.songTime);
    const step = Math.floor(at);
    let si = 0;
    while (si < song.song.sections.length - 1 && song.sectionStart[si + 1]! <= step) si++;
    return { beats: at / 4, energy: song.song.sections[si]!.energy };
  }
}

export function popcount(n: number): number {
  let c = 0;
  for (let v = n; v; v &= v - 1) c++;
  return c;
}
