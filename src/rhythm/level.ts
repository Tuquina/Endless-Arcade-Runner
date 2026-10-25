import { STEP } from '../core/Loop';
import { Player } from '../physics/Player';
import { PLAYER_HALF_WIDTH, SPIKE_HIT_HEIGHT, SPIKE_HIT_INSET } from '../physics/constants';
import {
  COIN,
  HAZARD,
  PAD,
  PORTAL_BALL,
  PORTAL_CUBE,
  PORTAL_GRAVITY_DOWN,
  PORTAL_GRAVITY_UP,
  PORTAL_SHIP,
  RING,
  RING_FLIP,
  SOLID,
  TRIGGER,
  type RectKind,
} from '../world/Rect';
import { World } from '../world/World';
import { STEPS_PER_BAR, compileSong, type CompiledSong, type Song } from '../audio/song';

/**
 * Rhythm levels: the obstacle chart is written on the song's 16th-note grid, and the level is laid
 * out so that **pressing exactly on the note is the safest moment to jump**.
 *
 * Chart characters (one per 16th note):
 *   `s` `d` `t`  one, two or three spikes (three need a held jump)
 *   `b`          low block to hop onto     `B`  tall block (held jump)
 *   `p`          gap                       `P`  wide gap (held jump)
 *   `u`          step up onto a higher floor (press)    `n`  the floor steps back down (no press)
 *   `j`          launch pad over a gap (no press)
 *   `r`          ring in the air over a gap: press again mid-air
 *   `D`          disco (collectible) on the ideal path
 *   `.`          nothing
 *
 * Gravity levels (they have a ceiling) add:
 *   `G`          gravity portal: the ceiling becomes the floor (or back); obstacles then hang from it
 *   `O`          blue ring in the air: press to flip gravity mid-air
 *   `C` `L` `V`  form portals: cube (jump), ball (a press flips gravity), ship (hold to fly)
 *   `f`          ball: flip to the other surface on this note
 *   `^` `v`      ship: start holding / let go; the level carves a tunnel around that flight path
 *
 * Every ground obstacle is placed by simulation: for its shape and the level's speed we find the
 * range of press times that clear it (for a quick tap *and* a full hold, or for holds only), and
 * shift the obstacle so that range is centred on the note. Rings, pads and discos are placed on the
 * path of a simulated "perfect" player who presses on every note. A final run of that player through
 * the finished level (and jittered variants of it in the tests) proves the level can be completed.
 */

export interface LevelDef {
  id: string;
  name: string;
  /** One line shown on the level card. */
  blurb: string;
  song: Song;
  /** Runner speed in tiles per second (constant for the whole level). */
  speed: number;
  /** Visual world (index into THEMES). */
  theme: number;
  /** 1 (gentle) .. 5 (brutal), shown as a difficulty badge. */
  tier: number;
  /** Show ghost markers where to jump (first levels). */
  guides?: boolean;
  /** Gravity levels: height of the ceiling the runner can flip onto. */
  ceiling?: number;
}

export interface RectSpec {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  kind: RectKind;
  /** Rings and portals (see RING_* / PORTAL_*). */
  code?: number;
}

/** A note the player should press on. */
export interface Press {
  /** Song time (s). */
  t: number;
  /** Where the runner's centre is at that moment (for guide markers). */
  x: number;
  /** Floor or air height at that moment (for guide markers). */
  y: number;
  hold: boolean;
  /** Ship flight: song time the button is let go. */
  until?: number;
}

export interface Checkpoint {
  t: number;
  state: Player;
}

export interface CompiledLevel {
  def: LevelDef;
  song: CompiledSong;
  speed: number;
  rects: RectSpec[];
  presses: Press[];
  checkpoints: Checkpoint[];
  /** Finish line (x) and the song time the runner crosses it. */
  endX: number;
  endT: number;
  discos: number;
  /** Song time the run starts at (a short run-up before the first beat). */
  startT: number;
}

