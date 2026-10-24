import { PLAYER_HEIGHT, SPIKE_HIT_INSET } from '../physics/constants';
import type { Game } from '../core/Game';
import { COIN, HAZARD, SOLID, type Rect } from '../world/Rect';
import { Confetti } from './Confetti';

/** The visible world is always at least this tall and this wide (tiles) → same fairness everywhere. */
const MIN_VIEW_H = 10;
const MIN_VIEW_W = 16;
/** Where the player sits horizontally (fraction of the visible width) and where the ground sits vertically. */
const PLAYER_SCREEN_X = 0.22;
const GROUND_SCREEN_Y = 0.72;

/**
 * Draws the world with a fixed tile-based camera. Milestone-1..3 art is intentionally plain
 * geometry; the polish pass (parallax, particles, themes) replaces the draw functions only.
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
  private readonly confetti = new Confetti();
  /** Seconds left on the "new record" banner. */
  private bannerT = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }

  private resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(1, Math.round(this.canvas.clientWidth * this.dpr));
    this.h = Math.max(1, Math.round(this.canvas.clientHeight * this.dpr));
    this.canvas.width = this.w;
    this.canvas.height = this.h;
    this.scale = Math.min(this.h / MIN_VIEW_H, this.w / MIN_VIEW_W);
    this.viewW = this.w / this.scale;
  }

  render(game: Game, alpha: number, frameDt: number, fps: number): void {
    const { ctx, scale } = this;
    const p = game.player;
    const px = p.prevX + (p.x - p.prevX) * alpha;
    const py = p.prevY + (p.y - p.prevY) * alpha;
    this.camX = px - this.viewW * PLAYER_SCREEN_X;
    const groundPx = this.h * GROUND_SCREEN_Y;
    const sx = (x: number): number => (x - this.camX) * scale;
    const sy = (y: number): number => groundPx - y * scale;

    // Sky + simple depth bands.
    const sky = ctx.createLinearGradient(0, 0, 0, this.h);
    sky.addColorStop(0, '#1b1442');
    sky.addColorStop(1, '#5b2a86');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.w, this.h);

    // World geometry.
    ctx.fillStyle = '#2ee6a6';
    game.world.forEachInRange(this.camX - 1, this.camX + this.viewW + 1, (r: Rect) => {
      if (r.kind === SOLID) {
        ctx.fillRect(sx(r.x0), sy(r.y1), (r.x1 - r.x0) * scale, Math.min((r.y1 - r.y0) * scale, this.h));
      }
    });
    ctx.fillStyle = '#ff4d6d';
    game.world.forEachInRange(this.camX - 1, this.camX + this.viewW + 1, (r: Rect) => {
      if (r.kind === HAZARD) {
        const cx = (r.x0 + r.x1) / 2;
        const half = 0.5;
        ctx.beginPath();
        ctx.moveTo(sx(cx - half), sy(r.y0));
        ctx.lineTo(sx(cx), sy(r.y0 + 1));
        ctx.lineTo(sx(cx + half), sy(r.y0));
        ctx.closePath();
        ctx.fill();
      }
    });

    // Coins.
    ctx.fillStyle = '#ffd23f';
    game.world.forEachInRange(this.camX - 1, this.camX + this.viewW + 1, (r: Rect) => {
      if (r.kind === COIN && !r.taken) {
        ctx.beginPath();
        ctx.arc(sx((r.x0 + r.x1) / 2), sy((r.y0 + r.y1) / 2), ((r.x1 - r.x0) / 2) * scale, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // Marker for the personal best distance (a thin vertical line with a flag).
    const bd = game.save.data.bestDist;
    if (bd > 0 && game.state !== 'menu') {
      const bx = sx(bd);
      if (bx > -scale && bx < this.w + scale) {
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(bx - 1, 0, 2, groundPx);
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.font = `700 ${Math.round(scale * 0.4)}px system-ui, sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('RÉCORD', bx + 6, groundPx * 0.25);
      }
    }

    // Player.
    if (!p.dead) {
      ctx.fillStyle = '#ffd23f';
      const size = scale;
      const cx = sx(px);
      const bottom = sy(py) + (size - PLAYER_HEIGHT * scale) / 2;
      ctx.fillRect(cx - size / 2, bottom - size, size, size);
    }

    if (game.debug) this.drawDebug(game, sx, sy, fps);
    if (game.celebrate) {
      game.celebrate = false;
      this.bannerT = 2;
      this.confetti.burst(this.w / 2, this.h * 0.3, scale * 9);
    }
    this.confetti.update(frameDt, scale * 14);
    this.confetti.draw(ctx, scale * 0.2);
    this.bannerT = Math.max(0, this.bannerT - frameDt);
    this.drawBanner(game);
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

  private drawDebug(game: Game, sx: (x: number) => number, sy: (y: number) => number, fps: number): void {
    const { ctx, scale } = this;
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#ffffff';
    game.world.forEachInRange(this.camX - 1, this.camX + this.viewW + 1, (r: Rect) => {
      ctx.strokeRect(sx(r.x0), sy(r.y1), (r.x1 - r.x0) * scale, Math.min((r.y1 - r.y0) * scale, this.h));
    });
    const p = game.player;
    ctx.strokeStyle = '#00ffff';
    ctx.strokeRect(sx(p.x - 0.4), sy(p.y + PLAYER_HEIGHT), 0.8 * scale, PLAYER_HEIGHT * scale);
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(
      `${fps.toFixed(0)} fps  v=${p.speed.toFixed(1)}  d=${game.difficulty.toFixed(2)}  inset=${SPIKE_HIT_INSET}`,
      this.w - 8,
      8,
    );
  }
}
