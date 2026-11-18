import {
  fits,
  place,
  shapeById,
  SHAPES,
  type Board,
  type Move,
  type Slot,
} from "../../src/core/rules";
import type { rewardDirectorDeal } from "../../src/core/reward-director";
import { verifyMixedDeal } from "./verify-mixed-deal";
type Deal = ReturnType<typeof rewardDirectorDeal>;
const need = (ok: unknown, message: string) => {
  if (!ok) throw Error(message);
};
function replay(board: Board, tray: Slot[], route: Move[]) {
  let b = board,
    reward = false;
  const used = new Set<number>();
  for (const m of route) {
    need(!used.has(m.slot), "Repeated preparation slot");
    used.add(m.slot);
    const shape = shapeById(tray[m.slot]!.shapeId);
    need(fits(b, shape, m.x, m.y), "Illegal preparation");
    b = place(b, shape, m.x, m.y).board;
    reward ||= b.every((c) => !c);
  }
  need(used.size === 3, "Incomplete preparation");
  return { board: b, reward };
}
export function verifyRewardDeal(board: Board, d: Deal) {
  const result = verifyMixedDeal(board, d),
    soft = !["load", "emergency"].includes(d.diagnostic.actual);
  if (soft)
    need(
      d.diagnostic.robustness.adequate &&
        d.diagnostic.robustness.secondRequired === 3,
      "False soft-phase label",
    );
  const rows = (b: Board) =>
    Array.from({ length: 8 }, (_, y) =>
      b.slice(y * 8, y * 8 + 8).reduce((n, c, x) => n | (c ? 1 << x : 0), 0),
    );
  const ends = new Set(
    d.diagnostic.robustness.roots.flatMap(
      (r) =>
        r.seconds?.choices.map((s) =>
          s.witness
            ? rows(replay(board, d.tray, s.witness).board).join()
            : null,
        ) ?? [],
    ),
  );
  ends.add(rows(replay(board, d.tray, d.witness).board).join());
  const samples = d.diagnostic.preparationSamples;
  const unique = new Set<string>();
  let reachable = 0;
  for (const sample of samples) {
    const actual = replay(board, d.tray, sample.via);
    need(
      rows(actual.board).join() === sample.rows.join(),
      "Wrong sampled endpoint",
    );
    need(actual.reward === sample.earned, "Wrong sampled reward");
    need(!unique.has(sample.rows.join()), "Duplicate sampled endpoint");
    unique.add(sample.rows.join());
    if (sample.earned) reachable++;
    if (sample.route) {
      const tray = sample.route.map((o) => ({
        shapeId: SHAPES[o.shape]!.id,
        color: 1,
        used: false,
      }));
      const route = sample.route.map((o, slot) => ({ slot, x: o.x, y: o.y }));
      need(
        replay(actual.board, tray, route).reward,
        "Sampled payoff does not reward",
      );
      if (!sample.earned) reachable++;
    }
  }
  if (samples.length) {
    const stats = d.diagnostic.preparationCoverage;
    need(
      stats &&
        stats.sampled === samples.length &&
        stats.reachable === reachable &&
        stats.coverage === reachable / samples.length,
      "Wrong reward coverage",
    );
  }
  if (d.director.prepared.length) {
    need(
      samples.length >= 3 && reachable / samples.length >= 0.6,
      "Narrow reward advertised as preparation",
    );
  }
  for (const preparation of d.diagnostic.preparations) {
    const endpoint = rows(replay(board, d.tray, preparation.via).board).join();
    need(
      endpoint === preparation.plan.rows.join(),
      "Preparation proof ends at another board",
    );
    ends.add(endpoint);
  }
  for (const p of d.director.prepared) {
    need(
      ends.has(p.rows.join()),
      "Prepared endpoint lacks an issued-tray route",
    );
    const start = p.rows.flatMap((r) =>
      Array.from({ length: 8 }, (_, x) => Number(!!(r & (1 << x)))),
    );
    const tray = p.route.map((o) => ({
        shapeId: SHAPES[o.shape]!.id,
        color: 1,
        used: false,
      })),
      route = p.route.map((o, slot) => ({ slot, x: o.x, y: o.y }));
    need(
      replay(start, tray, route).reward,
      "Prepared payoff lacks an actual reward",
    );
  }
  return {
    ...result,
    prepared: d.director.prepared.length,
    seconds: d.diagnostic.robustness.roots.reduce(
      (n, r) =>
        n +
        (r.seconds?.choices.filter((s) => s.status === "found").length ?? 0),
      0,
    ),
  };
}