type Kind = 's' | 'd' | 't' | 'b' | 'B' | 'p' | 'P' | 'u' | 'n' | 'j' | 'r' | 'D' | 'G' | 'O' | 'C' | 'L' | 'V' | 'f' | '^' | 'v';
const KINDS = new Set<string>(['s', 'd', 't', 'b', 'B', 'p', 'P', 'u', 'n', 'j', 'r', 'D', 'G', 'O', 'C', 'L', 'V', 'f', '^', 'v']);
/** Presses that need the runner on a surface (a jump, or a ball flip). */
const GROUND_PRESS = new Set<Kind>(['s', 'd', 't', 'b', 'B', 'p', 'P', 'u', 'f']);
const CUBE_KINDS = new Set<Kind>(['s', 'd', 't', 'b', 'B', 'p', 'P', 'u', 'n', 'j', 'r', 'O']);
const HOLD_KINDS = new Set<Kind>(['t', 'B', 'P']);

/** How long the simulated perfect player keeps the button down (steps). */
const TAP_STEPS = 6;
const HOLD_STEPS = 30;
/** Hold lengths every placement must survive (steps): a quick tap (~40 ms) to a full hold, or (held kinds) moderate to full holds. */
const TAP_RANGE = [5, 14, 30];
const HOLD_RANGE = [22, 30, 45];
const RUN_UP = 0.6;
const MAX_FLOOR = 3;
/** Ball flips: how much room (tiles) is left for an early flip; the late side follows from the spike spacing. */
const BALL_EARLY_ROOM = 2.2;
const BALL_LATE_ROOM = 0.9;
/** Ship tunnels: room left above and below the ideal flight path (tiles). */
const TUNNEL_MARGIN = 1.2;

interface ChartEvent {
  step: number;
  kind: Kind;
}

/** Parse the chart strings of every section into events on the global step grid. */
export function chartEvents(song: Song): ChartEvent[] {
  const out: ChartEvent[] = [];
  let base = 0;
  for (const sec of song.sections) {
    const steps = sec.bars * STEPS_PER_BAR;
    const p = (sec.chart ?? '').replace(/[\s|]/g, '');
    if (p) {
      for (let i = 0; i < steps; i++) {
        const c = p[i % p.length]!;
        if (c === '.') continue;
        if (!KINDS.has(c)) throw new Error(`${song.id}/${sec.name}: unknown chart character "${c}"`);
        out.push({ step: base + i, kind: c as Kind });
      }
    }
    base += steps;
  }
  return out;
}

// ------------------------------------------------------------------ geometry helpers

/** Floor profile: height changes and holes in the walking surface. */
class Profile {
  /** Sorted change points: from x on, the floor is h tiles high. */
  readonly changes: { x: number; h: number }[] = [{ x: -1e9, h: 0 }];
  readonly holes: { x0: number; x1: number }[] = [];
  readonly extra: RectSpec[] = [];
  /** Gravity levels: a ceiling slab at this height, with its own holes. */
  ceiling: number | null = null;
  readonly ceilHoles: { x0: number; x1: number }[] = [];

  heightAt(x: number): number {
    let h = 0;
    for (const c of this.changes) if (c.x <= x) h = c.h;
    return h;
  }

  setFrom(x: number, h: number): void {
    this.changes.push({ x, h });
    this.changes.sort((a, b) => a.x - b.x);
  }

