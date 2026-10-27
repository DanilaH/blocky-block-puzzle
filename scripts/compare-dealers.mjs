// Deterministic bounded beam search, independent of the time-budgeted hint worker.
// node scripts/compare-dealers.mjs initial-v1|solvable-v1|assist-v1 [seeds=1000] [moveLimit=150]
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
if (!["initial-v1", "solvable-v1", "assist-v1"].includes(policy))
  throw Error("policy required");
if (
  process.env.BALANCE_PLAYER &&
  !["random", "greedy", "beam3"].includes(process.env.BALANCE_PLAYER)
)
  throw Error("unknown player");
const out = new URL(
  `../${process.env.BALANCE_OUTPUT_DIR ?? "docs/qa/dealer-0.15"}/balance-${policy}${process.env.BALANCE_PLAYER ? "-" + process.env.BALANCE_PLAYER : ""}.jsonl`,
  import.meta.url,
);
fs.mkdirSync(
  new URL(
    `../${process.env.BALANCE_OUTPUT_DIR ?? "docs/qa/dealer-0.15"}/`,
    import.meta.url,
  ),
  {
    recursive: true,
  },
);
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
for (const player of process.env.BALANCE_PLAYER
  ? [process.env.BALANCE_PLAYER]
  : ["random", "beam3"])
  for (let seed = 1; seed <= seeds; seed++) {
    let g = R.newGame(seed, "balance09", policy),
      rng = seed,
      lines = 0,
      clearingMoves = 0,
      lastRefill = 0,
      nodes = 0,
      maxStreak = 0,
      dry = 0,
      maxDry = 0,
      noClearOptions = 0,
      totalOptions = 0,
      clearOptions = 0,
      dealMs = [],
      refills = 0;
    const gaps = [];
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
      const all = g.tray.flatMap((s, slot) =>
        s.used
          ? []
          : R.placements(g.board, R.shapeById(s.shapeId)).map((q) => ({
              slot,
              ...q,
            })),
      );
      const clears = all.filter(
        (m) =>
          R.place(g.board, R.shapeById(g.tray[m.slot].shapeId), m.x, m.y)
            .lines > 0,
      ).length;
      totalOptions += all.length;
      clearOptions += clears;
      noClearOptions += Number(clears === 0);
      let move;
      if (player === "beam3") {
        const s = search(g);
        move = s.move;
        nodes += s.nodes;
      } else if (player === "greedy") {
        let rank = -Infinity;
        for (const m of all) {
          const p = R.place(
            g.board,
            R.shapeById(g.tray[m.slot].shapeId),
            m.x,
            m.y,
          );
          const score =
            p.lines * 1000 + quality(p.board)[0] * 10 + quality(p.board)[1];
          if (score > rank) {
            rank = score;
            move = m;
          }
        }
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
      const started = performance.now();
      const refill = g.tray.filter((s) => s.used).length === 2,
        r = R.applyMove(g, move, g.revision);
      if (r.state.moves !== g.moves + 1) throw Error("illegal bot move");
      if (refill) {
        dealMs.push(performance.now() - started);
        refills++;
      }
      if (r.lines) {
        gaps.push(dry);
        dry = 0;
      } else {
        dry++;
        maxDry = Math.max(maxDry, dry);
      }
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
        dry,
        maxDry,
        gaps,
        noClearOptions,
        totalOptions,
        clearOptions,
        dealMs,
        refills,
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
