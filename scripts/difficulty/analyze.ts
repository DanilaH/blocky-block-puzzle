/** Offline diagnostics only. No production import and no access to dealer witnesses. */
import {
  SHAPES,
  shapeById,
  type Board,
  type Slot,
  type Move,
} from "../../src/core/rules";
const pop = Array.from({ length: 256 }, (_, n) => {
  let c = 0;
  for (; n; n &= n - 1) c++;
  return c;
});
type Op = Move & { masks: number[] };
const catalog = new Map(
  SHAPES.map((s) => [
    s.id,
    Array.from({ length: 9 - s.height }, (_, y) =>
      Array.from({ length: 9 - s.width }, (_, x) => ({
        x,
        y,
        masks: Array.from({ length: 8 }, (_, r) =>
          s.cells.reduce(
            (n, [dx, dy]) => (r === y + dy ? n | (1 << (x + dx)) : n),
            0,
          ),
        ),
      })),
    ).flat(),
  ]),
);
export const toRows = (board: Board) =>
  Array.from({ length: 8 }, (_, y) =>
    board
      .slice(y * 8, y * 8 + 8)
      .reduce((n, v, x) => (v ? n | (1 << x) : n), 0),
  );
export const toBoard = (rows: number[]) =>
  rows.flatMap((r) =>
    Array.from({ length: 8 }, (_, x) => Number(!!(r & (1 << x)))),
  );
export const occupied = (rows: number[]) =>
  rows.reduce((n, r) => n + pop[r]!, 0);
