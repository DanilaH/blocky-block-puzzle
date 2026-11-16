import { SHAPES, random, type Board, type Move } from "./rules";
import {
  catalog,
  packagePath,
  canPlace,
  transition,
  toRows,
  WorkBudget,
} from "./director-search";

/** Original sparse starting tasks. Existing composition-v2 content is frozen. */
export const CHALLENGE_OPENINGS = [
  {
    kind: "direct-line",
    rows: [31, 1, 0, 0, 0, 0, 0, 0],
    ids: ["I3-0", "L3-1", "T4-0"],
    moves: [
      [5, 0],
      [1, 0],
      [3, 0],
    ],
  },
  {
    kind: "direct-line",
    rows: [3, 1, 1, 1, 1, 0, 0, 0],
    ids: ["I3-1", "SZ4-0", "T4-3"],
    moves: [
      [0, 5],
      [2, 0],
      [0, 1],
    ],
  },
  {
    kind: "prepare-one",
    rows: [15, 1, 0, 0, 0, 0, 0, 0],
    ids: ["I2-0", "L3-1", "T4-0"],
    moves: [
      [4, 0],
      [6, 0],
      [0, 0],
    ],
  },
  {
    kind: "prepare-two",
    rows: [3, 1, 0, 0, 0, 0, 0, 0],
    ids: ["I2-0", "L3-1", "I2-0"],
    moves: [
      [2, 0],
      [4, 0],
      [6, 0],
    ],
  },
  {
    kind: "parallel-clear",
    rows: [63, 63, 1, 0, 0, 0, 0, 0],
    ids: ["O2-0", "L3-0", "T4-2"],
    moves: [
      [6, 0],
      [0, 0],
      [3, 0],
    ],
  },
  {
    kind: "parallel-clear",
    rows: [0, 1, 127, 127, 0, 0, 0, 0],
    ids: ["I2-1", "L3-2", "SZ4-2"],
    moves: [
      [7, 2],
      [1, 1],
      [3, 1],
    ],
  },
  {
    kind: "cross-clear",
    rows: [16, 16, 24, 239, 16, 16, 16, 16],
    ids: ["S1-0", "L3-1", "T4-0"],
    moves: [
      [4, 3],
      [1, 1],
      [3, 0],
    ],
  },
  {
    kind: "space-unlock",
    rows: [0, 0, 127, 0, 0, 36, 0, 0],
    ids: ["S1-0", "O3-0", "L3-1"],
    moves: [
      [7, 2],
      [3, 2],
      [0, 4],
    ],
  },
] as const;
export type OpeningKind = (typeof CHALLENGE_OPENINGS)[number]["kind"];

function points(
  cells: readonly (readonly number[])[],
  turns: number,
  mirror = false,
) {
  let result = cells.map(([x, y]) => [mirror ? 7 - x! : x!, y!]);
  for (let n = 0; n < turns; n++) result = result.map(([x, y]) => [7 - y!, x!]);
  return result;
}
const cellKey = (cells: readonly (readonly number[])[]) =>
  cells
    .map(([x, y]) => `${x},${y}`)
    .sort()
    .join(";");
function fingerprint(text: string) {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0).toString(16);
}

/** D4 equivalence includes the first witnessed action and the whole hand. */
export function openingDecisionKey(index: number): string {
  const recipe = CHALLENGE_OPENINGS[index];
  if (!recipe) throw Error("Unknown starting task");
  const board = recipe.rows.flatMap((r, y) =>
    Array.from({ length: 8 }, (_, x) => [x, y]).filter(([x]) => r & (1 << x!)),
  );
  const shapes = recipe.ids.map((id) => SHAPES.find((s) => s.id === id)!);
  const first = shapes[0]!.cells.map(([x, y]) => [
    x + recipe.moves[0]![0]!,
    y + recipe.moves[0]![1]!,
  ]);
  const variants: string[] = [];
  for (const mirror of [false, true])
    for (let turns = 0; turns < 4; turns++) {
      const bag = shapes
        .map((s) => {
          const p = points(s.cells, turns, mirror),
            x = Math.min(...p.map((c) => c[0]!)),
            y = Math.min(...p.map((c) => c[1]!));
          return cellKey(p.map((c) => [c[0]! - x, c[1]! - y]));
        })
        .sort()
        .join("|");
      variants.push(
        `${cellKey(points(board, turns, mirror))}/${cellKey(points(first, turns, mirror))}/${bag}`,
      );
    }
  return `${recipe.kind}:${fingerprint(variants.sort()[0]!)}`;
}
export const challengeOpeningIndex = (seed: number) =>
  Math.floor(random(seed >>> 0 || 1).value * CHALLENGE_OPENINGS.length);

export function seedForChallengeOpening(
  seed: number,
  history: readonly string[] = [],
) {
  const allowed = (n: number) => {
    const key = openingDecisionKey(challengeOpeningIndex(n));
    return (
      !history.slice(-3).includes(key) &&
      key.split(":")[0] !== history.at(-1)?.split(":")[0]
    );
  };
  let next = seed >>> 0 || 1;
  for (let n = 0; n < 32; n++) {
    if (allowed(next)) return next;
    next = random(next).state;
  }
  // Known seeds cover all eight recipes; bounded even under a constant UI seed.
  for (let n = 1; n < 200000; n += 7919) if (allowed(n)) return n;
  return next;
}

export function challengeOpening(seed: number) {
  let rng = seed >>> 0 || 1;
  const roll = () => {
    const n = random(rng);
    rng = n.state;
    return n.value;
  };
  const openingId = Math.floor(roll() * CHALLENGE_OPENINGS.length),
    turns = Math.floor(roll() * 4);
  const recipe = CHALLENGE_OPENINGS[openingId]!,
    board = Array<number>(64).fill(0);
  const occupied = recipe.rows.flatMap((r, y) =>
    Array.from({ length: 8 }, (_, x) => [x, y]).filter(([x]) => r & (1 << x!)),
  );
  for (const [x, y] of points(occupied, turns))
    board[y! * 8 + x!] = (openingId % 6) + 1;
  const path = recipe.ids.map((id, i) => {
    const s = SHAPES.find((s) => s.id === id)!,
      origin = recipe.moves[i]!;
    const absolute = points(
      s.cells.map(([x, y]) => [x + origin[0]!, y + origin[1]!]),
      turns,
    );
    const x = Math.min(...absolute.map((c) => c[0]!)),
      y = Math.min(...absolute.map((c) => c[1]!));
    const key = cellKey(absolute.map((c) => [c[0]! - x, c[1]! - y]));
    const shape = SHAPES.findIndex((s) => cellKey(s.cells) === key);
    const op = catalog()[shape]?.find((p) => p.x === x && p.y === y);
    if (!op) throw Error("Starting task geometry mismatch");
    return op;
  });
  const meter = new WorkBudget(512);
  meter.ceiling = meter.limit;
  let rows = toRows(board);
  for (const op of path) {
    if (canPlace(rows, op, meter) !== true)
      throw Error("Invalid starting task");
    const next = transition(rows, op, meter);
    if (!next) throw Error("Starting task budget");
    rows = next.rows;
  }
  const shuffle = [0, 1, 2]
    .map((i) => ({ i, r: roll() }))
    .sort((a, b) => a.r - b.r)
    .map((v) => v.i);
  return {
    ...packagePath(path, shuffle),
    board: board as Board,
    rngState: rng,
    openingId,
    key: openingDecisionKey(openingId),
    kind: recipe.kind,
    work: meter.used,
  };
}
