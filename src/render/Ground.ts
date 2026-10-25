import { SOLID, type Rect } from '../world/Rect';
import { hash } from './hash';
import type { ThemeBlender } from './themes';

/** World indices (order of THEMES). */
const NEON = 0;
const DUSK = 1;
const OCEAN = 2;
const FOREST = 3;
const VOID = 4;

const FLOWERS = ['#fff3b0', '#ffb3d1', '#ffffff', '#c9b3ff'];

/**
 * Paints the ground: a depth gradient, strata and stones under the surface, a lit lip with a soft
 * shadow, cliff edges where a pit begins, and per-world life on top (swaying grass and flowers,
 * a neon grid, seaweed with bubbles, desert pebbles, glowing crystals). Everything is placed by a
 * hash of its world x, so it scrolls with the ground, and animated with the game clock. One path
 * per kind of decoration and a cached gradient keep a frame cheap and free of garbage.
 */
export class GroundPainter {
  /** A 2 px wide image of the ground's depth gradient and lit lip, stretched across the screen each frame. */
  private strip: HTMLCanvasElement | null = null;
  private bodyKey = '';
  private readonly slabs: Rect[] = [];
  private readonly pits: number[] = [];

  /**
   * Draw every ground slab in `vis`. `groundPx` is the screen y of the surface, `scale` pixels per
   * tile, and `camX` the world x at the left edge of the screen.
   */
  draw(
    ctx: CanvasRenderingContext2D,
    vis: readonly Rect[],
    theme: ThemeBlender,
    time: number,
    camX: number,
    scale: number,
    groundPx: number,
    w: number,
    h: number,
    groundDepth: number,
    lite: boolean,
  ): void {
    const c = theme.c;
    const bottom = h + 40;
    const lipH = Math.max(4, scale * 0.2);
    const key = `${theme.version}:${h}:${groundPx}:${scale}`;
    if (this.bodyKey !== key || !this.strip) this.buildStrip(c.ground, c.groundDeep, c.groundTop, groundPx, bottom, lipH, key);
    const viewW = w / scale;
    this.findPits(vis, groundDepth, camX - 1, camX + viewW + 1);

    // One continuous pass across the whole screen (no per-slab clipping: that is what is costly).
    // The depth gradient and the lit lip never change between frames, so they are one cached blit.
    const strip = this.strip!;
    ctx.drawImage(strip, 0, 0, strip.width, strip.height, 0, groundPx, w, strip.height);
    // `lite` (slow devices) keeps the depth gradient, lip, pits and cliffs but skips the decoration.
    if (!lite) {
      this.underground(ctx, theme, time, camX, scale, groundPx, bottom, viewW, w);
      this.surface(ctx, theme, time, camX, scale, groundPx, viewW);
    }

    // …then the pits are cut out of it, with a darker cliff face and a rounded overhang at each side.
    for (let i = 0; i < this.pits.length; i += 2) {
      const x0 = Math.max(-2, (this.pits[i]! - camX) * scale);
      const x1 = Math.min(w + 2, (this.pits[i + 1]! - camX) * scale);
      ctx.fillStyle = c.pit;
      ctx.fillRect(x0, groundPx, x1 - x0, bottom - groundPx);
      if (this.pits[i]! > camX - 1) this.edge(ctx, c.groundTop, x0, -1, scale, groundPx, bottom, lipH);
      if (this.pits[i + 1]! < camX + viewW + 1) this.edge(ctx, c.groundTop, x1, 1, scale, groundPx, bottom, lipH);
    }

    if (!lite) this.foreground(ctx, theme, camX, scale, bottom, w);
  }

