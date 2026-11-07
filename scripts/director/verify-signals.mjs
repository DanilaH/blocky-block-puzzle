import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { createServer } from "vite";
const dir = process.env.SIGNALS_DIR || "docs/qa/director-signals",
  data = JSON.parse(gunzipSync(await fs.readFile(`${dir}/evidence.json.gz`)));
const server = await createServer({ server: { middlewareMode: true } });
try {
  const R = await server.ssrLoadModule("/src/core/rules.ts");
  let moves = 0,
    statuses = 0,
    witnesses = 0;
  function check(board, tray, a) {
    if (a.witness) {
      let b = board;
      const used = new Set(tray.flatMap((s, i) => (s.used ? [i] : [])));
      for (const m of a.witness) {
        assert.ok(!used.has(m.slot));
        used.add(m.slot);
        b = R.place(b, R.shapeById(tray[m.slot].shapeId), m.x, m.y).board;
      }
      assert.equal(used.size, tray.length);
      witnesses++;
    }
    for (const f of a.first) {
      if (f.status === "unknown") continue;
      const b = R.place(
        board,
        R.shapeById(tray[f.move.slot].shapeId),
        f.move.x,
        f.move.y,
      ).board;
      const t = tray.map((s, i) => ({
        ...s,
        used: s.used || i === f.move.slot,
      }));
      // At most two shapes remain: <=2*(64+64*64)=8320 nodes, below 20000.
      const proof = R.proveTray(b, t, 20000);
      assert.equal(Boolean(proof), f.status === "solvable");
      statuses++;
    }
  }
  for (const r of data.records) {
    const p = data.corpus.find((p) => p.id === r.id);
    const bounds = (first) =>
      first.length
        ? [
            first.filter((f) => f.status === "unsolvable").length /
              first.length,
            first.filter((f) => f.status !== "solvable").length / first.length,
          ]
        : [0, 0];
    const first = bounds(r.analysis.first),
      maxLines = Math.max(0, ...r.analysis.first.map((f) => f.immediateLines));
    assert.deepEqual(r.signals.first, first);
    assert.deepEqual(
      r.signals.tempt,
      maxLines
        ? bounds(r.analysis.first.filter((f) => f.immediateLines === maxLines))
        : [0, 0],
    );
    for (const c of r.children)
      assert.deepEqual(c.bounds, bounds(c.analysis.first));
    const second = r.children.length
      ? [
          r.children.reduce((n, c) => n + c.bounds[0], 0) / r.children.length,
          r.children.reduce((n, c) => n + c.bounds[1], 0) / r.children.length,
        ]
      : [0, 1];
    assert.deepEqual(r.signals.second, second);
    assert.deepEqual(r.signals.combined, [
      Math.max(first[0], r.signals.tempt[0], second[0]),
      Math.max(first[1], r.signals.tempt[1], second[1]),
    ]);

    check(p.state.board, p.state.tray, r.analysis);
    for (const c of r.children) check(c.board, c.tray, c.analysis);
    for (const o of r.outcomes) {
      let b = p.state.board;
      const used = new Set();
      for (const m of o.moves) {
        assert.ok(!used.has(m.slot));
        used.add(m.slot);
        b = R.place(
          b,
          R.shapeById(p.state.tray[m.slot].shapeId),
          m.x,
          m.y,
        ).board;
        moves++;
      }
      assert.equal(used.size === 3, o.success);
      assert.equal(b.filter(Boolean).length, o.endOccupied);
    }
  }
  const result = {
    positions: data.corpus.length,
    replays: data.records.reduce((n, r) => n + r.outcomes.length, 0),
    moves,
    statuses,
    witnesses,
    evidenceSha256: createHash("sha256")
      .update(await fs.readFile(`${dir}/evidence.json.gz`))
      .digest("hex"),
  };
  if (process.argv[2]) {
    const a = JSON.parse(gunzipSync(await fs.readFile(process.argv[2])));
    const clean = (d) => ({
      ...d,
      records: d.records.map(({ timing, ...r }) => r),
    });
    assert.deepEqual(clean(a), clean(data));
    result.exactRepeatExcludingTimings = true;
  }
  await fs.writeFile(
    `${dir}/verification.json`,
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(result);
} finally {
  await server.close();
}
