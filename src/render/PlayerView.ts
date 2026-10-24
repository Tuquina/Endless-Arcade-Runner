const HALF_PI = Math.PI / 2;
const BLINK_LEN = 0.12;

/** Rounded-rect path helper (arcTo works everywhere, unlike ctx.roundRect on older Safari). */
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Cosmetic state of the runner: squash & stretch (a damped spring), in-air spin that settles
 * flat on landing, blinking and eye direction. Updated at the fixed step so it is
 * frame-rate independent; it never feeds back into physics.
 */
export class PlayerView {
  color = '#ffd23f';
  shade = '#c79a12';
  /** Stretch amount: >0 tall & thin, <0 short & wide. */
  private q = 0;
  private qv = 0;
  private angle = 0;
  private blink = 2;
  private lookY = 0;

  reset(): void {
    this.q = this.qv = this.angle = this.lookY = 0;
    this.blink = 2;
  }

  jump(): void {
    this.qv += 9;
  }

  land(impact: number): void {
    this.qv -= 4 + Math.min(1, impact / 22) * 8;
  }

  update(dt: number, grounded: boolean, vy: number): void {
    const target = grounded ? 0 : Math.min(0.16, Math.abs(vy) * 0.011);
    const k = 380;
    const c = 2 * Math.sqrt(k) * 0.42;
    this.qv += (-k * (this.q - target) - c * this.qv) * dt;
    this.q += this.qv * dt;
    this.q = Math.max(-0.45, Math.min(0.4, this.q));

    if (grounded) {
      const snap = Math.round(this.angle / HALF_PI) * HALF_PI;
      this.angle += (snap - this.angle) * Math.min(1, dt * 28);
    } else {
      this.angle += 8.5 * dt;
    }
    this.lookY += (Math.max(-1, Math.min(1, vy / 14)) - this.lookY) * Math.min(1, dt * 14);

    this.blink -= dt;
    if (this.blink < -BLINK_LEN) this.blink = 2 + Math.random() * 2.5;
  }

  /** `cx` is the horizontal centre and `footY` the ground contact point, in pixels. */
  draw(ctx: CanvasRenderingContext2D, cx: number, footY: number, size: number, airborne: boolean): void {
    const sy = 1 + this.q;
    const sx = 1 - this.q * 0.6;
    ctx.save();
    ctx.translate(cx, footY - size * 0.5 * sy);
    ctx.rotate(this.angle);
    ctx.scale(sx, sy);

    const h = size / 2;
    const r = size * 0.22;
    rr(ctx, -h, -h, size, size, r);
    ctx.fillStyle = this.color;
    ctx.fill();
    // Soft underside + glossy corner give the flat shape some volume.
    ctx.save();
    ctx.clip();
    ctx.fillStyle = this.shade;
    ctx.fillRect(-h, h * 0.55, size, h);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(-h * 0.8, -h * 0.85, size * 0.45, size * 0.12);
    ctx.restore();

    // Eyes: wider while rising, pupils drift with vertical speed, blink every few seconds.
    const blinking = this.blink < 0 && this.blink > -BLINK_LEN;
    const eyeW = size * 0.17;
    const eyeH = blinking ? size * 0.03 : size * (airborne ? 0.3 : 0.26);
    const eyeY = -h * 0.12 - eyeH / 2;
    for (const ex of [-0.27, 0.27]) {
      const x = ex * size - eyeW / 2 + size * 0.06;
      rr(ctx, x, eyeY, eyeW, eyeH, eyeW / 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      if (!blinking) {
        ctx.fillStyle = '#2b1d5c';
        const pw = eyeW * 0.62;
        ctx.fillRect(x + eyeW - pw, eyeY + eyeH / 2 - pw / 2 - this.lookY * eyeH * 0.22, pw, pw * 1.25);
      }
    }
    ctx.restore();
  }
}