  private buildStrip(ground: string, deep: string, lipColor: string, top: number, bottom: number, lipH: number, key: string): void {
    const strip = this.strip ?? document.createElement('canvas');
    this.strip = strip;
    strip.width = 2;
    strip.height = Math.max(1, Math.ceil(bottom - top));
    const g = strip.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, strip.height);
    grad.addColorStop(0, ground);
    grad.addColorStop(1, deep);
    g.fillStyle = grad;
    g.fillRect(0, 0, 2, strip.height);
    // Lit lip with a soft shadow under it.
    g.fillStyle = lipColor;
    g.fillRect(0, 0, 2, lipH);
    g.fillStyle = 'rgba(0,0,0,0.2)';
    g.fillRect(0, lipH, 2, lipH * 0.7);
    g.fillStyle = 'rgba(0,0,0,0.1)';
    g.fillRect(0, lipH * 1.7, 2, lipH * 0.9);
    g.fillStyle = 'rgba(255,255,255,0.45)';
    g.fillRect(0, 0, 2, Math.max(2, lipH * 0.2));
    this.bodyKey = key;
  }

  /** Gaps between ground slabs inside [from, to]: `[start, end, start, end, …]` in world x (reused array). */
  private findPits(vis: readonly Rect[], groundDepth: number, from: number, to: number): void {
    this.slabs.length = 0;
    for (let i = 0; i < vis.length; i++) {
      const r = vis[i]!;
      if (r.kind === SOLID && r.y0 <= groundDepth) this.slabs.push(r);
    }
    this.slabs.sort((p, q) => p.x0 - q.x0);
    this.pits.length = 0;
    let covered = from;
    for (let i = 0; i < this.slabs.length; i++) {
      const r = this.slabs[i]!;
      if (r.x0 > covered + 0.01) this.pits.push(covered, r.x0);
      if (r.x1 > covered) covered = r.x1;
    }
    if (covered < to - 0.01) this.pits.push(covered, to);
  }

  /** Is world x over a pit (so nothing should grow there)? */
  private inPit(wx: number): boolean {
    for (let i = 0; i < this.pits.length; i += 2) if (wx > this.pits[i]! - 0.12 && wx < this.pits[i + 1]! + 0.12) return true;
    return false;
  }

  /** `dir` is -1 for the left end of a slab and +1 for the right end. */
  private edge(ctx: CanvasRenderingContext2D, lipColor: string, x: number, dir: -1 | 1, scale: number, top: number, bottom: number, lipH: number): void {
    const bw = scale * 0.07;
    for (let k = 0; k < 6; k++) {
      ctx.fillStyle = `rgba(0,0,0,${(0.36 * (1 - k / 6)).toFixed(3)})`;
      ctx.fillRect(dir < 0 ? x + k * bw : x - (k + 1) * bw, top, bw, bottom - top);
    }
    // Overhanging, rounded corner of the lip.
    ctx.fillStyle = lipColor;
    ctx.beginPath();
    ctx.arc(x + dir * lipH * 0.05, top + lipH / 2, lipH / 2, 0, 6.283);
    ctx.fill();
  }

  // -----------------------------------------------------------------------------------------
  // Under the surface
  // -----------------------------------------------------------------------------------------
  private underground(ctx: CanvasRenderingContext2D, theme: ThemeBlender, time: number, camX: number, s: number, top: number, bottom: number, viewW: number, w: number): void {
    const x0w = camX - 1;
    const x1w = camX + viewW + 1;

    // Strata: three wavy seams.
    ctx.strokeStyle = 'rgba(0,0,0,0.16)';
    ctx.lineWidth = Math.max(2, s * 0.05);
    ctx.beginPath();
    const step = Math.max(10, s * 0.6);
    for (const depth of [0.9, 1.9, 3.2]) {
      for (let sx = -step; sx <= w + step; sx += step) {
        const wx = sx / s + camX;
        const y = top + (depth + Math.sin(wx * 0.9 + depth * 3) * 0.07) * s;
        if (sx < 0) ctx.moveTo(sx, y);
        else ctx.lineTo(sx, y);
      }
    }
    ctx.stroke();

    // Stones scattered through the soil, darker and lighter ones.
    const cell = 0.8;
    ctx.beginPath();
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    const lightStones: number[] = [];
    for (let i = Math.floor(x0w / cell); i <= Math.floor(x1w / cell); i++) {
      const wx = (i + hash(i)) * cell;
      const depth = 0.4 + hash(i + 31) * 2.8;
      const rr = (0.05 + 0.09 * hash(i + 77)) * s;
      const sx = (wx - camX) * s;
      const sy = top + depth * s;
      if (hash(i + 5) < 0.6) {
        ctx.moveTo(sx + rr * 1.3, sy);
        ctx.ellipse(sx, sy, rr * 1.3, rr, 0, 0, 6.283);
      } else lightStones.push(sx, sy, rr);
    }
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    for (let i = 0; i < lightStones.length; i += 3) {
      const sx = lightStones[i]!;
      const sy = lightStones[i + 1]!;
      const rr = lightStones[i + 2]!;
      ctx.moveTo(sx + rr * 1.3, sy);
      ctx.ellipse(sx, sy, rr * 1.3, rr, 0, 0, 6.283);
    }
    ctx.fill();

    // Per-world detail, cross-faded during the transition between two worlds.
    this.undergroundOf(theme.a, 1 - theme.t, ctx, theme, time, camX, s, top, bottom, viewW, w);
    if (theme.b !== theme.a && theme.t > 0.01) this.undergroundOf(theme.b, theme.t, ctx, theme, time, camX, s, top, bottom, viewW, w);
  }

  private undergroundOf(idx: number, alpha: number, ctx: CanvasRenderingContext2D, theme: ThemeBlender, time: number, camX: number, s: number, top: number, bottom: number, viewW: number, w: number): void {
    const c = theme.c;
    ctx.globalAlpha = alpha;
    if (idx === NEON) {
      // Synthwave grid receding into the ground: horizontal lines getting wider apart, slanted verticals.
      ctx.strokeStyle = c.groundTop;
      ctx.lineWidth = Math.max(1.5, s * 0.03);
      ctx.globalAlpha = alpha * (0.3 + 0.12 * Math.sin(time * 2));
      ctx.beginPath();
      for (const d of [0.4, 0.9, 1.6, 2.7, 4.3]) {
        ctx.moveTo(0, top + d * s);
        ctx.lineTo(w, top + d * s);
      }
      const cx = w * 0.3;
      for (let i = Math.floor((camX - 1) / 1.2); i <= Math.floor((camX + viewW + 1) / 1.2); i++) {
        const x = (i * 1.2 - camX) * s;
        ctx.moveTo(x, top);
        ctx.lineTo(x + (x - cx) * 0.4, bottom);
      }
      ctx.stroke();
    } else if (idx === DUSK) {
      // Layered rock bands.
      ctx.fillStyle = 'rgba(0,0,0,0.09)';
      ctx.fillRect(0, top + 0.6 * s, w, 0.5 * s);
      ctx.fillRect(0, top + 1.9 * s, w, 0.6 * s);
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.fillRect(0, top + 1.2 * s, w, 0.4 * s);
    } else if (idx === OCEAN) {
      // Sand ripples.
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = Math.max(1.5, s * 0.035);
      ctx.beginPath();
      for (const d of [0.45, 0.95]) {
        for (let sx = -10; sx <= w + 10; sx += Math.max(8, s * 0.35)) {
          const wx = sx / s + camX;
          const y = top + (d + Math.sin(wx * 2.1 + d * 5) * 0.05) * s;
          if (sx < 0) ctx.moveTo(sx, y);
          else ctx.lineTo(sx, y);
        }
      }
      ctx.stroke();
    } else if (idx === FOREST) {
      // Roots hanging down from the surface.
      ctx.strokeStyle = 'rgba(0,0,0,0.28)';
      ctx.lineWidth = Math.max(1.5, s * 0.05);
      ctx.beginPath();
      for (let i = Math.floor((camX - 1) / 1.4); i <= Math.floor((camX + viewW + 1) / 1.4); i++) {
        const x = ((i + hash(i + 3)) * 1.4 - camX) * s;
        const len = (0.5 + hash(i + 9) * 0.7) * s;
        ctx.moveTo(x, top + 0.2 * s);
        ctx.quadraticCurveTo(x + (hash(i + 12) - 0.5) * s * 0.4, top + len * 0.6, x + (hash(i + 14) - 0.5) * s * 0.3, top + len);
      }
      ctx.stroke();
    } else if (idx === VOID) {
      // Cracks with a glow that breathes.
      ctx.strokeStyle = c.groundTop;
      ctx.lineWidth = Math.max(1.5, s * 0.035);
      for (let i = Math.floor((camX - 2) / 2.6); i <= Math.floor((camX + viewW + 2) / 2.6); i++) {
        const base = ((i + hash(i + 2)) * 2.6 - camX) * s;
        ctx.globalAlpha = alpha * (0.28 + 0.22 * Math.sin(time * 2 + i));
        ctx.beginPath();
        ctx.moveTo(base, top + 0.25 * s);
        for (let k = 1; k <= 5; k++) {
          ctx.lineTo(base + (k % 2 ? 0.18 : -0.12) * s * (0.6 + hash(i * 7 + k)), top + (0.25 + k * 0.32) * s);
        }
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  // -----------------------------------------------------------------------------------------
  // On the surface
  // -----------------------------------------------------------------------------------------
  private surface(ctx: CanvasRenderingContext2D, theme: ThemeBlender, time: number, camX: number, s: number, top: number, viewW: number): void {
    this.surfaceOf(theme.a, 1 - theme.t, ctx, theme, time, camX, s, top, viewW);
    if (theme.b !== theme.a && theme.t > 0.01) this.surfaceOf(theme.b, theme.t, ctx, theme, time, camX, s, top, viewW);
  }

  private surfaceOf(idx: number, alpha: number, ctx: CanvasRenderingContext2D, theme: ThemeBlender, time: number, camX: number, s: number, top: number, viewW: number): void {
    const c = theme.c;
    ctx.globalAlpha = alpha;
    const from = camX - 1;
    const to = camX + viewW + 1;
    if (idx === FOREST) {
      // Grass blades swaying in the wind: plain triangles (cheap) in two tones, one path per tone.
      const cell = 0.24;
      for (let tone = 0; tone < 2; tone++) {
        ctx.fillStyle = tone === 0 ? c.ground : c.groundTop;
        ctx.beginPath();
        for (let i = Math.floor(from / cell); i <= Math.floor(to / cell); i++) {
          if ((i & 1) !== tone) continue;
          const wx = (i + hash(i)) * cell;
          if (this.inPit(wx)) continue;
          const hgt = (0.16 + 0.3 * hash(i + 11)) * s * (tone === 0 ? 1.4 : 1.0);
          const sway = Math.sin(time * 2.4 + wx * 1.3) * 0.08 * s;
          const sx = (wx - camX) * s;
          ctx.moveTo(sx - 0.06 * s, top + 1);
          ctx.lineTo(sx + sway, top - hgt);
          ctx.lineTo(sx + 0.06 * s, top + 1);
        }
        ctx.fill();
      }
      for (let i = Math.floor(from / 0.9); i <= Math.floor(to / 0.9); i++) {
        if (hash(i + 400) < 0.72) continue;
        const wx = (i + hash(i + 401)) * 0.9;
        if (this.inPit(wx)) continue;
        const sx = (wx - camX) * s;
        const sy = top - (0.2 + 0.14 * hash(i + 402)) * s + Math.sin(time * 2 + wx) * 0.02 * s;
        ctx.fillStyle = FLOWERS[Math.floor(hash(i + 403) * FLOWERS.length)]!;
        ctx.beginPath();
        ctx.arc(sx, sy, 0.065 * s, 0, 6.283);
        ctx.fill();
        ctx.fillStyle = '#ffd23f';
        ctx.beginPath();
        ctx.arc(sx, sy, 0.026 * s, 0, 6.283);
        ctx.fill();
      }
    } else if (idx === NEON) {
      // A glowing edge plus little studs that pulse in waves along the track.
      ctx.fillStyle = c.groundTop;
      ctx.globalAlpha = alpha * 0.28;
      ctx.fillRect(0, top - s * 0.05, viewW * s + s * 3, s * 0.1);
      ctx.fillStyle = '#ffffff';
      for (let i = Math.floor(from); i <= Math.floor(to); i++) {
        if (this.inPit(i + 0.5)) continue;
        ctx.globalAlpha = alpha * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * 4 - i * 0.7)));
        ctx.fillRect((i + 0.5 - camX) * s - s * 0.03, top - s * 0.13, s * 0.06, s * 0.13);
      }
    } else if (idx === DUSK) {
      // Pebbles and a few dry golden blades.
      ctx.fillStyle = 'rgba(70,35,20,0.55)';
      ctx.beginPath();
      for (let i = Math.floor(from / 1.7); i <= Math.floor(to / 1.7); i++) {
        if (hash(i + 90) < 0.35 || this.inPit((i + hash(i + 91)) * 1.7)) continue;
        const sx = ((i + hash(i + 91)) * 1.7 - camX) * s;
        const rw = (0.09 + 0.12 * hash(i + 92)) * s;
        ctx.moveTo(sx - rw, top + 1);
        ctx.quadraticCurveTo(sx - rw * 0.7, top - rw * 1.1, sx, top - rw * 1.15);
        ctx.quadraticCurveTo(sx + rw * 0.8, top - rw, sx + rw, top + 1);
      }
      ctx.fill();
      ctx.fillStyle = c.groundTop;
      ctx.beginPath();
      for (let i = Math.floor(from / 0.5); i <= Math.floor(to / 0.5); i++) {
        if (hash(i + 95) < 0.55 || this.inPit((i + hash(i + 96)) * 0.5)) continue;
        const sx = ((i + hash(i + 96)) * 0.5 - camX) * s;
        const hgt = (0.1 + 0.14 * hash(i + 97)) * s;
        const sway = Math.sin(time * 1.6 + i) * 0.03 * s;
        ctx.moveTo(sx - 0.03 * s, top + 1);
        ctx.lineTo(sx + sway, top - hgt);
        ctx.lineTo(sx + 0.03 * s, top + 1);
      }
      ctx.fill();
    } else if (idx === OCEAN) {
      // Swaying seaweed, little corals and bubbles that rise from the weeds.
      ctx.lineCap = 'round';
      for (let i = Math.floor(from / 1.6); i <= Math.floor(to / 1.6); i++) {
        if (hash(i + 70) < 0.25 || this.inPit((i + hash(i + 71)) * 1.6)) continue;
        const wx = (i + hash(i + 71)) * 1.6;
        const sx = (wx - camX) * s;
        const hgt = (0.5 + 0.55 * hash(i + 72)) * s;
        const sway = Math.sin(time * 1.7 + wx * 0.8) * 0.16 * s;
        ctx.strokeStyle = hash(i + 73) < 0.5 ? '#0f8f7a' : c.groundTop;
        ctx.lineWidth = Math.max(2, s * 0.07);
        ctx.beginPath();
        ctx.moveTo(sx, top + 1);
        ctx.quadraticCurveTo(sx + sway * 1.4, top - hgt * 0.55, sx + sway, top - hgt);
        ctx.stroke();
        // A bubble climbing from this weed.
        const rise = (time * 0.35 + hash(i + 74)) % 1;
        ctx.fillStyle = 'rgba(220,255,255,0.55)';
        ctx.globalAlpha = alpha * (1 - rise);
        ctx.beginPath();
        ctx.arc(sx + sway * 0.5 + Math.sin(time * 3 + i) * 0.05 * s, top - hgt - rise * 2.4 * s, (0.04 + 0.04 * hash(i + 75)) * s, 0, 6.283);
        ctx.fill();
        ctx.globalAlpha = alpha;
      }
      ctx.lineCap = 'butt';
      ctx.fillStyle = '#ff8fa3';
      ctx.beginPath();
      for (let i = Math.floor(from / 2.3); i <= Math.floor(to / 2.3); i++) {
        if (hash(i + 80) < 0.4 || this.inPit((i + hash(i + 81)) * 2.3)) continue;
        const sx = ((i + hash(i + 81)) * 2.3 - camX) * s;
        for (let k = -1; k <= 1; k++) {
          const rr = (0.06 + 0.03 * (k === 0 ? 1 : 0)) * s;
          ctx.moveTo(sx + k * 0.1 * s + rr, top - 0.03 * s - (k === 0 ? 0.06 : 0) * s);
          ctx.arc(sx + k * 0.1 * s, top - 0.03 * s - (k === 0 ? 0.06 : 0) * s, rr, 0, 6.283);
        }
      }
      ctx.fill();
    } else if (idx === VOID) {
      // Glowing crystals growing out of the rock, and motes drifting up.
      for (let i = Math.floor(from / 1.3); i <= Math.floor(to / 1.3); i++) {
        if (hash(i + 60) < 0.2 || this.inPit((i + hash(i + 61)) * 1.3)) continue;
        const sx = ((i + hash(i + 61)) * 1.3 - camX) * s;
        const hgt = (0.2 + 0.5 * hash(i + 62)) * s;
        const glow = 0.55 + 0.45 * Math.sin(time * 2.2 + i * 1.7);
        ctx.fillStyle = c.groundTop;
        ctx.globalAlpha = alpha * (0.55 + 0.4 * glow);
        ctx.beginPath();
        ctx.moveTo(sx - 0.1 * s, top + 1);
        ctx.lineTo(sx - 0.02 * s, top - hgt);
        ctx.lineTo(sx + 0.12 * s, top + 1);
        ctx.moveTo(sx + 0.05 * s, top + 1);
        ctx.lineTo(sx + 0.17 * s, top - hgt * 0.6);
        ctx.lineTo(sx + 0.26 * s, top + 1);
        ctx.fill();
      }
      ctx.fillStyle = c.groundTop;
      for (let i = Math.floor(from / 1.1); i <= Math.floor(to / 1.1); i++) {
        const rise = (time * 0.25 + hash(i + 120)) % 1;
        ctx.globalAlpha = alpha * (1 - rise) * 0.6;
        ctx.fillRect(((i + hash(i + 121)) * 1.1 - camX) * s, top - rise * 2 * s - 0.1 * s, s * 0.05, s * 0.05);
      }
    }
    ctx.globalAlpha = 1;
  }

  // -----------------------------------------------------------------------------------------
  // Foreground: dark silhouettes sliding past the bottom edge faster than the ground (parallax).
  // -----------------------------------------------------------------------------------------
  private foreground(ctx: CanvasRenderingContext2D, theme: ThemeBlender, camX: number, s: number, bottom: number, w: number): void {
    const fx = camX * 1.45;
    const cell = 1.1;
    ctx.fillStyle = theme.c.groundDeep;
    ctx.globalAlpha = 0.92;
    ctx.beginPath();
    for (let i = Math.floor(fx / cell) - 1; i <= Math.floor((fx + w / s) / cell) + 1; i++) {
      if (hash(i + 200) < 0.3) continue;
      const sx = ((i + hash(i + 201)) * cell - fx) * s;
      const hgt = (0.2 + 0.5 * hash(i + 202)) * s;
      const rw = (0.25 + 0.3 * hash(i + 203)) * s;
      ctx.moveTo(sx - rw, bottom);
      ctx.quadraticCurveTo(sx - rw * 0.5, bottom - hgt, sx, bottom - hgt * 1.05);
      ctx.quadraticCurveTo(sx + rw * 0.6, bottom - hgt * 0.9, sx + rw, bottom);
    }
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