  /** Walkable surface as rects: ground slabs, raised blocks, minus holes (to `end`). */
  surface(end: number): RectSpec[] {
    const cuts = new Set<number>([WORLD_ORIGIN, end]);
    for (const c of this.changes) if (c.x > WORLD_ORIGIN && c.x < end) cuts.add(c.x);
    for (const hl of [...this.holes, ...this.ceilHoles]) {
      cuts.add(Math.max(WORLD_ORIGIN, hl.x0));
      cuts.add(Math.min(end, hl.x1));
    }
    const xs = [...cuts].sort((a, b) => a - b);
    const out: RectSpec[] = [];
    const push = (x0: number, x1: number, y0: number, y1: number): void => {
      const last = out.length ? out[out.length - 1]! : null;
      if (last && last.x1 === x0 && last.y0 === y0 && last.y1 === y1 && x1 - last.x0 <= 32) last.x1 = x1;
      else out.push({ x0, y0, x1, y1, kind: SOLID });
    };
    const ground: [number, number][] = [];
    const raised: [number, number, number][] = [];
    const roof: [number, number][] = [];
    for (let i = 0; i < xs.length - 1; i++) {
      const a = xs[i]!;
      const b = xs[i + 1]!;
      if (b - a < 1e-6) continue;
      const mid = (a + b) / 2;
      const h = this.heightAt(mid);
      const hole = this.holes.some((hl) => hl.x0 <= mid && mid < hl.x1);
      if (!(hole && h === 0)) ground.push([a, b]);
      if (h > 0 && !hole) raised.push([a, b, h]);
      if (this.ceiling !== null && !this.ceilHoles.some((hl) => hl.x0 <= mid && mid < hl.x1)) roof.push([a, b]);
    }
    for (const [a, b] of roof) push(a, b, this.ceiling!, this.ceiling! + 12);
    for (const [a, b] of ground) push(a, b, -50, 0);
    const ground0 = out.length;
    for (const [a, b, h] of raised) {
      const last = out.length > ground0 ? out[out.length - 1]! : null;
      if (last && last.x1 === a && last.y1 === h && b - last.x0 <= 32) last.x1 = b;
      else out.push({ x0: a, y0: 0, x1: b, y1: h, kind: SOLID });
    }
    // The game's World is a ring of 256 one-tile columns: keep every rect well under that.
    const split: RectSpec[] = [];
    for (const r of out) {
      for (let x = r.x0; x < r.x1; x += 32) split.push({ ...r, x0: x, x1: Math.min(r.x1, x + 32) });
    }
    return split;
  }
}

const WORLD_ORIGIN = -20;

function buildWorld(world: World, rects: readonly RectSpec[]): void {
  world.reset(WORLD_ORIGIN);
  for (const r of rects) world.add(r.x0, r.y0, r.x1, r.y1, r.kind).code = r.code ?? 0;
}

/** Place a shape rect (drawn standing on floor 0) on the runner's current surface. */
function onSurface(r: RectSpec, dx: number, floor: number, ceil: number | null, flipped: boolean): RectSpec {
  if (!flipped) return { ...r, x0: r.x0 + dx, x1: r.x1 + dx, y0: r.y0 + floor, y1: r.y1 + floor };
  return { ...r, x0: r.x0 + dx, x1: r.x1 + dx, y0: ceil! - r.y1, y1: ceil! - r.y0 };
}

const spikeRow = (x: number, n: number): RectSpec[] =>
  Array.from({ length: n }, (_, i) => ({ x0: x + i + SPIKE_HIT_INSET, y0: 0, x1: x + i + 1 - SPIKE_HIT_INSET, y1: SPIKE_HIT_HEIGHT, kind: HAZARD }));

/** Ball flip from the floor to a ceiling at `ceil`: horizontal distance covered before touching it. */
function ballFlight(speed: number, ceil: number): number {
  const world = new World(256);
  const prof = new Profile();
  prof.ceiling = ceil;
  buildWorld(world, prof.surface(200));
  const p = new Player();
  p.reset(0);
  p.form = 'ball';
  p.speed = speed;
  p.step(STEP, true, true, world);
  for (let i = 0; i < 300 && !p.grounded; i++) p.step(STEP, false, false, world);
  return p.x;
}

/**
 * Ball flip obstacle: two spikes on the surface the ball rolls on (flip too late and it hits them)
 * and spikes on the other surface just before the ideal arrival (flip too early and it lands on them).
 */
