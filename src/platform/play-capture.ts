import type { GameState, Move } from "../core/rules";
import type { Profile } from "../core/profile";
export const PLAY_CAPTURE_LIMIT = 800000;
export function stateHash(g: GameState): string {
  const canonical = (v: any): any =>
    Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, canonical(v[k])]),
          )
        : v;
  const s = JSON.stringify(canonical(g));
  let h = 2166136261;
  for (let i = 0; i < s.length; i++)
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16);
}
type Stamp = { activeMs: number; wallMs: number };
export type PlayEvent = Stamp &
  (
    | { kind: "checkpoint"; state: GameState; reason: string }
    | {
        kind: "move";
        move: Move;
        before: string;
        after: string;
        hinted: boolean;
      }
  );
export type PlayRecord = {
  schema: "blocky-play-v1";
  appVersion: string;
  origin: "manual-capture";
  completeGameStart: boolean;
  stopped: string;
  events: PlayEvent[];
};
/** Opt-in, bounded RAM only. No network, disk writes, search, or RNG consumption. */
export class PlayCapture {
  enabled = false;
  private active = false;
  private elapsed = 0;
  private tick = 0;
  private started = 0;
  private lastHash = "";
  private hinted = false;
  private events: PlayEvent[] = [];
  private bytes = 0;
  private completeGameStart = false;
  private stopped = "not-started";
  constructor(
    private now = () => performance.now(),
    private limit = PLAY_CAPTURE_LIMIT,
  ) {}
  private clock() {
    const n = this.now();
    if (this.enabled && this.active) this.elapsed += Math.max(0, n - this.tick);
    this.tick = n;
    return {
      activeMs: Math.round(this.elapsed),
      wallMs: Math.round(n - this.started),
    };
  }
  setActive(active: boolean) {
    this.clock();
    this.active = active;
  }
  get count() {
    return this.events.filter((e) => e.kind === "move").length;
  }
  get hasData() {
    return this.events.length > 0;
  }
  get status() {
    return this.stopped;
  }
  start(g: GameState, hinted = false) {
    if (!this.events.length) {
      this.started = this.now();
      this.elapsed = 0;
      this.completeGameStart = g.moves === 0;
    }
    this.tick = this.now();
    this.enabled = true;
    this.stopped = "recording";
    this.hinted = hinted;
    this.checkpoint(g, this.events.length ? "resumed" : "start");
  }
  stop(reason = "manual") {
    if (!this.enabled && ["limit", "capture-error"].includes(this.stopped))
      return;
    this.clock();
    this.enabled = false;
    this.stopped = reason;
  }
  clear() {
    this.stop();
    this.events = [];
    this.bytes = 0;
    this.lastHash = "";
    this.stopped = "not-started";
  }
  private append(e: PlayEvent) {
    const bytes = new TextEncoder().encode(JSON.stringify(e)).length + 1;
    if (this.bytes + bytes > this.limit) {
      this.stop("limit");
      return false;
    }
    this.events.push(e);
    this.bytes += bytes;
    return true;
  }
  private checkpoint(g: GameState, reason: string) {
    if (!this.enabled) return;
    if (
      this.append({
        ...this.clock(),
        kind: "checkpoint",
        state: structuredClone(g),
        reason,
      })
    )
      this.lastHash = stateHash(g);
  }
  committed(before: Profile, next: Profile) {
    if (!this.enabled) return;
    try {
      if (next.hint && next.hint !== before.hint) this.hinted = true;
      const a = before.game,
        b = next.game;
      if (a.gameId !== b.gameId || (a.moves === b.moves && !next.hint))
        this.hinted = false;
      if (a === b || (a.gameId === b.gameId && b.moves === a.moves + 1)) return;
      if (stateHash(a) !== stateHash(b))
        this.checkpoint(
          b,
          a.gameId !== b.gameId
            ? "new-game"
            : !a.reviveUsed && b.reviveUsed
              ? "revive"
              : "state-change",
        );
    } catch {
      this.stop("capture-error");
    }
  }
  record(before: GameState, move: Move, after: GameState) {
    if (!this.enabled) return;
    try {
      const from = stateHash(before),
        to = stateHash(after);
      if (this.lastHash === to) return; // duplicate notification
      if (this.lastHash !== from) this.checkpoint(before, "gap");
      if (!this.enabled) return;
      if (
        this.append({
          ...this.clock(),
          kind: "move",
          move: { ...move },
          before: from,
          after: to,
          hinted: this.hinted,
        })
      )
        this.lastHash = to;
      this.hinted = false;
    } catch {
      this.stop("capture-error");
    }
  }
  snapshot(): PlayRecord {
    return {
      schema: "blocky-play-v1",
      appVersion: "0.46.0-preview",
      origin: "manual-capture",
      completeGameStart: this.completeGameStart,
      stopped: this.stopped,
      events: structuredClone(this.events),
    };
  }
}
