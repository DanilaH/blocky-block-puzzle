/** Diagnostic control, not a release candidate. No assistance after the first 12 moves. */
import { deal, type GameState } from "../../src/core/rules";
import { initialDirector, observe, revived, type Director } from "./policy-v7";
export { initialDirector, observe, revived };
export function select(g: GameState, d: Director) {
  const next =
    g.moves < 12 ? null : deal(g.board, d.rng, "initial-v1", g.moves);
  return {
    tray: structuredClone(next?.tray ?? g.tray),
    director: { ...d, rng: next?.rngState ?? d.rng },
    difficulty: null,
    diagnostic: {
      revision: "neutral-control",
      source: next ? "neutral-weighted" : "baseline",
      phase: "control",
      qualified: false,
      recipe: "control",
      maxLines: null,
    },
  };
}
