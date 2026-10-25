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

/** Width (tiles) of the cached ground texture; its decoration repeats with this period. */
const TILE = 32;
/** Period (tiles of foreground parallax space) of the cached foreground silhouettes. */
const FORE_TILE = 22;

/**
 * Paints the ground (and gravity levels' ceilings). Drawing is limited by how many pixels are filled,
 * so everything that does not move by itself — the depth gradient, the lit lip, strata, stones and each
 * world's underground details — is painted once into a periodic texture (rebuilt only when the colours
 * or the screen size change) and copied 1:1 across the screen every frame, which is the cheapest thing
 * a canvas can do. Only the living details on top (swaying grass and flowers, pulsing studs, seaweed
 * and bubbles, glowing crystals, falling drops under ceilings) are drawn per frame, in a thin band.
 * The ceiling is the same texture mirrored: for a runner with flipped gravity it *is* a floor.
 */
export class GroundPainter {
  private tile: HTMLCanvasElement | null = null;
  private tileKey = '';
  private fore: HTMLCanvasElement | null = null;
  private foreKey = '';
  private readonly slabs: Rect[] = [];
  private readonly pits: number[] = [];
  private readonly roofHoles: number[] = [];
  private tileW = 1;
  private tileH = 1;

  /**
   * Draw every ground slab in `vis`. `groundPx` is the screen y of the surface, `scale` pixels per
   * tile, and `camX` the world x at the left edge of the screen. `pulse` (0..1) brightens the lip on
   * the beat in the music modes.
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
    pulse = 0,
  ): void {
    const c = theme.c;
    const bottom = h + 40;
    const lipH = Math.max(4, scale * 0.2);
    this.ensureTile(theme, scale, bottom - groundPx, lipH);
    const viewW = w / scale;
    this.findPits(vis, groundDepth, camX - 1, camX + viewW + 1);

    this.blit(ctx, camX, scale, -40, w + 40, groundPx, false); // (margins cover the screen shake)
    if (pulse > 0.02) this.lipGlow(ctx, c.groundTop, 0, w, groundPx, lipH, pulse, 1);
    // `lite` (slow devices) keeps the textured ground, pits and cliffs but skips the animated details.
    if (!lite) this.surface(ctx, theme, time, camX, scale, groundPx, viewW, this.pits, 1);

    // Pits are cut out of it, with a darker cliff face and a rounded overhang at each side.
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

  /**
   * Ceiling slabs (gravity levels): the ground texture mirrored under each slab, its lip facing down,
   * living details hanging from it, and a few drops falling off it. `ceilPx` is the screen y of its underside.
   */
  drawCeilings(
    ctx: CanvasRenderingContext2D,
    slabs: readonly Rect[],
    theme: ThemeBlender,
    time: number,
    camX: number,
    scale: number,
    ceilPx: number,
    w: number,
    lite: boolean,
    pulse: number,
  ): void {
    if (slabs.length === 0) return;
    const c = theme.c;
    const lipH = Math.max(4, scale * 0.2);
    const viewW = w / scale;
    // Holes in the ceiling, for the hanging details (same convention as ground pits).
    this.roofHoles.length = 0;
    let covered = camX - 1;
    for (const r of slabs) {
      if (r.x0 > covered + 0.01) this.roofHoles.push(covered, r.x0);
      if (r.x1 > covered) covered = r.x1;
    }
    if (covered < camX + viewW + 1) this.roofHoles.push(covered, camX + viewW + 1);

    ctx.save();
    // Mirror around the ceiling line: everything below is drawn as if it were a floor at `ceilPx`.
    ctx.translate(0, 2 * ceilPx);
    ctx.scale(1, -1);
    for (const r of slabs) {
      const x0 = Math.max(0, (r.x0 - camX) * scale);
      const x1 = Math.min(w, (r.x1 - camX) * scale);
      if (x1 <= x0) continue;
      this.blit(ctx, camX, scale, x0, x1, ceilPx, true);
      // Beyond the texture's depth the slab is its deepest colour, up to the top of the screen.
      ctx.fillStyle = c.groundDeep;
      ctx.fillRect(x0, ceilPx + this.tileH - 1, x1 - x0, ceilPx + 41);
      if (pulse > 0.02) this.lipGlow(ctx, c.groundTop, x0, x1, ceilPx, lipH, pulse, 1);
    }
    if (!lite) this.surface(ctx, theme, time, camX, scale, ceilPx, viewW, this.roofHoles, 0.8);
    ctx.restore();

    if (lite) return;
    // Drops gathering under the ceiling and falling off it, every so often.
    ctx.fillStyle = c.groundTop;
    for (let i = Math.floor((camX - 1) / 2.3); i <= Math.floor((camX + viewW + 1) / 2.3); i++) {
      const wx = (i + hash(i + 300)) * 2.3;
      if (this.inHoles(wx, this.roofHoles)) continue;
      const cycle = (time * 0.45 + hash(i + 301)) % 1;
      const sx = (wx - camX) * scale;
      const fall = cycle < 0.6 ? 0 : (cycle - 0.6) / 0.4;
      ctx.globalAlpha = cycle < 0.6 ? cycle / 0.6 : 1 - fall;
      const r = scale * (0.035 + 0.025 * Math.min(1, cycle / 0.6));
      ctx.fillRect(sx - r, ceilPx + lipH * 0.6 + fall * fall * scale * 3.2, r * 2, r * 2.6);
    }
    ctx.globalAlpha = 1;
  }

