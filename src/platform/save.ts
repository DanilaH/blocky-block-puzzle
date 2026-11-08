import { compactRewards } from "../core/monetization";
import { validProfile, type Profile } from "../core/profile";
export class DamagedSaveError extends Error {
  constructor() {
    super("Damaged save");
  }
}
export class SaveConflictError extends Error {
  constructor() {
    super("Save conflict");
  }
}
export interface SaveAdapter {
  load(): Promise<{ profile: Profile | null; recovered: boolean }>;
  write(profile: Profile): Promise<void>;
}
// Current + last valid state are committed by ONE IndexedDB transaction. Never fall back silently to volatile memory.
export class IndexedSave implements SaveAdapter {
  private db: Promise<IDBDatabase>;
  constructor(databaseName = "blocky-classic") {
    this.db = new Promise((resolve, reject) => {
      const req = indexedDB.open(databaseName, 1);
      req.onupgradeneeded = () => req.result.createObjectStore("save");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error("Save database is blocked"));
    });
  }
  async load() {
    const db = await this.db;
    return new Promise<{ profile: Profile | null; recovered: boolean }>(
      (resolve, reject) => {
        const tx = db.transaction("save", "readonly"),
          s = tx.objectStore("save"),
          a = s.get("current"),
          b = s.get("backup");
        tx.oncomplete = () => {
          if (validProfile(a.result))
            resolve({ profile: a.result, recovered: false });
          else if (validProfile(b.result))
            resolve({ profile: b.result, recovered: true });
          else if (a.result !== undefined || b.result !== undefined)
            reject(new DamagedSaveError());
          else resolve({ profile: null, recovered: false });
        };
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error("Read aborted"));
      },
    );
  }
  // Recovery is explicit and atomic. Keep the original records for diagnosis.
  async recoverDamaged(profile: Profile) {
    if (!validProfile(profile)) throw new Error("Invalid recovery profile");
    const db = await this.db;
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction("save", "readwrite"),
        s = tx.objectStore("save");
      const current = s.get("current"),
        backup = s.get("backup");
      let failure: unknown = new Error("Recovery transaction failed");
      backup.onsuccess = () => {
        try {
          // Another window may have recovered the game since the error screen.
          if (validProfile(current.result) || validProfile(backup.result)) {
            failure = new SaveConflictError();
            tx.abort();
            return;
          }
          s.put(
            { current: current.result, backup: backup.result },
            `damaged:${crypto.randomUUID()}`,
          );
          s.put(profile, "current");
          s.delete("backup");
        } catch (error) {
          failure = error;
          tx.abort();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(failure);
    });
  }
  async write(profile: Profile) {
    if (!validProfile(profile)) throw new Error("Invalid save");
    const db = await this.db;
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction("save", "readwrite"),
        s = tx.objectStore("save"),
        read = s.get("current");
      let failure: unknown = new Error("Failed transaction");
      read.onsuccess = () => {
        try {
          const current: unknown = read.result;
          if (validProfile(current)) {
            if (
              current.revision > profile.revision ||
              (current.revision === profile.revision &&
                JSON.stringify(current) !== JSON.stringify(profile))
            ) {
              failure = new SaveConflictError();
              tx.abort();
              return;
            }
            s.put(current, "backup");
          }
          s.put(profile, "current");
        } catch (error) {
          // Synchronous quota/serialization failures in an IDB callback must
          // reject this write, not escape as an uncaught window error.
          failure = error;
          tx.abort();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(failure);
    });
  }
}
export interface StoreObserver {
  prepare(before: Profile, next: Profile): Profile;
  committed(before: Profile, next: Profile, reason?: string): void;
  saveFailed(): void;
}
export class ProfileStore {
  observer: StoreObserver | null = null;
  busy = false;
  private idle: (() => void)[] = [];
  async waitIdle(): Promise<void> {
    while (this.busy)
      await new Promise<void>((resolve) => this.idle.push(resolve));
  }
  onBusyChange: (() => void) | null = null;
  constructor(
    public state: Profile,
    private readonly save: SaveAdapter,
  ) {}
  async update(
    reduce: (current: Profile) => Profile | null,
    reason?: string,
  ): Promise<boolean> {
    if (this.busy) return false;
    this.busy = true;
    this.onBusyChange?.();
    try {
      let next = reduce(this.state);
      if (!next || next === this.state) return false;
      next = compactRewards(next, this.state.game);
      const before = this.state;
      // Optional telemetry must never own the save transaction.
      try {
        next = this.observer?.prepare(before, next) ?? next;
      } catch {}
      await this.save.write(next);
      this.state = next;
      try {
        this.observer?.committed(before, next, reason);
      } catch {}
      return true;
    } catch (error) {
      try {
        this.observer?.saveFailed();
      } catch {}
      throw error;
    } finally {
      this.busy = false;
      this.onBusyChange?.();
      this.idle.splice(0).forEach((resolve) => resolve());
    }
  }
}
