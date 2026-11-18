import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { createServer } from "vite";
const dir = "docs/qa/director-sequences";
const data = JSON.parse(
  gunzipSync(await fs.readFile(`${dir}/evidence.json.gz`)),
);
const server = await createServer({ server: { middlewareMode: true } });
try {
  const R = await server.ssrLoadModule("/src/core/rules.ts"),
    B = await server.ssrLoadModule("/scripts/director/resilience.ts"),
    A = await server.ssrLoadModule("/scripts/difficulty/analyze.ts");
  let moves = 0,
    proofs = 0,
    guardChecks = 0;
  for (const run of data.runs) {
    let previous = data.corpus.find((p) => p.id === run.id).state;
    for (const step of run.steps) {
      assert.deepEqual({ ...previous, tray: step.before.tray }, step.before);
      if (step.choice.changed) {
        let board = step.before.board;
        const used = new Set();
        assert.ok(step.choice.proof);
        for (const m of step.choice.proof) {
          assert.ok(!used.has(m.slot));
          used.add(m.slot);
          board = R.place(
            board,
            R.shapeById(step.choice.tray[m.slot].shapeId),
            m.x,
            m.y,
          ).board;
        }
        assert.equal(used.size, 3);
        proofs++;
      }
      if (step.choice.protectedChange) {
        for (const taste of ["lines", "space"]) {
          const base = B.resilience(
              step.before.board,
              step.choice.targetTray,
              taste,
            ),
            n = B.resilience(step.before.board, step.choice.tray, taste);
          assert.ok(base.complete && n.complete);
          assert.ok(n.success + 1e-9 >= base.success);
          assert.ok(n.expectedLines + 1e-9 >= base.expectedLines);
          assert.ok(n.expectedOccupied <= base.expectedOccupied + 1e-9);
        }
        const a = A.analyze(
            step.before.board,
            step.choice.targetTray,
            50000,
          ).allClearPossible,
          b = A.analyze(
            step.before.board,
            step.choice.tray,
            50000,
          ).allClearPossible;
        assert.notEqual(a, null);
        assert.notEqual(b, null);
        assert.ok(!a || b);
        guardChecks++;
      }
      let state = structuredClone(step.before),
        lines = 0,
        clears = 0;
      for (const m of step.moves) {
        assert.ok(!state.tray[m.slot].used);
        assert.ok(
          R.fits(
            state.board,
            R.shapeById(state.tray[m.slot].shapeId),
            m.x,
            m.y,
          ),
        );
        const placement = R.place(
          state.board,
          R.shapeById(state.tray[m.slot].shapeId),
          m.x,
          m.y,
          state.tray[m.slot].color,
        );
        const out = R.applyMove(state, m, state.revision);
        state = out.state;
        lines += placement.lines;
        clears += Number(out.allClear);
        moves++;
      }
      assert.deepEqual(state, step.after);
      assert.equal(lines, step.lines);
      assert.equal(clears, step.allClears);
      previous = state;
    }
  }
  const proof = {
    episodes: data.runs.length,
    moves,
    substitutionProofs: proofs,
    protectedChecks: guardChecks,
    evidenceSha256: createHash("sha256")
      .update(await fs.readFile(`${dir}/evidence.json.gz`))
      .digest("hex"),
  };
  if (process.argv[2]) {
    const prior = JSON.parse(gunzipSync(await fs.readFile(process.argv[2])));
    assert.deepEqual(data, prior);
    proof.exactRepeat = true;
  }
  await fs.writeFile(
    `${dir}/verification.json`,
    JSON.stringify(proof, null, 2) + "\n",
  );
  console.log(proof);
} finally {
  await server.close();
}