  /** Copy the cached texture across [x0, x1) of the screen, scrolled with the world, its top at `y`. */
  private blit(ctx: CanvasRenderingContext2D, camX: number, scale: number, x0: number, x1: number, y: number, _flip: boolean): void {
    const tile = this.tile!;
    const tw = this.tileW;
    const th = this.tileH;
    // Whole-pixel offsets: a straight copy, with no resampling (half a pixel of drift is invisible).
    let phase = Math.floor(camX * scale) % tw;
    if (phase < 0) phase += tw;
    const left = Math.floor(x0);
    const right = Math.ceil(x1);
    for (let sx = -phase; sx < right; sx += tw) {
      const a = Math.max(left, sx);
      const b = Math.min(right, sx + tw);
      if (b > a) ctx.drawImage(tile, a - sx, 0, b - a, th, a, y, b - a, th);
    }
  }

  private lipGlow(ctx: CanvasRenderingContext2D, color: string, x0: number, x1: number, y: number, lipH: number, pulse: number, k: number): void {
    ctx.globalAlpha = Math.min(1, pulse * 0.9 * k);
    ctx.fillStyle = color;
    ctx.fillRect(x0, y - lipH * 0.35, x1 - x0, lipH * 0.7);
    ctx.globalAlpha = 1;
  }

  /** Paint the periodic ground texture (only when colours or size change). */
  private ensureTile(theme: ThemeBlender, s: number, height: number, lipH: number): void {
    const key = `${theme.version}:${s}:${height}`;
    if (key === this.tileKey && this.tile) return;
    this.tileKey = key;
    const c = theme.c;
    const tile = this.tile ?? document.createElement('canvas');
    this.tile = tile;
    const tw = Math.round(TILE * s);
    const th = Math.max(1, Math.ceil(height));
    if (tile.width !== tw || tile.height !== th) {
      tile.width = tw;
      tile.height = th;
    }
    this.tileW = tw;
    this.tileH = th;
    const g = tile.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, th);
    grad.addColorStop(0, c.ground);
    grad.addColorStop(Math.min(1, (5 * s) / th), c.groundDeep);
    grad.addColorStop(1, c.groundDeep);
    g.fillStyle = grad;
    g.fillRect(0, 0, tw, th);

    // Strata: three wavy seams (periodic over the texture).
    g.strokeStyle = 'rgba(0,0,0,0.16)';
    g.lineWidth = Math.max(2, s * 0.05);
    g.beginPath();
    const k = (Math.PI * 2 * 5) / TILE;
    for (const depth of [0.9, 1.9, 3.2]) {
      for (let x = 0; x <= tw + 4; x += 4) {
        const y = (depth + Math.sin((x / s) * k + depth * 3) * 0.07) * s;
        if (x === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
    }
    g.stroke();

    // Stones (wrapped around the edges so the texture tiles seamlessly).
    const cell = 0.8;
    const n = Math.round(TILE / cell);
    for (const light of [false, true]) {
      g.fillStyle = light ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.2)';
      g.beginPath();
      for (let i = 0; i < n; i++) {
        if ((hash(i + 5) < 0.6) === light) continue;
        const wx = (i + hash(i)) * cell;
        const depth = 0.4 + hash(i + 31) * 2.8;
        const rr = (0.05 + 0.09 * hash(i + 77)) * s;
        for (const off of [-TILE, 0, TILE]) {
          const sx = (wx + off) * s;
          if (sx < -rr * 2 || sx > tw + rr * 2) continue;
          g.moveTo(sx + rr * 1.3, depth * s);
          g.ellipse(sx, depth * s, rr * 1.3, rr, 0, 0, 6.283);
        }
      }
      g.fill();
    }

    this.undergroundOf(g, theme.a, 1 - theme.t, theme, s, th, tw);
    if (theme.b !== theme.a && theme.t > 0.01) this.undergroundOf(g, theme.b, theme.t, theme, s, th, tw);

    // Lit lip with a soft shadow under it.
    g.globalAlpha = 1;
    g.fillStyle = c.groundTop;
    g.fillRect(0, 0, tw, lipH);
    g.fillStyle = 'rgba(0,0,0,0.2)';
    g.fillRect(0, lipH, tw, lipH * 0.7);
    g.fillStyle = 'rgba(0,0,0,0.1)';
    g.fillRect(0, lipH * 1.7, tw, lipH * 0.9);
    g.fillStyle = 'rgba(255,255,255,0.45)';
    g.fillRect(0, 0, tw, Math.max(2, lipH * 0.2));
  }

