export const comboMultiplier = (streak: number) =>
  [1, 1.5, 2, 3, 4, 5][Math.max(0, Math.min(5, streak - 1))]!;
export function scoreBreakdown(
  cells: number,
  lines: number,
  streak: number,
  allClear: boolean,
  festival: boolean,
) {
  const lineBase = festival ? 50 * lines * (lines + 1) : 10 * lines ** 2;
  const combo = lines
    ? festival
      ? lineBase * (comboMultiplier(streak) - 1)
      : 5 * (streak - 1) * lines
    : 0;
  const empty = allClear ? (festival ? 1000 : 100) : 0;
  return {
    placement: cells,
    lines: lineBase,
    combo,
    empty,
    total: cells + lineBase + combo + empty,
  };
}

import catalog from "./shapes.json";
export type Cell = readonly [number, number];
export interface Shape {
  id: string;
  family: string;
  weight: number;
  cells: readonly Cell[];
  width: number;
  height: number;
}
export const SHAPES = catalog as unknown as readonly Shape[];
export const shapeById = (id: string): Shape => {
  const shape = SHAPES.find((s) => s.id === id);
  if (!shape) throw new Error("Unknown shape");
  return shape;
};
export type Board = number[];
export interface Move {
  slot: number;
  x: number;
  y: number;
}
export interface Slot {
  shapeId: string;
  used: boolean;
  color: number;
}
export type DealerVersion = "initial-v1" | "solvable-v1" | "assist-v1";
export interface GameState {
  gameId: string;
  revision: number;
  board: Board;
  tray: Slot[];
  scoringVersion?: "festival-v3";
  score: number;
  streak: number;
  rulesVersion?: "classic-v1" | "grace-v2";
  streakMisses?: number;
  moves: number;
  rngState: number;
  dealerVersion: DealerVersion;
  status: "playing" | "over";
  reviveUsed: boolean;
  assisted: boolean;
  dealerFallbacks: number;
}
export const emptyBoard = (): Board => Array<number>(64).fill(0);
export function fits(
  board: readonly number[],
  shape: Shape,
  x: number,
  y: number,
): boolean {
  return (
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    x >= 0 &&
    y >= 0 &&
    x + shape.width <= 8 &&
    y + shape.height <= 8 &&
    shape.cells.every(([dx, dy]) => board[(y + dy) * 8 + x + dx] === 0)
  );
}
export function placements(
  board: readonly number[],
  shape: Shape,
): { x: number; y: number }[] {
  const result = [];
  for (let y = 0; y <= 8 - shape.height; y++)
    for (let x = 0; x <= 8 - shape.width; x++)
      if (fits(board, shape, x, y)) result.push({ x, y });
  return result;
}
export function clearLines(board: Board): {
  board: Board;
  cells: number[];
  lines: number;
} {
  const rows: number[] = [],
    cols: number[] = [];
  for (let n = 0; n < 8; n++) {
    if (Array.from({ length: 8 }, (_, x) => board[n * 8 + x]).every(Boolean))
      rows.push(n);
    if (Array.from({ length: 8 }, (_, y) => board[y * 8 + n]).every(Boolean))
      cols.push(n);
  }
  const cells = Array.from({ length: 64 }, (_, i) => i).filter(
    (i) => rows.includes(Math.floor(i / 8)) || cols.includes(i % 8),
  );
  const next = board.slice();
  for (const i of cells) next[i] = 0;
  return { board: next, cells, lines: rows.length + cols.length };
}
export function place(
  board: Board,
  shape: Shape,
  x: number,
  y: number,
  color = 1,
) {
  if (!fits(board, shape, x, y)) throw new Error("Invalid placement");
  const next = board.slice();
  for (const [dx, dy] of shape.cells) next[(y + dy) * 8 + x + dx] = color;
  return clearLines(next);
}
export function hasMove(board: Board, tray: readonly Slot[]): boolean {
  return tray.some(
    (s) => !s.used && placements(board, shapeById(s.shapeId)).length > 0,
  );
}
// xorshift32: one uint32 is the complete state. Zero is normalized only at new-game creation.
export function random(state: number): { state: number; value: number } {
  let x = state >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return { state: x >>> 0, value: (x >>> 0) / 4294967296 };
}
function draw(state: number, allowed: readonly Shape[] = SHAPES) {
  const r = random(state);
  const total = allowed.reduce((n, s) => n + s.weight, 0);
  let target = r.value * total;
  for (const s of allowed) {
    target -= s.weight;
    if (target < 0) return { shape: s, state: r.state };
  }
  return { shape: allowed[allowed.length - 1]!, state: r.state };
}
export function proveTray(
  board: Board,
  tray: Slot[],
  budget = 5000,
): Move[] | null {
  let nodes = 0;
  function visit(b: Board, remaining: number[], path: Move[]): Move[] | null {
    if (!remaining.length) return path;
    for (const slot of remaining)
      for (const p of placements(b, shapeById(tray[slot]!.shapeId))) {
        if (++nodes > budget) return null;
        const next = place(b, shapeById(tray[slot]!.shapeId), p.x, p.y).board;
        const result = visit(
          next,
          remaining.filter((i) => i !== slot),
          [...path, { slot, ...p }],
        );
        if (result) return result;
      }
    return null;
  }
  return visit(
    board,
    [0, 1, 2].filter((i) => !tray[i]!.used),
    [],
  );
}
export function deal(
  board: Board,
  rngState: number,
  version: DealerVersion,
): {
  tray: Slot[];
  rngState: number;
  fallback: boolean;
  witness: Move[] | null;
} {
  // Experimental moderate assistance: retain the baseline unless it has no
  // immediate clear and a deterministic 35% gate opens. Never force a reward.
  if (version === "assist-v1") {
    let base = deal(board, rngState, "initial-v1");
    const rows = Array<number>(8).fill(0),
      cols = Array<number>(8).fill(0);
    for (let i = 0; i < 64; i++)
      if (board[i]) {
        rows[Math.floor(i / 8)]!++;
        cols[i % 8]!++;
      }
    // Count occupied cells, without allocating/clearing a board for every probe.
    // Cache each orientation across alternatives; board and geometry stay fixed.
    const clearByShape = new Map<string, boolean>();
    const offersClear = (tray: Slot[]) =>
      tray.some((s) => {
        const cached = clearByShape.get(s.shapeId);
        if (cached !== undefined) return cached;
        const shape = shapeById(s.shapeId);
        const sr = Array<number>(shape.height).fill(0),
          sc = Array<number>(shape.width).fill(0);
        for (const [x, y] of shape.cells) {
          sr[y]!++;
          sc[x]!++;
        }
        const found = placements(board, shape).some(
          (p) =>
            rows.includes(8) ||
            cols.includes(8) ||
            sr.some((n, y) => rows[p.y + y]! + n === 8) ||
            sc.some((n, x) => cols[p.x + x]! + n === 8),
        );
        clearByShape.set(s.shapeId, found);
        return found;
      });
    if (!base.tray.length || offersClear(base.tray)) return base;
    const gate = random(base.rngState);
    base = { ...base, rngState: gate.state };
    if (gate.value >= 0.35) return base;
    let nextRng = gate.state;
    for (let attempt = 0; attempt < 3; attempt++) {
      const candidate = deal(board, nextRng, "initial-v1");
      nextRng = candidate.rngState;
      if (!offersClear(candidate.tray)) continue;
      const witness = proveTray(board, candidate.tray, 800);
      if (witness) return { ...candidate, witness };
    }
    return { ...base, rngState: nextRng };
  }
  const allowed = SHAPES.filter((s) => placements(board, s).length);
  if (!allowed.length)
    return { tray: [], rngState, fallback: false, witness: null };
  function triple(): Slot[] {
    return [0, 1, 2].map(() => {
      const d = draw(rngState);
      rngState = d.state;
      return {
        shapeId: d.shape.id,
        used: false,
        color: (SHAPES.indexOf(d.shape) % 6) + 1,
      };
    });
  }
  for (let attempt = 0; attempt < 32; attempt++) {
    const tray = triple();
    if (!hasMove(board, tray)) continue;
    const witness = version === "solvable-v1" ? proveTray(board, tray) : null;
    if (version === "initial-v1" || witness)
      return { tray, rngState, fallback: false, witness };
  }
  const first = draw(rngState, allowed);
  rngState = first.state;
  const tray: Slot[] = [
    {
      shapeId: first.shape.id,
      used: false,
      color: (SHAPES.indexOf(first.shape) % 6) + 1,
    },
  ];
  for (let i = 1; i < 3; i++) {
    const d = draw(rngState);
    rngState = d.state;
    tray.push({
      shapeId: d.shape.id,
      used: false,
      color: (SHAPES.indexOf(d.shape) % 6) + 1,
    });
  }
  return { tray, rngState, fallback: true, witness: null };
}
export function newGame(
  seed: number,
  gameId: string,
  dealerVersion: DealerVersion = "initial-v1",
): GameState {
  const board = emptyBoard(),
    d = deal(board, seed >>> 0 || 1, dealerVersion);
  return {
    gameId,
    revision: 0,
    board,
    tray: d.tray,
    score: 0,
    streak: 0,
    rulesVersion: "grace-v2",
    streakMisses: 0,
    moves: 0,
    rngState: d.rngState,
    dealerVersion,
    status: "playing",
    reviveUsed: false,
    assisted: false,
    dealerFallbacks: 0,
  };
}
export function applyMove(
  state: GameState,
  move: Move,
  revision: number,
): {
  state: GameState;
  cells: number[];
  lines: number;
  points: number;
  allClear: boolean;
  breakdown: ReturnType<typeof scoreBreakdown>;
} | null {
  const slot = state.tray[move.slot];
  if (
    state.status !== "playing" ||
    revision !== state.revision ||
    !slot ||
    slot.used
  )
    return null;
  const shape = shapeById(slot.shapeId);
  if (!fits(state.board, shape, move.x, move.y)) return null;
  const placed = place(state.board, shape, move.x, move.y, slot.color),
    misses = placed.lines ? 0 : (state.streakMisses ?? 0) + 1,
    streak = placed.lines
      ? state.streak + 1
      : state.rulesVersion === "grace-v2" && misses <= 2
        ? state.streak
        : 0;
  const allClear = placed.board.every((c) => c === 0),
    breakdown = scoreBreakdown(
      shape.cells.length,
      placed.lines,
      streak,
      allClear,
      state.scoringVersion === "festival-v3",
    ),
    points = breakdown.total;
  let tray = state.tray.map((s, i) => ({
      ...s,
      used: i === move.slot || s.used,
    })),
    rngState = state.rngState,
    dealerFallbacks = state.dealerFallbacks;
  if (tray.every((s) => s.used)) {
    const d = deal(placed.board, rngState, state.dealerVersion);
    tray = d.tray;
    rngState = d.rngState;
    dealerFallbacks += Number(d.fallback);
  }
  return {
    state: {
      ...state,
      revision: state.revision + 1,
      board: placed.board,
      tray,
      rngState,
      dealerFallbacks,
      score: state.score + points,
      streak,
      streakMisses: streak ? misses : 0,
      moves: state.moves + 1,
      status: hasMove(placed.board, tray) ? "playing" : "over",
    },
    cells: placed.cells,
    lines: placed.lines,
    points,
    breakdown,
    allClear,
  };
}
