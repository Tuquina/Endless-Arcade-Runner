import { PLAYER_HEIGHT } from '../physics/constants';
import type { Game } from '../core/Game';
import { COIN, HAZARD, PAD, PORTAL_BALL, PORTAL_CUBE, PORTAL_GRAVITY_DOWN, PORTAL_GRAVITY_UP, PORTAL_SHIP, PORTAL_SPEED, PORTAL_WAVE, RING, RING_FLIP, SOLID, TRIGGER, WAVE_SLAM, moverCycle, moverLift, type Rect } from '../world/Rect';
import { Confetti } from './Confetti';
import { hash } from './hash';
import { GroundPainter } from './Ground';
import { DISTANCE_GOALS } from '../core/skins';
import { THEMES, ThemeBlender } from './themes';
import { ZONE_NAMES } from '../rhythm/secret';

/**
 * The visible world is always at least this tall and this wide (tiles) → same fairness everywhere.
 * 14 wide keeps ≥ 11 tiles (≈ 0.85 s at top speed) of warning ahead on a vertical phone while
 * making the character ~14 % larger than a 16-tile view would.
 */
const MIN_VIEW_H = 10;
const MIN_VIEW_W = 14;
/** Where the player sits horizontally (fraction of the visible width) and where the ground sits vertically. */
const PLAYER_SCREEN_X = 0.2;
const GROUND_SCREEN_Y = 0.72;
/** Canvas pixel budget (width × height in device pixels). */
const MAX_PIXELS = 4_200_000;
/** Anything taller/deeper than this is treated as ground, not a floating block. */
const GROUND_DEPTH = -1;

const DASH: number[] = [10, 10];
/** Portal colours and labels by code. */
const PORTAL_STYLE: Record<number, { color: string; label: string; hint: string }> = {
  [PORTAL_GRAVITY_UP]: { color: '#ffd23f', label: '↓', hint: 'GRAVEDAD NORMAL' },
  [PORTAL_GRAVITY_DOWN]: { color: '#35b8ff', label: '↑', hint: '¡AL TECHO!' },
  [PORTAL_CUBE]: { color: '#2ee6a6', label: '■', hint: 'SALTO' },
  [PORTAL_BALL]: { color: '#ff5d73', label: '●', hint: 'BOLA: TOCÁ PARA CAMBIAR DE LADO' },
  [PORTAL_SHIP]: { color: '#ff7ad9', label: '▲', hint: 'NAVE: MANTENÉ PARA SUBIR' },
  [PORTAL_WAVE]: { color: '#35e0ff', label: '◆', hint: 'ONDA: MANTENÉ = SUBE · SOLTÁ = BAJA' },
  [PORTAL_SPEED]: { color: '#ff9a3c', label: '»', hint: '¡VELOCIDAD!' },
};
const JUDGE_TEXT = { perfect: '¡PERFECTO!', good: 'BIEN', ok: 'OK', miss: '' } as const;
const JUDGE_COLOR = { perfect: '#ffd23f', good: '#2ee6a6', ok: '#6ec1ff', miss: '#ffffff' } as const;

/**
 * Draws the world with a fixed tile-based camera: themed sky, parallax layers, geometry,
 * particles, the animated player and screen effects. Scratch arrays and cached gradients are
 * reused so steady-state frames allocate (almost) nothing.
 */
