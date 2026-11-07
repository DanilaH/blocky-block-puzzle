import fs from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "vite";
const dir = "docs/qa/dealer-antirepeat",
  bytes = await fs.readFile(`${dir}/evidence.json.gz`),
  data = JSON.parse(gunzipSync(bytes));
const server = await createServer({ server: { middlewareMode: true } });
try {
  const R = await server.ssrLoadModule("/src/core/rules.ts"),
    N = await server.ssrLoadModule("/scripts/director/antirepeat.ts"),
    H = await server.ssrLoadModule("/src/core/rhythm.ts");
  const bag = (t) =>
    t
      .map((s) => R.shapeById(s.shapeId).family)
      .sort()
      .join(",");
  let moves = 0,
    recomputed = 0;
  for (const run of data.runs) {
    let g = R.newGame(run.seed, "antirepeat-" + run.seed, "flow-v4"),
      lines = 0,
      clears = 0,
      repeats = 0,
      deals = 0,
      changed = 0;
    const history = [];
    for (const m of run.moves) {
      if (g.tray.every((s) => !s.used)) {
        const k = bag(g.tray);
        repeats += Number(history.slice(-4).includes(k));
        deals++;
        history.push(k);
      }
      assert.ok(!g.tray[m.slot].used);
      assert.ok(R.fits(g.board, R.shapeById(g.tray[m.slot].shapeId), m.x, m.y));
      const placed = R.place(
          g.board,
          R.shapeById(g.tray[m.slot].shapeId),
          m.x,
          m.y,
          g.tray[m.slot].color,
        ),
        v = R.applyMove(g, m, g.revision);
      lines += placed.lines;
      clears += Number(v.allClear);
      let next = v.state;
      if (
        run.mode === "antirepeat" &&
        g.tray.filter((s) => !s.used).length === 1
      ) {
        const rhythm = H.advanceRhythmV4(
          g.rhythm,
          placed.board,
          placed.lines,
          v.allClear,
          R.random(g.rngState).value,
        );
        const c = N.antiRepeatDeal(
          placed.board,
          g.rngState,
          g.moves + 1,
          bag(g.tray),
          rhythm,
        );
        recomputed++;
        if (c) {
          changed += Number(c.changed);
          next = {
            ...next,
            tray: c.tray,
            rngState: c.rngState,
            rhythm: {
              ...next.rhythm,
              recentBags: [
                ...(next.rhythm.recentBags ?? []).slice(0, -1),
                bag(c.tray),
              ],
            },
            status: R.hasMove(next.board, c.tray) ? "playing" : "over",
          };
        }
      }
      g = next;
      moves++;
    }
    assert.deepEqual(g, run.final);
    assert.equal(lines, run.lines);
    assert.equal(clears, run.clears);
    assert.equal(repeats, run.repeats);
    assert.equal(changed, run.changed);
    assert.equal(deals, run.deals);
  }
  const v = {
    runs: data.runs.length,
    moves,
    recomputed,
    exactReplay: true,
    evidenceSha256: createHash("sha256").update(bytes).digest("hex"),
  };
  await fs.writeFile(
    `${dir}/verification.json`,
    JSON.stringify(v, null, 2) + "\n",
  );
  console.log(v);
} finally {
  await server.close();
}
