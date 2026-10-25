import type { Prefab } from './types';

/** Simple helper: pick one of two heights etc. without allocating in hot paths (build is off-loop). */
export const PREFABS: Prefab[] = [
  // ---- spikes ----
  {
    id: 'spike1', mechanic: 'spike', minD: 0, maxD: 1,
    build(b) { b.spikes(0, 1); b.width = 1; },
  },
  {
    id: 'spike2', mechanic: 'spike', minD: 0.03, maxD: 1,
    build(b) { b.spikes(0, 2); b.width = 2; },
  },
  {
    // Three spikes in a row need a long held jump: the window is only human-sized from d ≈ 0.4 up
    // (higher speed carries the runner further while it is above the spikes).
    id: 'spike3', mechanic: 'spike', minD: 0.4, maxD: 1, weight: 0.7,
    build(b) { b.spikes(0, 3); b.width = 3; },
  },
  {
    id: 'spikePair', mechanic: 'spike', minD: 0.2, maxD: 1,
    build(b, r) {
      const gap = r.range(3.5, 5.5);
      b.spikes(0, 1);
      b.spikes(1 + gap, r.int(1, 2));
      b.width = 1 + gap + 2;
    },
  },
  {
    id: 'spike4', mechanic: 'spike', minD: 0.9, maxD: 1, weight: 0.5,
    build(b) { b.spikes(0, 4); b.width = 4; },
  },

  // ---- blocks ----
  {
    id: 'block1', mechanic: 'block', minD: 0, maxD: 1,
    build(b, r) { const w = r.int(1, 2); b.block(0, w, 1); b.width = w; },
  },
  {
    id: 'block15', mechanic: 'block', minD: 0.15, maxD: 1,
    build(b, r) { const w = r.int(1, 2); b.block(0, w, 1.5); b.width = w; },
  },
  {
    id: 'blockStair', mechanic: 'block', minD: 0.3, maxD: 1,
    build(b) { b.block(0, 2, 1); b.block(2, 2, 2); b.width = 4; },
  },
  {
    id: 'blockGap', mechanic: 'block', minD: 0.3, maxD: 1,
    build(b, r) {
      const gap = r.range(3, 4.5);
      b.block(0, 2, 1);
      b.block(2 + gap, 2, 1);
      b.width = 4 + gap;
    },
  },
  {
    id: 'blockSpike', mechanic: 'block', minD: 0.35, maxD: 1,
    build(b) { b.block(0, 2, 1); b.spikes(2, 1); b.width = 3; },
  },

  // ---- pits ----
  {
    id: 'pit', mechanic: 'pit', minD: 0, maxD: 1,
    build(b, r, d) { const w = r.range(2, 2.6 + 2.2 * d); b.pit(0, w); b.width = w; },
  },
  {
    id: 'pitPair', mechanic: 'pit', minD: 0.35, maxD: 1,
    build(b, r, d) {
      const w1 = r.range(2, 2.4 + 1.6 * d);
      const ground = r.range(3, 4.5);
      const w2 = r.range(2, 2.4 + 1.6 * d);
      b.pit(0, w1);
      b.pit(w1 + ground, w2);
      b.width = w1 + ground + w2;
    },
  },

  // ---- elevated platforms ----
  {
    id: 'platformOver', mechanic: 'platform', minD: 0, maxD: 1,
    build(b, r) {
      const n = r.int(3, 4);
      b.spikes(0, n);
      b.platform(0, n, 1.8);
      b.width = n;
    },
  },
  {
    id: 'stone', mechanic: 'platform', minD: 0.25, maxD: 1,
    build(b, r) {
      const w = r.range(6, 7.5);
      b.pit(0, w);
      b.platform(w / 2 - 1, 2, 0);
      b.width = w;
    },
  },
  {
    id: 'platformStep', mechanic: 'platform', minD: 0.35, maxD: 1,
    build(b) {
      b.platform(0, 3, 1.0);
      b.spikes(3, 2);
      b.platform(3, 2.6, 1.8);
      b.width = 5.6;
    },
  },

  // ---- combos (timing + jump height) ----
  {
    id: 'pitSpike', mechanic: 'combo', minD: 0, maxD: 1,
    build(b, r, d) {
      const w = r.range(2, 2.4 + 1.2 * d);
      b.pit(0, w);
      b.spikes(w + 3, 1);
      b.width = w + 4;
    },
  },
  {
    id: 'spikeBlockSpike', mechanic: 'combo', minD: 0.2, maxD: 1,
    // The recovery space after the block grows with speed, so the second spike is never a scramble.
    build(b, _r, d) {
      const before = 5 + 2.5 * d; // landing room between the first spike and the block…
      const after = 3.2 + 3.2 * d; // …and between the block and the second spike
      b.spikes(0, 1);
      b.block(before, 2, 1.5);
      b.spikes(before + 2 + after, 1);
      b.width = before + 3 + after;
    },
  },
  {
    id: 'rhythm', mechanic: 'combo', minD: 0.4, maxD: 1,
    build(b, r) {
      const gap = r.range(3.6, 4.4);
      b.spikes(0, 1);
      b.spikes(1 + gap, 1);
      b.spikes(2 + 2 * gap, 2);
      b.width = 4 + 2 * gap;
    },
  },

  // =====================================================================================
  // Variety: more shapes for the existing families
  // =====================================================================================
  {
    id: 'spikeGap2', mechanic: 'spike', minD: 0.25, maxD: 1,
    build(b, r) {
      const gap = r.range(4, 5.5);
      b.spikes(0, 2);
      b.spikes(2 + gap, 2);
      b.width = 4 + gap;
    },
  },
  {
    id: 'block2', mechanic: 'block', minD: 0.4, maxD: 1,
    build(b, r) { const w = r.int(1, 2); b.block(0, w, 2); b.width = w; },
  },
  {
    id: 'blockHop', mechanic: 'block', minD: 0.45, maxD: 1,
    build(b, r, d) {
      const gap = r.range(3.2, 3.8) + 1.0 * d; // more room between the stepping blocks as speed rises
      b.block(0, 1.5, 1);
      b.block(1.5 + gap, 1.5, 1);
      b.block(3 + 2 * gap, 1.5, 1);
      b.width = 4.5 + 2 * gap;
    },
  },
  {
    id: 'stairsDown', mechanic: 'block', minD: 0.5, maxD: 1,
    build(b) { b.block(0, 2, 2); b.block(2, 2, 1); b.spikes(5, 1); b.width = 6; },
  },
  {
    id: 'pitTriple', mechanic: 'pit', minD: 0.6, maxD: 1,
    build(b, r, d) {
      const w = () => r.range(2, 2.2 + 1.2 * d);
      const g = () => r.range(3, 4);
      const w1 = w(), g1 = g(), w2 = w(), g2 = g(), w3 = w();
      b.pit(0, w1);
      b.pit(w1 + g1, w2);
      b.pit(w1 + g1 + w2 + g2, w3);
      b.width = w1 + g1 + w2 + g2 + w3;
    },
  },
  {
    id: 'pitIsland', mechanic: 'pit', minD: 0.5, maxD: 1,
    build(b, r, d) {
      const w1 = r.range(2, 2.4 + 1.2 * d);
      const w2 = r.range(2, 2.4 + 1.2 * d);
      const island = 6 + 1.6 * d; // room to land, hop the spike, and take off again
      b.pit(0, w1);
      b.spikes(w1 + island / 2 - 0.5, 1);
      b.pit(w1 + island, w2);
      b.width = w1 + island + w2;
    },
  },
  {
    id: 'bridge', mechanic: 'platform', minD: 0.45, maxD: 1,
    build(b) {
      b.pit(0, 9);
      b.platform(1.5, 2, 0);
      b.platform(5.5, 2, 0);
      b.width = 9;
    },
  },
  {
    id: 'platformGap', mechanic: 'platform', minD: 0.5, maxD: 1,
    build(b) {
      b.spikes(0, 3);
      b.platform(0, 3, 1.8);
      b.pit(5, 2.5);
      b.width = 7.5;
    },
  },
  {
    id: 'coinRun', mechanic: 'rest', minD: 0, maxD: 1, bonusCoins: true,
    build(b) { b.width = 14; },
  },

  // =====================================================================================
  // Ceilings: the jump is cut short, so height has to be judged, not just timing
  // =====================================================================================
  {
    id: 'lowCeilSpikes', mechanic: 'ceiling', minD: 0, maxD: 1, validate: true,
    build(b, r) {
      // The ceiling only cuts the highest (fully held) jumps, so the jump has to be judged, not maxed.
      const n = r.int(1, 2);
      b.spikes(1, n);
      b.ceiling(0, n + 3, r.range(2.5, 2.9));
      b.width = n + 3;
    },
  },
  {
    id: 'tunnel', mechanic: 'ceiling', minD: 0.3, maxD: 0.75, validate: true, // at full speed the held jump leaves no human-sized window under the roof
    build(b, r) {
      b.ceiling(0, 8, r.range(2.1, 2.5));
      b.spikes(3.5, 1);
      b.width = 8;
    },
  },

  // =====================================================================================
  // Movers: hazards that slide up and down. Their timing is random per run and every variant is
  // proven solvable before it is used (see placement.ts), so they can't create impossible spots.
  // =====================================================================================
  {
    id: 'orbBob', mechanic: 'mover', minD: 0, maxD: 1, validate: true,
    build(b, r, d) {
      const wl = (8 - 3 * d) * r.range(0.9, 1.1);
      b.orb(1.5, 0.15, r.range(1.7, 2.2), wl, r.next());
      b.width = 3;
    },
  },
  {
    id: 'orbPair', mechanic: 'mover', minD: 0.2, maxD: 1, validate: true,
    build(b, r, d) {
      const wl = (8 - 1.5 * d) * r.range(0.9, 1.1);
      const gap = r.range(5.5, 8);
      b.orb(1.5, 0.15, r.range(1.7, 2.2), wl, r.next());
      b.orb(1.5 + gap, 0.15, r.range(1.7, 2.2), wl, r.next());
      b.width = 3 + gap;
    },
  },
  {
    id: 'orbSpikes', mechanic: 'mover', minD: 0.5, maxD: 1, validate: true,
    build(b, r, d) {
      // A slow, high saw above the spikes: the jump has to happen while it is lifted.
      b.spikes(0, 2);
      b.orb(1, 2.0, r.range(1.4, 1.9), (15 - 4 * d) * r.range(0.9, 1.1), r.next());
      b.width = 2;
    },
  },
  {
    id: 'orbPit', mechanic: 'mover', minD: 0.55, maxD: 1, validate: true,
    build(b, r, d) {
      // The saw swings above the pit: a normal jump passes under it, a fully held one can hit it.
      const w = r.range(3.2, 3.8);
      b.pit(0, w);
      b.orb(w / 2, 2.6, r.range(1.2, 1.6), (9 - 2 * d) * r.range(0.9, 1.1), r.next());
      b.width = w;
    },
  },

  // ---- crushers ----
  {
    id: 'crusher', mechanic: 'crusher', minD: 0, maxD: 1, validate: true,
    build(b, r, d) {
      b.crusher(2, 1.6, 2.4, (11 - 2 * d) * r.range(0.9, 1.1), r.next());
      b.width = 4;
    },
  },
  {
    id: 'crusherSpike', mechanic: 'crusher', minD: 0.3, maxD: 1, validate: true,
    build(b, r, d) {
      b.crusher(2, 1.6, 2.4, (11 - 2 * d) * r.range(0.9, 1.1), r.next());
      b.spikes(7, 1);
      b.width = 9;
    },
  },
  {
    id: 'crusherPair', mechanic: 'crusher', minD: 0.5, maxD: 1, validate: true,
    build(b, r, d) {
      const wl = (10 - 2 * d) * r.range(0.9, 1.1);
      const gap = r.range(6.5, 8.5);
      // Same rhythm for both (a corridor of safe timing), with a little drift so it isn't a mirror image.
      const ph = r.next();
      b.crusher(2, 1.6, 2.4, wl, ph);
      b.crusher(2 + gap, 1.6, 2.4, wl, ph + r.range(-0.1, 0.1));
      b.width = 4 + gap;
    },
  },

  // =====================================================================================
  // Gauntlets: several obstacles chained, assembled at random and validated as a whole
  // =====================================================================================
  {
    id: 'gauntlet', mechanic: 'gauntlet', minD: 0, maxD: 1, validate: true, weight: 1.5,
    build(b, r, d) {
      const count = r.int(2, 3);
      const spacing = r.range(6.5, 8) + 1.5 * d; // recovery room between the pieces grows with speed
      let x = 0;
      for (let i = 0; i < count; i++) {
        switch (r.int(0, 4)) {
          case 0: b.spikes(x, 2); x += 2; break;
          case 1: b.block(x, 1, 1.5); x += 1; break;
          case 2: b.orb(x + 1, 0.15, r.range(1.7, 2.2), (7 - 2 * d) * r.range(0.9, 1.1), r.next()); x += 2; break;
          case 3: { const w = r.range(2, 2.8); b.pit(x, w); x += w; break; }
          default: b.crusher(x + 1, 1.6, 2.4, (10 - 2 * d) * r.range(0.9, 1.1), r.next()); x += 2.2; break;
        }
        x += spacing;
      }
      b.width = x - spacing + 1;
    },
  },
];
