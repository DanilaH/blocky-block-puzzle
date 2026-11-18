import {
  fits,
  place,
  shapeById,
  SHAPES,
  type Board,
  type Move,
  type Slot,
} from "../../src/core/rules";
import type { forgivingDirectorDeal } from "../../src/core/forgiving-director";
import { verifyMixedDeal } from "./verify-mixed-deal";
type Deal = ReturnType<typeof forgivingDirectorDeal>;
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
export function verifyForgivingDeal(board: Board, d: Deal) {
  const result = verifyMixedDeal(board, d),
    soft = !["load", "build", "emergency"].includes(d.diagnostic.actual);
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
