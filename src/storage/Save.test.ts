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
    expect(a.data).toMatchObject({ best: 0, attempts: 0, coins: 0 });
    a.data.best = 321;
    a.data.attempts = 7;
    a.flush();
    expect(new Save(st).data).toMatchObject({ best: 321, attempts: 7 });
  });

  it('recovers from corrupt or malicious content', () => {
    expect(new Save(fake('{not json')).data.best).toBe(0);
    const s = new Save(fake(JSON.stringify({ best: -5, attempts: 'many', coins: NaN, bestDist: 12.9 })));
    expect(s.data).toMatchObject({ best: 0, attempts: 0, coins: 0, bestDist: 12 });
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

  it('stores skins and challenge progress, sanitising bad input', () => {
    const st = fake();
    const a = new Save(st);
    expect(a.data).toMatchObject({ maxDist: 0, skin: 'classic', unlocked: ['classic'] });
    a.data.maxDist = 640;
    a.data.skin = 'mint';
    a.data.unlocked = ['classic', 'mint'];
    a.flush();
    expect(new Save(st).data).toMatchObject({ maxDist: 640, skin: 'mint', unlocked: ['classic', 'mint'] });
    const bad = new Save(fake(JSON.stringify({ skin: 7, unlocked: ['a', 3, 'a', '', 'b'], maxDist: -1 })));
    expect(bad.data).toMatchObject({ skin: 'classic', unlocked: ['a', 'b'], maxDist: 0 });
  });

  it('a stale second tab cannot erase progress made in the first', () => {
    const st = fake();
    const tabA = new Save(st);
    const tabB = new Save(st); // loaded while everything was still zero
    tabA.data.best = 500;
    tabA.data.bestDist = 480;
    tabA.data.maxDist = 1200;
    tabA.data.unlocked = ['classic', 'mint', 'rose', 'shades'];
    tabA.flush();
    tabB.data.attempts = 3;
    tabB.flush();
    const merged = new Save(st).data;
    expect(merged).toMatchObject({ best: 500, bestDist: 480, maxDist: 1200, attempts: 3 });
    expect(merged.unlocked).toEqual(['classic', 'mint', 'rose', 'shades']);
  });

  it('does not throw when storage is unavailable or full', () => {
    const broken: StorageLike = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('quota'); },
    };
    const s = new Save(broken);
    s.data.best = 10;
    expect(() => s.flush()).not.toThrow();
    expect(s.data.best).toBe(10);
  });
});
