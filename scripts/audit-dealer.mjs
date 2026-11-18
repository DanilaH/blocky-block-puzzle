// Compare optimized production core with the committed pre-optimization version.
import fs from "node:fs";
import zlib from "node:zlib";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import ts from "typescript";
const revision = "5fa49edb5f0d23acca6aa6816651a5e5a623a1dd";
async function core(source) {
  source = source.replace(
    'import catalog from "./shapes.json";',
    `const catalog=${fs.readFileSync("src/core/shapes.json", "utf8")};`,
  );
  return import(
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
}
const before = await core(
  execFileSync("git", ["show", `${revision}:src/core/rules.ts`], {
    encoding: "utf8",
  }),
);
const after = await core(fs.readFileSync("src/core/rules.ts", "utf8"));
const corpus = JSON.parse(
  zlib.gunzipSync(fs.readFileSync("docs/qa/dealer-0.15/positions.json.gz")),
).boards;
let rng = 92173;
const rnd = () => {
  rng = after.random(rng).state;
  return rng / 4294967296;
};
const edge = [];
for (let i = 0; i < 1000; i++) {
  const density = (i % 11) / 10;
  const board = Array.from({ length: 64 }, () =>
    rnd() < density ? 1 + Math.floor(rnd() * 6) : 0,
  );
  edge.push({ board, seed: Math.floor(rnd() * 0xffffffff) || 1 });
}
// Every possible single hole, checkerboards, narrow corridor, empty and full.
for (let hole = 0; hole < 64; hole++)
  edge.push({
    board: Array.from({ length: 64 }, (_, i) => (i === hole ? 0 : 1)),
    seed: hole + 1,
  });
edge.push(
  {
    board: Array.from(
      { length: 64 },
      (_, i) => ((i % 8) + Math.floor(i / 8)) % 2,
    ),
    seed: 7,
  },
  {
    board: Array.from({ length: 64 }, (_, i) => (i % 8 === 3 ? 0 : 1)),
    seed: 13,
  },
);
let comparisons = 0,
  witnesses = 0;
for (const { board, seed } of [...corpus, ...edge])
  for (const policy of ["initial-v1", "assist-v1"]) {
    const snapshot = board.slice(),
      a = before.deal(board, seed, policy),
      b = after.deal(board, seed, policy);
    assert.deepEqual(b, a);
    assert.deepEqual(board, snapshot);
    assert.deepEqual(after.deal(board, seed, policy), b);
    const hasAny = after.SHAPES.some((s) => after.placements(board, s).length);
    assert.equal(after.hasMove(board, b.tray), hasAny);
    if (b.witness) {
      let next = board.slice();
      const used = new Set();
      for (const m of b.witness) {
        assert(!used.has(m.slot));
        used.add(m.slot);
        next = after.place(
          next,
          after.shapeById(b.tray[m.slot].shapeId),
          m.x,
          m.y,
        ).board;
      }
      assert.equal(used.size, 3);
      witnesses++;
    }
    comparisons++;
  }
const times = { before: [], after: [] };
for (let warm = 0; warm < 2; warm++)
  for (const { board, seed } of corpus) {
    before.deal(board, seed, "assist-v1");
    after.deal(board, seed, "assist-v1");
  }
for (let pass = 0; pass < 5; pass++)
  for (const { board, seed } of corpus) {
    for (const key of pass % 2 ? ["after", "before"] : ["before", "after"]) {
      const t = performance.now();
      (key === "before" ? before : after).deal(board, seed, "assist-v1");
      times[key].push(performance.now() - t);
    }
  }
const q = (a, p) =>
  a.slice().sort((a, b) => a - b)[Math.round((a.length - 1) * p)];
const result = {
  reference: revision,
  comparisons,
  witnesses,
  corpus: corpus.length,
  synthetic: edge.length,
  method:
    "Same boards and seeds; full output equivalence including RNG, fallback, witness; warmup 2000 per version; alternating version order, 5000 measurements each. Desktop Node, not Android.",
  timings: Object.fromEntries(
    Object.entries(times).map(([k, v]) => [
      k,
      {
        n: v.length,
        p50: q(v, 0.5),
        p95: q(v, 0.95),
        p99: q(v, 0.99),
        max: Math.max(...v),
      },
    ]),
  ),
};
fs.mkdirSync("docs/qa/dealer-0.16", { recursive: true });
fs.writeFileSync(
  "docs/qa/dealer-0.16/audit.json",
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result, null, 2));
