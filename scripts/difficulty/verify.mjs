import { createServer } from "vite";
import fs from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import assert from "node:assert/strict";
const root = process.argv[2] || "docs/qa/difficulty-package1";
const server = await createServer({ server: { middlewareMode: true } });
let witnesses = 0,
  playerTraces = 0,
  metricReplays = 0;
try {
  const R = await server.ssrLoadModule("/src/core/rules.ts"),
    A = await server.ssrLoadModule("/scripts/difficulty/analyze.ts");
  for (const dir of [root, root + "/holdout"]) {
    const positions = JSON.parse(
      gunzipSync(await fs.readFile(dir + "/positions.json.gz")).toString(),
    ).positions;
    const results = JSON.parse(
      gunzipSync(await fs.readFile(dir + "/results.json.gz")).toString(),
    ).results;
    function replay(p, r, moves) {
      let board = [...p.state.board],
        tray = structuredClone(r.tray),
        lines = 0;
      for (const m of moves) {
        assert(!tray[m.slot].used);
        const s = R.shapeById(tray[m.slot].shapeId);
        assert(R.fits(board, s, m.x, m.y));
        const v = R.place(board, s, m.x, m.y);
        board = v.board;
        lines += v.lines;
        tray[m.slot].used = true;
      }
      return { board, tray, lines };
    }
    for (const [i, r] of results.entries()) {
      const p = positions.find((p) => p.id === r.id);
      if (r.witness) {
        const v = replay(p, r, r.witness);
        assert(v.tray.every((s) => s.used));
        witnesses++;
      }
      for (const outcome of Object.values(r.outcomes)) {
        const v = replay(p, r, outcome.moves);
        assert.equal(v.lines, outcome.lines);
        assert.equal(v.board.filter(Boolean).length, outcome.endOccupied);
        assert.equal(
          v.tray.every((s) => s.used),
          outcome.success,
        );
        playerTraces++;
      }
      if (i % 17 === 0) {
        const { first, witness, ...metrics } = A.analyze(
          p.state.board,
          r.tray,
          r.metrics.budget,
        );
        assert.deepEqual(metrics, r.metrics);
        assert.deepEqual(witness, r.witness);
        assert.deepEqual(first, r.first);
        metricReplays++;
      }
    }
  }
  const result = { witnesses, playerTraces, metricReplays, passed: true };
  await fs.writeFile(
    root + "/verification.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result));
} finally {
  await server.close();
}
