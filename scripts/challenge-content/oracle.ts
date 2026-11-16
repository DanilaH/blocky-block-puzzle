/** Offline cell-set oracle, independent of the production bitboard search. */
import {
  shapeById,
  type Board,
  type Slot,
  type Move,
} from "../../src/core/rules";
import { boundedOptions } from "../director/mixed-players";

/** Separate positive route check using cells and simultaneous row/column clears. */
export function verifyWitness(board: Board, tray: Slot[], witness: Move[]) {
  let cells = new Set(board.flatMap((v, i) => (v ? [i] : [])));
  const used = new Set<number>();
  for (const m of witness) {
    const slot = tray[m.slot];
    if (!slot || slot.used || used.has(m.slot))
      throw Error("Invalid witness slot");
    const s = shapeById(slot.shapeId);
    if (
      m.x < 0 ||
      m.y < 0 ||
      m.x + s.width > 8 ||
      m.y + s.height > 8 ||
      s.cells.some(([x, y]) => cells.has((m.y + y) * 8 + m.x + x))
    )
      throw Error("Invalid cell witness");
    used.add(m.slot);
    for (const [x, y] of s.cells) cells.add((m.y + y) * 8 + m.x + x);
    const rows: number[] = [],
      cols: number[] = [];
    for (let i = 0; i < 8; i++) {
      if (
        Array.from({ length: 8 }, (_, x) => cells.has(i * 8 + x)).every(Boolean)
      )
        rows.push(i);
      if (
        Array.from({ length: 8 }, (_, y) => cells.has(y * 8 + i)).every(Boolean)
      )
        cols.push(i);
    }
    cells = new Set(
      [...cells].filter((i) => !rows.includes(i >> 3) && !cols.includes(i % 8)),
    );
  }
  if (used.size !== tray.filter((s) => !s.used).length)
    throw Error("Incomplete cell witness");
}

export function inspectChoices(board: Board, tray: Slot[], limit = 200000) {
  let work = 0;
  const initial = new Set(board.flatMap((v, i) => (v ? [i] : [])));
  type Status = "SOLVABLE" | "UNSOLVABLE" | "UNKNOWN";
  const cache = new Map<string, Status>();
  function fits(cells: Set<number>, id: string, x: number, y: number) {
    if (work >= limit) return null;
    work++;
    return shapeById(id).cells.every(
      ([dx, dy]) => !cells.has((y + dy) * 8 + x + dx),
    );
  }
  function place(cells: Set<number>, id: string, x: number, y: number) {
    const n = new Set(cells);
    for (const [dx, dy] of shapeById(id).cells) n.add((y + dy) * 8 + x + dx);
    const rows: number[] = [],
      cols: number[] = [];
    for (let i = 0; i < 8; i++) {
      if (Array.from({ length: 8 }, (_, x) => n.has(i * 8 + x)).every(Boolean))
        rows.push(i);
      if (Array.from({ length: 8 }, (_, y) => n.has(y * 8 + i)).every(Boolean))
        cols.push(i);
    }
    for (const i of n)
      if (rows.includes(i >> 3) || cols.includes(i % 8)) n.delete(i);
    return { cells: n, lines: rows.length + cols.length };
  }
  function search(cells: Set<number>, left: string[]): Status {
    if (!left.length) return "SOLVABLE";
    const key =
      [...cells].sort((a, b) => a - b).join() + "/" + [...left].sort().join();
    const cached = cache.get(key);
    if (cached) return cached;
    for (let slot = 0; slot < left.length; slot++) {
      const id = left[slot]!,
        shape = shapeById(id);
      for (let y = 0; y <= 8 - shape.height; y++)
        for (let x = 0; x <= 8 - shape.width; x++) {
          const fit = fits(cells, id, x, y);
          if (fit === null) return "UNKNOWN";
          if (!fit) continue;
          const next = place(cells, id, x, y),
            r = search(
              next.cells,
              left.filter((_, i) => i !== slot),
            );
          if (r === "UNKNOWN") return r;
          if (r === "SOLVABLE") {
            cache.set(key, r);
            return r;
          }
        }
    }
    cache.set(key, "UNSOLVABLE");
    return "UNSOLVABLE";
  }
  const plausible = new Set(
    boundedOptions(board, tray).map(
      (p) => `${p.move.slot}:${p.move.x},${p.move.y}`,
    ),
  );
  const first: {
      move: Move;
      status: Status;
      lines: number;
      plausible: boolean;
    }[] = [],
    initialSlots = new Set<number>();
  // Immediate legality is always enumerated, even if the continuation budget ends.
  for (let slot = 0; slot < tray.length; slot++) {
    if (tray[slot]!.used) continue;
    const id = tray[slot]!.shapeId,
      shape = shapeById(id);
    for (let y = 0; y <= 8 - shape.height; y++)
      for (let x = 0; x <= 8 - shape.width; x++) {
        if (
          !shape.cells.every(([dx, dy]) => !initial.has((y + dy) * 8 + x + dx))
        )
          continue;
        initialSlots.add(slot);
        const n = place(initial, id, x, y);
        const left = tray
          .filter((s, i) => !s.used && i !== slot)
          .map((s) => s.shapeId);
        first.push({
          move: { slot, x, y },
          status: search(n.cells, left),
          lines: n.lines,
          plausible: plausible.has(`${slot}:${x},${y}`),
        });
      }
  }
  const good = first.filter((f) => f.status === "SOLVABLE"),
    bad = first.filter((f) => f.status === "UNSOLVABLE"),
    unknown = first.filter((f) => f.status === "UNKNOWN");
  return {
    status: good.length
      ? "SOLVABLE"
      : unknown.length
        ? "UNKNOWN"
        : "UNSOLVABLE",
    complete: unknown.length === 0,
    work,
    limit,
    legalFirstMoveCount: first.length,
    solvingFirstMoveCount: good.length,
    badButLegalFirstMoveCount: bad.length,
    unknownFirstMoveCount: unknown.length,
    initialSlots: initialSlots.size,
    chain:
      good.length > 0 && initialSlots.size < tray.filter((s) => !s.used).length,
    choice: good.some((f) => f.plausible) && bad.some((f) => f.plausible),
    first,
  };
}
