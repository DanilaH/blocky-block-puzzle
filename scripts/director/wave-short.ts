/** Offline paired experiment: guaranteed vs neutral distribution in bounded challenge windows. */
import { deal, type GameState } from "../../src/core/rules";
import {
  select as baseline,
  observe as learn,
  type Director,
  type Observation,
} from "./policy-v7";
import { analyze } from "../difficulty/analyze";
export { initialDirector, revived } from "./policy-v7";
export function observe(d: Director, o: Observation): Director {
  const n = learn(d, o);
  if (d.phase === "recovery") return n;
  const age = d.age + 1;
  if (!o.success || n.dry >= 2 || o.occupied >= 36)
    return { ...n, phase: "payoff", age: 0 };
  if (o.allClear) return { ...n, phase: "build", age: 0 };
  if (d.phase === "build" && age >= 2 && o.occupied >= 12)
    return { ...n, phase: "challenge", age: 0 };
  if (d.phase === "challenge" && age >= 2)
    return { ...n, phase: "payoff", age: 0 };
  if (d.phase === "payoff" && ((age >= 2 && o.lines >= 2) || age >= 4))
    return { ...n, phase: "build", age: 0 };
  return { ...n, phase: d.phase, age };
}
export function chooseWave(
  g: GameState,
  d: Director,
  mode: "guaranteed" | "neutral",
  limits = { candidates: 8, checks: 30000 },
) {
  const qualified = d.evidence >= 3 && d.skill >= 0.6;
  const active = g.moves >= 12 && d.phase === "challenge" && qualified;
  let tray = g.tray,
    rng = d.rng,
    source = "baseline",
    proof: ReturnType<typeof analyze> | null = null;
  if (active && limits.checks > 0) {
    // One ordinary weighted draw; no reroll to seek a fatal tray or target advertising.
    const proposal = deal(g.board, rng, "initial-v1", g.moves);
    rng = proposal.rngState;
    proof = analyze(g.board, proposal.tray, limits.checks);
    if (mode === "neutral" || proof.status === "solvable") {
      tray = proposal.tray;
      source = mode === "neutral" ? "neutral-weighted" : "weighted-solvable";
    }
  }
  const result = baseline(
    { ...g, tray },
    { ...d, rng },
    { candidates: 1, checks: limits.checks },
  );
  return {
    ...result,
    diagnostic: {
      ...result.diagnostic,
      revision: "wave-" + mode,
      qualified,
      source,
      recipe: source === "baseline" ? result.diagnostic.recipe : source,
      sampledStatus: proof?.status ?? null,
      sampledComplete: proof?.complete ?? null,
      sampledWitness: proof?.witness ?? null,
      occupied: g.board.filter(Boolean).length,
      waveAge: d.age,
      // Explicitly retain impossible draws in the neutral experiment; do not call them proven tasks.
      guaranteed: mode === "guaranteed" || source === "baseline",
    },
  };
}
