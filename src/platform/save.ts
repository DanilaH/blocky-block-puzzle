import { validProfile, type Profile } from "../core/profile";
export interface SaveAdapter {
  load(): Promise<{ profile: Profile | null; recovered: boolean }>;
  write(profile: Profile): Promise<void>;
}
// Current + last valid state are committed by ONE IndexedDB transaction. Never fall back silently to volatile memory.
export class IndexedSave implements SaveAdapter {
  private db: Promise<IDBDatabase>;
  constructor() {
    this.db = new Promise((resolve, reject) => {
      const req = indexedDB.open("blocky-classic", 1);
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
            reject(new Error("Damaged save"));
          else resolve({ profile: null, recovered: false });
        };
        tx.onerror = () => reject(tx.error);
      },
    );
  }
  async write(profile: Profile) {
    if (!validProfile(profile)) throw new Error("Invalid save");
    const db = await this.db;
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction("save", "readwrite"),
        s = tx.objectStore("save"),
        read = s.get("current");
      read.onsuccess = () => {
        const current: unknown = read.result;
        if (validProfile(current)) {
          if (
            current.revision > profile.revision ||
            (current.revision === profile.revision &&
              JSON.stringify(current) !== JSON.stringify(profile))
          ) {
            tx.abort();
            return;
          }
          s.put(current, "backup");
        }
        s.put(profile, "current");
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () =>
        reject(new Error("Save conflict or failed transaction"));
    });
  }
}
export class ProfileStore {
  busy = false;
  constructor(
    public state: Profile,
    private readonly save: SaveAdapter,
  ) {}
  async update(reduce: (current: Profile) => Profile | null): Promise<boolean> {
    if (this.busy) return false;
    this.busy = true;
    try {
      const next = reduce(this.state);
      if (!next || next === this.state) return false;
      await this.save.write(next);
      this.state = next;
      return true;
    } finally {
      this.busy = false;
    }
  }
}
