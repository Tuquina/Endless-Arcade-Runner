const MAX = 80;
const COLORS = ['#ffd23f', '#2ee6a6', '#ff4d6d', '#6ec1ff', '#ffffff'];

/** Fixed pool of screen-space confetti pieces: bursting never allocates. */
export class Confetti {
  private readonly x = new Float32Array(MAX);
  private readonly y = new Float32Array(MAX);
  private readonly vx = new Float32Array(MAX);
  private readonly vy = new Float32Array(MAX);
  private readonly life = new Float32Array(MAX);
  private readonly color = new Uint8Array(MAX);

  burst(cx: number, cy: number, speed: number): void {
    for (let i = 0; i < MAX; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      this.x[i] = cx;
      this.y[i] = cy;
      this.vx[i] = Math.cos(a) * s;
      this.vy[i] = Math.sin(a) * s - speed * 0.6;
      this.life[i] = 1 + Math.random() * 0.8;
      this.color[i] = i % COLORS.length;
    }
  }

  update(dt: number, gravity: number): void {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i]! <= 0) continue;
      this.life[i]! -= dt;
      this.vy[i]! += gravity * dt;
      this.x[i]! += this.vx[i]! * dt;
      this.y[i]! += this.vy[i]! * dt;
    }
  }

  draw(ctx: CanvasRenderingContext2D, size: number): void {
    for (let i = 0; i < MAX; i++) {
      const l = this.life[i]!;
      if (l <= 0) continue;
      ctx.globalAlpha = Math.min(1, l * 2);
      ctx.fillStyle = COLORS[this.color[i]!]!;
      ctx.fillRect(this.x[i]!, this.y[i]!, size, size * 0.6);
    }
    ctx.globalAlpha = 1;
  }
}
