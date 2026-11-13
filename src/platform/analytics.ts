import { Capacitor, registerPlugin } from "@capacitor/core";
import { experimentContext } from "../core/experiment";
import { APP_VERSION } from "../app-version";
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
    if (this.enabled) await this.flush();
  }
  track(name: string, params: Params = {}, id: string = crypto.randomUUID()) {
    if (this.disposed) return;
    const event = {
      name,
      params: {
        ...params,
        eventId: id,
        sessionId: this.sessionId,
        appVersion: APP_VERSION,
        eventSchema: 2,
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
    const activeMs = old.activeMs + Math.floor(this.elapsed - this.savedElapsed);
    const previousProgress = before.metrics?.reviveProgress;
    const justRevived = next.game.reviveUsed && (!same || !before.game.reviveUsed);
    const intent = justRevived ? next.ads?.intents.find(i=>i.gameId===next.game.gameId&&i.kind==="revive"&&["applied","claimed"].includes(i.status)) : undefined;
    const restoredActive=justRevived&&!same?Number(intent?.context?.runActiveMs??0):0;
    const progress = justRevived && intent ? { intentId:intent.id, offerId:intent.snapshot?.reviveOffer?.id??`legacy:${intent.id}`, startMoves:next.game.moves, oldTrayEnd:next.game.moves+next.game.tray.filter(s=>!s.used).length, activeAt:same?activeMs:restoredActive, flags:0 } : same&&previousProgress?{...previousProgress}:undefined;
    if (progress) {
      const delta=next.game.moves-progress.startMoves;
      progress.flags |= Number(delta>0) | (Number(next.game.moves>=progress.oldTrayEnd)<<1) | (Number(next.game.moves>=progress.oldTrayEnd+3)<<2) | (Number(next.game.status==="over"&&delta>0)<<3);
    }
    return {
      ...next,
      metrics: same
        ? {
            ...old,
            activeMs,
            failureIndex: (before.metrics?.failureIndex??0)+Number(before.game.status==="playing"&&next.game.status==="over"),
            closed: justRevived ? false : !!before.metrics?.closed || !!next.ads?.closedEpisodes?.includes(`${next.game.gameId}:${before.metrics?.episode??1}`),
            episode: justRevived&&before.metrics?.closed?(before.metrics.episode??1)+1:before.metrics?.episode??1,
            ...(progress?{reviveProgress:progress}:{}),
            maxStreak: Math.max(old.maxStreak, next.game.streak),
            started: old.started || next.game.moves > 0,
          }
        : {
            gameId: next.game.gameId,
            activeMs: restoredActive,
            maxStreak: Math.max(next.game.streak,Number(intent?.context?.runMaxStreak??0)),
            started: next.game.moves > 0,
            durationComplete: next.game.moves === 0 || intent?.context?.runDurationComplete===true,
            failureIndex: Number(intent?.context?.failureIndex??0), closed: false,
            episode: next.game.reviveUsed&&next.ads?.completed.includes(next.game.gameId)?2:1,
            ...(progress?{reviveProgress:progress}:{}),
          },
    };
  }
  boot(p: Profile, fresh: boolean, recovered: boolean) {
    this.track("session_started",experimentContext(p),`session:${this.sessionId}`);
    const assignment=p.experiment?.assignment;
    if (assignment) this.track("experiment_assigned",{...experimentContext(p),assignedAt:assignment.assignedAt,installationId:p.experiment!.installationId},`assignment:${assignment.id}`);
    if (fresh) {
      this.track("first_open", {}, "first_open");
      this.track("tutorial_start", { step: p.tutorialStep ?? 0 });
    }
    if (recovered) this.track("save_recovered", { reason: "backup" });
  }
  committed(before: Profile, next: Profile, reason?: string) {
    const assignment=next.experiment?.assignment;
    if (assignment && assignment.id!==before.experiment?.assignment?.id) this.track("experiment_assigned",{...experimentContext(next),assignedAt:assignment.assignedAt,installationId:next.experiment!.installationId},`assignment:${assignment.id}`);
    const g = next.game,
      prev = before.game;
    const oldStats = this.stats(before);
    const elapsed = Math.floor(this.elapsed - this.savedElapsed);
    this.savedElapsed = this.elapsed;
    const context = { ...experimentContext(next), gameId: g.gameId, episodeIndex:next.metrics?.episode??1 };
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
      emit("run_started");
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
    const failure = same && prev.status === "playing" && g.status === "over";
    if (failure) emit("run_failed",{failureIndex:next.metrics?.failureIndex??1,revision:g.revision,moves:g.moves,score:g.score,reviveCount:Number(g.reviveUsed)});
    if ((same && !before.metrics?.closed && next.metrics?.closed) || (!same && oldStats.started && !before.metrics?.closed))
      this.track("run_closed",{...experimentContext(before),gameId:prev.gameId,episodeIndex:before.metrics?.episode??1,reason:same?"final_result":"restart",moves:same?g.moves:prev.moves,score:same?g.score:prev.score,activeMs:oldStats.activeMs+elapsed},`run_closed:${prev.gameId}:${before.metrics?.episode??1}`);
    if (g.reviveUsed && ((!same) || (!prev.reviveUsed && before.metrics?.closed))) emit("run_reopened",{intentId:next.metrics?.reviveProgress?.intentId??"legacy"});
    const offer=g.reviveOffer;
    if (same && offer?.shown && !prev.reviveOffer?.shown) emit("revive_offer_shown",{offerId:offer.id??`legacy:${g.gameId}`,failureIndex:next.metrics?.failureIndex??1,deadline:offer.deadline,readyState:offer.readyState??"unknown"});
    if (same && offer?.decision && !prev.reviveOffer?.decision) emit("revive_offer_decided",{offerId:offer.id??`legacy:${g.gameId}`,decision:offer.decision,readyState:offer.readyState??"unknown"});
    const progress=next.metrics?.reviveProgress, priorFlags=progress && before.metrics?.reviveProgress?.intentId===progress.intentId?before.metrics!.reviveProgress!.flags:0;
    if (progress) for (const [i,milestone] of ["first_move","old_tray_completed","next_tray_completed","failed_again"].entries())
      if ((progress.flags&(1<<i)) && !(priorFlags&(1<<i))) this.track("post_revive_checkpoint",{...context,intentId:progress.intentId,offerId:progress.offerId,milestone,additionalMoves:g.moves-progress.startMoves,additionalActiveMs:(next.metrics?.activeMs??0)-progress.activeAt},`post_revive_checkpoint:${progress.intentId}:${milestone}`);
    if ((!same && g.reviveUsed) || (same && !prev.reviveUsed && g.reviveUsed)) {
      const intent=next.ads?.intents.find(i=>i.gameId===g.gameId&&i.kind==="revive"&&["applied","claimed"].includes(i.status));
      emit("revive_applied", { restored: !same,intentId:intent?.id??"legacy" });
      if (intent?.status==="claimed") this.track("reward_applied",{...context,intentId:intent.id,kind:"revive",offerId:intent.snapshot?.reviveOffer?.id??"legacy"},`reward_applied:${intent.id}`);
    }
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
