import type { TrailKind } from '../core/skins';

const MAX = 192;

export const P_DUST = 0;
export const P_SHARD = 1;
export const P_RING = 2;
export const P_SPARK = 3;

const COLORS = ['#ffffff', '#ffd23f', '#2ee6a6', '#ff4d6d', '#c79a12', '#ffd23f', '#ffd23f', '#ffd23f', '#ffd23f'];
export const C_WHITE = 0;
export const C_GOLD = 1;
export const C_GREEN = 2;
export const C_PINK = 3;
export const C_DARK = 4;
/** First of 4 slots recoloured to match the selected skin (trail and death burst). */
export const C_SKIN = 5;
const SKIN_SLOTS = 4;

/**
 * Pool of world-space particles in parallel typed arrays (no per-particle objects). Spawning
 * recycles the oldest slot when full, so effects can never grow memory or stall a frame.
 */
export class Particles {
  private readonly x = new Float32Array(MAX);
  private readonly y = new Float32Array(MAX);
  private readonly vx = new Float32Array(MAX);
  private readonly vy = new Float32Array(MAX);
  private readonly life = new Float32Array(MAX);
  private readonly maxLife = new Float32Array(MAX);
  private readonly size = new Float32Array(MAX);
  private readonly rot = new Float32Array(MAX);
  private readonly vr = new Float32Array(MAX);
  private readonly kind = new Uint8Array(MAX);
  private readonly color = new Uint8Array(MAX);
  private readonly gravity = new Float32Array(MAX);
  private cursor = 0;
  /** 1 normally; lower for reduced-motion users. */
  density = 1;
  private readonly palette = COLORS.slice();
  private trailKind: TrailKind = 'shard';
  private trailColors = 1;

  /** Recolour the skin slots and pick how the trail moves. `colors[0]` also colours the death burst. */
  setSkin(color: string, trail?: { kind: TrailKind; colors: readonly string[] }): void {
    const colors = trail?.colors.length ? trail.colors : [color];
    for (let i = 0; i < SKIN_SLOTS; i++) this.palette[C_SKIN + i] = colors[i % colors.length]!;
    this.trailColors = Math.min(SKIN_SLOTS, colors.length);
    this.trailKind = trail?.kind ?? 'shard';
    if (!trail) this.palette[C_SKIN] = color;
  }

  clear(): void {
    this.life.fill(0);
  }

  private spawn(kind: number, x: number, y: number, vx: number, vy: number, life: number, size: number, color: number, gravity = 0, vr = 0): void {
    const i = this.cursor;
    this.cursor = (i + 1) % MAX;
    this.kind[i] = kind;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.life[i] = this.maxLife[i] = life;
    this.size[i] = size;
    this.color[i] = color;
    this.gravity[i] = gravity;
    this.rot[i] = Math.random() * 6.28;
    this.vr[i] = vr;
  }

  /** Small puffs kicked up at the feet when jumping. */
  jump(x: number, y: number): void {
    const n = Math.ceil(5 * this.density);
    for (let i = 0; i < n; i++) {
      this.spawn(P_DUST, x + (Math.random() - 0.5) * 0.4, y + 0.05, -1.5 - Math.random() * 2, 0.6 + Math.random() * 1.2, 0.35 + Math.random() * 0.2, 0.12 + Math.random() * 0.1, C_WHITE);
    }
  }

  /** Expanding ring + dust sprayed sideways; stronger for harder landings. */
  land(x: number, y: number, impact: number): void {
    const power = Math.min(1, impact / 20);
    this.spawn(P_RING, x, y + 0.03, 0, 0, 0.28, 0.35 + power * 0.7, C_WHITE);
    const n = Math.ceil((4 + power * 6) * this.density);
    for (let i = 0; i < n; i++) {
      const dir = i % 2 ? 1 : -1;
      this.spawn(P_DUST, x, y + 0.05, dir * (1 + Math.random() * 3) - 2, 0.3 + Math.random() * 1.2, 0.3 + Math.random() * 0.25, 0.1 + Math.random() * 0.12, C_WHITE);
    }
  }

