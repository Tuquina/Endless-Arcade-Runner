import { describe, expect, it } from 'vitest';
import { PORTAL_BALL, PORTAL_GRAVITY_DOWN, PORTAL_SHIP, PORTAL_SPEED, PORTAL_WAVE, RING, TRIGGER } from '../world/Rect';
import { runPerfect } from './level';
import { SecretStream, zoneTempo } from './secret';

/** A finite copy of the stream's level (it is endless), to run a scripted player through. */
function upTo(st: SecretStream) {
  return { ...st.level, endT: st.generatedT - 0.5, endX: st.generatedX };
}

describe('secret mode', () => {
  const streams = [1, 2, 3, 4].map((seed) => {
    const st = new SecretStream(seed);
    st.ensure(0, 2600);
    return st;
  });

  it('opens with every kind of zone, then keeps mixing them without repeats', () => {
    for (const st of streams) {
      const kinds = st.zones.map((z) => z.kind);
      expect(kinds.slice(0, 7)).toEqual(['cube', 'gravity', 'ball', 'cube', 'ship', 'mix', 'wave']);
      for (let i = 1; i < kinds.length; i++) expect(kinds[i], `zone ${i}`).not.toBe(kinds[i - 1]);
      expect(st.zones.length).toBeGreaterThanOrEqual(12);
    }
  });

  it('uses every mechanic of the game', () => {
    const st = streams[0]!;
    const rects = st.level.rects;
    const codes = new Set(rects.filter((r) => r.kind === TRIGGER).map((r) => r.code));
    for (const c of [PORTAL_BALL, PORTAL_SHIP, PORTAL_WAVE, PORTAL_GRAVITY_DOWN, PORTAL_SPEED]) expect(codes.has(c), `portal ${c}`).toBe(true);
    expect(rects.some((r) => r.kind === RING)).toBe(true);
    expect(rects.some((r) => r.mover?.wave === 1), 'crushers').toBe(true);
    expect(rects.some((r) => r.mover?.wave === 0), 'saws').toBe(true);
    expect(rects.some((r) => r.y1 >= 12), 'ceilings').toBe(true);
  });

  it('gets faster: tempo and speed climb with every zone, then hold', () => {
    expect(zoneTempo(0).bpm).toBeLessThan(zoneTempo(6).bpm);
    expect(zoneTempo(0).speed).toBeLessThan(zoneTempo(6).speed);
    expect(zoneTempo(40)).toEqual(zoneTempo(80));
  });

  it('every zone is built (rarely needs a second roll) and the whole run is completable', () => {
    for (const st of streams) {
      expect(st.failures.length, st.failures.join('\n')).toBeLessThanOrEqual(2);
      const lv = upTo(st);
      expect(runPerfect(lv).ok).toBe(true);
      for (const holdMode of ['short', 'long'] as const) expect(runPerfect(lv, { holdMode }).ok, holdMode).toBe(true);
      for (let seed = 1; seed <= 3; seed++) {
        const r = runPerfect(lv, { jitterMs: 35, seed });
        expect(r.ok, `seed ${st.seed}, ±35 ms #${seed}: dies at ${r.t.toFixed(1)} s`).toBe(true);
      }
    }
  }, 120000);

  it('presses and rects stay in order as zones are appended (the world is fed front to back)', () => {
    const st = new SecretStream(9);
    st.ensure(0, 1200);
    const n = st.level.presses.length;
    st.ensure(st.generatedX, 600);
    const ps = st.level.presses;
    expect(ps.length).toBeGreaterThan(n);
    for (let i = 1; i < ps.length; i++) expect(ps[i]!.t).toBeGreaterThan(ps[i - 1]!.t);
    const rs = st.level.rects;
    for (let i = 1; i < rs.length; i++) expect(rs[i]!.x0).toBeGreaterThanOrEqual(rs[i - 1]!.x0 - 30);
  });
});
