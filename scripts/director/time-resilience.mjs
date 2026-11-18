import { createServer } from "vite";
import fs from "node:fs/promises";
import { gunzipSync } from "node:zlib";
const server = await createServer({ server: { middlewareMode: true } });
try {
  const R = await server.ssrLoadModule("/src/core/rules.ts"),
    D = await server.ssrLoadModule("/scripts/director/policy.ts");
  const ps = JSON.parse(
    gunzipSync(
      await fs.readFile(
        "docs/qa/difficulty-package1/holdout/positions.json.gz",
      ),
    ),
  )
    .positions.filter((p) => p.state.board.filter(Boolean).length >= 12)
    .slice(0, 16);
  const cases = ps.map((p) => ({
    g: {
      ...p.state,
      moves: 80,
      tray: R.deal(p.state.board, p.seed, "flow-v4", 80, "", p.state.rhythm)
        .tray,
    },
    d: {
      ...D.initialDirector(p.seed),
      phase: "challenge",
      skill: 0.85,
      evidence: 10,
    },
  }));
  for (const { g, d } of cases) D.select(g, d);
  const samples = [];
  for (let repeat = 0; repeat < 3; repeat++)
    for (const { g, d } of cases) {
      const t = performance.now();
      const s = D.select(g, d);
      samples.push({
        ms: performance.now() - t,
        changed: s.diagnostic.source !== "baseline",
        checks: s.diagnostic.checks,
      });
    }
  const times = samples.map((s) => s.ms).sort((a, b) => a - b);
  const result = {
    environment: "Cloud Node CPU, sequential, warm; not Android frames",
    n: times.length,
    p50: times[Math.floor(times.length * 0.5)],
    p95: times[Math.floor(times.length * 0.95)],
    max: times.at(-1),
    samples,
  };
  await fs.writeFile(
    "docs/qa/director-resilience/timing.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify({ ...result, samples: undefined }));
} finally {
  await server.close();
}