export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private w = 0;
  private h = 0;
  /** Pixels per tile. */
  private scale = 1;
  private viewW = MIN_VIEW_W;
  private camX = 0;
  private groundPx = 0;
  private readonly confetti = new Confetti();
  /** Seconds left on the "new record" banner. */
  private bannerT = 0;
  private readonly theme = new ThemeBlender();
  private readonly ground = new GroundPainter();
  /**
   * Adaptive quality: if frames stay slow for a while (a weak phone) the ground drops its decoration;
   * if they get fast again for a longer while it comes back. Thresholds sit below 30 fps so a
   * display capped at 30 Hz is not mistaken for a struggling device.
   */
  lite = false;
  private frameEma = 1 / 60;
  private slowFor = 0;
  private fastFor = 0;
  private skyGrad: CanvasGradient | null = null;
  private skyVersion = -1;
  private readonly visible: Rect[] = [];
  /** The first portal of each kind in the current level gets a hint above it. */
  private firstPortals = new Map<number, number>();
  private firstPortalsOf: unknown = null;
  /** Rhythm mode: 0..1 flash on every beat (scaled by the section's energy). */
  private pulse = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    new ResizeObserver(() => this.resize()).observe(canvas);
    // Moving the window to a screen with another pixel density changes DPR without resizing the canvas.
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  private resize(): void {
    const cssW = Math.max(1, this.canvas.clientWidth);
    const cssH = Math.max(1, this.canvas.clientHeight);
    // Crisp on dense phone screens, but never more pixels than a mid-range GPU fills comfortably
    // (a 4K monitor at 2x would otherwise be an 8-megapixel canvas).
    this.dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(MAX_PIXELS / (cssW * cssH)));
    this.w = Math.max(1, Math.round(cssW * this.dpr));
    this.h = Math.max(1, Math.round(cssH * this.dpr));
    this.canvas.width = this.w;
    this.canvas.height = this.h;
    this.scale = Math.min(this.h / MIN_VIEW_H, this.w / MIN_VIEW_W);
    this.viewW = this.w / this.scale;
    this.skyVersion = -1; // gradient depends on canvas height
  }

  private trackPerformance(dt: number): void {
    this.frameEma += (dt - this.frameEma) * 0.05;
    if (this.frameEma > 0.036) {
      this.slowFor += dt;
      this.fastFor = 0;
    } else if (this.frameEma < 0.025) {
      this.fastFor += dt;
      this.slowFor = 0;
    } else {
      this.slowFor = this.fastFor = 0;
    }
    if (!this.lite && this.slowFor > 1.5) this.lite = true;
    else if (this.lite && this.fastFor > 8) this.lite = false;
  }

  private X(x: number): number {
    return (x - this.camX) * this.scale;
  }

  private Y(y: number): number {
    return this.groundPx - y * this.scale;
  }

  render(game: Game, alpha: number, frameDt: number, fps: number): void {
    if (frameDt > 0 && frameDt < 0.2) this.trackPerformance(frameDt);
    const { ctx, scale } = this;
    const p = game.player;
    const px = p.prevX + (p.x - p.prevX) * alpha;
    const py = p.prevY + (p.y - p.prevY) * alpha;
    this.camX = px - this.viewW * PLAYER_SCREEN_X;
    this.groundPx = this.h * GROUND_SCREEN_Y;

    // Rhythm levels keep one world's palette for the whole song.
    // (The secret run cycles through every world as it goes, like the endless runner.)
    this.theme.update(game.inRhythm && game.mode !== 'secret' ? game.rhythm.level!.def.theme * 400 + 1 : px + game.themeOffset);
    if (game.inRhythm) {
      const { beats, energy } = game.rhythm.beat();
      const phase = beats - Math.floor(beats);
      this.pulse = beats >= 0 ? Math.exp(-phase * 7) * (0.35 + 0.65 * energy) : 0;
    } else {
      this.pulse = 0;
    }
    if (this.skyVersion !== this.theme.version) {
      const g = ctx.createLinearGradient(0, 0, 0, this.groundPx);
      g.addColorStop(0, this.theme.c.skyTop);
      g.addColorStop(1, this.theme.c.skyBottom);
      this.skyGrad = g;
      this.skyVersion = this.theme.version;
    }

    // Screen shake: a decaying jitter on the whole scene.
    const sh = game.shake * scale * 0.35;
    ctx.setTransform(1, 0, 0, 1, Math.sin(game.time * 91) * sh, Math.cos(game.time * 77) * sh);

    this.drawBackground(game);
    if (this.pulse > 0.02) {
      ctx.fillStyle = `rgba(255,255,255,${(0.07 * this.pulse).toFixed(3)})`;
      ctx.fillRect(-40, -40, this.w + 80, this.groundPx + 40);
    }
    this.drawWorld(game, px);
    game.fx.draw(ctx, this.camX, this.groundPx, scale);
    this.drawPlayer(game, px, py);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    if (game.flash > 0) {
      ctx.globalAlpha = Math.min(0.55, game.flash);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.globalAlpha = 1;
    }

    if (game.celebrate) {
      game.celebrate = false;
      this.bannerT = 2;
      this.confetti.burst(this.w / 2, this.h * 0.3, scale * 9);
    }
    this.confetti.update(frameDt, scale * 14);
    this.confetti.draw(ctx, scale * 0.2);
    this.bannerT = Math.max(0, this.bannerT - frameDt);
    this.drawBanner(game);
    if (game.debug) this.drawDebug(game, fps);
  }

  // ---------------------------------------------------------------- background

  private drawBackground(game: Game): void {
    const { ctx, scale, w, h, groundPx } = this;
    const c = this.theme.c;
    const pad = 40; // covers screen shake
    ctx.fillStyle = this.skyGrad!;
    ctx.fillRect(-pad, -pad, w + 2 * pad, groundPx + pad);
    ctx.fillStyle = c.pit;
    ctx.fillRect(-pad, groundPx, w + 2 * pad, h - groundPx + pad);

    this.drawDecor(game);

    // Far mountains (slow) — pointed silhouettes from two summed sines.
    ctx.fillStyle = c.far;
    ctx.beginPath();
    ctx.moveTo(-pad, groundPx);
    const step = Math.max(6, Math.round(scale * 0.25));
    for (let sx = -pad; sx <= w + pad; sx += step) {
      const wx = sx / scale + this.camX * 0.12;
      const m = Math.abs(Math.sin(wx * 0.23 + 1.3)) * 0.6 + Math.abs(Math.sin(wx * 0.11)) * 0.4;
      ctx.lineTo(sx, groundPx - (1.6 + 3.4 * m) * scale);
    }
    ctx.lineTo(w + pad, groundPx);
    ctx.closePath();
    ctx.fill();

    // Mid skyline (faster) — columns of varying height, one path, one fill.
    ctx.fillStyle = c.mid;
    ctx.beginPath();
    const cell = 1.7;
    const off = this.camX * 0.3;
    const first = Math.floor(off / cell) - 1;
    const last = Math.ceil((off + this.viewW) / cell) + 1;
    for (let i = first; i <= last; i++) {
      const bh = 0.8 + 2.6 * hash(i);
      ctx.rect((i * cell - off) * scale, groundPx - bh * scale, cell * scale * 0.86, bh * scale);
    }
    ctx.fill();
  }

  /** Per-world ambience, cross-faded by the theme blend so nothing pops on transition. */
  private drawDecor(game: Game): void {
    const { ctx, scale, w, groundPx } = this;
    const { a, b, t } = this.theme;
    for (let pass = 0; pass < 2; pass++) {
      const idx = pass === 0 ? a : b;
      const weight = pass === 0 ? 1 - t : t;
      if (weight <= 0.01) continue;
      if (pass === 1 && b === a) continue;
      ctx.globalAlpha = weight;
      switch (THEMES[idx]!.name) {
        case 'Neón':
        case 'Vacío':
          ctx.fillStyle = '#ffffff';
          for (let i = 0; i < 40; i++) {
            const sx = (((hash(i) * 3 * w - this.camX * 0.05 * scale) % w) + w) % w;
            const sy = hash(i + 99) * groundPx * 0.8;
            const tw = 0.5 + 0.5 * Math.sin(game.time * 2 + i);
            ctx.globalAlpha = weight * (0.3 + 0.6 * tw);
            ctx.fillRect(sx, sy, scale * 0.07, scale * 0.07);
          }
          break;
        case 'Atardecer': {
          const cx = w * 0.72 - this.camX * 0.01 * scale;
          const cy = groundPx - scale * 3.4;
          const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, scale * 2.6);
          g.addColorStop(0, '#fff2b0');
          g.addColorStop(0.45, '#ffd166');
          g.addColorStop(1, 'rgba(255,209,102,0)');
          ctx.fillStyle = g;
          ctx.fillRect(cx - scale * 3, cy - scale * 3, scale * 6, scale * 6);
          break;
        }
        case 'Océano':
          ctx.fillStyle = '#bff6ff';
          for (let i = 0; i < 22; i++) {
            const rise = (game.time * 0.35 + hash(i + 7)) % 1;
            const sx = (((hash(i) * 2 * w - this.camX * 0.15 * scale) % w) + w) % w;
            ctx.globalAlpha = weight * 0.35 * (1 - rise);
            ctx.beginPath();
            ctx.arc(sx, groundPx - rise * groundPx * 0.9, scale * (0.08 + 0.12 * hash(i + 3)), 0, 6.283);
            ctx.fill();
          }
          break;
        case 'Bosque':
          ctx.fillStyle = '#eaff7a';
          for (let i = 0; i < 18; i++) {
            const sx = (((hash(i) * 2 * w - this.camX * 0.2 * scale) % w) + w) % w + Math.sin(game.time + i) * scale * 0.4;
            const sy = groundPx - scale * (1 + 4 * hash(i + 5)) + Math.cos(game.time * 0.8 + i) * scale * 0.3;
            ctx.globalAlpha = weight * (0.35 + 0.5 * Math.sin(game.time * 2.3 + i * 1.7) ** 2);
            ctx.fillRect(sx, sy, scale * 0.09, scale * 0.09);
          }
          break;
      }
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- world geometry

  private drawWorld(game: Game, runnerX: number): void {
    const { ctx, scale } = this;
    const c = this.theme.c;
    const vis = this.visible;
    game.world.collect(this.camX - 1, this.camX + this.viewW + 1, vis);

    // Ground: depth gradient, strata, lit lip, cliff edges and the living decoration of each world.
    this.ground.draw(ctx, vis, this.theme, game.time, this.camX, scale, this.groundPx, this.w, this.h, GROUND_DEPTH, this.lite);

    // Blocks and floating platforms.
    for (let i = 0; i < vis.length; i++) {
      const r = vis[i]!;
      if (r.kind !== SOLID || r.y0 <= GROUND_DEPTH) continue;
      if (r.y1 >= 12) {
        this.drawCeiling(r);
        continue;
      }
      const x = this.X(r.x0);
      const y = this.Y(r.y1);
      const wpx = (r.x1 - r.x0) * scale;
      const hpx = (r.y1 - r.y0) * scale;
      ctx.fillStyle = c.block;
      ctx.fillRect(x, y, wpx, hpx);
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = Math.max(1, scale * 0.03);
      ctx.beginPath();
      for (let gx = r.x0 + 1; gx < r.x1 - 0.01; gx++) {
        ctx.moveTo(this.X(gx), y);
        ctx.lineTo(this.X(gx), y + hpx);
      }
      for (let gy = r.y1 - 1; gy > r.y0 + 0.01; gy--) {
        ctx.moveTo(x, this.Y(gy));
        ctx.lineTo(x + wpx, this.Y(gy));
      }
      ctx.stroke();
      ctx.fillStyle = c.blockTop;
      ctx.fillRect(x, y, wpx, Math.max(3, scale * 0.12));
    }

    // Movers: drawn at the height the runner will find them (their motion is locked to its x).
    for (let i = 0; i < vis.length; i++) {
      const r = vis[i]!;
      if (r.kind === HAZARD && r.mover) this.drawMover(game, r, runnerX);
    }

    // Spikes: triangle with a lit left face.
    for (let i = 0; i < vis.length; i++) {
      const r = vis[i]!;
      if (r.kind !== HAZARD || r.mover) continue;
      const mx = (r.x0 + r.x1) / 2;
      const cx = this.X(mx);
      // Spikes hanging from a ceiling point down (solid above, nothing to stand on below).
      const w = game.world;
      const hanging = !w.overlap(mx - 0.05, r.y0 - 0.1, mx + 0.05, r.y0 - 0.02, SOLID) && !!w.overlap(mx - 0.05, r.y1 + 0.02, mx + 0.05, r.y1 + 0.1, SOLID);
      const base = hanging ? this.Y(r.y1) : this.Y(r.y0);
      const tip = hanging ? base + scale : base - scale;
      const half = scale * 0.5;
      ctx.fillStyle = c.spike;
      ctx.beginPath();
      ctx.moveTo(cx - half, base);
      ctx.lineTo(cx, tip);
      ctx.lineTo(cx + half, base);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = Math.max(1.5, scale * 0.04);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.beginPath();
      ctx.moveTo(cx - half, base);
      ctx.lineTo(cx, tip);
      ctx.lineTo(cx, base);
      ctx.closePath();
      ctx.fill();
    }

    // Coins: spinning discs (width oscillates like a flipping coin).
    for (let i = 0; i < vis.length; i++) {
      const r = vis[i]!;
      if (r.kind !== COIN || r.taken) continue;
      const cx = this.X((r.x0 + r.x1) / 2);
      const cy = this.Y((r.y0 + r.y1) / 2);
      const rad = ((r.x1 - r.x0) / 2) * scale;
      const spin = Math.abs(Math.cos(game.time * 4 + r.x0 * 1.7));
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.ellipse(cx, cy, rad * (0.2 + 0.8 * spin), rad, 0, 0, 6.283);
      ctx.fill();
      ctx.fillStyle = '#fff3b0';
      ctx.beginPath();
      ctx.ellipse(cx, cy, rad * (0.1 + 0.4 * spin), rad * 0.5, 0, 0, 6.283);
      ctx.fill();
    }

    // Pads and rings (rhythm mode).
    for (let i = 0; i < vis.length; i++) {
      const r = vis[i]!;
      if (r.kind === PAD) this.drawPad(r);
      else if (r.kind === RING) this.drawRing(r, game);
      else if (r.kind === TRIGGER) this.drawPortal(r, game);
    }

    if (game.inRhythm) {
      this.drawRhythm(game, runnerX);
      return;
    }

    // Challenge gates: a dashed line at each distance goal (gold until it has been reached).
    if (game.state !== 'menu') {
      ctx.setLineDash(DASH);
      ctx.lineWidth = Math.max(2, scale * 0.06);
      ctx.font = `800 ${Math.round(scale * 0.42)}px system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      for (let i = 0; i < DISTANCE_GOALS.length; i++) {
        const goal = DISTANCE_GOALS[i]!;
        const gx = this.X(goal.n);
        if (gx < -scale * 3 || gx > this.w + scale) continue;
        const reached = game.isUnlocked(goal.id);
        ctx.strokeStyle = reached ? 'rgba(255,255,255,0.35)' : 'rgba(255,210,63,0.85)';
        ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath();
        ctx.moveTo(gx, this.groundPx);
        ctx.lineTo(gx, this.groundPx - scale * 6);
        ctx.stroke();
        ctx.fillText(`${goal.n} m`, gx + scale * 0.2, this.groundPx - scale * 6);
      }
      ctx.setLineDash([]);
    }

    // Marker for the personal best distance.
    const bd = game.bestDist;
    if (bd > 0 && game.state !== 'menu') {
      const bx = this.X(bd);
      if (bx > -scale && bx < this.w + scale) {
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(bx - 1, 0, 2, this.groundPx);
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.font = `800 ${Math.round(scale * 0.4)}px system-ui, sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('RÉCORD', bx + 6, this.groundPx * 0.25);
      }
    }
  }

  private drawPad(r: Rect): void {
    const { ctx, scale } = this;
    const cx = this.X((r.x0 + r.x1) / 2);
    const base = this.Y(r.y0);
    const wpx = (r.x1 - r.x0) * scale;
    const glow = 0.5 + 0.5 * this.pulse;
    ctx.fillStyle = `rgba(255,210,63,${(0.25 * glow).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(cx, base, wpx * 0.9, scale * 0.5 * (1 + 0.3 * this.pulse), 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.ellipse(cx, base, wpx * 0.55, scale * 0.22, 0, Math.PI, 0);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(2, scale * 0.06);
    ctx.beginPath();
    for (let k = 0; k < 2; k++) {
      const y = base - scale * (0.45 + k * 0.28 + 0.1 * this.pulse);
      ctx.moveTo(cx - scale * 0.18, y + scale * 0.14);
      ctx.lineTo(cx, y);
      ctx.lineTo(cx + scale * 0.18, y + scale * 0.14);
    }
    ctx.stroke();
  }

  private drawRing(r: Rect, game: Game): void {
    const { ctx, scale } = this;
    const cx = this.X((r.x0 + r.x1) / 2);
    const cy = this.Y((r.y0 + r.y1) / 2);
    const rad = scale * 0.42 * (1 + 0.12 * this.pulse);
    const flip = r.code === RING_FLIP;
    ctx.strokeStyle = flip ? 'rgba(53,184,255,0.4)' : 'rgba(255,210,63,0.35)';
    ctx.lineWidth = scale * 0.22;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, 6.283);
    ctx.stroke();
    ctx.strokeStyle = flip ? '#35b8ff' : '#ffd23f';
    ctx.lineWidth = scale * 0.09;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    const a = game.time * 4;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, scale * 0.06, 0, 6.283);
    ctx.fill();
  }

  /** Ceiling slab of a gravity level: a dark band with a lit underside the runner can walk on. */
  private drawCeiling(r: Rect): void {
    const { ctx, scale } = this;
    const c = this.theme.c;
    const x = this.X(r.x0);
    const wpx = (r.x1 - r.x0) * scale + 1;
    const bottom = this.Y(r.y0);
    ctx.fillStyle = c.mid;
    ctx.fillRect(x, -40, wpx, bottom + 40);
    // Faint bands that scroll with the slab, so the ceiling reads as a surface and shows speed.
    ctx.fillStyle = c.far;
    for (let gx = Math.ceil(r.x0 / 2) * 2; gx < r.x1; gx += 2) ctx.fillRect(this.X(gx), -40, Math.max(2, scale * 0.12), bottom + 40);
    ctx.fillStyle = c.ground;
    ctx.fillRect(x, bottom - scale * 0.35, wpx, scale * 0.35);
    ctx.fillStyle = c.groundTop;
    ctx.fillRect(x, bottom - Math.max(3, scale * 0.12), wpx, Math.max(3, scale * 0.12));
  }

  /** Gravity and form portals: a tall glowing oval with the symbol of what it does. */
  private drawPortal(r: Rect, game: Game): void {
    const { ctx, scale } = this;
    const st = PORTAL_STYLE[r.code] ?? PORTAL_STYLE[PORTAL_CUBE]!;
    const ceil = game.rhythm.level?.def.ceiling ?? 5;
    if (r.code === PORTAL_SPEED) {
      this.drawSpeedPortal(r, game, ceil);
      return;
    }
    const cx = this.X((r.x0 + r.x1) / 2);
    const cy = this.Y(ceil / 2);
    const ry = (ceil / 2) * scale * 0.92;
    const rx = scale * (0.45 + 0.05 * this.pulse);
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = st.color;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * 1.6, ry, 0, 0, 6.283);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = st.color;
    ctx.lineWidth = scale * 0.14;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, 6.283);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = scale * 0.04;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 ${Math.round(scale * 0.7)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(st.label, cx, cy);

    const lv = game.rhythm.level;
    if (lv && this.firstPortalsOf !== lv) {
      this.firstPortalsOf = lv;
      this.firstPortals.clear();
      for (const q of lv.rects) if (q.kind === TRIGGER && !this.firstPortals.has(q.code ?? 0)) this.firstPortals.set(q.code ?? 0, q.x0);
    }
    const first = this.firstPortals.get(r.code);
    if (first !== undefined && Math.abs(first - r.x0) < 0.01) {
      ctx.font = `900 ${Math.round(scale * 0.36)}px system-ui, sans-serif`;
      ctx.fillStyle = st.color;
      ctx.textBaseline = 'bottom';
      ctx.fillText(st.hint, cx, this.Y(ceil) + scale * 1.4);
    }
  }

  /** Speed portal: a column of chevrons, one to three depending on how fast it makes the runner. */
  private drawSpeedPortal(r: Rect, game: Game, ceil: number): void {
    const { ctx, scale } = this;
    const base = game.rhythm.level?.speed ?? r.amp;
    const ratio = r.amp / base;
    const n = ratio < 0.95 ? 1 : ratio < 1.1 ? 1 : ratio < 1.4 ? 2 : 3;
    const dir = ratio < 0.95 ? -1 : 1;
    const cx = this.X((r.x0 + r.x1) / 2);
    const color = ratio < 0.95 ? '#6ec1ff' : ratio < 1.1 ? '#2ee6a6' : ratio < 1.4 ? '#ff9a3c' : '#ff4d6d';
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    ctx.lineWidth = scale * 0.16;
    const h = scale * 0.45;
    for (let row = 0; row < 3; row++) {
      const cy = this.Y(ceil * (0.25 + row * 0.25));
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const ox = (i - (n - 1) / 2) * scale * 0.4 * dir;
        ctx.moveTo(cx + ox - h * 0.6 * dir, cy - h);
        ctx.lineTo(cx + ox + h * 0.4 * dir, cy);
        ctx.lineTo(cx + ox - h * 0.6 * dir, cy + h);
      }
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }

  /** Beat ticks, jump guides, checkpoints, best-progress marker, finish line and judgement popups. */
  private drawRhythm(game: Game, runnerX: number): void {
    const { ctx, scale } = this;
    const r = game.rhythm;
    const lv = r.level!;
    const x0 = this.camX - 1;
    const x1 = this.camX + this.viewW + 1;

    // A tick on the ground for every beat, longer on the first beat of a bar.
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    const bxs = lv.beatX;
    let k0 = 0;
    for (let lo = 0, hi = bxs.length; lo < hi; ) {
      const mid = (lo + hi) >> 1;
      if (bxs[mid]! < x0) lo = k0 = mid + 1;
      else hi = mid;
    }
    for (let k = k0; k < bxs.length && bxs[k]! < x1; k++) {
      const bx = this.X(bxs[k]!);
      const bar = k % 4 === 0;
      ctx.fillRect(bx - 1, this.groundPx + scale * 0.05, 2, scale * (bar ? 0.4 : 0.2));
    }

    // Where to press (first levels, and always in practice): a dot that fills as the runner gets there.
    if (lv.def.guides || r.practice) {
      for (const pr of lv.presses) {
        if (pr.x < runnerX - 0.5) continue;
        if (pr.x > x1) break;
        const gx = this.X(pr.x);
        const gy = this.Y(pr.y) - scale * 0.08;
        const near = Math.max(0, 1 - (pr.x - runnerX) / 6);
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = Math.max(1.5, scale * 0.05);
        ctx.fillStyle = `rgba(255,255,255,${(0.15 + 0.6 * near).toFixed(3)})`;
        ctx.beginPath();
        if (pr.hold) ctx.ellipse(gx + scale * 0.2, gy, scale * 0.38, scale * 0.14, 0, 0, 6.283);
        else ctx.arc(gx, gy, scale * 0.15, 0, 6.283);
        ctx.fill();
        ctx.stroke();
      }
    }

    if (r.practice) {
      ctx.fillStyle = '#2ee6a6';
      for (const cp of lv.checkpoints) {
        if (cp.state.x < x0 || cp.state.x > x1) continue;
        const cx = this.X(cp.state.x);
        const cy = this.Y(cp.state.y) - scale * 0.6;
        ctx.beginPath();
        ctx.moveTo(cx, cy - scale * 0.25);
        ctx.lineTo(cx + scale * 0.18, cy);
        ctx.lineTo(cx, cy + scale * 0.25);
        ctx.lineTo(cx - scale * 0.18, cy);
        ctx.closePath();
        ctx.fill();
      }
    }

    ctx.font = `900 ${Math.round(scale * 0.42)}px system-ui, sans-serif`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    if (game.mode === 'secret') {
      this.drawSecret(game, x0, x1);
      this.drawPopup(game, runnerX);
      return;
    }
    const rec = game.levelRecord(r.index);
    if (!r.practice && rec.best > 0 && rec.best < 100) {
      const bx = this.X((rec.best / 100) * lv.endX);
      if (bx > -scale && bx < this.w + scale) {
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(bx - 1, 0, 2, this.groundPx);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillText(`MEJOR ${rec.best}%`, bx + 6, this.groundPx * 0.22);
      }
    }

    // Big attempt counter at the start, like a title card painted on the level.
    const sx = this.X(2.5);
    if (sx > -this.w && sx < this.w && game.state !== 'menu') {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = `900 ${Math.round(scale * 0.75)}px system-ui, sans-serif`;
      ctx.fillText(r.practice ? 'PRÁCTICA' : `INTENTO ${rec.attempts}`, sx, this.Y(4.2));
      ctx.font = `800 ${Math.round(scale * 0.38)}px system-ui, sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText(`${lv.def.name} · ${lv.def.song.bpm} BPM`, sx, this.Y(3.1));
    }

    // Finish gate: a checkered column.
    const fx = this.X(lv.endX);
    if (fx > -scale && fx < this.w + scale) {
      const cell = scale * 0.35;
      for (let row = 0; row * cell < this.groundPx; row++) {
        for (let col = 0; col < 2; col++) {
          ctx.fillStyle = (row + col) % 2 ? '#ffffff' : '#14102b';
          ctx.fillRect(fx + col * cell, this.groundPx - (row + 1) * cell, cell, cell);
        }
      }
      ctx.fillStyle = '#ffd23f';
      ctx.font = `900 ${Math.round(scale * 0.5)}px system-ui, sans-serif`;
      ctx.fillText('META', fx + cell * 2.4, this.groundPx * 0.3);
    }

    this.drawPopup(game, runnerX);
  }

  /** Secret run: a banner at the start of every zone, and the record distance. */
  private drawSecret(game: Game, x0: number, x1: number): void {
    const { ctx, scale } = this;
    const zones = game.stream?.zones ?? [];
    for (const z of zones) {
      if (game.state === 'menu') break;
      if (z.x0 < x0 - 12 || z.x0 > x1) continue;
      const zx = this.X(z.x0 + 1.5);
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.font = `900 ${Math.round(scale * 0.7)}px system-ui, sans-serif`;
      ctx.fillText(z.index === 0 ? 'Ω MODO SECRETO' : `ZONA ${z.index + 1}`, zx, this.Y(4.3));
      ctx.font = `800 ${Math.round(scale * 0.38)}px system-ui, sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText(`${ZONE_NAMES[z.kind]} · ${Math.round(game.stream!.level.song.song.sections[z.index * 4]?.bpm ?? 0)} BPM`, zx, this.Y(3.3));
    }
    const best = game.secretBest;
    if (best > 0) {
      const bx = this.X(best);
      if (bx > -scale && bx < this.w + scale) {
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(bx - 1, 0, 2, this.groundPx);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.font = `900 ${Math.round(scale * 0.42)}px system-ui, sans-serif`;
        ctx.fillText(`MEJOR ${best} m`, bx + 6, this.groundPx * 0.22);
      }
    }
  }

  private drawPopup(game: Game, runnerX: number): void {
    const { ctx, scale } = this;
    // Judgement popup above the runner.
    const pop = game.rhythm.popup;
    if (pop && pop.j !== 'miss') {
      const age = game.time - pop.at;
      if (age < 0.55) {
        ctx.globalAlpha = Math.min(1, (0.55 - age) / 0.2);
        ctx.fillStyle = JUDGE_COLOR[pop.j];
        ctx.textAlign = 'center';
        ctx.font = `900 ${Math.round(scale * (0.42 + (pop.j === 'perfect' ? 0.12 : 0)))}px system-ui, sans-serif`;
        // Above the runner, or below it when it is up near a ceiling (so it never hides under the HUD).
        const high = pop.y > 2;
        ctx.fillText(JUDGE_TEXT[pop.j], this.X(runnerX), this.Y(high ? pop.y - 1.1 - age : pop.y + 2.2 + age * 1.5));
        ctx.globalAlpha = 1;
      }
    }
  }

  private drawMover(game: Game, r: Rect, runnerX: number): void {
    const { ctx, scale } = this;
    const c = this.theme.c;
    const lift = r.amp * moverLift(r, runnerX);
    const cx = this.X((r.x0 + r.x1) / 2);

    if (r.wave === WAVE_SLAM) {
      // Crusher: a heavy column hanging from above that slams down. It shudders just before it drops.
      const u = moverCycle(r, runnerX);
      const warn = u > 0.4 && u < 0.5;
      const shake = warn ? Math.sin(game.time * 90) * scale * 0.05 : 0;
      const wpx = (r.x1 - r.x0 + 0.16) * scale;
      const x = cx - wpx / 2 + shake;
      const bottom = this.Y(r.y0 + lift);
      ctx.fillStyle = warn ? '#ff8aa0' : c.spike;
      ctx.fillRect(x, -scale, wpx, bottom + scale);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x + wpx * 0.72, -scale, wpx * 0.28, bottom + scale);
      // Teeth along the underside.
      ctx.fillStyle = '#ffffff';
      const teeth = 4;
      const tw = wpx / teeth;
      for (let i = 0; i < teeth; i++) {
        ctx.beginPath();
        ctx.moveTo(x + i * tw, bottom);
        ctx.lineTo(x + (i + 0.5) * tw, bottom + scale * 0.32);
        ctx.lineTo(x + (i + 1) * tw, bottom);
        ctx.closePath();
        ctx.fill();
      }
      return;
    }

    // Saw: a faint rail shows how far it travels, the blade spins.
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = Math.max(2, scale * 0.05);
    ctx.setLineDash(DASH);
    ctx.beginPath();
    ctx.moveTo(cx, this.Y(r.y0 - 0.15));
    ctx.lineTo(cx, this.Y(r.railTop));
    ctx.stroke();
    ctx.setLineDash([]);
    const cy = this.Y(r.y0 + lift + (r.y1 - r.y0) / 2);
    const rad = scale * 0.42;
    const spin = game.time * 9;
    ctx.fillStyle = c.spike;
    ctx.beginPath();
    const teeth = 8;
    for (let i = 0; i < teeth * 2; i++) {
      const a = spin + (i * Math.PI) / teeth;
      const rr = i % 2 ? rad * 0.72 : rad;
      const px = cx + Math.cos(a) * rr;
      const py = cy + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = Math.max(1.5, scale * 0.04);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(cx, cy, rad * 0.22, 0, 6.283);
    ctx.fill();
  }

  private drawPlayer(game: Game, px: number, py: number): void {
    const p = game.player;
    if (p.dead) return;
    const size = this.scale;
    const ctx = this.ctx;
    // A soft shadow on the ground under the runner (smaller and fainter the higher it jumps).
    if (p.g > 0 && p.form !== 'ship' && py < 4 && game.world.overlap(px - 0.3, -0.6, px + 0.3, -0.4, SOLID)) {
      const k = 1 - py / 4;
      this.ctx.fillStyle = `rgba(0,0,0,${(0.3 * k).toFixed(3)})`;
      this.ctx.beginPath();
      this.ctx.ellipse(this.X(px), this.groundPx + size * 0.06, size * 0.46 * (0.55 + 0.45 * k), size * 0.09, 0, 0, 6.283);
      this.ctx.fill();
    }
    // The sprite (1×1) is slightly larger than the hitbox (0.8): centre it on the hitbox.
    const foot = this.Y(py) + (size - PLAYER_HEIGHT * size) / 2;
    const cx = this.X(px);
    const cy = this.Y(py + PLAYER_HEIGHT / 2);
    ctx.save();
    // Flipped gravity: mirror the runner around its centre so its feet are on the ceiling.
    if (p.g < 0) {
      ctx.translate(0, 2 * cy);
      ctx.scale(1, -1);
    }
    if (p.form === 'wave') {
      // A dart pointing where it is heading, with a fading zigzag trail behind it.
      this.drawWaveTrail(game, px, py);
      const ang = Math.atan2(-p.vy * p.g, p.speed);
      ctx.translate(cx, cy);
      ctx.rotate(ang);
      const s = size;
      ctx.fillStyle = game.skin.color;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = s * 0.06;
      ctx.beginPath();
      ctx.moveTo(0.55 * s, 0);
      ctx.lineTo(-0.4 * s, -0.36 * s);
      ctx.lineTo(-0.22 * s, 0);
      ctx.lineTo(-0.4 * s, 0.36 * s);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (p.form === 'ball') {
      // A rolling wheel around the character.
      ctx.translate(cx, cy);
      ctx.rotate(px * 1.4);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.62, 0, 6.283);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = size * 0.07;
      ctx.stroke();
      ctx.beginPath();
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2;
        ctx.moveTo(Math.cos(a) * size * 0.45, Math.sin(a) * size * 0.45);
        ctx.lineTo(Math.cos(a) * size * 0.62, Math.sin(a) * size * 0.62);
      }
      ctx.stroke();
      ctx.translate(-cx, -cy);
      game.view.draw(ctx, cx, foot - size * 0.08, size * 0.82, !p.grounded);
    } else if (p.form === 'ship') {
      // A little rocket under a smaller character, nose tilted by the climb rate.
      ctx.translate(cx, cy);
      ctx.rotate(Math.max(-0.5, Math.min(0.5, -p.vy * p.g * 0.06)));
      const s = size;
      ctx.fillStyle = '#ff7ad9';
      ctx.beginPath();
      ctx.moveTo(-0.62 * s, 0.05 * s);
      ctx.lineTo(0.7 * s, 0.12 * s);
      ctx.quadraticCurveTo(0.45 * s, 0.42 * s, -0.5 * s, 0.4 * s);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(-0.55 * s, 0.26 * s, 1.0 * s, 0.1 * s);
      const flame = 0.18 + 0.12 * Math.abs(Math.sin(game.time * 40));
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.moveTo(-0.62 * s, 0.12 * s);
      ctx.lineTo(-(0.62 + flame) * s, 0.22 * s);
      ctx.lineTo(-0.58 * s, 0.32 * s);
      ctx.closePath();
      ctx.fill();
      game.view.draw(ctx, -0.05 * s, 0.1 * s, s * 0.62, false);
    } else {
      game.view.draw(ctx, cx, foot, size, !p.grounded);
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- overlays

  private readonly waveTrail: number[] = [];

  /** The wave leaves its zigzag behind (world coordinates, drawn before the flip transform). */
  private drawWaveTrail(game: Game, px: number, py: number): void {
    const t = this.waveTrail;
    const n = t.length;
    if (n >= 2 && (px < t[n - 2]! - 1 || px - t[n - 2]! > 3)) t.length = 0;
    t.push(px, py + 0.4);
    if (t.length > 120) t.splice(0, t.length - 120);
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.strokeStyle = game.skin.color;
    ctx.lineWidth = Math.max(2, this.scale * 0.14);
    ctx.lineJoin = 'round';
    for (let i = 2; i < t.length; i += 2) {
      ctx.globalAlpha = (i / t.length) * 0.8;
      ctx.beginPath();
      ctx.moveTo(this.X(t[i - 2]!), this.Y(t[i - 1]!));
      ctx.lineTo(this.X(t[i]!), this.Y(t[i + 1]!));
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Only the in-world "new record" banner lives on the canvas; the rest of the HUD is DOM. */
  private drawBanner(game: Game): void {
    if (this.bannerT <= 0 || game.state !== 'playing') return;
    const { ctx, scale } = this;
    ctx.globalAlpha = Math.min(1, this.bannerT / 0.4, (2 - this.bannerT) / 0.2 + 0.01);
    ctx.fillStyle = '#ffd23f';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = `800 ${Math.round(scale * (0.9 + 0.2 * Math.min(1, (2 - this.bannerT) * 4)))}px system-ui, sans-serif`;
    ctx.fillText('¡NUEVO RÉCORD!', this.w / 2, this.h * 0.14);
    ctx.globalAlpha = 1;
  }

  private drawDebug(game: Game, fps: number): void {
    const { ctx, scale } = this;
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#ffffff';
    for (let i = 0; i < this.visible.length; i++) {
      const r = this.visible[i]!;
      const lift = r.mover ? r.amp * moverLift(r, game.player.x) : 0;
      ctx.strokeRect(this.X(r.x0), this.Y(r.y1 + lift), (r.x1 - r.x0) * scale, Math.min((r.y1 - r.y0) * scale, this.h));
    }
    const p = game.player;
    ctx.strokeStyle = '#00ffff';
    ctx.strokeRect(this.X(p.x - 0.4), this.Y(p.y + PLAYER_HEIGHT), 0.8 * scale, PLAYER_HEIGHT * scale);
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(
      `${fps.toFixed(0)} fps  v=${p.speed.toFixed(1)}  d=${game.difficulty.toFixed(2)}  world=${THEMES[this.theme.a]!.name}${this.lite ? ' LITE' : ''}`,
      this.w - 8,
      8,
    );
  }
}
