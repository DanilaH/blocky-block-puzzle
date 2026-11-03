import { validCampaign } from "../adventure/save";
import type { Campaign } from "../adventure/core";
import { type AdsState, validRevivePlan } from "./monetization";
import { fits, hasMove, shapeById, type GameState, type Move } from "./rules";
export interface HintReceipt {
  gameId: string;
  revision: number;
  hintId: string;
  move: Move;
  source: "free" | "earned";
}
export interface Profile {
  schemaVersion: 1;
  campaign?: Campaign;
  wardrobe?: { selected: number; unlocked: number[]; discoveries: number };
  metrics?: {
    gameId: string;
    activeMs: number;
    maxStreak: number;
    started: boolean;
    durationComplete: boolean;
  };
  ads?: AdsState;
  tutorialStep?: number;
  revision: number;
  game: GameState;
  best: number;
  legacyBest?: number;
  festivalBest?: number;
  progressionBest?: number;
  freeDay: string;
  freeHints: number;
  earnedHints: number;
  hint: HintReceipt | null;
  settings: {
    sound: boolean;
    calm: boolean;
    haptics?: boolean;
    musicVolume?: number;
    effectsVolume?: number;
  };
}
export function dayKey(date = new Date()): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}
export const createProfile = (game: GameState): Profile => ({
  schemaVersion: 1,
  tutorialStep: 0,
  revision: 0,
  game,
  best: 0,
  freeDay: dayKey(),
  freeHints: 3,
  earnedHints: 0,
  hint: null,
  settings: { sound: true, calm: false, musicVolume: 0, effectsVolume: 1 },
});
export function withHint(
  profile: Profile,
  gameId: string,
  revision: number,
  move: Move,
  day: string,
): Profile | null {
  const game = profile.game;
  if (
    game.gameId !== gameId ||
    game.revision !== revision ||
    game.status !== "playing"
  )
    return null;
  const slot = game.tray[move.slot];
  if (
    !slot ||
    slot.used ||
    !fits(game.board, shapeById(slot.shapeId), move.x, move.y)
  )
    return null;
  if (profile.hint?.gameId === gameId && profile.hint.revision === revision)
    return profile;
  const freeHints = profile.freeDay === day ? profile.freeHints : 3;
  if (!freeHints && !profile.earnedHints) return null;
  const source = freeHints ? "free" : "earned";
  return {
    ...profile,
    revision: profile.revision + 1,
    game: { ...game, assisted: true },
    freeDay: day,
    freeHints: freeHints - Number(source === "free"),
    earnedHints: profile.earnedHints - Number(source === "earned"),
    hint: { gameId, revision, hintId: `${gameId}:${revision}`, move, source },
  };
}
const integer = (x: unknown) =>
  typeof x === "number" && Number.isSafeInteger(x) && x >= 0;
