// Same legal moves/RNG for both rules. Measures score inflation, not human fun.
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
const rows = [];
for (let seed = 1; seed <= 200; seed++) {
  let a = R.newGame(seed, "compare"),
    b = { ...structuredClone(a), scoringVersion: "festival-v3" };
  let totalBonus = 0, emptyBonus = 0;
  let clears = 0,
    maxA = 0,
    maxB = 0;
  while (a.status === "playing" && a.moves < 150) {
    const opts = a.tray.flatMap((s, slot) =>
      s.used
        ? []
        : R.placements(a.board, R.shapeById(s.shapeId)).map((m) => ({
            slot,
            ...m,
          })),
    );
    // Greedy clears, then open space; equal tie breaking for both versions.
    let best = null,
      rank = -Infinity;
    for (const m of opts) {
      const q = R.place(a.board, R.shapeById(a.tray[m.slot].shapeId), m.x, m.y);
      const v = q.lines * 100 + q.board.filter((x) => !x).length;
      if (v > rank) {
        rank = v;
        best = m;
      }
    }
    const ea = R.applyMove(a, best, a.revision),
      eb = R.applyMove(b, best, b.revision);
    totalBonus += eb.breakdown.combo; emptyBonus += eb.breakdown.empty;
    a = ea.state;
    b = eb.state;
    clears += Number(ea.lines > 0);
    maxA = Math.max(maxA, a.streak);
    maxB = Math.max(maxB, b.streak);
    if (
      JSON.stringify(a.board) !== JSON.stringify(b.board) ||
      JSON.stringify(a.tray) !== JSON.stringify(b.tray) ||
      a.rngState !== b.rngState
    )
      throw Error("gameplay divergence");
  }
  rows.push({
    seed, totalBonus, emptyBonus,
    moves: a.moves,
    censored: a.status === "playing",
    clears,
    oldScore: a.score,
    newScore: b.score,
    oldMax: maxA,
    newMax: maxB,
  });
}
fs.mkdirSync("docs/qa/feel-0.19", { recursive: true });
fs.writeFileSync(
  "docs/qa/feel-0.19/score-comparison.json",
  JSON.stringify(rows, null, 2),
);
const avg = (k) => rows.reduce((s, r) => s + r[k], 0) / rows.length;
console.log(
  JSON.stringify({
    games: rows.length,
    censored: rows.filter((r) => r.censored).length,
    meanMoves: avg("moves"),
    meanClears: avg("clears"),
    meanOldScore: avg("oldScore"),
    meanNewScore: avg("newScore"),
    meanOldMax: avg("oldMax"),
    meanNewMax: avg("newMax"),
  }),
);
