import { WORLD_LENGTH } from '../world/Difficulty';

/** Colour palette of one world. Colours are 0xRRGGBB so they can be blended without allocating. */
export interface Theme {
  name: string;
  skyTop: number;
  skyBottom: number;
  far: number;
  mid: number;
  ground: number;
  groundTop: number;
  block: number;
  blockTop: number;
  spike: number;
  pit: number;
}

export const THEMES: readonly Theme[] = [
  { name: 'Neón', skyTop: 0x1b1442, skyBottom: 0x5b2a86, far: 0x3a2272, mid: 0x2b1a5a, ground: 0x2ee6a6, groundTop: 0x8dffd9, block: 0x6ec1ff, blockTop: 0xbfe4ff, spike: 0xff4d6d, pit: 0x0d0824 },
  { name: 'Atardecer', skyTop: 0x2b1055, skyBottom: 0xff7e5f, far: 0xb04a6e, mid: 0x7a2e5a, ground: 0xffb347, groundTop: 0xffe0a3, block: 0xff6b9d, blockTop: 0xffc2d8, spike: 0x19e8ff, pit: 0x240b2e },
  { name: 'Océano', skyTop: 0x021b3a, skyBottom: 0x0b8fb3, far: 0x0a5a86, mid: 0x08406a, ground: 0x19d3b0, groundTop: 0x92fff0, block: 0xffd166, blockTop: 0xfff0bf, spike: 0xff5d73, pit: 0x01101f },
  { name: 'Bosque', skyTop: 0x0b2a1f, skyBottom: 0x3f8a4a, far: 0x24593a, mid: 0x174030, ground: 0xa7e05a, groundTop: 0xe4ffb0, block: 0xe08a4a, blockTop: 0xffcc9a, spike: 0xe83f5b, pit: 0x07140d },
  { name: 'Vacío', skyTop: 0x05050f, skyBottom: 0x2a1f5c, far: 0x211a52, mid: 0x161240, ground: 0xb388ff, groundTop: 0xe6d4ff, block: 0xff7ad9, blockTop: 0xffc9f0, spike: 0xffe14d, pit: 0x03030a },
];

/** Distance (tiles) each world lasts, and how long the cross-fade into the next one takes. */
export const THEME_LENGTH = WORLD_LENGTH;
export const THEME_FADE = 60;

const KEYS = ['skyTop', 'skyBottom', 'far', 'mid', 'ground', 'groundTop', 'block', 'blockTop', 'spike', 'pit'] as const;
type ColorKey = (typeof KEYS)[number];

const hex = (n: number): string => '#' + n.toString(16).padStart(6, '0');

function mix(a: number, b: number, t: number): number {
  const r = ((a >> 16) & 255) + (((b >> 16) & 255) - ((a >> 16) & 255)) * t;
  const g = ((a >> 8) & 255) + (((b >> 8) & 255) - ((a >> 8) & 255)) * t;
  const bl = (a & 255) + ((b & 255) - (a & 255)) * t;
  return ((r | 0) << 16) | ((g | 0) << 8) | (bl | 0);
}

/**
 * Computes the current CSS colours for a given distance. Strings are rebuilt only when the
 * (quantised) blend changes, so most frames allocate nothing; `version` tells the renderer
 * when to rebuild cached gradients.
 */
export class ThemeBlender {
  readonly c: Record<ColorKey, string> = {
    skyTop: '', skyBottom: '', far: '', mid: '', ground: '', groundTop: '',
    block: '', blockTop: '', spike: '', pit: '',
  };
  version = 0;
  /** Indices and blend of the two worlds currently on screen (for per-world decorations). */
  a = 0;
  b = 0;
  t = 0;
  private key = -1;

  update(distance: number): void {
    const d = Math.max(0, distance);
    const idx = Math.floor(d / THEME_LENGTH);
    const frac = d - idx * THEME_LENGTH;
    const fadeStart = THEME_LENGTH - THEME_FADE;
    let t = 0;
    if (frac > fadeStart) {
      const u = (frac - fadeStart) / THEME_FADE;
      t = u * u * (3 - 2 * u);
    }
    const qt = Math.round(t * 32);
    const a = idx % THEMES.length;
    const b = (idx + 1) % THEMES.length;
    const key = (idx * 64 + qt) | 0;
    if (key === this.key) return;
    this.key = key;
    this.a = a;
    this.b = b;
    this.t = qt / 32;
    const ta = THEMES[a]!;
    const tb = THEMES[b]!;
    for (const k of KEYS) this.c[k] = hex(mix(ta[k], tb[k], this.t));
    this.version++;
  }
}
