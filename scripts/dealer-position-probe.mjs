import fs from "node:fs";
import ts from "typescript";
const source = fs
  .readFileSync("src/core/rules.ts", "utf8")
  .replace(
    'import catalog from "./shapes.json";',
    `const catalog=${fs.readFileSync("src/core/shapes.json", "utf8")};`,
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
const boards = [];
for (let seed = 1; boards.length < 1000; seed++) {
  let g = R.newGame(seed, "corpus"),
    rng = seed;
  while (g.status === "playing" && g.moves < 100 && boards.length < 1000) {
    if (g.moves > 0 && g.moves % 3 === 0)
      boards.push({
        board: g.board.slice(),
        seed: Math.imul(boards.length + 1, 2654435761) >>> 0 || 1,
      });
    const opts = g.tray.flatMap((s, slot) =>
      s.used
        ? []
        : R.placements(g.board, R.shapeById(s.shapeId)).map((m) => ({
            slot,
            ...m,
          })),
    );
    let m;
    if (seed % 2) {
      rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
      m = opts[rng % opts.length];
    } else {
      let rank = -Infinity;
      for (const x of opts) {
        const p = R.place(
          g.board,
          R.shapeById(g.tray[x.slot].shapeId),
          x.x,
          x.y,
        );
        let v = p.lines * 100 + p.board.filter((c) => !c).length;
        if (v > rank) {
          rank = v;
          m = x;
        }
      }
    }
    g = R.applyMove(g, m, g.revision).state;
  }
}
const rows = [];
for (const [index, b] of boards.entries())
  for (const policy of ["initial-v1", "solvable-v1", "assist-v1"]) {
    const t = performance.now(),
      d = R.deal(b.board, b.seed, policy),
      ms = performance.now() - t;
    let legal = 0,
      clears = 0,
      slots = 0;
    for (const s of d.tray) {
      let found = false;
      for (const p of R.placements(b.board, R.shapeById(s.shapeId))) {
        legal++;
        if (R.place(b.board, R.shapeById(s.shapeId), p.x, p.y).lines) {
          clears++;
          found = true;
        }
      }
      slots += Number(found);
    }
    rows.push({
      index,
      policy,
      occupied: b.board.filter(Boolean).length,
      legal,
      clears,
      clearingSlots: slots,
      witnessFound: !!R.proveTray(b.board, d.tray),
      fallback: d.fallback,
      ms,
    });
  }
fs.writeFileSync(
  "docs/qa/dealer-0.15/positions.json",
  JSON.stringify({
    method:
      "1000 baseline refill positions, alternating random/greedy source games; same board and seed per policy; proof budget 5000, null is unknown",
    boards,
    rows,
  }),
);
console.log("1000 positions x 3 policies complete");
