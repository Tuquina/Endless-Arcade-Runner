import { PLAYER_HEIGHT, SPIKE_HIT_INSET } from '../physics/constants';
import type { Game } from '../core/Game';
import { SOLID, type Rect } from '../world/Rect';

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

  render(game: Game, alpha: number, fps: number): void {
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
      if (r.kind !== SOLID) {
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

    // Player.
    if (!p.dead) {
      ctx.fillStyle = '#ffd23f';
      const size = scale;
      const cx = sx(px);
      const bottom = sy(py) + (size - PLAYER_HEIGHT * scale) / 2;
      ctx.fillRect(cx - size / 2, bottom - size, size, size);
    }

    if (game.debug) this.drawDebug(game, sx, sy, fps);
    this.drawHud(game);
  }

  private drawHud(game: Game): void {
    const { ctx } = this;
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'top';
    const fs = Math.round(this.scale * 0.7);
    ctx.font = `700 ${fs}px system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(`${game.score} m`, this.scale * 0.5, this.scale * 0.5);
    if (game.state !== 'playing') {
      ctx.textAlign = 'center';
      ctx.font = `700 ${Math.round(this.scale * 0.9)}px system-ui, sans-serif`;
      ctx.fillText(game.state === 'ready' ? 'TAP TO START' : 'TAP TO RETRY', this.w / 2, this.h * 0.28);
    }
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
