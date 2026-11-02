import { Capacitor, registerPlugin } from "@capacitor/core";
import type { Profile } from "../core/profile";

export type Params = Record<string, string | number | boolean>;
export interface AnalyticsEvent {
  name: string;
  params: Params;
}
export interface AnalyticsBridge {
  initialize(): Promise<{ enabled: boolean }>;
  report(p: { events: AnalyticsEvent[] }): Promise<void>;
}
export const nativeAnalytics = (): AnalyticsBridge | null =>
  Capacitor.isNativePlatform()
    ? registerPlugin<AnalyticsBridge>("BlockyAnalytics")
    : null;

// Small best-effort transport. Never await analytics in a gameplay transaction.
// Stable event IDs survive transport retries; no claim of exactly-once network delivery.
export class ProductAnalytics {
  readonly sessionId = crypto.randomUUID();
  private history: AnalyticsEvent[] = [];
  private pending: AnalyticsEvent[] = [];
  private enabled = false;
  private sending = false;
  private disposed = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private active = false;
  private tick: number;
  private elapsed = 0;
  private savedElapsed = 0;
  private resumedGame = "";
  constructor(
    private bridge: AnalyticsBridge | null,
    private now = () => performance.now(),
  ) {
    this.tick = now();
  }
  async init() {
    try {
      this.enabled = (await this.bridge?.initialize())?.enabled ?? false;
    } catch {
      this.enabled = false;
    }
    if (this.enabled) this.schedule();
  }
  track(name: string, params: Params = {}, id: string = crypto.randomUUID()) {
    if (this.disposed) return;
    const event = {
      name,
      params: {
        ...params,
        eventId: id,
        sessionId: this.sessionId,
        appVersion: "0.31.0-preview",
        eventSchema: 1,
      },
    };
    this.history.push(event);
    if (this.history.length > 128) this.history.shift();
    // No unbounded offline queue, no storage writes, no board/RNG in payload.
    this.pending.push(event);
    if (this.pending.length > 128) this.pending.shift();
    if (this.enabled) this.schedule();
  }
  snapshot() {
    return structuredClone(this.history);
  }
  private schedule() {
    if (!this.timer && !this.disposed && this.pending.length)
      this.timer = setTimeout(() => {
        this.timer = undefined;
        void this.flush();
      }, 1000);
  }
  async flush() {
    if (!this.enabled || this.sending || this.disposed) return;
    this.sending = true;
    const batch = this.pending.slice(0, 32);
    try {
      if (batch.length) {
        await this.bridge!.report({ events: batch });
        const ids = new Set(batch.map((e) => e.params.eventId));
        this.pending = this.pending.filter((e) => !ids.has(e.params.eventId));
      }
    } catch {
      /* Keep bounded retry batch; gameplay remains available. */
    } finally {
      this.sending = false;
      this.schedule();
    }
  }
  dispose() {
    this.disposed = true;
    clearTimeout(this.timer);
    this.pending = [];
  }
  private accumulate() {
    const now = this.now();
    if (this.active) this.elapsed += Math.max(0, now - this.tick);
    this.tick = now;
  }
  setActive(active: boolean, p: Profile) {
    this.accumulate();
    this.active = active;
    if (active && p.game.moves > 0 && this.resumedGame !== p.game.gameId) {
      this.resumedGame = p.game.gameId;
      this.track("game_resume", { gameId: p.game.gameId, moves: p.game.moves });
    }
  }
  private stats(p: Profile) {
    return p.metrics?.gameId === p.game.gameId
      ? p.metrics
      : {
          gameId: p.game.gameId,
          activeMs: 0,
          maxStreak: p.game.streak,
          started: p.game.moves > 0,
          durationComplete: p.game.moves === 0,
        };
  }
  prepare(before: Profile, next: Profile): Profile {
    this.accumulate();
    const old = this.stats(before);
    const same = next.game.gameId === before.game.gameId;
    return {
      ...next,
      metrics: same
        ? {
            ...old,
            activeMs:
              old.activeMs + Math.floor(this.elapsed - this.savedElapsed),
            maxStreak: Math.max(old.maxStreak, next.game.streak),
            started: old.started || next.game.moves > 0,
          }
        : {
            gameId: next.game.gameId,
            activeMs: 0,
            maxStreak: next.game.streak,
            started: next.game.moves > 0,
            durationComplete: next.game.moves === 0,
          },
    };
  }
  boot(p: Profile, fresh: boolean, recovered: boolean) {
    if (fresh) {
      this.track("first_open", {}, "first_open");
      this.track("tutorial_start", { step: p.tutorialStep ?? 0 });
    }
    if (recovered) this.track("save_recovered", { reason: "backup" });
  }
  committed(before: Profile, next: Profile, reason?: string) {
    const g = next.game,
      prev = before.game;
    const oldStats = this.stats(before);
    const elapsed = Math.floor(this.elapsed - this.savedElapsed);
    this.savedElapsed = this.elapsed;
    const context = { gameId: g.gameId };
    const emit = (name: string, params: Params = {}) =>
      this.track(
        name,
        { ...context, ...params },
        `${name}:${g.gameId}:${next.revision}`,
      );
    const same = prev.gameId === g.gameId;
    const lessonBefore = before.tutorialStep ?? 4,
      lessonAfter = next.tutorialStep ?? 4;
    if (lessonAfter !== lessonBefore) {
      if (lessonAfter === 0) emit("tutorial_start", { step: 0 });
      else if (lessonAfter === 4)
        emit(
          reason === "tutorial_skip" ? "tutorial_skip" : "tutorial_complete",
        );
      else emit("tutorial_step", { step: lessonAfter });
    }
    if (same && !oldStats.started && g.moves > 0 && lessonAfter === 4) {
      emit("game_start", { dealerVersion: g.dealerVersion });
      this.resumedGame = g.gameId;
    }
    if (
      (same && prev.status === "playing" && g.status === "over") ||
      (!same && prev.status === "playing" && oldStats.started)
    ) {
      this.track(
        "game_end",
        {
          gameId: prev.gameId,
          reason: same ? "no_moves" : "restart",
          score: same ? g.score : prev.score,
          moves: same ? g.moves : prev.moves,
          activeMs: oldStats.activeMs + elapsed,
          durationComplete: oldStats.durationComplete,
          maxStreak: Math.max(oldStats.maxStreak, same ? g.streak : 0),
          dealerVersion: prev.dealerVersion,
          revive: same ? g.reviveUsed : prev.reviveUsed,
        },
        `game_end:${prev.gameId}:${same ? g.revision : prev.revision}`,
      );
    }
    if ((!same && g.reviveUsed) || (same && !prev.reviveUsed && g.reviveUsed))
      emit("revive_applied", { restored: !same });
    if (same && g.streak > prev.streak)
      emit("clear", { streak: g.streak, points: g.score - prev.score });
    if (next.hint && next.hint.hintId !== before.hint?.hintId)
      emit("hint_applied", { source: next.hint.source });
    for (const key of ["sound", "calm", "haptics"] as const)
      if (before.settings[key] !== next.settings[key])
        emit(key === "calm" ? "intensity_setting" : "audio_setting", {
          setting: key,
          enabled: next.settings[key] ?? true,
        });
  }
  saveFailed() {
    this.track("save_failure", { reason: "write" });
  }
}
