import {
  SHAPES,
  fits,
  place,
  shapeById,
  type Board,
  type GameState,
  type Move,
} from "./rules";
export interface HintResult {
  gameId: string;
  revision: number;
  move: Move | null;
  lines: number;
  diagnostics: {
    nodes: number;
    checks: number;
    cacheHits: number;
    elapsedMs: number;
    cutoff: boolean;
  };
}
export function findHint(
  game: GameState,
  budgetMs = 180,
  maxNodes = 100000,
): HintResult {
  const start = performance.now(),
    deadline = start + budgetMs;
  let nodes = 0,
    checks = 0,
    cacheHits = 0,
    cutoff = false;
  const cache = new Map<string, [number, number]>();
  const remaining = game.tray
    .map((s, i) => (s.used ? -1 : i))
    .filter((i) => i >= 0)
    .sort(
      (a, b) =>
        game.tray[a]!.shapeId.localeCompare(game.tray[b]!.shapeId) || a - b,
    );
  const expired = () => nodes >= maxNodes || performance.now() >= deadline;
  let best: Move[] = [];
  let bestRank = [0, -1, -1, -65];
  function evaluate(board: Board): [number, number] | null {
    const key = board.map((x) => (x ? 1 : 0)).join("");
    const cached = cache.get(key);
    if (cached) {
      cacheHits++;
      return cached;
    }
    let mobility = 0,
      isolated = 0;
    for (const shape of SHAPES)
      for (let y = 0; y <= 8 - shape.height; y++)
        for (let x = 0; x <= 8 - shape.width; x++) {
          if ((checks++ & 127) === 0 && expired()) {
            cutoff = true;
            return null;
          }
          if (fits(board, shape, x, y)) mobility++;
        }
    for (let i = 0; i < 64; i++)
      if (
        !board[i] &&
        !(
          (i % 8 > 0 && !board[i - 1]) ||
          (i % 8 < 7 && !board[i + 1]) ||
          (i >= 8 && !board[i - 8]) ||
          (i < 56 && !board[i + 8])
        )
      )
        isolated++;
    const value: [number, number] = [mobility, -isolated];
    if (cache.size < 2048) cache.set(key, value);
    return value;
  }
  function visit(
    board: Board,
    left: number[],
    path: Move[],
    lines: number,
  ): void {
    // Score every prefix: a dead end can still be the best available sequence.
    if (path.length > 0 && path.length >= bestRank[0]!) {
      const tail = evaluate(board);
      if (!tail) return;
      const rank = [path.length, lines, ...tail];
      const diff = rank.findIndex((v, i) => v !== bestRank[i]);
      if (diff >= 0 && rank[diff]! > bestRank[diff]!) {
        bestRank = rank;
        best = path;
      }
    }
    if (!left.length) return;
    for (const slot of left) {
      const shape = shapeById(game.tray[slot]!.shapeId);
      for (let y = 0; y <= 8 - shape.height; y++)
        for (let x = 0; x <= 8 - shape.width; x++) {
          if (expired()) {
            cutoff = true;
            return;
          }
          checks++;
          if (!fits(board, shape, x, y)) continue;
          nodes++;
          const p = place(board, shape, x, y);
          visit(
            p.board,
            left.filter((i) => i !== slot),
            [...path, { slot, x, y }],
            lines + p.lines,
          );
          if (cutoff) return;
        }
    }
  }
  // Guaranteed legal fallback does not depend on completing the expensive evaluator.
  fallback: for (const slot of remaining) {
    const shape = shapeById(game.tray[slot]!.shapeId);
    for (let y = 0; y <= 8 - shape.height; y++)
      for (let x = 0; x <= 8 - shape.width; x++)
        if (fits(game.board, shape, x, y)) {
          best = [{ slot, x, y }];
          break fallback;
        }
  }
  if (best.length) visit(game.board, remaining, [], 0);
  const move = best[0] ?? null;
  const lines = move
    ? place(
        game.board,
        shapeById(game.tray[move.slot]!.shapeId),
        move.x,
        move.y,
      ).lines
    : 0;
  return {
    gameId: game.gameId,
    revision: game.revision,
    move,
    lines,
    diagnostics: {
      nodes,
      checks,
      cacheHits,
      elapsedMs: performance.now() - start,
      cutoff,
    },
  };
}
