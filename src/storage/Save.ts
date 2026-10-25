import { DEFAULT_DIFFICULTY, isDifficultyId, type DifficultyId } from '../world/Difficulty';
import { DEFAULT_MODE, isGameMode, type GameMode } from '../core/modes';

/** Best run in one difficulty. */
export interface BestRecord {
  /** Best score (distance + coin bonus). */
  best: number;
  /** Distance reached in that run, for the "ghost" marker. */
  bestDist: number;
}

/** Persistent player data. Bump `v` and extend `migrate` when the shape changes. */
export interface SaveData {
  v: 1;
  /** Records are kept per difficulty. */
  records: { [K in DifficultyId]: BestRecord };
  /** Last chosen game mode and endless difficulty. */
  mode: GameMode;
  difficulty: DifficultyId;
  attempts: number;
  /** Lifetime coins. */
  coins: number;
  /** Audio switches (applied by the audio system). */
  music: boolean;
  sfx: boolean;
  /** Longest distance (m) ever reached in one run; drives the skin challenges. */
  maxDist: number;
  /** Lifetime obstacles dodged (skin objectives). */
  saws: number;
  crushers: number;
  /** Selected and unlocked skin ids. */
  skin: string;
  unlocked: string[];
}

export const SAVE_KEY = 'onebutton.save.v1';

/** Minimal slice of the Web Storage API, so tests can inject a fake. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const emptyRecords = (): SaveData['records'] => ({ easy: { best: 0, bestDist: 0 }, normal: { best: 0, bestDist: 0 }, hard: { best: 0, bestDist: 0 } });

const defaults = (): SaveData => ({ v: 1, records: emptyRecords(), mode: DEFAULT_MODE, difficulty: DEFAULT_DIFFICULTY, attempts: 0, coins: 0, music: true, sfx: true, maxDist: 0, saws: 0, crushers: 0, skin: 'classic', unlocked: ['classic'] });

/** Non-negative finite integer, else the fallback. Guards against hand-edited or corrupt storage. */
function count(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

type Record_ = { [k: string]: { best?: unknown; bestDist?: unknown } | undefined };

function migrate(raw: unknown): SaveData {
  const out = defaults();
  if (typeof raw === 'object' && raw !== null) {
    const o = raw as Record<string, unknown>;
    // Saves from before difficulties kept a single record: it belongs to Normal.
    out.records.normal = { best: count(o.best, 0), bestDist: count(o.bestDist, 0) };
    if (typeof o.records === 'object' && o.records !== null) {
      const rec = o.records as Record_;
      for (const id of Object.keys(out.records) as DifficultyId[]) {
        const r = rec[id];
        if (r && typeof r === 'object') out.records[id] = { best: count(r.best, 0), bestDist: count(r.bestDist, 0) };
      }
    }
    if (isGameMode(o.mode)) out.mode = o.mode;
    if (isDifficultyId(o.difficulty)) out.difficulty = o.difficulty;
    out.attempts = count(o.attempts, 0);
    out.coins = count(o.coins, 0);
    out.music = typeof o.music === 'boolean' ? o.music : true;
    out.sfx = typeof o.sfx === 'boolean' ? o.sfx : true;
    out.maxDist = count(o.maxDist, 0);
    out.saws = count(o.saws, 0);
    out.crushers = count(o.crushers, 0);
    if (typeof o.skin === 'string' && o.skin.length > 0 && o.skin.length <= 32) out.skin = o.skin;
    if (Array.isArray(o.unlocked)) {
      const ids = o.unlocked.filter((v): v is string => typeof v === 'string' && v.length > 0 && v.length <= 32);
      out.unlocked = [...new Set(ids)].slice(0, 32);
    }
  }
  return out;
}

/**
 * localStorage wrapper that never throws: private windows, blocked storage or a full quota
 * degrade to an in-memory save for the session.
 */
export class Save {
  data: SaveData = defaults();
  private readonly storage: StorageLike | null;

  constructor(storage?: StorageLike) {
    this.storage = storage ?? Save.browserStorage();
    this.load();
  }

  private static browserStorage(): StorageLike | null {
    try {
      return globalThis.localStorage ?? null;
    } catch {
      return null;
    }
  }

  load(): void {
    try {
      const text = this.storage?.getItem(SAVE_KEY);
      this.data = text ? migrate(JSON.parse(text)) : defaults();
    } catch {
      this.data = defaults();
    }
  }

  /**
   * Write to storage, first merging in what another tab may have saved since we loaded, so a
   * stale tab can never erase progress (records and unlocks only ever grow).
   */
  flush(): void {
    try {
      const text = this.storage?.getItem(SAVE_KEY);
      if (text) {
        const other = migrate(JSON.parse(text));
        const d = this.data;
        for (const id of Object.keys(d.records) as DifficultyId[]) {
          if (other.records[id].best > d.records[id].best) d.records[id] = { ...other.records[id] };
        }
        d.maxDist = Math.max(d.maxDist, other.maxDist);
        d.attempts = Math.max(d.attempts, other.attempts);
        d.saws = Math.max(d.saws, other.saws);
        d.crushers = Math.max(d.crushers, other.crushers);
        d.unlocked = [...new Set([...d.unlocked, ...other.unlocked])];
      }
    } catch {
      /* unreadable storage: just overwrite below */
    }
    try {
      this.storage?.setItem(SAVE_KEY, JSON.stringify(this.data));
    } catch {
      /* quota or privacy mode: keep playing with the in-memory copy */
    }
  }
}
