// Deterministic bounded beam search, independent of the time-budgeted hint worker.
// node scripts/balance.mjs initial-v1|solvable-v1 [seeds=1000] [moveLimit=150]
import fs from "node:fs";
import ts from "typescript";
const source = fs
  .readFileSync(new URL("../src/core/rules.ts", import.meta.url), "utf8")
  .replace(
    'import catalog from "./shapes.json";',
    `const catalog = ${fs.readFileSync(new URL("../src/core/shapes.json", import.meta.url), "utf8")};`,
  );
const R = await import(
  "data:text/javascript;base64," +
    Buffer.from(
      ts.transpileModule(source, {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
        },
      }).outputText,
    ).toString("base64")
);
const policy = process.argv[2],
  seeds = Number(process.argv[3] ?? 1000),
  limit = Number(process.argv[4] ?? 150),
  beamWidth = 3;
if (!["initial-v1", "solvable-v1"].includes(policy))
  throw Error("policy required");
const out = new URL(
  `../docs/qa/feel-0.9/balance-${policy}.jsonl`,
  import.meta.url,
);
fs.mkdirSync(new URL("../docs/qa/feel-0.9/", import.meta.url), {
  recursive: true,
});
fs.writeFileSync(out, "");
function quality(board) {
  let empty = 0,
    isolated = 0,
    edges = 0;
  for (let i = 0; i < 64; i++)
    if (!board[i]) {
      empty++;
      const near =
        (i % 8 > 0 && !board[i - 1] ? 1 : 0) +
        (i % 8 < 7 && !board[i + 1] ? 1 : 0) +
        (i >= 8 && !board[i - 8] ? 1 : 0) +
        (i < 56 && !board[i + 8] ? 1 : 0);
      if (!near) isolated++;
      edges += near;
    }
  return [empty, -isolated, edges];
}
const compare = (a, b) => {
  for (let i = 0; i < a.rank.length; i++)
    if (a.rank[i] !== b.rank[i]) return b.rank[i] - a.rank[i];
  return a.order - b.order;
};
function search(g) {
  let beam = [
      {
        board: g.board,
        left: g.tray.map((s, i) => (s.used ? -1 : i)).filter((i) => i >= 0),
        first: null,
        lines: 0,
        rank: [0, 0, 0, 0, 0],
        order: 0,
      },
    ],
    best = null,
    nodes = 0,
    order = 0;
  for (let depth = 1; depth <= 3; depth++) {
    const next = [];
    for (const n of beam)
      for (const slot of n.left) {
        const shape = R.shapeById(g.tray[slot].shapeId);
        for (const q of R.placements(n.board, shape)) {
          const p = R.place(n.board, shape, q.x, q.y),
            lines = n.lines + p.lines;
          nodes++;
          next.push({
            board: p.board,
            left: n.left.filter((i) => i !== slot),
            first: n.first ?? { slot, ...q },
            lines,
            rank: [depth, lines, ...quality(p.board)],
            order: order++,
          });
        }
      }
    if (!next.length) break;
    next.sort(compare);
    beam = next.slice(0, beamWidth);
    best = beam[0];
  }
  return { move: best?.first, nodes };
}
const start = performance.now();
for (const player of ["random", "beam3"])
  for (let seed = 1; seed <= seeds; seed++) {
    let g = R.newGame(seed, "balance09", policy),
      rng = seed,
      lines = 0,
      clearingMoves = 0,
      lastRefill = 0,
      nodes = 0,
      maxStreak = 0;
    const sizes = {},
      families = {};
    function recordTray() {
      for (const s of g.tray) {
        const shape = R.shapeById(s.shapeId);
        sizes[shape.cells.length] = (sizes[shape.cells.length] ?? 0) + 1;
        families[shape.family] = (families[shape.family] ?? 0) + 1;
      }
    }
    recordTray();
    while (g.status === "playing" && g.moves < limit) {
      let move;
      if (player === "beam3") {
        const s = search(g);
        move = s.move;
        nodes += s.nodes;
      } else {
        const options = g.tray.flatMap((s, slot) =>
          s.used
            ? []
            : R.placements(g.board, R.shapeById(s.shapeId)).map((q) => ({
                slot,
                ...q,
              })),
        );
        rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
        move = options[rng % options.length];
      }
      if (!move) throw Error(`playing without move ${seed}`);
      const refill = g.tray.filter((s) => s.used).length === 2,
        r = R.applyMove(g, move, g.revision);
      if (r.state.moves !== g.moves + 1) throw Error("illegal bot move");
      g = r.state;
      lines += r.lines;
      clearingMoves += Number(r.lines > 0);
      maxStreak = Math.max(maxStreak, g.streak);
      if (refill) {
        lastRefill = g.moves;
        recordTray();
      }
    }
    fs.appendFileSync(
      out,
      JSON.stringify({
        policy,
        player,
        seed,
        limit,
        moves: g.moves,
        score: g.score,
        lines,
        clearingMoves,
        maxStreak,
        over: g.status === "over",
        movesSinceRefill: g.moves - lastRefill,
        fallbacks: g.dealerFallbacks,
        nodes,
        sizes,
        families,
      }) + "\n",
    );
    if (seed % 100 === 0)
      console.log(
        policy,
        player,
        seed,
        "elapsed seconds",
        Math.round((performance.now() - start) / 1000),
      );
  }
