import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { mixedRuntime } from "./mixed-runtime.mjs";
const { server, R, H, MP, A } = await mixedRuntime(),
  D = await server.ssrLoadModule("/src/core/reward-director.ts"),
  D2 = await server.ssrLoadModule("/src/core/goal-director.ts"),
  V = await server.ssrLoadModule("/scripts/director/verify-constructive-deal.ts");
const hash = (v) =>
  createHash("sha256")
    .update(typeof v === "string" ? v : JSON.stringify(v))
    .digest("hex");
const raw = await fs.readFile("docs/qa/director-constructive/results.json.gz"),
  data = JSON.parse(gunzipSync(raw));
let moves = 0,
  roots = 0,
  seconds = 0,
  preparations = 0,
  negative = 0,
  trios = 0, constructionProofs = 0;
try {
  for (const [f, h] of Object.entries(data.source))
    assert.equal(
      hash(await fs.readFile(f, "utf8")),
      h,
      "Changed frozen source: " + f,
    );
  for (const run of data.runs) {
    const baseline = run.mode === "baseline";
    let g = R.newGame(
        run.seed,
        "constructive-study-" + run.seed,
        baseline ? "director-v2" : "director-v6",
      ),
      cursor = 0;
    let rng = createHash("sha256")
      .update("mixed-player:" + run.seed)
      .digest()
      .readUInt32LE(0);
    function inspect(input) {
      const record = run.deals[cursor++];
      assert(record);
      assert.deepEqual(record.input, input);
      assert.deepEqual(A.toRows(g.board), record.board);
      assert.deepEqual(g.tray, record.tray);
      assert.equal(g.rngState, record.outputRng);
      assert.deepEqual(
        baseline ? g.goalDirector : g.rewardDirector,
        record.outputDirector,
      );
      if (!baseline) {
        const p = V.verifyConstructiveDeal(g.board, {
          ...record,
          director: record.outputDirector,
        });
        constructionProofs += p.constructionProofs;
        roots += p.safe;
        seconds += p.seconds;
        preparations += p.prepared;
        negative += p.negative;
      }
      trios++;
    }
    inspect({ seed: run.seed, moves: 0 });
    for (let i = 0; i < run.actions.length; i++) {
      const roll = R.random(rng);
      rng = roll.state;
      const expected = MP.chooseMixed(g.board, g.tray, run.style, roll.value),
        [slot, x, y] = run.actions[i],
        move = { slot, x, y };
      assert.deepEqual(move, expected.move);
      const old = g,
        refill = g.tray.filter((s) => !s.used).length === 1,
        a = R.applyMove(g, move, g.revision);
      assert(a);
      g = a.state;
      assert.deepEqual(
        [
          a.lines,
          Number(a.allClear),
          g.board.filter(Boolean).length,
          Number(expected.perturbed),
          Number(expected.different),
        ],
        run.events[i],
      );
      if (refill) {
        const rhythm = H.advanceRhythmV4(
            old.rhythm,
            g.board,
            a.lines,
            a.allClear,
            R.random(old.rngState).value,
          ),
          saved = baseline
            ? D2.observeGoalDirector(old.goalDirector, a.allClear)
            : D.observeRewardDirector(old.rewardDirector, a.allClear);
        inspect({ seed: old.rngState, moves: g.moves, rhythm, saved });
      }
      moves++;
    }
    assert.equal(cursor, run.deals.length);
    assert.equal(hash(g), run.finalHash);
    assert.equal(g.status === "over", run.ended);
  }
  const result = {
    valid: true,
    games: data.runs.length,
    moves,
    trios,
    constructionProofs,
    roots,
    seconds,
    preparations,
    negative,
    playerChoicesRecomputed: true,
    sourceSha256: createHash("sha256").update(raw).digest("hex"),
  };
  await fs.writeFile(
    "docs/qa/director-constructive/replay.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result));
} finally {
  await server.close();
}
