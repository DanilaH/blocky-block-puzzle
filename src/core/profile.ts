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
  tutorialStep?: number;
  revision: number;
  game: GameState;
  best: number;
  freeDay: string;
  freeHints: number;
  earnedHints: number;
  hint: HintReceipt | null;
  settings: { sound: boolean; calm: boolean };
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
  settings: { sound: true, calm: false },
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
      (p.tutorialStep !== undefined &&
        (!integer(p.tutorialStep) || p.tutorialStep > 4)) ||
      !integer(p.revision) ||
      !integer(p.best) ||
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
      !integer(g.streak) ||
      !integer(g.dealerFallbacks) ||
      !integer(g.rngState) ||
      g.rngState < 1 ||
      g.rngState > 0xffffffff ||
      !["initial-v1", "solvable-v1"].includes(g.dealerVersion) ||
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
    return true;
  } catch {
    return false;
  }
}
