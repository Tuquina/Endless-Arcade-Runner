import type { Accessory, Skin } from '../core/skins';

const HALF_PI = Math.PI / 2;
const BLINK_LEN = 0.12;
const INK = '#2b1d5c';

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

/** Four-pointed sparkle centred at (x, y) with arm length r. */
function star4(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.closePath();
  ctx.fill();
}

/** Run `draw` with the current alpha scaled by `k`, then put it back exactly. */
function faded(ctx: CanvasRenderingContext2D, k: number, draw: () => void): void {
  const a = ctx.globalAlpha;
  ctx.globalAlpha = a * k;
  draw();
  ctx.globalAlpha = a;
}

/** Accessories that sit behind the body (their lower part is hidden by it). */
const BEHIND: ReadonlySet<Accessory> = new Set(['catEars', 'bearEars', 'antenna', 'flame', 'crystals']);

/**
 * Cosmetic state and drawing of the runner: squash & stretch (a damped spring), in-air spin that
 * settles flat on landing, blinking and eye direction, plus everything a skin adds (pattern, face,
 * accessories, aura). Updated at the fixed step so it is frame-rate independent; it never feeds
 * back into physics. The same class draws the previews in the menus.
 */
export class PlayerView {
  color = '#ffd23f';
  shade = '#c79a12';
  private skin: Skin | null = null;
  private rainbow = false;
  private hue = 0;
  private hueKey = -1;
  /** Animation clock (s) for flickering flames, antenna lights, glitches… */
  private clock = 0;
  /** Stretch amount: >0 tall & thin, <0 short & wide. */
  private q = 0;
  private qv = 0;
  private angle = 0;
  private blink = 2;
  private lookY = 0;

  setSkin(skin: Skin): void {
    this.skin = skin;
    this.color = skin.color;
    this.shade = skin.shade;
    this.rainbow = skin.rainbow ?? false;
    this.hueKey = -1;
  }

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
    this.clock += dt;
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

    if (this.rainbow) {
      this.hue = (this.hue + dt * 140) % 360;
      const key = Math.floor(this.hue / 6); // recolour every 6° → 60 strings per cycle, not 1 per frame
      if (key !== this.hueKey) {
        this.hueKey = key;
        this.color = `hsl(${key * 6} 90% 60%)`;
        this.shade = `hsl(${key * 6} 70% 42%)`;
      }
    }

