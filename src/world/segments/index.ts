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
    id: 'spike3', mechanic: 'spike', minD: 0.12, maxD: 1,
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
    id: 'spike4', mechanic: 'spike', minD: 0.4, maxD: 1,
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
      b.platform(3, 2, 2.0);
      b.width = 5;
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
    build(b) { b.spikes(0, 1); b.block(4, 2, 1.5); b.spikes(9, 1); b.width = 10; },
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
];
