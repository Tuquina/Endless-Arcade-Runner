import { PLAYER_HEIGHT } from '../physics/constants';
import type { Game } from '../core/Game';
import { COIN, HAZARD, SOLID, WAVE_SLAM, moverCycle, moverLift, type Rect } from '../world/Rect';
import { Confetti } from './Confetti';
import { hash } from './hash';
import { GroundPainter } from './Ground';
import { DISTANCE_GOALS } from '../core/skins';
import { THEMES, ThemeBlender } from './themes';

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

    this.theme.update(px + game.themeOffset);
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
      const cx = this.X((r.x0 + r.x1) / 2);
      const base = this.Y(r.y0);
      const half = scale * 0.5;
      ctx.fillStyle = c.spike;
      ctx.beginPath();
      ctx.moveTo(cx - half, base);
      ctx.lineTo(cx, base - scale);
      ctx.lineTo(cx + half, base);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = Math.max(1.5, scale * 0.04);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.beginPath();
      ctx.moveTo(cx - half, base);
      ctx.lineTo(cx, base - scale);
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
    const bd = game.save.data.bestDist;
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
    // A soft shadow on the ground under the runner (smaller and fainter the higher it jumps).
    if (py < 4 && game.world.overlap(px - 0.3, -0.6, px + 0.3, -0.4, SOLID)) {
      const k = 1 - py / 4;
      this.ctx.fillStyle = `rgba(0,0,0,${(0.3 * k).toFixed(3)})`;
      this.ctx.beginPath();
      this.ctx.ellipse(this.X(px), this.groundPx + size * 0.06, size * 0.46 * (0.55 + 0.45 * k), size * 0.09, 0, 0, 6.283);
      this.ctx.fill();
    }
    // The sprite (1×1) is slightly larger than the hitbox (0.8): centre it on the hitbox.
    const foot = this.Y(py) + (size - PLAYER_HEIGHT * size) / 2;
    game.view.draw(this.ctx, this.X(px), foot, size, !p.grounded);
  }

  // ---------------------------------------------------------------- overlays

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