    this.blink -= dt;
    if (this.blink < -BLINK_LEN) this.blink = 2 + Math.random() * 2.5;
  }

  /** `cx` is the horizontal centre and `footY` the ground contact point, in pixels. */
  draw(ctx: CanvasRenderingContext2D, cx: number, footY: number, size: number, airborne: boolean): void {
    const skin = this.skin;
    const accessories = skin?.accessories ?? [];
    const aura = skin?.aura;
    const t = this.clock;
    const h = size / 2;
    const sy = 1 + this.q;
    const sx = 1 - this.q * 0.6;

    // Ghosts hover and are slightly see-through.
    const hover = aura === 'ghost' ? size * (0.06 + 0.04 * Math.sin(t * 3)) : 0;
    ctx.save();
    ctx.translate(cx, footY - hover - size * 0.5 * sy);
    ctx.rotate(this.angle);
    ctx.scale(sx, sy);
    if (aura === 'ghost') ctx.globalAlpha = 0.84;

    // ---- behind the body -------------------------------------------------------------
    if (aura === 'ghost') {
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      rr(ctx, -h * 1.12, -h * 1.12, size * 1.12, size * 1.12, size * 0.28);
      ctx.fill();
    }
    if (aura === 'glitch' && t % 1.7 < 0.14) {
      ctx.fillStyle = 'rgba(255,0,170,0.55)';
      rr(ctx, -h - size * 0.07, -h + size * 0.02, size, size, size * 0.2);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,212,255,0.55)';
      rr(ctx, -h + size * 0.07, -h - size * 0.02, size, size, size * 0.2);
      ctx.fill();
    }
    for (const a of accessories) if (BEHIND.has(a)) this.accessory(ctx, a, size, t);

    // ---- body --------------------------------------------------------------------------
    rr(ctx, -h, -h, size, size, size * 0.22);
    ctx.fillStyle = this.color;
    ctx.fill();
    ctx.save();
    ctx.clip();
    // Soft underside gives the flat shape some volume.
    ctx.fillStyle = this.shade;
    ctx.fillRect(-h, h * 0.55, size, h);
    if (skin?.pattern) this.pattern(ctx, skin.pattern, skin.accent ?? this.shade, size);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(-h * 0.8, -h * 0.85, size * 0.45, size * 0.12);
    ctx.restore();

    // ---- face --------------------------------------------------------------------------
    this.face(ctx, skin?.face ?? 'default', size, airborne);
    if (skin?.mouth) this.mouth(ctx, skin.mouth, size);

    // ---- in front of the body ----------------------------------------------------------
    for (const a of accessories) if (!BEHIND.has(a)) this.accessory(ctx, a, size, t);
    if (aura === 'sparkle') {
      // A glint travels around the corners of the gem.
      const phase = (t * 1.3) % 4;
      const corner = Math.floor(phase);
      const f = phase - corner;
      ctx.fillStyle = '#ffffff';
      star4(ctx, (corner % 2 ? 0.3 : -0.3) * size, (corner < 2 ? -0.3 : 0.3) * size, Math.sin(f * Math.PI) * size * 0.2);
    }
    ctx.restore();
  }

  // -------------------------------------------------------------------------------------
  // Pattern: drawn inside the body's clip, so it never leaks past the rounded corners.
  // -------------------------------------------------------------------------------------
  private pattern(ctx: CanvasRenderingContext2D, kind: NonNullable<Skin['pattern']>, accent: string, s: number): void {
    const h = s / 2;
    ctx.fillStyle = accent;
    ctx.strokeStyle = accent;
    switch (kind) {
      case 'stripes':
        for (const i of [-0.28, 0, 0.28]) {
          ctx.beginPath();
          ctx.moveTo((i - 0.07) * s, -h);
          ctx.lineTo((i + 0.07) * s, -h);
          ctx.lineTo((i + 0.03) * s, -0.04 * s);
          ctx.lineTo((i - 0.03) * s, -0.04 * s);
          ctx.closePath();
          ctx.fill();
        }
        ctx.fillRect(-h, 0.1 * s, 0.1 * s, 0.07 * s);
        ctx.fillRect(-h, 0.28 * s, 0.14 * s, 0.07 * s);
        ctx.fillRect(h - 0.1 * s, 0.1 * s, 0.1 * s, 0.07 * s);
        ctx.fillRect(h - 0.14 * s, 0.28 * s, 0.14 * s, 0.07 * s);
        break;
      case 'dots':
        faded(ctx, 0.55, () => {
          for (const [x, y, r] of [[-0.3, 0.3, 0.06], [0.28, 0.34, 0.07], [0.04, 0.42, 0.045], [-0.35, -0.36, 0.05], [0.34, -0.34, 0.06]] as const) {
            ctx.beginPath();
            ctx.arc(x * s, y * s, r * s, 0, 6.283);
            ctx.fill();
          }
        });
        break;
      case 'checker': {
        const cell = s / 4;
        faded(ctx, 0.55, () => {
          for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if ((i + j) & 1) ctx.fillRect(-h + i * cell, -h + j * cell, cell, cell);
        });
        break;
      }
      case 'circuit':
        ctx.lineWidth = 0.03 * s;
        ctx.beginPath();
        ctx.moveTo(-h, 0.32 * s);
        ctx.lineTo(-0.24 * s, 0.32 * s);
        ctx.lineTo(-0.24 * s, 0.14 * s);
        ctx.moveTo(h, 0.4 * s);
        ctx.lineTo(0.2 * s, 0.4 * s);
        ctx.lineTo(0.2 * s, 0.2 * s);
        ctx.lineTo(0.34 * s, 0.2 * s);
        ctx.moveTo(-0.1 * s, h);
        ctx.lineTo(-0.1 * s, 0.34 * s);
        ctx.lineTo(0.06 * s, 0.34 * s);
        ctx.stroke();
        for (const [x, y] of [[-0.24, 0.14], [0.34, 0.2], [0.06, 0.34]] as const) {
          ctx.beginPath();
          ctx.arc(x * s, y * s, 0.032 * s, 0, 6.283);
          ctx.fill();
        }
        break;
      case 'stars':
        for (const [x, y, r] of [[-0.3, 0.3, 0.07], [0.3, 0.36, 0.055], [0.32, -0.3, 0.05], [-0.32, -0.34, 0.045]] as const) {
          star4(ctx, x * s, y * s, r * s * 1.4);
        }
        break;
      case 'frost':
        ctx.lineWidth = 0.02 * s;
        faded(ctx, 0.7, () => {
          ctx.beginPath();
          ctx.moveTo(-h, 0.1 * s);
          ctx.lineTo(-0.1 * s, h);
          ctx.moveTo(-h, -0.2 * s);
          ctx.lineTo(0.2 * s, h);
          ctx.moveTo(0.1 * s, -h);
          ctx.lineTo(h, 0.3 * s);
          ctx.stroke();
        });
        faded(ctx, 0.35, () => {
          ctx.beginPath();
          ctx.moveTo(-h, h);
          ctx.lineTo(-0.15 * s, h);
          ctx.lineTo(-h, 0.15 * s);
          ctx.closePath();
          ctx.fill();
        });
        break;
      case 'facets':
        ctx.fillStyle = 'rgba(255,255,255,0.28)';
        ctx.beginPath();
        ctx.moveTo(-h, -h);
        ctx.lineTo(0, -h);
        ctx.lineTo(-h, 0);
        ctx.closePath();
        ctx.moveTo(0, 0);
        ctx.lineTo(h, 0);
        ctx.lineTo(0, h);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(0,40,90,0.14)';
        ctx.beginPath();
        ctx.moveTo(h, h);
        ctx.lineTo(0, h);
        ctx.lineTo(h, 0);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.65)';
        ctx.lineWidth = 0.022 * s;
        ctx.beginPath();
        ctx.moveTo(-h, -h); ctx.lineTo(h, h);
        ctx.moveTo(h, -h); ctx.lineTo(-h, h);
        ctx.moveTo(0, -h); ctx.lineTo(0, h);
        ctx.moveTo(-h, 0); ctx.lineTo(h, 0);
        ctx.stroke();
        break;
    }
  }

  // -------------------------------------------------------------------------------------
  // Face
  // -------------------------------------------------------------------------------------
  private face(ctx: CanvasRenderingContext2D, face: NonNullable<Skin['face']>, s: number, airborne: boolean): void {
    if (face === 'none') return;
    const h = s / 2;
    const blinking = this.blink < 0 && this.blink > -BLINK_LEN;
    // The eyes sit a little right of centre: the runner looks where it is going.
    const cxs = [-0.21 * s, 0.33 * s];
    const eyeW = s * 0.17;
    const eyeH = blinking ? s * 0.03 : s * (airborne ? 0.3 : 0.26);
    const eyeY = -h * 0.12 - eyeH / 2;
    const cy = -h * 0.12;
    const accent = this.skin?.accent ?? INK;

    if (face === 'visor') {
      // A dark LED visor with two glowing eyes and a scanning light.
      ctx.fillStyle = '#10222e';
      rr(ctx, -0.4 * s, -0.25 * s, 0.84 * s, 0.3 * s, 0.07 * s);
      ctx.fill();
      ctx.fillStyle = accent;
      for (const x of cxs) {
        const lh = blinking ? 0.02 * s : 0.13 * s;
        rr(ctx, x - 0.075 * s, cy - 0.03 * s - lh / 2, 0.15 * s, lh, 0.04 * s);
        ctx.fill();
      }
      ctx.fillStyle = '#ffffff';
      faded(ctx, 0.55, () => ctx.fillRect(-0.38 * s + ((this.clock * 0.7) % 1) * 0.78 * s, -0.23 * s, 0.04 * s, 0.26 * s));
      return;
    }
    if (face === 'astro') {
      // Big helmet glass with a reflection; the eyes are two small dots inside.
      ctx.fillStyle = '#16233f';
      rr(ctx, -0.4 * s, -0.36 * s, 0.84 * s, 0.56 * s, 0.2 * s);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.04 * s;
      rr(ctx, -0.43 * s, -0.39 * s, 0.9 * s, 0.62 * s, 0.22 * s);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.beginPath();
      ctx.moveTo(-0.3 * s, -0.3 * s);
      ctx.lineTo(-0.08 * s, -0.3 * s);
      ctx.lineTo(-0.26 * s, 0.12 * s);
      ctx.lineTo(-0.34 * s, 0.12 * s);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      for (const x of cxs) {
        if (blinking) ctx.fillRect(x - 0.05 * s, cy - 0.02 * s, 0.1 * s, 0.025 * s);
        else {
          ctx.beginPath();
          ctx.arc(x, cy - 0.04 * s - this.lookY * 0.03 * s, 0.055 * s, 0, 6.283);
          ctx.fill();
        }
      }
      return;
    }
    if (face === 'ninja') {
      // Dark mask across the eyes; only two angry white slits show.
      ctx.fillStyle = '#0c1226';
      ctx.fillRect(-h, -0.3 * s, s, 0.3 * s);
      ctx.fillStyle = '#ffffff';
      for (const [i, x] of cxs.entries()) {
        ctx.save();
        ctx.translate(x, cy - 0.08 * s);
        ctx.rotate(i === 0 ? 0.28 : -0.28);
        const lh = blinking ? 0.02 * s : 0.075 * s;
        rr(ctx, -0.085 * s, -lh / 2, 0.17 * s, lh, lh / 2);
        ctx.fill();
        ctx.restore();
      }
      return;
    }
    if (face === 'ghost') {
      ctx.fillStyle = accent === INK ? '#2b3a5c' : '#3b4b75';
      for (const x of cxs) {
        ctx.beginPath();
        ctx.ellipse(x, cy - 0.04 * s, 0.065 * s, blinking ? 0.012 * s : 0.1 * s, 0, 0, 6.283);
        ctx.fill();
      }
      return;
    }

    if (face === 'panda') {
      // Dark patches around the eyes.
      ctx.fillStyle = accent;
      for (const [i, x] of cxs.entries()) {
        ctx.beginPath();
        ctx.ellipse(x, cy - 0.02 * s, 0.17 * s, 0.22 * s, i === 0 ? 0.35 : -0.35, 0, 6.283);
        ctx.fill();
      }
    }
    for (const [i, x] of cxs.entries()) {
      const ex = x - eyeW / 2;
      rr(ctx, ex, eyeY, eyeW, eyeH, eyeW / 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      if (!blinking) {
        ctx.fillStyle = INK;
        const pw = eyeW * 0.62;
        ctx.fillRect(ex + eyeW - pw, eyeY + eyeH / 2 - pw / 2 - this.lookY * eyeH * 0.22, pw, pw * 1.25);
      }
      if (face === 'angry') {
        // Slanted brows pointing at the nose: a permanent frown.
        ctx.strokeStyle = this.skin?.accent ?? INK;
        ctx.lineWidth = 0.06 * s;
        ctx.lineCap = 'round';
        ctx.beginPath();
        const bx = x;
        if (i === 0) {
          ctx.moveTo(bx - 0.13 * s, eyeY - 0.07 * s);
          ctx.lineTo(bx + 0.11 * s, eyeY + 0.0 * s);
        } else {
          ctx.moveTo(bx + 0.13 * s, eyeY - 0.07 * s);
          ctx.lineTo(bx - 0.11 * s, eyeY + 0.0 * s);
        }
        ctx.stroke();
        ctx.lineCap = 'butt';
      }
    }
  }

  private mouth(ctx: CanvasRenderingContext2D, kind: NonNullable<Skin['mouth']>, s: number): void {
    ctx.strokeStyle = INK;
    ctx.fillStyle = INK;
    ctx.lineWidth = 0.04 * s;
    ctx.lineCap = 'round';
    switch (kind) {
      case 'smile':
      case 'fang':
        ctx.beginPath();
        ctx.arc(0.06 * s, 0.14 * s, 0.13 * s, 0.2 * Math.PI, 0.8 * Math.PI);
        ctx.stroke();
        if (kind === 'fang') {
          ctx.fillStyle = '#ffffff';
          for (const x of [-0.04, 0.16]) {
            ctx.beginPath();
            ctx.moveTo((x - 0.035) * s, 0.235 * s);
            ctx.lineTo((x + 0.035) * s, 0.235 * s);
            ctx.lineTo(x * s, 0.31 * s);
            ctx.closePath();
            ctx.fill();
          }
        }
        break;
      case 'o':
        ctx.beginPath();
        ctx.ellipse(0.06 * s, 0.27 * s, 0.05 * s, 0.07 * s, 0, 0, 6.283);
        ctx.fill();
        break;
      case 'grin':
        ctx.beginPath();
        ctx.arc(0.05 * s, 0.02 * s, 0.34 * s, 0.22 * Math.PI, 0.78 * Math.PI);
        ctx.stroke();
        break;
    }
    ctx.lineCap = 'butt';
  }

  // -------------------------------------------------------------------------------------
  // Accessories
  // -------------------------------------------------------------------------------------
  private accessory(ctx: CanvasRenderingContext2D, a: Accessory, s: number, t: number): void {
    const h = s / 2;
    const accent = this.skin?.accent ?? this.shade;
    switch (a) {
      case 'shades':
        ctx.fillStyle = '#14102b';
        rr(ctx, -0.4 * s, -0.2 * s, 0.34 * s, 0.27 * s, s * 0.08);
        ctx.fill();
        rr(ctx, 0.06 * s, -0.2 * s, 0.34 * s, 0.27 * s, s * 0.08);
        ctx.fill();
        ctx.fillRect(-0.08 * s, -0.14 * s, 0.16 * s, 0.05 * s);
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.fillRect(-0.33 * s, -0.16 * s, 0.1 * s, 0.04 * s);
        ctx.fillRect(0.13 * s, -0.16 * s, 0.1 * s, 0.04 * s);
        break;
      case 'crown':
        ctx.fillStyle = '#ffd23f';
        ctx.strokeStyle = '#b8860b';
        ctx.lineWidth = Math.max(1, s * 0.03);
        ctx.beginPath();
        ctx.moveTo(-0.28 * s, -h + s * 0.03);
        ctx.lineTo(-0.3 * s, -h - s * 0.24);
        ctx.lineTo(-0.14 * s, -h - s * 0.08);
        ctx.lineTo(0, -h - s * 0.28);
        ctx.lineTo(0.14 * s, -h - s * 0.08);
        ctx.lineTo(0.3 * s, -h - s * 0.24);
        ctx.lineTo(0.28 * s, -h + s * 0.03);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ff4d6d';
        ctx.beginPath();
        ctx.arc(0, -h - s * 0.02, s * 0.035, 0, 6.283);
        ctx.fill();
        break;
      case 'headphones': {
        // Band over the head and two cups that thump on the beat of the clock.
        const thump = 1 + 0.06 * Math.max(0, Math.sin(t * 8));
        ctx.strokeStyle = '#1d1b2e';
        ctx.lineWidth = 0.09 * s;
        ctx.beginPath();
        ctx.arc(0, -0.08 * s, 0.56 * s, Math.PI * 1.08, Math.PI * 1.92);
        ctx.stroke();
        for (const d of [-1, 1]) {
          const cw = 0.2 * s * thump;
          const ch = 0.36 * s * thump;
          ctx.fillStyle = '#1d1b2e';
          rr(ctx, d * 0.52 * s - cw / 2, -0.12 * s - ch / 2 + 0.1 * s, cw, ch, cw * 0.4);
          ctx.fill();
          ctx.fillStyle = accent;
          rr(ctx, d * 0.52 * s - cw * 0.28, -0.12 * s - ch * 0.32 + 0.1 * s, cw * 0.56, ch * 0.64, cw * 0.25);
          ctx.fill();
        }
        break;
      }
      case 'catEars':
        for (const d of [-1, 1]) {
          ctx.fillStyle = this.color;
          ctx.beginPath();
          ctx.moveTo(d * 0.46 * s, -0.42 * s);
          ctx.lineTo(d * 0.4 * s, -0.74 * s);
          ctx.lineTo(d * 0.12 * s, -0.46 * s);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = accent;
          ctx.beginPath();
          ctx.moveTo(d * 0.38 * s, -0.48 * s);
          ctx.lineTo(d * 0.37 * s, -0.64 * s);
          ctx.lineTo(d * 0.22 * s, -0.5 * s);
          ctx.closePath();
          ctx.fill();
        }
        break;
      case 'bearEars':
        ctx.fillStyle = accent;
        for (const d of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(d * 0.37 * s, -0.43 * s, 0.17 * s, 0, 6.283);
          ctx.fill();
        }
        break;
      case 'antenna': {
        ctx.strokeStyle = this.shade;
        ctx.lineWidth = 0.04 * s;
        ctx.beginPath();
        ctx.moveTo(0.12 * s, -0.46 * s);
        ctx.lineTo(0.12 * s, -0.78 * s);
        ctx.stroke();
        const on = 0.5 + 0.5 * Math.sin(t * 6);
        ctx.fillStyle = accent;
        faded(ctx, 0.25 + 0.2 * on, () => {
          ctx.beginPath();
          ctx.arc(0.12 * s, -0.82 * s, 0.11 * s, 0, 6.283);
          ctx.fill();
        });
        ctx.beginPath();
        ctx.arc(0.12 * s, -0.82 * s, 0.06 * s, 0, 6.283);
        ctx.fill();
        break;
      }
      case 'bolts':
        ctx.fillStyle = '#6d7f95';
        ctx.strokeStyle = '#3b4a5c';
        ctx.lineWidth = 0.015 * s;
        for (const x of [-0.41, 0.43]) {
          ctx.beginPath();
          ctx.arc(x * s, 0.3 * s, 0.045 * s, 0, 6.283);
          ctx.fill();
          ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 0.025 * s;
        ctx.beginPath();
        for (const y of [0.3, 0.37, 0.44]) {
          ctx.moveTo(-0.02 * s, y * s);
          ctx.lineTo(0.2 * s, y * s);
        }
        ctx.stroke();
        break;
      case 'headband': {
        // Red band across the forehead with two tails fluttering behind the runner.
        ctx.fillStyle = accent;
        ctx.fillRect(-h, -0.37 * s, s, 0.09 * s);
        for (const [i, len] of [[0, 0.5], [1, 0.38]] as const) {
          const sway = Math.sin(t * 11 + i * 1.7) * 0.07 * s;
          ctx.beginPath();
          ctx.moveTo(-h, -0.37 * s + i * 0.03 * s);
          ctx.quadraticCurveTo(-h - len * 0.5 * s, -0.4 * s + sway, -h - len * s, -0.33 * s + sway * 1.6 + i * 0.07 * s);
          ctx.lineTo(-h - len * s + 0.04 * s, -0.27 * s + sway * 1.6 + i * 0.07 * s);
          ctx.quadraticCurveTo(-h - len * 0.45 * s, -0.31 * s + sway, -h, -0.28 * s + i * 0.03 * s);
          ctx.closePath();
          ctx.fill();
        }
        break;
      }
      case 'wizardHat':
        // Brim, cone with a bent tip, a band, and a twinkling star.
        ctx.fillStyle = '#3c2090';
        ctx.beginPath();
        ctx.ellipse(0, -0.46 * s, 0.56 * s, 0.1 * s, 0, 0, 6.283);
        ctx.fill();
        ctx.fillStyle = '#5a32c4';
        ctx.beginPath();
        ctx.moveTo(-0.34 * s, -0.47 * s);
        ctx.quadraticCurveTo(-0.14 * s, -0.8 * s, 0.14 * s, -1.0 * s);
        ctx.quadraticCurveTo(0.2 * s, -1.06 * s, 0.3 * s, -0.98 * s);
        ctx.quadraticCurveTo(0.2 * s, -0.8 * s, 0.34 * s, -0.47 * s);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = accent;
        ctx.fillRect(-0.3 * s, -0.58 * s, 0.62 * s, 0.07 * s);
        ctx.fillStyle = '#ffffff';
        star4(ctx, 0.04 * s, -0.78 * s, (0.07 + 0.025 * Math.sin(t * 5)) * s);
        break;
      case 'beard':
        ctx.fillStyle = '#f4f4f8';
        ctx.strokeStyle = 'rgba(0,0,0,0.18)';
        ctx.lineWidth = 0.015 * s;
        ctx.beginPath();
        ctx.moveTo(-0.44 * s, 0.14 * s);
        ctx.quadraticCurveTo(-0.46 * s, 0.4 * s, -0.2 * s, h);
        ctx.lineTo(0.28 * s, h);
        ctx.quadraticCurveTo(0.52 * s, 0.4 * s, 0.46 * s, 0.14 * s);
        ctx.quadraticCurveTo(0.03 * s, 0.28 * s, -0.44 * s, 0.14 * s);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      case 'flame':
        for (const [i, x] of [-0.28, 0, 0.28].entries()) {
          const hgt = (0.3 + 0.12 * Math.sin(t * 13 + i * 2.1)) * s;
          const sway = Math.sin(t * 9 + i) * 0.05 * s;
          ctx.fillStyle = '#ff9a1f';
          ctx.beginPath();
          ctx.moveTo(x * s - 0.13 * s, -0.42 * s);
          ctx.quadraticCurveTo(x * s - 0.12 * s, -0.5 * s - hgt * 0.6, x * s + sway, -0.5 * s - hgt);
          ctx.quadraticCurveTo(x * s + 0.12 * s, -0.5 * s - hgt * 0.5, x * s + 0.13 * s, -0.42 * s);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = accent;
          ctx.beginPath();
          ctx.moveTo(x * s - 0.07 * s, -0.42 * s);
          ctx.quadraticCurveTo(x * s - 0.06 * s, -0.48 * s - hgt * 0.35, x * s + sway * 0.6, -0.5 * s - hgt * 0.62);
          ctx.quadraticCurveTo(x * s + 0.07 * s, -0.48 * s - hgt * 0.3, x * s + 0.07 * s, -0.42 * s);
          ctx.closePath();
          ctx.fill();
        }
        break;
      case 'crystals':
        for (const [x, hgt] of [[-0.28, 0.3], [0.02, 0.46], [0.3, 0.26]] as const) {
          ctx.fillStyle = '#e9fbff';
          ctx.beginPath();
          ctx.moveTo((x - 0.11) * s, -0.42 * s);
          ctx.lineTo(x * s, -0.5 * s - hgt * s);
          ctx.lineTo((x + 0.11) * s, -0.42 * s);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = 'rgba(124,197,230,0.7)';
          ctx.beginPath();
          ctx.moveTo(x * s, -0.42 * s);
          ctx.lineTo(x * s, -0.5 * s - hgt * s);
          ctx.lineTo((x + 0.11) * s, -0.42 * s);
          ctx.closePath();
          ctx.fill();
        }
        break;
      case 'frogEyes': {
        const blinking = this.blink < 0 && this.blink > -BLINK_LEN;
        for (const x of [-0.25, 0.27]) {
          ctx.fillStyle = this.color;
          ctx.beginPath();
          ctx.arc(x * s, -0.43 * s, 0.22 * s, 0, 6.283);
          ctx.fill();
          if (blinking) {
            ctx.fillStyle = this.shade;
            ctx.fillRect((x - 0.15) * s, -0.45 * s, 0.3 * s, 0.045 * s);
          } else {
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(x * s, -0.43 * s, 0.17 * s, 0, 6.283);
            ctx.fill();
            ctx.fillStyle = INK;
            ctx.beginPath();
            ctx.arc((x + 0.04) * s, -0.43 * s - this.lookY * 0.04 * s, 0.085 * s, 0, 6.283);
            ctx.fill();
          }
        }
        break;
      }
    }
  }
}
