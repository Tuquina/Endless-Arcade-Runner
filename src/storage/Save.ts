/** Persistent player data. Bump `v` and extend `migrate` when the shape changes. */
export interface SaveData {
  v: 1;
  /** Best score (distance + coin bonus). */
  best: number;
  /** Distance reached in the best run, for the "ghost" marker. */
  bestDist: number;
  attempts: number;
  /** Lifetime coins. */
  coins: number;
}

export const SAVE_KEY = 'onebutton.save.v1';

/** Minimal slice of the Web Storage API, so tests can inject a fake. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const defaults = (): SaveData => ({ v: 1, best: 0, bestDist: 0, attempts: 0, coins: 0 });

/** Non-negative finite integer, else the fallback. Guards against hand-edited or corrupt storage. */
function count(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

function migrate(raw: unknown): SaveData {
  const out = defaults();
  if (typeof raw === 'object' && raw !== null) {
    const o = raw as Record<string, unknown>;
    out.best = count(o.best, 0);
    out.bestDist = count(o.bestDist, 0);
    out.attempts = count(o.attempts, 0);
    out.coins = count(o.coins, 0);
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

  flush(): void {
    try {
      this.storage?.setItem(SAVE_KEY, JSON.stringify(this.data));
    } catch {
      /* quota or privacy mode: keep playing with the in-memory copy */
    }
  }
}
