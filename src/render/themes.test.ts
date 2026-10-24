import { describe, expect, it } from 'vitest';
import { THEMES, THEME_FADE, THEME_LENGTH, ThemeBlender } from './themes';

const hex = (n: number): string => '#' + n.toString(16).padStart(6, '0');

describe('ThemeBlender', () => {
  it('starts on the first world with its exact colours', () => {
    const b = new ThemeBlender();
    b.update(0);
    expect(b.c.ground).toBe(hex(THEMES[0]!.ground));
    expect(b.c.skyTop).toBe(hex(THEMES[0]!.skyTop));
  });

  it('holds colours (and does not bump the version) away from boundaries', () => {
    const b = new ThemeBlender();
    b.update(10);
    const v = b.version;
    b.update(200);
    expect(b.version).toBe(v);
  });

  it('cross-fades into the next world and lands exactly on it', () => {
    const b = new ThemeBlender();
    b.update(THEME_LENGTH - THEME_FADE - 1);
    const before = b.c.ground;
    b.update(THEME_LENGTH - THEME_FADE / 2);
    expect(b.c.ground).not.toBe(before);
    expect(b.t).toBeGreaterThan(0.3);
    expect(b.t).toBeLessThan(0.7);
    b.update(THEME_LENGTH + 1);
    expect(b.c.ground).toBe(hex(THEMES[1]!.ground));
    expect(b.a).toBe(1);
  });

  it('wraps around after the last world', () => {
    const b = new ThemeBlender();
    b.update(THEME_LENGTH * THEMES.length + 5);
    expect(b.a).toBe(0);
    expect(b.c.ground).toBe(hex(THEMES[0]!.ground));
  });
});
