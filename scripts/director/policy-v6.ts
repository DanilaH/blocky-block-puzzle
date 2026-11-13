/** Experimental package 2. Offline only; never imported by the shipped game. */
import {
  SHAPES,
  random,
  deal,
  type GameState,
  type Slot,
} from "../../src/core/rules";
import { analyze } from "../difficulty/analyze";
import { resilience } from "./resilience";
import { constructTasks } from "./recipes";
export type Phase = "build" | "challenge" | "payoff" | "encore" | "recovery";
export type Director = {
  version: 1;
  phase: Phase;
  age: number;
  skill: number;
  evidence: number;
  dry: number;
  rewardRun: number;
  recovery: number;
  recent: string[];
  rng: number;
};
export const initialDirector = (seed: number): Director => ({
  version: 1,
  phase: "build",
  age: 0,
  skill: 0.35,
  evidence: 0,
  dry: 0,
  rewardRun: 0,
  recovery: 0,
  recent: [],
  rng: seed >>> 0,
});
export function revived(d: Director): Director {
  return { ...d, phase: "recovery", age: 0, recovery: 3, dry: 0, rewardRun: 0 };
}
export type Observation = {
  success: boolean;
  lines: number;
  allClear: boolean;
  occupied: number;
  difficulty: number | null;
};
/** Update on completed tray or loss, not on wall-clock time or advertising state. */
export function observe(d: Director, o: Observation): Director {
  const n = {
    ...d,
    recent: [...d.recent],
    age: d.age + 1,
    dry: o.lines ? 0 : d.dry + 1,
    rewardRun: o.lines >= 2 ? d.rewardRun + 1 : 0,
  };
  // Gift trays teach us little. Failures on difficult trays also carry less certainty.
  if (o.difficulty !== null && o.difficulty >= 0.02) {
    const weight = Math.min(1, o.difficulty);
    n.evidence += weight;
    n.skill = Math.max(
      0,
      Math.min(
        1,
        d.skill + (o.success ? 1 - d.skill : -d.skill) * 0.12 * weight,
      ),
    );
  }
  if (d.phase === "recovery") {
    n.recovery = d.recovery;
    if (n.recovery === 0) {
      n.phase = "build";
      n.age = 0;
    }
    return n;
  }
  if (!o.success || n.dry >= 3 || o.occupied >= 36) {
    n.phase = "payoff";
    n.age = 0;
    return n;
  }
  if (o.allClear) {
    const r = random(n.rng);
    n.rng = r.state;
    n.phase = d.phase !== "encore" && r.value < 0.16 ? "encore" : "build";
    n.age = 0;
    return n;
  }
  if (d.phase === "encore" && n.age >= 1) {
    n.phase = "build";
    n.age = 0;
  } else if (d.phase === "payoff" && o.lines > 0) {
    n.phase = "build";
    n.age = 0;
  } else if (d.phase === "build" && n.age >= 2 && o.occupied >= 12) {
    n.phase = "challenge";
    n.age = 0;
  } else if (d.phase === "challenge" && (o.lines >= 2 || n.age >= 3)) {
    n.phase = "payoff";
    n.age = 0;
  }
  return n;
}
const family = (t: Slot[]) =>
  t
    .map((s) => SHAPES.find((x) => x.id === s.shapeId)!.family)
    .sort()
    .join(",");