  /** One trail particle in the selected skin's style. */
  trail(x: number, y: number): void {
    const c = C_SKIN + Math.floor(Math.random() * this.trailColors);
    const r = Math.random();
    switch (this.trailKind) {
      case 'ember': // rises like sparks off a fire
        this.spawn(P_SPARK, x + (r - 0.5) * 0.3, y, -1.5 - r, 2 + r * 2.5, 0.45 + r * 0.2, 0.15, c);
        break;
      case 'bubble': // slow floating bubbles
        this.spawn(P_DUST, x + (r - 0.5) * 0.3, y, -1.2, 0.8 + r * 0.8, 0.7 + r * 0.3, 0.14 + r * 0.06, c);
        break;
      case 'star': // little spinning stars
        this.spawn(P_SHARD, x, y + (r - 0.5) * 0.5, -2 - r, (r - 0.5) * 2, 0.55, 0.2, c, 0, 8);
        break;
      case 'pixel': // square pixels that stay in a line
        this.spawn(P_SPARK, x, y + (Math.floor(r * 3) - 1) * 0.22, -3, 0, 0.4, 0.2, c);
        break;
      case 'wisp': // soft smoke
        this.spawn(P_DUST, x, y + (r - 0.5) * 0.3, -1, 0.5, 0.55, 0.28, c);
        break;
      case 'flake': // snow drifting down
        this.spawn(P_DUST, x, y + r * 0.4, -1.5, -0.9, 0.8, 0.09, c);
        break;
      default:
        this.spawn(P_SHARD, x, y, -2, 0, 0.3, 0.22, C_SKIN, 0, 0);
    }
  }

  coin(x: number, y: number): void {
    const n = Math.ceil(7 * this.density);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.283 + Math.random() * 0.5;
      const s = 2 + Math.random() * 2.5;
      this.spawn(P_SPARK, x, y, Math.cos(a) * s, Math.sin(a) * s, 0.35 + Math.random() * 0.2, 0.09, C_GOLD);
    }
  }

  /** The body bursts into 3×3 cubes plus sparks. */
  death(x: number, y: number): void {
    for (let gy = 0; gy < 3; gy++) {
      for (let gx = 0; gx < 3; gx++) {
        const dx = gx - 1;
        const dy = gy - 1;
        this.spawn(P_SHARD, x + dx * 0.3, y + 0.5 + dy * 0.3, dx * 3 + (Math.random() - 0.5) * 3 - 2, 5 + dy * 3 + Math.random() * 3, 0.9 + Math.random() * 0.5, 0.28, C_SKIN, -26, (Math.random() - 0.5) * 12);
      }
    }
    const n = Math.ceil(10 * this.density);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283;
      const s = 3 + Math.random() * 6;
      this.spawn(P_SPARK, x, y + 0.5, Math.cos(a) * s, Math.sin(a) * s + 2, 0.4 + Math.random() * 0.4, 0.1, i % 2 ? C_PINK : C_WHITE, -12);
    }
  }

  update(dt: number): void {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i]! <= 0) continue;
      this.life[i]! -= dt;
      this.vy[i]! += this.gravity[i]! * dt;
      this.x[i]! += this.vx[i]! * dt;
      this.y[i]! += this.vy[i]! * dt;
      this.rot[i]! += this.vr[i]! * dt;
    }
  }

  /** Draw with the renderer's camera: screen = ((x - camX) * scale, groundPx - y * scale). */
  draw(ctx: CanvasRenderingContext2D, camX: number, groundPx: number, scale: number): void {
    for (let i = 0; i < MAX; i++) {
      const life = this.life[i]!;
      if (life <= 0) continue;
      const t = life / this.maxLife[i]!; // 1 → 0
      const px = (this.x[i]! - camX) * scale;
      const py = groundPx - this.y[i]! * scale;
      const s = this.size[i]! * scale;
      const kind = this.kind[i]!;
      ctx.globalAlpha = Math.min(1, t * 1.6);
      ctx.fillStyle = this.palette[this.color[i]!]!;
      if (kind === P_DUST) {
        ctx.beginPath();
        ctx.arc(px, py, s * (0.6 + (1 - t) * 0.8), 0, 6.283);
        ctx.fill();
      } else if (kind === P_RING) {
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = Math.max(1, scale * 0.06 * t);
        ctx.beginPath();
        ctx.ellipse(px, py, s * (1 - t * 0.6) * 1.6, s * (1 - t * 0.6) * 0.45, 0, 0, 6.283);
        ctx.stroke();
      } else if (kind === P_SPARK) {
        ctx.fillRect(px - s / 2, py - s / 2, s * (0.4 + t), s * (0.4 + t));
      } else {
        const sz = s * (0.4 + t * 0.6);
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(this.rot[i]!);
        ctx.fillRect(-sz / 2, -sz / 2, sz, sz);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }
}