function ballShape(speed: number, ceil: number): RectSpec[] {
  // The two hanging spikes end BALL_EARLY_ROOM tiles before where an on-time flip lands (the window
  // search below then centres the whole shape on the note).
  const arrive = ballFlight(speed, ceil) - BALL_LATE_ROOM;
  const hanging = spikeRow(arrive - BALL_EARLY_ROOM - 2, 2).map((r) => ({ ...r, y0: ceil - r.y1, y1: ceil - r.y0 }));
  return [...spikeRow(0, 2), ...hanging];
}

/** Shape of a ground obstacle relative to its start, standing on floor 0. */
function shape(kind: Kind, speed: number): { rects: RectSpec[]; holes: [number, number][]; len: number; raise?: boolean } {
  const spikes = (n: number): RectSpec[] =>
    Array.from({ length: n }, (_, i) => ({ x0: i + SPIKE_HIT_INSET, y0: 0, x1: i + 1 - SPIKE_HIT_INSET, y1: SPIKE_HIT_HEIGHT, kind: HAZARD }));
  switch (kind) {
    case 's': return { rects: spikes(1), holes: [], len: 1 };
    case 'd': return { rects: spikes(2), holes: [], len: 2 };
    case 't': return { rects: spikes(3), holes: [], len: 3 };
    case 'b': return { rects: [{ x0: 0, y0: 0, x1: 3, y1: 1, kind: SOLID }], holes: [], len: 3 };
    case 'B': return { rects: [{ x0: 0, y0: 0, x1: 2, y1: 2, kind: SOLID }], holes: [], len: 2 };
    case 'p': return { rects: [], holes: [[0, gapWidth(speed, false)]], len: gapWidth(speed, false) };
    case 'P': return { rects: [], holes: [[0, gapWidth(speed, true)]], len: gapWidth(speed, true) };
    case 'u': return { rects: [], holes: [], len: 6, raise: true };
    default: throw new Error(`no ground shape for ${kind}`);
  }
}

/** Gap widths scale with speed so the jump window stays roughly constant in time. */
export function gapWidth(speed: number, wide: boolean): number {
  return Math.round((wide ? speed * 0.4 + 0.5 : speed * 0.24 + 0.5) * 10) / 10;
}

export interface Window {
  /** Distance from the press point to the obstacle start (tiles). */
  lead: number;
  /** Width of the press window shared by every hold length (ms). */
  ms: number;
}

const windowCache = new Map<string, Window>();

/**
 * For a ground obstacle at a given speed: where to put it relative to the press so that the press
 * window (intersected over the allowed hold lengths) is centred on the note.
 */
export function pressWindow(kind: Kind, speed: number, ceil = 5): Window {
  const key = `${kind}@${speed}@${kind === 'f' ? ceil : ''}`;
  const hit = windowCache.get(key);
  if (hit) return hit;
  const OBST = 14;
  const ball = kind === 'f';
  const sh = ball ? { rects: ballShape(speed, ceil), holes: [] as [number, number][], len: 2, raise: false } : shape(kind, speed);
  const world = new World(512);
  const rects: RectSpec[] = sh.rects.map((r) => ({ ...r, x0: r.x0 + OBST, x1: r.x1 + OBST }));
  const prof = new Profile();
  if (ball) prof.ceiling = ceil;
  for (const [a, b] of sh.holes) prof.holes.push({ x0: a + OBST, x1: b + OBST });
  if (sh.raise) prof.setFrom(OBST, 1);
  buildWorld(world, [...prof.surface(OBST + 60), ...rects]);
  const holds = HOLD_KINDS.has(kind) ? HOLD_RANGE : ball ? [5] : TAP_RANGE;
  const p = new Player();
  const maxStep = Math.ceil((OBST + 2) / speed / STEP);
  const ok = new Uint8Array(maxStep);
  for (let s = 0; s < maxStep; s++) {
    let all = true;
    for (const hold of holds) {
      p.reset(0);
      p.speed = speed;
      if (ball) p.form = 'ball';
      let n = 0;
      while (p.x < OBST + sh.len + (ball ? 10 : 4) && !p.dead && n < 2000) {
        p.step(STEP, n === s, n >= s && n < s + hold, world);
        n++;
      }
      if (p.dead) {
        all = false;
        break;
      }
    }
    ok[s] = all ? 1 : 0;
  }
  // Largest run of surviving press steps.
  let best = [0, -1];
  for (let i = 0; i < maxStep; i++) {
    if (!ok[i]) continue;
    let j = i;
    while (j + 1 < maxStep && ok[j + 1]) j++;
    if (j - i > best[1]! - best[0]!) best = [i, j];
    i = j;
  }
  if (best[1]! < best[0]!) throw new Error(`obstacle "${kind}" cannot be cleared at speed ${speed}`);
  const centre = (best[0]! + best[1]!) / 2;
  // Press at step `centre` happens with the runner at x = speed * centre * STEP (state before the step).
  const w: Window = { lead: OBST - speed * centre * STEP, ms: (best[1]! - best[0]! + 1) * STEP * 1000 };
  windowCache.set(key, w);
  return w;
}

