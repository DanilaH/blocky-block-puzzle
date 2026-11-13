import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { mixedRuntime } from "./mixed-runtime.mjs";
const { server, R } = await mixedRuntime(),
  results = [];
try {
  for (const [path, prefix, versions] of [
    [
      "docs/qa/director-goal-cycle/results.json.gz",
      "goal-cycle-",
      ["flow-v4", "director-v2"],
    ],
    [
      "docs/qa/director-mixed/results.json.gz",
      "mixed-study-",
      ["director-v2", "director-v3"],
    ],
    [
      "docs/qa/director-forgiving/results.json.gz",
      "forgiving-study-",
      ["director-v2", "director-v4"],
    ],
    [
      "docs/qa/director-reward-paths/results.json.gz",
      "reward-study-",
      ["director-v2", "director-v5"],
    ],
  ]) {
    const raw = await fs.readFile(path),
      data = JSON.parse(gunzipSync(raw));
    let moves = 0;
    // Source files gained additive v4 code, so behavioral hashes, rather than
    // equality to old source-file hashes, are the compatibility requirement.
    for (const run of data.runs) {
      let g = R.newGame(
        run.seed,
        prefix + run.seed,
        versions[run.mode === "baseline" ? 0 : 1],
      );
      for (let i = 0; i < run.actions.length; i++) {
        const [slot, x, y] = run.actions[i],
          a = R.applyMove(g, { slot, x, y }, g.revision);
        assert(a);
        g = a.state;
        moves++;
        assert.deepEqual(
          [a.lines, Number(a.allClear), g.board.filter(Boolean).length],
          run.events[i].slice(0, 3),
        );
      }
      assert.equal(
        createHash("sha256").update(JSON.stringify(g)).digest("hex"),
        run.finalHash,
      );
    }
    results.push({
      path,
      games: data.runs.length,
      moves,
      sourceSha256: createHash("sha256").update(raw).digest("hex"),
    });
  }
  const result = {
    valid: true,
    games: results.reduce((n, r) => n + r.games, 0),
    moves: results.reduce((n, r) => n + r.moves, 0),
    results,
  };
  await fs.writeFile(
    "docs/qa/director-constructive/legacy-replay.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result));
} finally {
  await server.close();
}
