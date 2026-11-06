import { type Board, type Slot, type Move } from "../../src/core/rules";
import { actions, transition, toRows, occupied } from "./analyze";
export const styles = [
  "clear",
  "space",
  "combo",
  "two",
  "three",
  "plausible",
] as const;
export type Style = (typeof styles)[number];
const pop = Array.from({ length: 256 }, (_, v) => {
  let n = 0;
  for (; v; v &= v - 1) n++;
  return n;
});
function geometry(rows: number[]) {
  let edges = 0,
    holes = 0;
  for (let y = 0; y < 8; y++) {
    const row = rows[y]!,
      empty = ~row & 255;
    edges += pop[(row ^ (row << 1)) & 255]! + pop[row ^ (rows[y + 1] ?? 0)]!;
    const near =
      ((empty << 1) |
        (empty >> 1) |
        (~(rows[y - 1] ?? 255) & 255) |
        (~(rows[y + 1] ?? 255) & 255)) &
      255;
    holes += pop[empty & ~near]!;
  }
  return -occupied(rows) * 2 - edges - holes * 20;
}
/** Independent bounded players; never read analyzer labels, witness, or future trays. */
export function choose(
  board: Board,
  tray: Slot[],
  style: Style,
  roll = 0,
): Move | null {
  const horizon =
    style === "three" ? 3 : style === "two" || style === "combo" ? 2 : 1;
  let beam = [
    {
      rows: toRows(board),
      used: 0,
      lines: 0,
      clearSteps: 0,
      first: null as Move | null,
      value: 0,
    },
  ];
  for (
    let depth = 0;
    depth < Math.min(horizon, tray.filter((s) => !s.used).length);
    depth++
  ) {
    const children = beam.flatMap((p) =>
      actions(p.rows, tray, p.used).map((op) => {
        const n = transition(p.rows, op),
          lines = p.lines + n.lines,
          clearSteps = p.clearSteps + Number(n.lines > 0),
          g = geometry(n.rows);
        const value =
          style === "space"
            ? g
            : style === "combo"
              ? clearSteps * 180 + lines * 30 + g
              : lines * 200 + g;
        return {
          rows: n.rows,
          used: p.used | (1 << op.slot),
          lines,
          clearSteps,
          first: p.first ?? { slot: op.slot, x: op.x, y: op.y },
          value,
        };
      }),
    );
    if (!children.length) break;
    children.sort((a, b) => b.value - a.value);
    beam = children.slice(0, 16);
  }
  // Plausible mistakes pick among good-looking moves, not arbitrary placements.
  return (
    beam[
      Math.min(
        beam.length - 1,
        style === "plausible" ? Math.floor(roll * Math.min(5, beam.length)) : 0,
      )
    ]?.first ?? null
  );
}
export function playTray(board: Board, tray: Slot[], style: Style, seed = 1) {
  let rows = toRows(board),
    slots = structuredClone(tray),
    rng = seed >>> 0;
  const moves: Move[] = [];
  let lines = 0,
    allClears = 0;
  for (let i = 0; i < 3 && slots.some((s) => !s.used); i++) {
    rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
    const b = rows.flatMap((r) =>
      Array.from({ length: 8 }, (_, x) => Number(!!(r & (1 << x)))),
    );
    const move = choose(b, slots, style, rng / 4294967296);
    if (!move) break;
    const op = actions(rows, slots).find(
      (o) => o.slot === move.slot && o.x === move.x && o.y === move.y,
    );
    if (!op) throw Error("Illegal player move");
    const n = transition(rows, op);
    rows = n.rows;
    lines += n.lines;
    allClears += Number(occupied(rows) === 0);
    slots[move.slot]!.used = true;
    moves.push(move);
  }
  return {
    success: slots.every((s) => s.used),
    moves,
    lines,
    allClears,
    endOccupied: occupied(rows),
  };
}