  /** Each world's details under the surface, painted into the texture at `alpha`. */
  private undergroundOf(g: CanvasRenderingContext2D, idx: number, alpha: number, theme: ThemeBlender, s: number, th: number, tw: number): void {
    const c = theme.c;
    g.globalAlpha = alpha;
    const each = (period: number, fn: (i: number, x: number) => void): void => {
      const n = Math.round(TILE / period);
      for (let i = 0; i < n; i++) for (const off of [-TILE, 0, TILE]) fn(i, ((i + hash(i + 17)) * period + off) * s);
    };
    if (idx === NEON) {
      // Synthwave grid: horizontal lines getting wider apart, verticals every tile.
      g.strokeStyle = c.groundTop;
      g.lineWidth = Math.max(1.5, s * 0.03);
      g.globalAlpha = alpha * 0.32;
      g.beginPath();
      for (const d of [0.4, 0.9, 1.6, 2.7, 4.3]) {
        g.moveTo(0, d * s);
        g.lineTo(tw, d * s);
      }
      for (let i = 0; i <= TILE; i++) {
        g.moveTo(i * s, 0);
        g.lineTo(i * s - 0.25 * s, th);
      }
      g.stroke();
    } else if (idx === DUSK) {
      // Layered rock bands, with a few fossils.
      g.fillStyle = 'rgba(0,0,0,0.09)';
      g.fillRect(0, 0.6 * s, tw, 0.5 * s);
      g.fillRect(0, 1.9 * s, tw, 0.6 * s);
      g.fillStyle = 'rgba(255,255,255,0.07)';
      g.fillRect(0, 1.2 * s, tw, 0.4 * s);
      g.strokeStyle = 'rgba(255,255,255,0.18)';
      g.lineWidth = Math.max(1.5, s * 0.04);
      g.beginPath();
      each(5.3, (i, x) => {
        if (hash(i + 40) < 0.4) return;
        const y = (1.3 + hash(i + 41) * 1.6) * s;
        const r = (0.12 + 0.08 * hash(i + 42)) * s;
        g.moveTo(x + r, y);
        g.arc(x, y, r, 0, Math.PI * 1.6);
      });
      g.stroke();
    } else if (idx === OCEAN) {
      // Sand ripples and shells.
      g.strokeStyle = 'rgba(255,255,255,0.22)';
      g.lineWidth = Math.max(1.5, s * 0.035);
      g.beginPath();
      const k = (Math.PI * 2 * 11) / TILE;
      for (const d of [0.45, 0.95]) {
        for (let x = 0; x <= tw + 4; x += 4) {
          const y = (d + Math.sin((x / s) * k + d * 5) * 0.05) * s;
          if (x === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
      }
      g.stroke();
      g.fillStyle = 'rgba(255,220,230,0.35)';
      g.beginPath();
      each(3.2, (i, x) => {
        const y = (1.4 + hash(i + 50) * 1.8) * s;
        g.moveTo(x + 0.12 * s, y);
        g.arc(x, y, 0.12 * s, Math.PI, 0);
      });
      g.fill();
    } else if (idx === FOREST) {
      // Roots hanging down from the surface.
      g.strokeStyle = 'rgba(0,0,0,0.28)';
      g.lineWidth = Math.max(1.5, s * 0.05);
      g.beginPath();
      each(1.6, (i, x) => {
        const len = (0.5 + hash(i + 9) * 0.7) * s;
        g.moveTo(x, 0.2 * s);
        g.quadraticCurveTo(x + (hash(i + 12) - 0.5) * s * 0.4, len * 0.6, x + (hash(i + 14) - 0.5) * s * 0.3, len);
      });
      g.stroke();
    } else if (idx === VOID) {
      // Glowing cracks.
      g.strokeStyle = c.groundTop;
      g.lineWidth = Math.max(1.5, s * 0.035);
      g.globalAlpha = alpha * 0.4;
      g.beginPath();
      each(2.7, (i, x) => {
        g.moveTo(x, 0.25 * s);
        for (let k = 1; k <= 5; k++) g.lineTo(x + (k % 2 ? 0.18 : -0.12) * s * (0.6 + hash(i * 7 + k)), (0.25 + k * 0.32) * s);
      });
      g.stroke();
    }
    g.globalAlpha = 1;
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

  /** Is world x over one of `holes` (so nothing should grow there)? */
  private inHoles(wx: number, holes: readonly number[]): boolean {
    for (let i = 0; i < holes.length; i += 2) if (wx > holes[i]! - 0.12 && wx < holes[i + 1]! + 0.12) return true;
    return false;
  }

  /** `dir` is -1 for the left end of a slab and +1 for the right end. */
  private edge(ctx: CanvasRenderingContext2D, lipColor: string, x: number, dir: -1 | 1, scale: number, top: number, bottom: number, lipH: number): void {
    const bw = scale * 0.07;
    for (let k = 0; k < 6; k++) {
      ctx.globalAlpha = 0.36 * (1 - k / 6);
      ctx.fillStyle = '#000000';
      ctx.fillRect(dir < 0 ? x + k * bw : x - (k + 1) * bw, top, bw, bottom - top);
    }
    ctx.globalAlpha = 1;
    // Overhanging, rounded corner of the lip.
    ctx.fillStyle = lipColor;
    ctx.beginPath();
    ctx.arc(x + dir * lipH * 0.05, top + lipH / 2, lipH / 2, 0, 6.283);
    ctx.fill();
  }

  // -----------------------------------------------------------------------------------------
  // On the surface
  // -----------------------------------------------------------------------------------------
  private surface(ctx: CanvasRenderingContext2D, theme: ThemeBlender, time: number, camX: number, s: number, top: number, viewW: number, holes: readonly number[], k: number): void {
    this.holes = holes;
    this.surfaceOf(theme.a, (1 - theme.t) * k, ctx, theme, time, camX, s, top, viewW);
    if (theme.b !== theme.a && theme.t > 0.01) this.surfaceOf(theme.b, theme.t * k, ctx, theme, time, camX, s, top, viewW);
  }

  /** Holes of the surface being decorated (ground pits, or ceiling gaps). */
  private holes: readonly number[] = [];

  private inPit(wx: number): boolean {
    return this.inHoles(wx, this.holes);
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
  // Foreground: dark silhouettes sliding past the bottom edge faster than the ground (parallax),
  // painted once into a periodic texture.
  // -----------------------------------------------------------------------------------------
  private foreground(ctx: CanvasRenderingContext2D, theme: ThemeBlender, camX: number, s: number, bottom: number, w: number): void {
    const key = `${theme.version}:${s}`;
    const fh = Math.ceil(0.8 * s);
    const fw = Math.round(FORE_TILE * s);
    if (key !== this.foreKey || !this.fore) {
      this.foreKey = key;
      const fore = this.fore ?? document.createElement('canvas');
      this.fore = fore;
      fore.width = fw;
      fore.height = fh;
      const g = fore.getContext('2d')!;
      g.clearRect(0, 0, fw, fh);
      g.fillStyle = theme.c.groundDeep;
      g.globalAlpha = 0.92;
      g.beginPath();
      const cell = 1.1;
      const n = Math.round(FORE_TILE / cell);
      for (let i = 0; i < n; i++) {
        if (hash(i + 200) < 0.3) continue;
        const hgt = (0.2 + 0.5 * hash(i + 202)) * s;
        const rw = (0.25 + 0.3 * hash(i + 203)) * s;
        for (const off of [-FORE_TILE, 0, FORE_TILE]) {
          const sx = ((i + hash(i + 201)) * cell + off) * s;
          g.moveTo(sx - rw, fh);
          g.quadraticCurveTo(sx - rw * 0.5, fh - hgt, sx, fh - hgt * 1.05);
          g.quadraticCurveTo(sx + rw * 0.6, fh - hgt * 0.9, sx + rw, fh);
        }
      }
      g.fill();
    }
    let phase = (camX * 1.45 * s) % fw;
    if (phase < 0) phase += fw;
    for (let x = -Math.floor(phase); x < w; x += fw) ctx.drawImage(this.fore!, x, Math.floor(bottom - fh));
  }
}
