import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { createServer } from "vite";
import { overlap } from "./actuator-pool.mjs";
const dir = "docs/qa/director-targeted";
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
    const origin = data.corpus.find((p) => p.id === run.id);
    let previous = origin.state,
      history = structuredClone(origin.history),
      lastHelp = -3,
      helpCount = 0;
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
      assert.deepEqual(previous.tray, step.choice.baseTray);
      const baseModels = ["lines", "space"].map((t) =>
        B.resilience(previous.board, previous.tray, t),
      );
      const risk = baseModels.every((m) => m.complete)
        ? Math.min(...baseModels.map((m) => m.success))
        : null;
      assert.equal(step.choice.risky, risk !== null && risk <= 0.9);
      assert.equal(
        step.choice.eligible,
        step.choice.risky && step.step - lastHelp >= 3,
      );
      if (step.choice.changed) {
        assert.ok(run.mode !== "baseline" && step.choice.eligible);
        const models = ["lines", "space"].map((t) =>
          B.resilience(previous.board, step.choice.tray, t),
        );
        assert.ok(
          models.every(
            (m, i) => m.complete && m.success + 1e-9 >= baseModels[i].success,
          ),
        );
        assert.ok(
          Math.min(...models.map((m) => m.success)) >= risk + 0.05 - 1e-9,
        );
        lastHelp = step.step;
        helpCount++;
        assert.ok(helpCount <= 2);
        if (run.mode === "risk-guarded") {
          const cells = (t) =>
            t.reduce((n, s) => n + R.shapeById(s.shapeId).cells.length, 0);
          assert.ok(cells(step.choice.tray) >= 0.9 * cells(previous.tray));
          assert.ok(
            overlap(step.choice.tray, history) <=
              overlap(previous.tray, history) + 0.05 + 1e-9,
          );
          assert.ok(
            models.every(
              (m, i) =>
                m.expectedLines + 1e-9 >= 0.95 * baseModels[i].expectedLines,
            ),
          );
          const a = A.analyze(
              previous.board,
              previous.tray,
              50000,
            ).allClearPossible,
            b = A.analyze(
              previous.board,
              step.choice.tray,
              50000,
            ).allClearPossible;
          assert.notEqual(a, null);
          assert.notEqual(b, null);
          assert.ok(!a || b);
          guardChecks++;
        }
      }
      history = [...history, structuredClone(step.choice.tray)].slice(-4);
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
