/** Exact seen-run regression, without repeating the acceptance oracle/timings. */
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createServer } from "vite";
const server = await createServer({
  server: { middlewareMode: true, hmr: false, watch: null },
});
try {
  const R = await server.ssrLoadModule("/src/core/rules.ts"),
    P = await server.ssrLoadModule("/scripts/director/mixed-players.ts"),
    C = await server.ssrLoadModule("/src/platform/play-capture.ts");
  const results = [];
  for (const [file, policy] of [
    [
      "artifacts/challenge-content/development-r3.json",
      "director-challenge-v1",
    ],
    [
      "artifacts/challenge-balance/development-v2.json",
      "director-challenge-v2",
    ],
  ]) {
    const bytes = await fs.readFile(file),
      data = JSON.parse(bytes);
    let matched = 0;
    for (const expected of data.games) {
      const { seed, style, arm } = expected,
        ms = { bounded: 2200, clear: 1500, three: 3200, lapse: 2400 }[style];
      let g = R.newGame(
          seed,
          `challenge-${data.stage}-${style}-${seed}-${arm}`,
          arm === "control" ? "director-v2" : policy,
          undefined,
          arm,
        ),
        player = (seed ^ 0x85ebca6b) >>> 0,
        active = 0,
        allClears = 0,
        ordinary = 0;
      while (g.status === "playing" && g.moves < 300) {
        const roll = R.random(player);
        player = roll.state;
        const move = P.chooseMixed(g.board, g.tray, style, roll.value).move;
        assert(move);
        const r = R.applyMove(g, move, g.revision, false, {
          activeMs: (active += ms),
        });
        assert(r);
        g = r.state;
        allClears += Number(r.allClear);
        ordinary += Number(r.lines > 0 && !r.allClear);
      }
      const actual = {
        finalHash: C.stateHash(g),
        moves: g.moves,
        allClears,
        ordinary,
        ended: g.status === "over",
      };
      for (const [key, value] of Object.entries(actual))
        assert.equal(
          value,
          expected[key],
          `${data.stage}/${seed}/${style}/${arm}/${key}`,
        );
      matched++;
      if (matched % 32 === 0)
        console.log(data.stage, matched + "/" + data.games.length, "exact");
    }
    results.push({
      stage: data.stage,
      policy,
      runs: matched,
      exact: true,
      sourceSha256: crypto.createHash("sha256").update(bytes).digest("hex"),
      fields: ["finalHash", "moves", "allClears", "ordinary", "ended"],
    });
  }
  await fs.mkdir("artifacts/challenge-opportunity", { recursive: true });
  await fs.writeFile(
    "artifacts/challenge-opportunity/legacy-outcomes.json",
    JSON.stringify(results, null, 2) + "\n",
  );
  console.log(JSON.stringify(results));
} finally {
  await server.close();
}
