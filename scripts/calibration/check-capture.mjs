/** Synthetic replay/CPU check; not a human calibration dataset. */
import { createServer } from "vite";
import fs from "node:fs/promises";
const server = await createServer({ server: { middlewareMode: true } });
try {
  const R = await server.ssrLoadModule("/src/core/rules.ts"),
    P = await server.ssrLoadModule("/scripts/difficulty/players.ts"),
    C = await server.ssrLoadModule("/src/platform/play-capture.ts"),
    V = await server.ssrLoadModule("/scripts/calibration/replay.ts");
  let tick = 0,
    seed = 1,
    g = R.newGame(seed, "synthetic-" + seed, "flow-v4");
  const c = new C.PlayCapture(() => tick);
  c.start(g);
  c.setActive(true);
  const times = [];
  for (let i = 0; i < 1000; i++) {
    if (g.status === "over") {
      seed++;
      g = R.newGame(seed, "synthetic-" + seed, "flow-v4");
    }
    const move = P.choose(g.board, g.tray, "clear"),
      after = R.applyMove(g, move, g.revision).state;
    tick += 1000;
    const start = performance.now();
    c.record(g, move, after);
    times.push(performance.now() - start);
    g = after;
  }
  c.stop();
  const data = c.snapshot(),
    replay = V.replayRecord(data),
    json = JSON.stringify(data);
  times.sort((a, b) => a - b);
  if (replay.moves.length !== 1000) throw Error("Lost moves");
  const report = {
    source: "synthetic diagnostic, not human",
    moves: replay.moves.length,
    segments: replay.segments.length,
    bytes: new TextEncoder().encode(json).length,
    p50Ms: times[500],
    p95Ms: times[950],
    maxMs: times.at(-1),
    environment:
      "Node CPU; recorder only, excludes game calculations, not Android FPS",
  };
  await fs.mkdir("docs/qa/play-capture-0.46", { recursive: true });
  await fs.writeFile(
    "docs/qa/play-capture-0.46/capture-cost.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} finally {
  await server.close();
}