// ------------------------------------------------------------------ perfect-player simulation

interface Hold {
  from: number;
  to: number;
}

/** Steps the player from step `n0` to `n1` (exclusive), pressing per `holds`. Returns the step it died on, or -1. */
function simulate(p: Player, world: World, n0: number, n1: number, holds: readonly Hold[], path?: number[]): number {
  for (let n = n0; n < n1; n++) {
    if (path && p.form === 'ship') path.push(p.x, p.y);
    let pressed = false;
    let held = false;
    for (const h of holds) {
      if (n === h.from) pressed = true;
      if (n >= h.from && n < h.to) held = true;
    }
    p.step(STEP, pressed, held, world);
    if (p.dead) return n;
  }
  return -1;
}

const stepOf = (t: number): number => Math.round(t / STEP);

export function compileLevel(def: LevelDef): CompiledLevel {
  const song = compileSong(def.song);
  const speed = def.speed;
  const events = chartEvents(def.song);
  const lastStep = events.length ? events[events.length - 1]!.step : 0;
  // Finish two bars after the last obstacle (or at the end of the song).
  const endStep = Math.min(song.totalSteps, (Math.floor(lastStep / STEPS_PER_BAR) + 3) * STEPS_PER_BAR);
  const endT = endStep * song.stepDur;
  const endX = speed * endT;
  const worldEnd = endX + 60;

  const prof = new Profile();
  const ceil = def.ceiling ?? null;
  prof.ceiling = ceil;
  const placed: RectSpec[] = [];
  const presses: Press[] = [];
  const holds: Hold[] = [];
  const world = new World(4096);
  const startT = -RUN_UP;
  const p = new Player();
  let n = stepOf(startT);
  p.reset(speed * n * STEP);
  p.speed = speed;
  let discos = 0;
  let floor = 0;
  /** Ship flight path (x, y pairs) since the last ship portal, to carve its tunnel. */
  const shipPath: number[] = [];
  let shipFrom = 0;

  const rebuild = (): void => buildWorld(world, [...prof.surface(worldEnd), ...prof.extra, ...placed]);

  // "verso, compás 3, paso 9" style locations for authoring errors.
  const where = (step: number): string => {
    let i = 0;
    while (i < def.song.sections.length - 1 && song.sectionStart[i + 1]! <= step) i++;
    const local = step - song.sectionStart[i]!;
    return `${def.song.sections[i]!.name} bar ${Math.floor(local / STEPS_PER_BAR) + 1} step ${local % STEPS_PER_BAR}`;
  };
  const fail = (msg: string, step: number): never => {
    throw new Error(`${def.id}: ${msg} (${where(step)})`);
  };
  const portal = (x: number, code: number): void => {
    placed.push({ x0: x + PLAYER_HALF_WIDTH, y0: -3, x1: x + PLAYER_HALF_WIDTH + 0.6, y1: (ceil ?? 8) + 3, kind: TRIGGER, code });
  };
  /** Solid walls above and below the recorded flight, leaving TUNNEL_MARGIN of room around it. */
  const carveTunnel = (toX: number): void => {
    const c0 = Math.ceil(shipFrom + 1.5);
    for (let c = c0; c + 1 <= toX - 0.5; c++) {
      let lo = Infinity;
      let hi = -Infinity;
      for (let k = 0; k < shipPath.length; k += 2) {
        const px = shipPath[k]!;
        // A wider span than the column itself: on slopes, a late or early press shifts the path sideways too.
        if (px < c - 1.2 || px > c + 2.2) continue;
        lo = Math.min(lo, shipPath[k + 1]!);
        hi = Math.max(hi, shipPath[k + 1]! + 0.8);
      }
      if (lo === Infinity) continue;
      const top = Math.floor((lo - TUNNEL_MARGIN) * 2) / 2;
      const bottom = Math.ceil((hi + TUNNEL_MARGIN) * 2) / 2;
      if (top >= 0.5) placed.push({ x0: c, y0: 0, x1: c + 1, y1: top, kind: SOLID });
      if (ceil !== null && bottom <= ceil - 0.5) placed.push({ x0: c, y0: bottom, x1: c + 1, y1: ceil, kind: SOLID });
    }
    shipPath.length = 0;
  };

  for (const ev of events) {
    const t = ev.step * song.stepDur;
    const ns = stepOf(t);
    rebuild();
    const died = simulate(p, world, n, ns, holds, shipPath);
    if (died >= 0) fail(`perfect run dies at ${(died * STEP).toFixed(2)} s before placing "${ev.kind}"`, ev.step);
    n = ns;
    const x = speed * ns * STEP;
    const kind = ev.kind;
    const flipped = p.g < 0;
    if (CUBE_KINDS.has(kind) && p.form !== 'cube') fail(`"${kind}" needs the cube form`, ev.step);
    if (kind === 'f' && p.form !== 'ball') fail('"f" needs the ball form', ev.step);
    if ((kind === '^' || kind === 'v') && p.form !== 'ship') fail(`"${kind}" needs the ship form`, ev.step);
    if ('GOCLVf'.includes(kind) && ceil === null) fail(`"${kind}" needs a level with a ceiling`, ev.step);
    if ((kind === 'u' || kind === 'n' || kind === 'j') && flipped) fail(`"${kind}" is not available upside down`, ev.step);
    if (GROUND_PRESS.has(kind) && !p.grounded && !p.canJump) {
      // A ground jump (or ball flip) must start from a surface: the chart asked for one while still airborne.
      fail(`"${kind}" at ${t.toFixed(2)} s comes before the previous jump has landed`, ev.step);
    }
    if (kind === 'n') {
      floor = Math.max(0, floor - 1);
      prof.setFrom(x, floor);
    } else if (kind === 'D') {
      const cy = p.y + 0.4;
      placed.push({ x0: p.x - 0.35, y0: cy - 0.35, x1: p.x + 0.35, y1: cy + 0.35, kind: COIN });
      discos++;
    } else if (kind === 'G') {
      portal(x, flipped ? PORTAL_GRAVITY_UP : PORTAL_GRAVITY_DOWN);
    } else if (kind === 'C' || kind === 'L' || kind === 'V') {
      if (p.form === 'ship') carveTunnel(x);
      if (kind === 'V') shipFrom = x;
      portal(x, kind === 'C' ? PORTAL_CUBE : kind === 'L' ? PORTAL_BALL : PORTAL_SHIP);
    } else if (kind === '^') {
      presses.push({ t, x, y: p.y, hold: true, until: Infinity });
      holds.push({ from: ns, to: Infinity });
    } else if (kind === 'v') {
      const open = holds[holds.length - 1];
      if (!open || open.to !== Infinity) fail('"v" without a "^" before it', ev.step);
      open!.to = ns;
      presses[presses.length - 1]!.until = t;
    } else if (kind === 'j') {
      const x0 = x + PLAYER_HALF_WIDTH;
      placed.push({ x0, y0: floor, x1: x0 + 0.8, y1: floor + 0.25, kind: PAD });
      // Gap across most of the flight, measured on a copy of the current world.
      const land = flightLanding(world, p, [...prof.surface(worldEnd), ...prof.extra, ...placed], ns, holds);
      if (land - (x0 + 1.4) > 1) prof.holes.push({ x0: x0 + 1.4, x1: land - 1.2 });
    } else if (kind === 'r' || kind === 'O') {
      if (p.grounded) fail(`ring at ${t.toFixed(2)} s but the perfect player is on the ground`, ev.step);
      const cy = p.y + 0.4;
      // Taller than it is drawn: a long or short hold on the previous jump still reaches it.
      const ring: RectSpec = { x0: p.x - 0.5, y0: cy - 0.8, x1: p.x + 0.5, y1: cy + 0.8, kind: RING, code: kind === 'O' ? RING_FLIP : 0 };
      placed.push(ring);
      const base = [...prof.surface(worldEnd), ...prof.extra, ...placed];
      const without = flightLanding(world, p, base, ns, holds);
      const withRing = flightLanding(world, p, base, ns, [...holds, { from: ns, to: ns + TAP_STEPS }]);
      // Make the press necessary: a gap where the runner would land without it.
      const holes = flipped ? prof.ceilHoles : prof.holes;
      if (kind === 'O') holes.push({ x0: without - 1.2, x1: without + 1.4 });
      else if (withRing - without > 2) holes.push({ x0: without - 1, x1: withRing - 1.1 });
      presses.push({ t, x, y: p.y, hold: false });
      holds.push({ from: ns, to: ns + TAP_STEPS });
    } else if (kind === 'f') {
      const w = pressWindow('f', speed, ceil!);
      for (const r of ballShape(speed, ceil!)) placed.push(onSurface(r, x + w.lead, 0, ceil, flipped));
      presses.push({ t, x, y: p.y, hold: false });
      holds.push({ from: ns, to: ns + TAP_STEPS });
    } else {
      const w = pressWindow(kind, speed);
      const start = x + w.lead;
      const sh = shape(kind, speed);
      for (const r of sh.rects) placed.push(onSurface(r, start, floor, ceil, flipped));
      for (const [a, b] of sh.holes) (flipped ? prof.ceilHoles : prof.holes).push({ x0: a + start, x1: b + start });
      if (sh.raise) {
        floor = Math.min(MAX_FLOOR, floor + 1);
        prof.setFrom(start, floor);
      }
      const hold = HOLD_KINDS.has(kind);
      presses.push({ t, x, y: flipped ? ceil! : floor - (sh.raise ? 1 : 0), hold });
      holds.push({ from: ns, to: ns + (hold ? HOLD_STEPS : TAP_STEPS) });
    }
  }
  if (p.form === 'ship') carveTunnel(endX);

  const rects = [...prof.surface(worldEnd), ...prof.extra, ...placed].sort((a, b) => a.x0 - b.x0);
  const level: CompiledLevel = { def, song, speed, rects, presses, checkpoints: [], endX, endT, discos, startT };
  const res = runPerfect(level, { recordCheckpoints: true });
  if (!res.ok) throw new Error(`${def.id}: perfect run fails at ${res.t.toFixed(2)} s (x=${res.x.toFixed(1)})`);
  level.checkpoints = res.checkpoints;
  return level;
}

