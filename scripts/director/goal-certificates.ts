/** Independent offline verifier. No production module imports this file. */
import {
  shapeById,
  placements,
  place,
  fits,
  type Board,
  type Slot,
  type Move,
} from "../../src/core/rules";
import { analyze } from "../difficulty/analyze";
import type { goalDirectorDeal } from "../../src/core/goal-director";
type Deal = ReturnType<typeof goalDirectorDeal>;
function require(condition: unknown, message: string): asserts condition {
  if (!condition) throw Error(message);
}
export function verifyGoalDeal(
  board: Board,
  deal: Pick<Deal, "tray" | "witness" | "diagnostic">,
) {
  let b = board,
    reward = false;
  const used = new Set<number>();
  for (const m of deal.witness) {
    require(!used.has(m.slot), "Repeated proof slot");
    used.add(m.slot);
    const s = shapeById(deal.tray[m.slot]!.shapeId);
    require(fits(b, s, m.x, m.y), "Illegal proof");
    b = place(b, s, m.x, m.y).board;
    reward ||= b.every((v) => !v);
  }
  require(used.size === 3, "Incomplete proof");
  require(deal.diagnostic.checks <= deal.diagnostic.limit, "Budget exceeded");
  const c = deal.diagnostic.certificate;
  if (!c)
    return {
      reward,
      kind: null,
      initialAvailable: deal.tray.filter(
        (s) => placements(board, shapeById(s.shapeId)).length,
      ).length,
    };
  if (c.kind === "slot-order") {
    require(c.forbiddenOrder.length === 3 &&
      new Set(c.forbiddenOrder).size === 3 &&
      c.forbiddenOrder.every((i) => i >= 0 && i < 3), "Bad order certificate");
    let work = 0;
    function search(b: Board, depth: number): boolean {
      if (depth === 3) return true;
      const s = shapeById(
        deal.tray[c!.kind === "slot-order" ? c!.forbiddenOrder[depth]! : 0]!
          .shapeId,
      );
      for (const p of placements(b, s)) {
        require(++work <= 1000000, "Offline order verifier exhausted");
        if (search(place(b, s, p.x, p.y).board, depth + 1)) return true;
      }
      return false;
    }
    require(!search(board, 0), "Claimed forbidden order has a solution");
  } else {
    require(JSON.stringify(c.goodFirst) ===
      JSON.stringify(deal.witness[0]), "Good first is not witnessed");
    const m = c.badFirst,
      s = shapeById(deal.tray[m.slot]!.shapeId);
    require(fits(board, s, m.x, m.y), "Illegal certified bad move");
    const after = place(board, s, m.x, m.y).board;
    const remaining = deal.tray.map((s, i) => ({ ...s, used: i === m.slot }));
    const result = analyze(after, remaining, 100000);
    require(result.complete, "Offline remainder verifier exhausted");
    if (c.kind === "placement")
      require(result.status ===
        "unsolvable", "Claimed fatal first move has a route");
    else {
      require(reward, "Reward choice lacks a rewarding witness");
      require(result.status==='solvable','Reward-only choice is actually fatal');
      require(after.some(Boolean), "Bad first already rewarded");
      require(!result.allClearPossible, "Claimed lost reward is reachable");
    }
    require(firstValue(board, deal.tray, m) >=
      firstValue(board, deal.tray, c.goodFirst) -
        12, "Bad first fails plausibility threshold");
  }
  return {
    reward,
    kind: c.kind,
    initialAvailable: deal.tray.filter(
      (s) => placements(board, shapeById(s.shapeId)).length,
    ).length,
  };
}
function firstValue(board: Board, tray: Slot[], move: Move) {
  const next = place(
      board,
      shapeById(tray[move.slot]!.shapeId),
      move.x,
      move.y,
    ),
    b = next.board;
  let edges = 0,
    holes = 0;
  const rows = Array.from({ length: 8 }, (_, y) =>
    b.slice(y * 8, y * 8 + 8).reduce((n, v, x) => n | (v ? 1 << x : 0), 0),
  );
  const pop = (v: number) => {
    let n = 0;
    for (; v; v &= v - 1) n++;
    return n;
  };
  for (let y = 0; y < 8; y++) {
    const row = rows[y]!,
      empty = ~row & 255;
    edges += pop((row ^ (row << 1)) & 255) + pop(row ^ (rows[y + 1] ?? 0));
    const near =
      ((empty << 1) |
        (empty >> 1) |
        (~(rows[y - 1] ?? 255) & 255) |
        (~(rows[y + 1] ?? 255) & 255)) &
      255;
    holes += pop(empty & ~near);
  }
  return next.lines * 200 - b.filter(Boolean).length * 2 - edges - holes * 20;
}
