import type { Skin } from '../core/skins';
import { PlayerView } from '../render/PlayerView';

/**
 * A small canvas that draws a skin with the very same code the game uses, so what the player
 * picks in the menu is exactly what runs. Animated (blinking, flames, antenna lights…) only while
 * `tick` is being called.
 */
export class SkinPreview {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly view = new PlayerView();

  constructor(readonly canvas: HTMLCanvasElement, skin: Skin) {
    this.ctx = canvas.getContext('2d')!;
    this.setSkin(skin);
  }

  setSkin(skin: Skin): void {
    this.view.setSkin(skin);
  }

  /** Match the canvas bitmap to its CSS size (call after layout, e.g. when a screen becomes visible). */
  fit(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(this.canvas.clientWidth * dpr);
    const h = Math.round(this.canvas.clientHeight * dpr);
    if (w > 0 && h > 0 && (this.canvas.width !== w || this.canvas.height !== h)) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  tick(dt: number): void {
    const { canvas, ctx } = this;
    if (canvas.width === 0) return;
    this.view.update(dt, true, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Leave headroom above the body for hats, ears and flames.
    const size = canvas.height * 0.46;
    this.view.draw(ctx, canvas.width / 2, canvas.height * 0.86, size, false);
  }
}