export function actions(rows: number[], tray: Slot[], used = 0): Op[] {
  return tray.flatMap((s, slot) =>
    s.used || used & (1 << slot)
      ? []
      : catalog
          .get(s.shapeId)!
          .filter((o) => o.masks.every((r, y) => !(r & rows[y]!)))
          .map((o) => ({ ...o, slot })),
  );
}
export function transition(rows: number[], op: Op) {
  const added = rows.map((r, y) => r | op.masks[y]!);
  let columns = 255;
  for (const r of added) columns &= r;
  const lines = pop[columns]! + added.filter((r) => r === 255).length;
  return { rows: added.map((r) => (r === 255 ? 0 : r) & ~columns), lines };
}
type Summary = {
  complete: boolean;
  witness: Move[] | null;
  orders: Set<string>;
  minClear: number;
  maxLines: number;
  minOccupied: number;
  maxOccupied: number;
  allClear: boolean;
};
const empty = (complete = true): Summary => ({
  complete,
  witness: null,
  orders: new Set(),
  minClear: Infinity,
  maxLines: 0,
  minOccupied: 64,
  maxOccupied: 0,
  allClear: false,
});
export function analyze(board: Board, tray: Slot[], budget = 100000) {
  if (
    board.length !== 64 ||
    tray.length > 3 ||
    !Number.isInteger(budget) ||
    budget < 0
  )
    throw Error("Invalid analysis input");
  tray.forEach((s) => shapeById(s.shapeId));
  const initial = toRows(board),
    target = tray.reduce((m, s, i) => (s.used ? m : m | (1 << i)), 0);
  const cache = new Map<string, Summary>();
  let checks = 0,
    nodes = 0,
    hits = 0;
  function search(rows: number[], used: number): Summary {
    if (used === target)
      return {
        ...empty(),
        witness: [],
        orders: new Set([""]),
        minOccupied: occupied(rows),
        maxOccupied: occupied(rows),
      };
    const key = used + ":" + rows.join(",");
    const old = cache.get(key);
    if (old) {
      hits++;
      return old;
    }
    const result = empty();
    outer: for (let slot = 0; slot < tray.length; slot++) {
      if (tray[slot]!.used || used & (1 << slot)) continue;
      for (const op of catalog.get(tray[slot]!.shapeId)!) {
        if (checks >= budget) {
          result.complete = false;
          break outer;
        }
        checks++;
        if (op.masks.some((r, y) => r & rows[y]!)) continue;
        nodes++;
        const next = transition(rows, { ...op, slot });
        const child = search(next.rows, used | (1 << slot));
        result.complete &&= child.complete;
        if (child.witness) {
          result.witness ??= [{ slot, x: op.x, y: op.y }, ...child.witness];
          for (const order of child.orders)
            result.orders.add(String(slot) + order);
          result.minClear = Math.min(
            result.minClear,
            next.lines ? 1 : child.minClear + 1,
          );
          result.maxLines = Math.max(
            result.maxLines,
            next.lines + child.maxLines,
          );
          result.minOccupied = Math.min(result.minOccupied, child.minOccupied);
          result.maxOccupied = Math.max(result.maxOccupied, child.maxOccupied);
          result.allClear ||= occupied(next.rows) === 0 || child.allClear;
        }
      }
    }
    // Incomplete summaries are not memoized: unknown is never treated as failure.
    if (result.complete) cache.set(key, result);
    return result;
  }
  // Enumerating <=192 immediate placements is cheap and independent of search budget.
  const roots = actions(initial, tray);
  const first = roots.map((op) => {
    const next = transition(initial, op);
    const child = search(next.rows, 1 << op.slot);
    return {
      move: { slot: op.slot, x: op.x, y: op.y },
      immediateLines: next.lines,
      status: child.witness
        ? "solvable"
        : child.complete
          ? "unsolvable"
          : "unknown",
      child,
      next,
    };
  });
  const complete = first.every((x) => x.child.complete);
  const safe = first.filter((x) => x.status === "solvable").length,
    unknown = first.filter((x) => x.status === "unknown").length;
  const winners = first.filter((x) => x.child.witness);
  const orders = new Set(
    winners.flatMap((x) =>
      [...x.child.orders].map((s) => String(x.move.slot) + s),
    ),
  );
  let overlaps = 0,
    pairs = 0;
  for (let i = 0; i < roots.length; i++)
    for (let j = i + 1; j < roots.length; j++)
      if (roots[i]!.slot !== roots[j]!.slot) {
        pairs++;
        if (roots[i]!.masks.some((r, y) => r & roots[j]!.masks[y]!)) overlaps++;
      }
  const remaining = tray.filter((s) => !s.used).length;
  let permutations = 1;
  for (let i = 2; i <= remaining; i++) permutations *= i;
  const bestImmediate = Math.max(0, ...first.map((x) => x.immediateLines));
  const tempting = first.filter((x) => x.immediateLines === bestImmediate);
  const minClear = Math.min(
    Infinity,
    ...winners.map((x) => (x.immediateLines ? 1 : x.child.minClear + 1)),
  );
  const shapeSequence = (order: string) =>
    [...order].map((s) => tray[Number(s)]!.shapeId).join(",");
  return {
    status:
      remaining === 0 || safe ? "solvable" : unknown ? "unknown" : "unsolvable",
    complete,
    budget,
    checks,
    nodes,
    cacheHits: hits,
    rootChecks: tray
      .filter((s) => !s.used)
      .reduce((n, s) => n + catalog.get(s.shapeId)!.length, 0),
    placementConflictRatio: pairs ? overlaps / pairs : null,
    legalFirst: roots.length,
    safeFirst: safe,
    unknownFirst: unknown,
    safeRatio: complete && roots.length ? safe / roots.length : null,
    safeRatioBounds: roots.length
      ? [safe / roots.length, (safe + unknown) / roots.length]
      : null,
    viableSlotOrders: [...orders].sort(),
    viableShapeOrders: [...new Set([...orders].map(shapeSequence))].sort(),
    orderFreedom: complete
      ? remaining === 0
        ? 1
        : orders.size / permutations
      : null,
    minMovesToClearOnSuccess:
      complete && Number.isFinite(minClear) ? minClear : null,
    maxLinesOnSuccess: complete
      ? Math.max(0, ...winners.map((x) => x.immediateLines + x.child.maxLines))
      : null,
    allClearPossible: complete
      ? winners.some((x) => occupied(x.next.rows) === 0 || x.child.allClear)
      : null,
    endOccupiedRange:
      complete && winners.length
        ? [
            Math.min(...winners.map((x) => x.child.minOccupied)),
            Math.max(...winners.map((x) => x.child.maxOccupied)),
          ]
        : null,
    greedyTrapRatio:
      complete && bestImmediate > 0
        ? tempting.filter((x) => x.status === "unsolvable").length /
          tempting.length
        : null,
    witness: winners.length
      ? [winners[0]!.move, ...winners[0]!.child.witness!]
      : remaining === 0
        ? []
        : null,
    first: first.map(({ move, immediateLines, status }) => ({
      move,
      immediateLines,
      status,
    })),
  };
}
