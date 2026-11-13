import { revivePlan, type RevivePlan } from "./monetization";
import type { GameState } from "./rules";
export const REVIVE_WINDOW_MS = 5000;
/** Wall clock applies only to the offer, never to board/dealer/reward receipts. */
export function startReviveOffer(game: GameState, now: number, prepared: RevivePlan | null = revivePlan(game)): GameState {
  return game.reviveOffer || game.status !== "over" || game.reviveUsed
    ? game
    : {
        ...game,
        reviveOffer: {
          ...(prepared?.selection ? { selection: prepared.selection } : {}),
          id: `revive:${game.gameId}:${game.revision}`,
          deadline: now + REVIVE_WINDOW_MS,
          accepted: false,
          expired: false,
        },
      };
}
export function acceptReviveOffer(game: GameState, now: number): GameState {
  const offer = game.reviveOffer;
  if (!offer || offer.expired || game.status !== "over" || game.reviveUsed)
    return game;
  if (offer.accepted) return game;
  return {
    ...game,
    reviveOffer: {
      ...offer,
      accepted: now < offer.deadline,
      expired: now >= offer.deadline,
      decision: now < offer.deadline ? "accept" : "expired",
    },
  };
}
export function expireReviveOffer(game: GameState, now: number): GameState {
  const offer = game.reviveOffer;
  return !offer || offer.accepted || offer.expired || now < offer.deadline
    ? game
    : { ...game, reviveOffer: { ...offer, expired: true, decision: "expired" } };
}