export function select(
  g: GameState,
  d: Director,
  limits = { candidates: 8, checks: 30000 },
) {
  if (!g.tray.every((s) => !s.used)) throw Error("Selection only at refill");
  if (limits.candidates < 1 || limits.candidates > 16 || limits.checks < 0)
    throw Error("Invalid selection budget");
  if (g.moves < 12 && d.phase !== "recovery")
    return {
      tray: structuredClone(g.tray),
      director: structuredClone(d),
      difficulty: null,
      diagnostic: {
        revision: "resilience-v6",
        qualified: false,
        recipe: "opening",
        phase: d.phase,
        target: 0,
        source: "baseline",
        fallback: true,
        checked: 0,
        checks: 0,
        unknown: 0,
        orderFreedom: null,
        preparation: null,
        maxLines: null,
        motif: "opening",
      },
    };
  const original = structuredClone(g.tray),
    pool = [{ tray: original, source: "baseline" }];
  let rng = d.rng;
  const next = () => {
    const r = random(rng);
    rng = r.state;
    return r.value;
  };
  if (d.phase === "challenge" && d.evidence >= 1 && d.skill >= 0.5) {
    for (
      let attempt = 0;
      attempt < 3 && pool.length < limits.candidates;
      attempt++
    ) {
      const tasks = constructTasks(g.board, rng);
      rng = tasks.rng;
      for (const task of tasks.proposals) {
        const bag = task.tray
          .map((s) => s.shapeId)
          .sort()
          .join(",");
        if (
          !pool.some(
            (p) =>
              p.tray
                .map((s) => s.shapeId)
                .sort()
                .join(",") === bag,
          ) &&
          pool.length < limits.candidates
        )
          pool.push(task);
      }
    }
  }
  const changing = d.evidence >= 1 && d.skill >= 0.5 && d.phase === "challenge";
  for (let i = pool.length; changing && i < limits.candidates; i++) {
    if (i % 2) {
      const tray = Array.from({ length: 3 }, () => ({
        shapeId: SHAPES[Math.floor(next() * SHAPES.length)]!.id,
        used: false,
        color: 1,
      }));
      pool.push({ tray, source: "catalog" });
    } else {
      const seed = Math.floor(next() * 0xffffffff);
      pool.push({
        tray: deal(g.board, seed, "flow-v4", g.moves, "", {
          ...g.rhythm!,
          pressure: i % 4 ? 25 : 90,
          reliefMoves: 0,
        }).tray,
        source: "constructed",
      });
    }
  }
  const unique = pool.filter(
    (c, i) =>
      pool.findIndex(
        (p) =>
          p.tray.map((s) => s.shapeId).join(",") ===
          c.tray.map((s) => s.shapeId).join(","),
      ) === i,
  );
  const evaluated = unique.map((c) => ({
    ...c,
    metrics: analyze(g.board, c.tray, limits.checks),
    behavior: [
      resilience(g.board, c.tray, "lines", 4, limits.checks),
      resilience(g.board, c.tray, "space", 4, limits.checks),
    ],
  }));
  const qualified = d.evidence >= 1 && d.skill >= 0.5;
  const effectiveSkill = qualified ? d.skill : 0.2;
  const base = evaluated.find((c) => c.source === "baseline")?.metrics;
  const baseBehavior = evaluated[0]!.behavior;
  const target =
    d.phase === "recovery"
      ? 0.05
      : d.phase === "payoff" || d.phase === "encore"
        ? 0.1
        : d.phase === "build"
          ? 0.12
          : 0.2 + effectiveSkill * 0.45;
  const scored = evaluated
    .filter((c) => {
      const m = c.metrics;
      if (!m.complete || m.status !== "solvable") return false;
      if (c.source === "baseline") return true;
      if (!base?.complete) return false;
      if (base.allClearPossible && !m.allClearPossible) return false;
      if (
        !c.behavior.every(
          (b, i) =>
            b.complete &&
            baseBehavior[i]!.complete &&
            b.success! >= 0.85 &&
            b.success! >= baseBehavior[i]!.success! - 0.08 &&
            b.expectedLines! >= baseBehavior[i]!.expectedLines! * 0.8 &&
            b.expectedOccupied! <= baseBehavior[i]!.expectedOccupied! + 4,
        )
      )
        return false;
      return true;
    })
    .map((c) => {
      const m = c.metrics,
        difficulty = 1 - Math.min(...c.behavior.map((b) => b.success ?? 1));
      const order = 1 - m.orderFreedom!;
      const preparation = (m.minMovesToClearOnSuccess ?? 0) >= 2 ? 1 : 0;
      const lines = m.maxLinesOnSuccess ?? 0;
      const recipe = m.allClearPossible
        ? "all-clear"
        : order >= 0.5
          ? "order"
          : preparation
            ? "prepare"
            : lines >= 3
              ? "multi-clear"
              : lines
                ? "direct"
                : "build";
      const motif =
        family(c.tray) +
        "|" +
        Number(order > 0.34) +
        "|" +
        preparation +
        "|" +
        Math.min(lines, 3);
      const repeat = d.recent.filter((x) => x === motif).length;
      const rewardWeight =
        d.phase === "payoff" || d.phase === "encore" || d.phase === "recovery"
          ? 3
          : 1;
      const value =
        -Math.abs(difficulty - target) * 12 +
        Math.min(lines, 3) * rewardWeight +
        (m.allClearPossible ? rewardWeight * 2 : 0) +
        (d.phase === "challenge" ? order * 2 + preparation : 0) -
        repeat * 6;
      return { ...c, difficulty, motif, recipe, value };
    });
  scored.sort((a, b) => b.value - a.value);
  // In qualified challenge episodes prefer a verified ordering/preparation task.
  if (qualified && d.phase === "challenge") {
    const index = scored.findIndex(
      (c) => c.recipe === "order" || c.recipe === "prepare",
    );
    if (index > 0) scored.unshift(...scored.splice(index, 1));
  }
  // The opening is controlled by the existing policy. Budget exhaustion never forces a hard tray.
  const chosen = scored[0];
  const tray = chosen?.tray ?? original;
  const motif = chosen?.motif ?? family(tray) + "|baseline";
  return {
    tray: structuredClone(tray),
    director: {
      ...d,
      rng,
      recent: [...d.recent, motif].slice(-6),
      recovery:
        d.phase === "recovery" ? Math.max(0, d.recovery - 1) : d.recovery,
    },
    difficulty: chosen?.difficulty ?? null,
    diagnostic: {
      revision: "resilience-v6",
      qualified,
      recipe: chosen?.recipe ?? "baseline",
      phase: d.phase,
      target,
      source: chosen?.source ?? "baseline",
      fallback: !chosen,
      checked: evaluated.length,
      checks: evaluated.reduce((n, c) => n + c.metrics.checks, 0),
      unknown: evaluated.filter((c) => !c.metrics.complete).length,
      orderFreedom: chosen?.metrics.orderFreedom ?? null,
      preparation: chosen?.metrics.minMovesToClearOnSuccess ?? null,
      maxLines: chosen?.metrics.maxLinesOnSuccess ?? null,
      motif,
      behavior: chosen?.behavior ?? evaluated[0]!.behavior,
    },
  };
}
