/** Offline model, not an estimate of human win probability. No solver witnesses or player imports. */
import { shapeById, type Board, type Slot } from "../../src/core/rules";
import { actions, occupied, toRows, transition } from "../difficulty/analyze";
export type Taste = "lines" | "space";
// Different from benchmark geometry: preserve broad empty rectangles, penalize near-full stranded cells.
function room(rows: number[]) {
  let squares = 0;
  for (let y = 0; y < 7; y++)
    for (let x = 0; x < 7; x++) {
      const mask = 3 << x;
      if (!((rows[y]! | rows[y + 1]!) & mask)) squares++;
    }
  return squares;
}
export function resilience(
  board: Board,
  tray: Slot[],
  taste: Taste = "lines",
  width = 4,
  budget = 20000,
) {
  if (
    board.length !== 64 ||
    tray.length > 3 ||
    !Number.isInteger(width) ||
    width < 1 ||
    width > 8 ||
    !Number.isInteger(budget) ||
    budget < 0
  )
    throw Error("Invalid resilience input");
  tray.forEach((s) => shapeById(s.shapeId));
  const target = tray.reduce((m, s, i) => (s.used ? m : m | (1 << i)), 0);
  let checks = 0,
    unknown = 0,
    success = 0,
    expectedLines = 0,
    expectedOccupied = 0;
  const failureAt = [0, 0, 0];
  function visit(
    rows: number[],
    used: number,
    depth: number,
    mass: number,
    lines: number,
  ) {
    if (used === target) {
      success += mass;
      expectedLines += mass * lines;
      expectedOccupied += mass * occupied(rows);
      return;
    }
    const ops = actions(rows, tray, used);
    if (!ops.length) {
      failureAt[depth]! += mass;
      expectedLines += mass * lines;
      expectedOccupied += mass * occupied(rows);
      return;
    }
    if (checks + ops.length > budget) {
      unknown += mass;
      return;
    }
    checks += ops.length;
    const ranked = ops
      .map((op) => {
        const n = transition(rows, op);
        return {
          op,
          n,
          value:
            n.lines * (taste === "lines" ? 80 : 12) +
            room(n.rows) * 2 -
            occupied(n.rows),
        };
      })
      .sort((a, b) => b.value - a.value);
    // Include multiple figure choices rather than four translations of the same shape.
    const chosen: typeof ranked = [];
    const slots = new Set<number>();
    for (const a of ranked)
      if (!slots.has(a.op.slot) && chosen.length < width) {
        chosen.push(a);
        slots.add(a.op.slot);
      }
    for (const a of ranked)
      if (chosen.length < width && !chosen.includes(a)) chosen.push(a);
    chosen.sort((a, b) => b.value - a.value);
    const norm = chosen.reduce((s, _, i) => s + 1 / (i + 1), 0);
    chosen.forEach((a, i) =>
      visit(
        a.n.rows,
        used | (1 << a.op.slot),
        depth + 1,
        mass / (i + 1) / norm,
        lines + a.n.lines,
      ),
    );
  }
  visit(toRows(board), 0, 0, 1, 0);
  return {
    complete: unknown === 0,
    checks,
    unknown,
    success: unknown === 0 ? success : null,
    successBounds: [success, success + unknown],
    failureAt,
    expectedLines: unknown === 0 ? expectedLines : null,
    expectedOccupied: unknown === 0 ? expectedOccupied : null,
  };
}
