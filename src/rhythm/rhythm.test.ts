import { describe, expect, it } from 'vitest';
import { STEP } from '../core/Loop';
import { Player } from '../physics/Player';
import { PAD, RING, SOLID } from '../world/Rect';
import { World } from '../world/World';
import { STEPS_PER_BAR, compileSong, degreeToMidi } from '../audio/song';
import { chartEvents, compileLevel, pressWindow, runPerfect, type CompiledLevel } from './level';
import { LEVELS } from './levels';
import { RhythmRun, gradeOf } from './RhythmRun';

const compiled: CompiledLevel[] = LEVELS.map((d) => compileLevel(d));

describe('rhythm physics: pads and rings', () => {
  const flat = (): World => {
    const w = new World(256);
    w.reset(-20);
    w.add(-20, -50, 200, 0, SOLID);
    return w;
  };

  it('a pad launches the runner high without a press', () => {
    const w = flat();
    w.add(3, 0, 3.8, 0.25, PAD);
    const p = new Player();
    p.reset(0);
    p.speed = 8;
    let apex = 0;
    for (let n = 0; n < 200; n++) {
      p.step(STEP, false, false, w);
      apex = Math.max(apex, p.y);
    }
    expect(apex).toBeGreaterThan(2.6);
    expect(p.dead).toBe(false);
  });

  it('a ring needs a press while touching it, works once, and ignores how long the press is held', () => {
    const run = (pressAt: number, hold: number): number => {
      const w = flat();
      w.add(1.5, 0.9, 2.5, 2.7, RING);
      const p = new Player();
      p.reset(0);
      p.speed = 8;
      let apex = 0;
      let jumps = 0;
      for (let n = 0; n < 220; n++) {
        const pressed = n === 0 || n === pressAt;
        const wasUp = p.y > 0.2;
        p.step(STEP, pressed, n < 3 || (n >= pressAt && n < pressAt + hold), w);
        if (p.jumped && wasUp) jumps++; // mid-air jumps only
        apex = Math.max(apex, p.y);
      }
      return jumps * 100 + apex;
    };
    const atRing = Math.round(2 / 8 / STEP); // runner centre at x = 2 → inside the ring, near the top of its jump
    const tap = run(atRing, 2);
    const held = run(atRing, 40);
    expect(Math.floor(tap / 100)).toBe(1); // the ring jump
    expect(tap % 100).toBeCloseTo(held % 100, 5); // same arc whatever the hold
    expect(Math.floor(run(atRing + 16, 2) / 100)).toBe(0); // press after passing the ring: no mid-air jump
  });
});

describe('songs', () => {
  it('compile, and every lead token and chart character is valid', () => {
    for (const d of LEVELS) {
      const c = compileSong(d.song);
      expect(c.totalSteps).toBe(d.song.sections.reduce((n, s) => n + s.bars * STEPS_PER_BAR, 0));
      expect(chartEvents(d.song).length).toBeGreaterThan(20);
    }
  });

  it('maps scale degrees to the right notes', () => {
    expect(degreeToMidi(57, 'minor', 1)).toBe(57);
    expect(degreeToMidi(57, 'minor', 3)).toBe(60); // A minor third: C
    expect(degreeToMidi(57, 'minor', 8)).toBe(69); // octave
    expect(degreeToMidi(57, 'minor', 0)).toBe(55); // the 7th below: G
  });
});