/** Where the runner lands (x) if it keeps going from `from` in `rects` with the given presses. */
function flightLanding(world: World, from: Player, rects: RectSpec[], n0: number, holds: readonly Hold[]): number {
  buildWorld(world, rects);
  const c = new Player();
  c.copyFrom(from);
  let n = n0;
  let airborne = false;
  for (let i = 0; i < 400; i++) {
    c.step(STEP, holds.some((h) => h.from === n), holds.some((h) => n >= h.from && n < h.to), world);
    n++;
    if (!c.grounded) airborne = true;
    else if (airborne) break;
    if (c.dead) break;
  }
  return c.x;
}

export interface RunOptions {
  /** Random timing error added to every press (uniform ±ms), with this seed. */
  jitterMs?: number;
  seed?: number;
  /** Shift every press by this many ms (negative = early). */
  shiftMs?: number;
  /** Override hold lengths: all quick taps, or every press held to the max. */
  holdMode?: 'short' | 'long';
  recordCheckpoints?: boolean;
}

/** Run a scripted player through the finished level. */
export function runPerfect(level: CompiledLevel, o: RunOptions = {}): { ok: boolean; t: number; x: number; checkpoints: Checkpoint[]; discos: number } {
  const world = new World(4096);
  buildWorld(world, level.rects);
  let seed = (o.seed ?? 1) >>> 0;
  const rand = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const holds: Hold[] = level.presses.map((pr) => {
    const jitter = (o.jitterMs ? (rand() * 2 - 1) * o.jitterMs : 0) + (o.shiftMs ?? 0);
    const from = stepOf(pr.t + jitter / 1000);
    if (pr.until !== undefined) {
      // Ship flight: the release gets its own timing error.
      const rel = (o.jitterMs ? (rand() * 2 - 1) * o.jitterMs : 0) + (o.shiftMs ?? 0);
      return { from, to: Math.max(from + 1, stepOf(pr.until + rel / 1000)) };
    }
    const len = o.holdMode === 'short' ? (pr.hold ? HOLD_RANGE[0]! : TAP_RANGE[0]!) : o.holdMode === 'long' ? 45 : pr.hold ? HOLD_STEPS : TAP_STEPS;
    return { from, to: from + len };
  });
  const p = new Player();
  let n = stepOf(level.startT);
  p.reset(level.speed * n * STEP);
  p.speed = level.speed;
  const end = stepOf(level.endT) + 1;
  const checkpoints: Checkpoint[] = [];
  const song = level.song;
  const sectionTimes = song.sectionStart.slice(1, -1).map((s) => s * song.stepDur).filter((t) => t < level.endT - 2);
  let nextCp = 0;
  let pressIdx = 0;
  let hi = 0;
  let discos = 0;
  for (; n < end; n++) {
    let pressed = false;
    let held = false;
    while (hi < holds.length && holds[hi]!.to <= n) hi++;
    for (let i = hi; i < holds.length && holds[i]!.from <= n; i++) {
      if (holds[i]!.from === n) pressed = true;
      if (n < holds[i]!.to) held = true;
    }
    p.step(STEP, pressed, held, world);
    const c = world.overlap(p.x - 0.4, p.y, p.x + 0.4, p.y + 0.8, COIN);
    if (c) {
      c.taken = true;
      discos++;
    }
    if (p.dead) return { ok: false, t: n * STEP, x: p.x, checkpoints, discos };
    if (o.recordCheckpoints && nextCp < sectionTimes.length && n * STEP >= sectionTimes[nextCp]!) {
      const t = n * STEP;
      while (pressIdx < level.presses.length && level.presses[pressIdx]!.t < t) pressIdx++;
      const nextPress = pressIdx < level.presses.length ? level.presses[pressIdx]!.t : Infinity;
      // A checkpoint needs firm ground and a moment to breathe before the next note.
      if (p.grounded && nextPress - t > 0.38 && !held) {
        const s = new Player();
        s.copyFrom(p);
        checkpoints.push({ t, state: s });
        nextCp++;
      } else if (n * STEP > sectionTimes[nextCp]! + 6) {
        nextCp++;
      }
    }
  }
  return { ok: true, t: n * STEP, x: p.x, checkpoints, discos };
}
