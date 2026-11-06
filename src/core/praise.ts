import {
  fits,
  place,
  shapeById,
  SHAPES,
  type GameState,
  type Move,
  type Board,
} from "./rules";
export type RankedMove = { move: Move; rank: number[] };
export type PraiseResult = {
  gameId: string;
  revision: number;
  depth: number;
  choices: RankedMove[];
};
const compare = (a: number[], b: number[]) => {
  for (let i = 0; i < a.length; i++) {
    const d = a[i]! - b[i]!;
    if (d) return d;
  }
  return 0;
};
// Only fully completed iterations are published: a cut-off never invents a winner.
export function rankMoves(game: GameState, budget = 350): PraiseResult {
  const result: PraiseResult = {
    gameId: game.gameId,
    revision: game.revision,
    depth: 0,
    choices: [],
  };
  if (game.board.filter(Boolean).length < 12) return result;
  const until = performance.now() + budget;
  let nodes = 0;
  const left = game.tray.map((s, i) => (s.used ? -1 : i)).filter((i) => i >= 0);
  const roots: Move[] = [];
  for (const slot of left) {
    const s = shapeById(game.tray[slot]!.shapeId);
    for (let y = 0; y <= 8 - s.height; y++)
      for (let x = 0; x <= 8 - s.width; x++)
        if (fits(game.board, s, x, y)) roots.push({ slot, x, y });
  }
  if (roots.length < 2) return result;
  const cache = new Map<string, number[]>();
  const check = () => {
    if (++nodes > 3000000 || performance.now() > until)
      throw new Error("budget");
  };
  function quality(b: Board) {
    const key = b.map((x) => (x ? 1 : 0)).join("");
    const cached = cache.get(key);
    if (cached) return cached;
    let mobility = 0,
      holes = 0;
    for (const s of SHAPES)
      for (let y = 0; y <= 8 - s.height; y++)
        for (let x = 0; x <= 8 - s.width; x++) {
          check();
          if (fits(b, s, x, y)) mobility++;
        }
    for (let i = 0; i < 64; i++)
      if (
        !b[i] &&
        !(
          (i % 8 > 0 && !b[i - 1]) ||
          (i % 8 < 7 && !b[i + 1]) ||
          (i >= 8 && !b[i - 8]) ||
          (i < 56 && !b[i + 8])
        )
      )
        holes++;
    const q = [mobility, -holes];
    if (cache.size < 2048) cache.set(key, q);
    return q;
  }
  function search(
    b: Board,
    slots: number[],
    depth: number,
    placed: number,
    lines: number,
  ): number[] {
    check();
    let best = [placed, lines, ...quality(b)];
    if (!depth) return best;
    for (const slot of slots) {
      const s = shapeById(game.tray[slot]!.shapeId);
      for (let y = 0; y <= 8 - s.height; y++)
        for (let x = 0; x <= 8 - s.width; x++) {
          check();
          if (!fits(b, s, x, y)) continue;
          const p = place(b, s, x, y);
          const q = search(
            p.board,
            slots.filter((i) => i !== slot),
            depth - 1,
            placed + 1,
            lines + p.lines,
          );
          if (compare(q, best) > 0) best = q;
        }
    }
    return best;
  }
  for (let depth = 1; depth <= left.length; depth++) {
    try {
      const choices = roots.map((move) => {
        const p = place(
          game.board,
          shapeById(game.tray[move.slot]!.shapeId),
          move.x,
          move.y,
        );
        return {
          move,
          rank: search(
            p.board,
            left.filter((i) => i !== move.slot),
            depth - 1,
            1,
            p.lines,
          ),
        };
      });
      choices.sort((a, b) => compare(b.rank, a.rank));
      result.depth = depth;
      result.choices = choices;
    } catch {
      break;
    }
  }
  return result;
}
export function praiseFor(
  result: PraiseResult | null,
  game: GameState,
  move: Move,
): "excellent" | "good" | null {
  if (
    !result ||
    result.gameId !== game.gameId ||
    result.revision !== game.revision ||
    !result.depth
  )
    return null;
  const best = result.choices[0];
  const choice = result.choices.find(
    (c) =>
      c.move.slot === move.slot && c.move.x === move.x && c.move.y === move.y,
  );
  if (!best || !choice || result.choices.length < 2) return null;
  // Broad ties on obvious boards are not achievements; don't flood every move with praise.
  const tied = result.choices.filter(
    (c) => compare(c.rank, best.rank) === 0,
  ).length;
  if (tied > Math.max(2, result.choices.length * 0.2)) return null;
  if (compare(choice.rank, best.rank) === 0) return "excellent";
  if (
    choice.rank[0] === best.rank[0] &&
    choice.rank[1] === best.rank[1] &&
    choice.rank[2]! >= best.rank[2]! * 0.97 &&
    choice.rank[3]! >= best.rank[3]! - 1
  )
    return "good";
  return null;
}
