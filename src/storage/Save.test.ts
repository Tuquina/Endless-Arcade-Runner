import { describe, expect, it } from 'vitest';
import { SAVE_KEY, Save, type StorageLike } from './Save';

function fake(initial?: string): StorageLike & { store: Map<string, string> } {
  const store = new Map<string, string>();
  if (initial !== undefined) store.set(SAVE_KEY, initial);
  return { store, getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) };
}

describe('Save', () => {
  it('starts empty and round-trips through storage', () => {
    const st = fake();
    const a = new Save(st);
    expect(a.data).toMatchObject({ attempts: 0, coins: 0 });
    a.data.records.normal.best = 321;
    a.data.attempts = 7;
    a.flush();
    expect(new Save(st).data).toMatchObject({ attempts: 7, records: { normal: { best: 321 } } });
  });

  it('recovers from corrupt or malicious content', () => {
    expect(new Save(fake('{not json')).data.records.normal.best).toBe(0);
    const s = new Save(fake(JSON.stringify({ best: -5, attempts: 'many', coins: NaN, bestDist: 12.9 })));
    expect(s.data).toMatchObject({ attempts: 0, coins: 0, records: { normal: { best: 0, bestDist: 12 } } });
  });

  it('keeps audio settings and defaults them to on', () => {
    const st = fake();
    const a = new Save(st);
    expect(a.data).toMatchObject({ music: true, sfx: true });
    a.data.music = false;
    a.flush();
    expect(new Save(st).data).toMatchObject({ music: false, sfx: true });
    expect(new Save(fake(JSON.stringify({ music: 'no' }))).data.music).toBe(true);
  });

  it('keeps the disco sound of the music modes, soft by default', () => {
    const st = fake();
    const a = new Save(st);
    expect(a.data.musicSfx).toBe('soft');
    a.data.musicSfx = 'off';
    a.flush();
    expect(new Save(st).data.musicSfx).toBe('off');
    expect(new Save(fake(JSON.stringify({ musicSfx: 'loud' }))).data.musicSfx).toBe('soft');
  });

  it('stores skins and challenge progress, sanitising bad input', () => {
    const st = fake();
    const a = new Save(st);
    expect(a.data).toMatchObject({ maxDist: 0, saws: 0, crushers: 0, skin: 'classic', unlocked: ['classic'] });
    a.data.maxDist = 640;
    a.data.saws = 12;
    a.data.crushers = 5;
    a.data.skin = 'mint';
    a.data.unlocked = ['classic', 'mint'];
    a.flush();
    expect(new Save(st).data).toMatchObject({ maxDist: 640, saws: 12, crushers: 5, skin: 'mint', unlocked: ['classic', 'mint'] });
    const bad = new Save(fake(JSON.stringify({ skin: 7, unlocked: ['a', 3, 'a', '', 'b'], maxDist: -1 })));
    expect(bad.data).toMatchObject({ skin: 'classic', unlocked: ['a', 'b'], maxDist: 0 });
  });

  it('a stale second tab cannot erase progress made in the first', () => {
    const st = fake();
    const tabA = new Save(st);
    const tabB = new Save(st); // loaded while everything was still zero
    tabA.data.records.hard = { best: 500, bestDist: 480 };
    tabA.data.maxDist = 1200;
    tabA.data.saws = 30;
    tabA.data.unlocked = ['classic', 'mint', 'rose', 'shades'];
    tabA.flush();
    tabB.data.attempts = 3;
    tabB.flush();
    const merged = new Save(st).data;
    expect(merged).toMatchObject({ records: { hard: { best: 500, bestDist: 480 } }, maxDist: 1200, attempts: 3, saws: 30 });
    expect(merged.unlocked).toEqual(['classic', 'mint', 'rose', 'shades']);
  });

  it('does not throw when storage is unavailable or full', () => {
    const broken: StorageLike = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('quota'); },
    };
    const s = new Save(broken);
    s.data.records.normal.best = 10;
    expect(() => s.flush()).not.toThrow();
    expect(s.data.records.normal.best).toBe(10);
  });
});

describe('Save: difficulty records', () => {
  it('moves a pre-difficulty record to Normal and defaults the selection', () => {
    const s = new Save(fake(JSON.stringify({ best: 900, bestDist: 700 })));
    expect(s.data.records).toEqual({ easy: { best: 0, bestDist: 0 }, normal: { best: 900, bestDist: 700 }, hard: { best: 0, bestDist: 0 } });
    expect(s.data).toMatchObject({ mode: 'endless', difficulty: 'normal' });
  });

  it('keeps the chosen difficulty and per-difficulty records, ignoring bad values', () => {
    const st = fake();
    const a = new Save(st);
    a.data.difficulty = 'hard';
    a.data.records.hard = { best: 321, bestDist: 300 };
    a.flush();
    expect(new Save(st).data).toMatchObject({ difficulty: 'hard', records: { hard: { best: 321, bestDist: 300 }, easy: { best: 0 } } });
    const bad = new Save(fake(JSON.stringify({ difficulty: 'insane', mode: 'x', records: { hard: { best: -3, bestDist: 'a' }, easy: 5 } })));
    expect(bad.data).toMatchObject({ difficulty: 'normal', mode: 'endless', records: { hard: { best: 0, bestDist: 0 }, easy: { best: 0 } } });
  });

  it('merges records per difficulty across tabs', () => {
    const st = fake();
    const a = new Save(st);
    const b = new Save(st);
    a.data.records.easy = { best: 50, bestDist: 40 };
    a.flush();
    b.data.records.hard = { best: 70, bestDist: 60 };
    b.flush();
    expect(new Save(st).data.records).toMatchObject({ easy: { best: 50 }, hard: { best: 70 } });
  });
});

describe('Save: rhythm progress', () => {
  it('stores per-level records and settings, sanitising bad input, and merges tabs', () => {
    const st = fake();
    const a = new Save(st);
    const b = new Save(st);
    a.data.rhythm['primer-pulso'] = { best: 100, done: true, acc: 92, discos: 0b101, attempts: 7 };
    a.data.latency = 40;
    a.flush();
    b.data.rhythm['primer-pulso'] = { best: 60, done: false, acc: 0, discos: 0b010, attempts: 9 };
    b.flush();
    expect(new Save(st).data.rhythm['primer-pulso']).toEqual({ best: 100, done: true, acc: 92, discos: 0b111, attempts: 9 });
    const bad = new Save(fake(JSON.stringify({ rhythm: { x: { best: 400, done: 'yes', discos: -1 }, y: 3 }, latency: 9999, practice: 1 })));
    expect(bad.data.rhythm).toEqual({ x: { best: 100, done: false, acc: 0, discos: 0, attempts: 0 } });
    expect(bad.data).toMatchObject({ latency: 250, practice: false });
  });
});