export function validProfile(value: unknown): value is Profile {
  try {
    if (!value || typeof value !== "object") return false;
    const p = value as Profile,
      g = p.game;
    if (
      p.schemaVersion !== 1 ||
      (p.campaign !== undefined && !validCampaign(p.campaign)) ||
      (p.tutorialStep !== undefined &&
        (!integer(p.tutorialStep) || p.tutorialStep > 4)) ||
      (p.wardrobe !== undefined &&
        (!p.wardrobe ||
          !integer(p.wardrobe.selected) ||
          p.wardrobe.selected > 10 ||
          !integer(p.wardrobe.discoveries) ||
          !Array.isArray(p.wardrobe.unlocked) ||
          !p.wardrobe.unlocked.includes(0) ||
          !p.wardrobe.unlocked.includes(p.wardrobe.selected) ||
          new Set(p.wardrobe.unlocked).size !== p.wardrobe.unlocked.length ||
          !p.wardrobe.unlocked.every((n) => integer(n) && n <= 10))) ||
      !integer(p.revision) ||
      !integer(p.best) ||
      (p.legacyBest !== undefined && !integer(p.legacyBest)) ||
      (p.progressionBest !== undefined && !integer(p.progressionBest)) ||
      (p.festivalBest !== undefined && !integer(p.festivalBest)) ||
      (p.settings?.haptics !== undefined &&
        typeof p.settings.haptics !== "boolean") ||
      [p.settings?.musicVolume, p.settings?.effectsVolume].some(
        (v) =>
          v !== undefined &&
          (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1),
      ) ||
      !integer(p.freeHints) ||
      p.freeHints > 3 ||
      !integer(p.earnedHints) ||
      typeof p.freeDay !== "string" ||
      typeof p.settings?.sound !== "boolean" ||
      typeof p.settings?.calm !== "boolean"
    )
      return false;
    if (
      !g ||
      typeof g.gameId !== "string" ||
      !g.gameId ||
      !integer(g.revision) ||
      !integer(g.moves) ||
      !integer(g.score) ||
      (g.scoringVersion !== undefined &&
        !["festival-v3", "festival-v4"].includes(g.scoringVersion)) ||
      !integer(g.streak) ||
      (g.rulesVersion !== undefined &&
        !["classic-v1", "grace-v2"].includes(g.rulesVersion)) ||
      (g.streakMisses !== undefined &&
        (!integer(g.streakMisses) ||
          g.streakMisses > 2 ||
          (!g.streak && g.streakMisses !== 0))) ||
      !integer(g.dealerFallbacks) ||
      !integer(g.rngState) ||
      g.rngState < 1 ||
      g.rngState > 0xffffffff ||
      !["initial-v1", "solvable-v1", "assist-v1", "flow-v1"].includes(
        g.dealerVersion,
      ) ||
      typeof g.reviveUsed !== "boolean" ||
      typeof g.assisted !== "boolean"
    )
      return false;
    if (
      !Array.isArray(g.board) ||
      g.board.length !== 64 ||
      !g.board.every((c) => integer(c) && c <= 6) ||
      !Array.isArray(g.tray) ||
      g.tray.length !== 3
    )
      return false;
    if (
      !g.tray.every((s) => {
        shapeById(s.shapeId);
        return (
          typeof s.used === "boolean" &&
          integer(s.color) &&
          s.color >= 1 &&
          s.color <= 6
        );
      })
    )
      return false;
    if (g.status !== (hasMove(g.board, g.tray) ? "playing" : "over"))
      return false;
    if (p.best < g.score) return false;
    if (p.hint !== null) {
      const h = p.hint,
        s = g.tray[h.move.slot];
      if (
        h.gameId !== g.gameId ||
        h.revision !== g.revision ||
        typeof h.hintId !== "string" ||
        !["free", "earned"].includes(h.source) ||
        !s ||
        s.used ||
        !fits(g.board, shapeById(s.shapeId), h.move.x, h.move.y)
      )
        return false;
    }
    if (
      p.metrics !== undefined &&
      (!p.metrics ||
        p.metrics.gameId !== g.gameId ||
        !integer(p.metrics.activeMs) ||
        !integer(p.metrics.maxStreak) ||
        typeof p.metrics.started !== "boolean" ||
        typeof p.metrics.durationComplete !== "boolean")
    )
      return false;
    if (p.ads !== undefined) {
      const a = p.ads;
      if (
        !a ||
        (a.ledgerVersion !== undefined && a.ledgerVersion !== 2) ||
        !integer(a.activeMs) ||
        !integer(a.lastFullscreenMs) ||
        a.lastFullscreenMs > a.activeMs ||
        !Array.isArray(a.interstitials) ||
        !a.interstitials.every(integer) ||
        !Array.isArray(a.completed) ||
        !a.completed.every((v) => typeof v === "string") ||
        !Array.isArray(a.receipts) ||
        !a.receipts.every((v) => typeof v === "string" && v.length > 0) ||
        !Array.isArray(a.intents)
      )
        return false;
      const ids = new Set();
      for (const i of a.intents) {
        if (
          !i ||
          typeof i.id !== "string" ||
          !i.id ||
          ids.has(i.id) ||
          !["hints", "revive"].includes(i.kind) ||
          !["pending", "applied", "available", "claimed"].includes(i.status) ||
          !integer(i.revision) ||
          typeof i.gameId !== "string" ||
          !i.gameId
        )
          return false;
        ids.add(i.id);
        if (i.compact !== undefined) {
          if (
            i.compact !== true ||
            a.ledgerVersion !== 2 ||
            i.snapshot !== undefined ||
            i.plan !== undefined ||
            !(
              i.status === "applied" ||
              (i.kind === "revive" && i.status === "claimed")
            )
          )
            return false;
          continue;
        }
        if (
          !i.snapshot ||
          i.gameId !== i.snapshot?.gameId ||
          i.revision !== i.snapshot.revision ||
          !validProfile({
            ...createProfile(i.snapshot),
            best: i.snapshot.score,
          })
        )
          return false;
        ids.add(i.id);
        if (i.kind === "revive" && !validRevivePlan(i.snapshot, i.plan))
          return false;
        if (
          i.kind === "hints" &&
          (i.plan !== undefined || ["available", "claimed"].includes(i.status))
        )
          return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

export function bestFor(p: Profile): number {
  if (p.game.scoringVersion === "festival-v4") return p.progressionBest ?? 0;
  return p.game.scoringVersion === "festival-v3"
    ? (p.festivalBest ?? 0)
    : (p.legacyBest ?? p.best);
}
export function recordScore(p: Profile, game: GameState) {
  const legacyBest = p.legacyBest ?? p.best;
  return {
    best: Math.max(p.best, game.score),
    legacyBest: game.scoringVersion
      ? legacyBest
      : Math.max(legacyBest, game.score),
    progressionBest:
      game.scoringVersion === "festival-v4"
        ? Math.max(p.progressionBest ?? 0, game.score)
        : (p.progressionBest ?? 0),
    festivalBest:
      game.scoringVersion === "festival-v3"
        ? Math.max(p.festivalBest ?? 0, game.score)
        : (p.festivalBest ?? 0),
  };
}