describe('rhythm levels', () => {
  it('are ordered from gentle to brutal, each between 45 s and 90 s, with 3 discos', () => {
    let prevBpm = 0;
    let prevTier = 0;
    for (const lv of compiled) {
      expect(lv.def.song.bpm).toBeGreaterThan(prevBpm);
      expect(lv.def.tier).toBeGreaterThanOrEqual(prevTier);
      prevBpm = lv.def.song.bpm;
      prevTier = lv.def.tier;
      expect(lv.endT).toBeGreaterThan(45);
      expect(lv.endT).toBeLessThan(90);
      expect(lv.endT).toBeLessThanOrEqual(lv.song.totalSteps * lv.song.stepDur + 1e-9);
      expect(lv.discos).toBe(3);
      expect(lv.checkpoints.length, `${lv.def.id} practice checkpoints`).toBeGreaterThanOrEqual(3);
    }
  });

  it('put every press exactly on the 16th-note grid', () => {
    for (const lv of compiled) {
      for (const p of lv.presses) {
        const steps = p.t / lv.song.stepDur;
        expect(Math.abs(steps - Math.round(steps))).toBeLessThan(1e-9);
      }
    }
  });

  it('centre every ground obstacle on its note with a human-sized window', () => {
    for (const lv of compiled) {
      const kinds = new Set(chartEvents(lv.def.song).map((e) => e.kind));
      for (const k of ['s', 'd', 't', 'b', 'B', 'p', 'P', 'u'] as const) {
        if (!kinds.has(k)) continue;
        expect(pressWindow(k, lv.speed).ms, `${lv.def.id} "${k}"`).toBeGreaterThanOrEqual(100);
      }
    }
  });

  for (const lv of compiled) {
    it(`${lv.def.id}: pressing on the beat clears it and collects every disco`, () => {
      const res = runPerfect(lv);
      expect(res.ok).toBe(true);
      expect(res.discos).toBe(3);
    });

    it(`${lv.def.id}: forgiving with sloppy timing and any hold length`, () => {
      const jitter = lv.def.tier <= 2 ? 60 : 45;
      for (let seed = 1; seed <= 6; seed++) {
        const r = runPerfect(lv, { jitterMs: jitter, seed });
        expect(r.ok, `±${jitter} ms, seed ${seed}: dies at ${r.t.toFixed(2)} s`).toBe(true);
      }
      for (const holdMode of ['short', 'long'] as const) expect(runPerfect(lv, { holdMode }).ok, holdMode).toBe(true);
      for (const shiftMs of [-40, 40]) expect(runPerfect(lv, { shiftMs }).ok, `shift ${shiftMs}`).toBe(true);
    });

    it(`${lv.def.id}: is not trivial (doing nothing fails early)`, () => {
      const r = runPerfect({ ...lv, presses: [] });
      expect(r.ok).toBe(false);
      expect(r.t).toBeLessThan(lv.endT * 0.25);
    });
  }

  it('practice checkpoints restart from the ground with room before the next note', () => {
    for (const lv of compiled) {
      for (const cp of lv.checkpoints) {
        expect(cp.state.grounded).toBe(true);
        const next = lv.presses.find((p) => p.t >= cp.t);
        if (next) expect(next.t - cp.t).toBeGreaterThan(0.35);
      }
    }
  });
});

describe('RhythmRun judging', () => {
  it('grades presses by distance to the note and counts skipped notes as misses', () => {
    const r = new RhythmRun();
    const lv = r.load(0);
    const w = new World(256);
    const p = new Player();
    r.begin(w, p, null);
    const [a, b, c, d] = lv.presses;
    expect(r.press(a!.t + 0.02, 0, 0, 0)).toBe('perfect');
    expect(r.press(b!.t - 0.07, 0, 0, 0)).toBe('good');
    expect(r.press(c!.t + 0.12, 0, 0, 0)).toBe('ok');
    r.expire(d!.t + 0.2); // d skipped
    expect(r.counts).toEqual({ perfect: 1, good: 1, ok: 1, miss: 1 });
    expect(r.combo).toBe(0);
    expect(r.maxCombo).toBe(3);
    expect(r.accuracy).toBe(Math.round(((1 + 0.75 + 0.4) / 4) * 100));
    expect(r.press(d!.t + 1.5, 0, 0, 0)).toBeNull(); // nowhere near a note
  });

  it('turns accuracy into a grade', () => {
    expect(gradeOf(100)).toBe('S');
    expect(gradeOf(90)).toBe('A');
    expect(gradeOf(75)).toBe('B');
    expect(gradeOf(10)).toBe('C');
  });

  it('feeds the level into a small World without overflowing it, from the start or a checkpoint', () => {
    const r = new RhythmRun();
    for (let i = 0; i < LEVELS.length; i++) {
      const lv = r.load(i);
      const w = new World(256);
      const p = new Player();
      for (const cp of [null, ...lv.checkpoints]) {
        r.begin(w, p, cp);
        for (let x = p.x; x < lv.endX; x += 5) {
          r.feed(w, x + 60);
          w.prune(x - 20);
        }
      }
    }
  });
});
