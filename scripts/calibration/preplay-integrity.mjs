/** Synthetic integrity check only: no dealer changes or human-balance claims. */
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { createServer } from "vite";
const server = await createServer({ server: { middlewareMode: true } });
try {
  const R = await server.ssrLoadModule("/src/core/rules.ts");
  const P = await server.ssrLoadModule("/scripts/difficulty/players.ts");
  const C = await server.ssrLoadModule("/src/platform/play-capture.ts");
  const V = await server.ssrLoadModule("/scripts/calibration/replay.ts");
  let t = 0,
    seed = 250001,
    g = R.newGame(seed, "integrity-" + seed, "flow-v4");
  const c = new C.PlayCapture(() => t);
  c.start(g);
  c.setActive(true);
  let accepted = 0;
  for (let i = 0; i < 12000 && c.enabled; i++) {
    if (g.status === "over") {
      seed++;
      g = R.newGame(seed, "integrity-" + seed, "flow-v4");
    }
    const move = P.choose(g.board, g.tray, "clear");
    const result = R.applyMove(g, move, g.revision);
    if (!result) throw Error("Synthetic invalid move");
    t += 1000;
    c.record(g, move, result.state);
    g = result.state;
    accepted++;
  }
  const record = c.snapshot(),
    json = JSON.stringify(record),
    replay = V.replayRecord(record);
  if (record.stopped !== "limit")
    throw Error("Capture did not reach its bound");
  if (replay.moves.length !== c.count) throw Error("Stored move count differs");
  if (Buffer.byteLength(json) > 900000) throw Error("Export limit exceeded");
  c.stop();
  if (c.snapshot().stopped !== "limit")
    throw Error("Stop hid the limit reason");
  // A nonzero-score recording starts mid-game, then resumes after an unrecorded move.
  let h = R.newGame(250101, "midgame-integrity", "flow-v4");
  const advance = () => {
    const before = h,
      move = P.choose(h.board, h.tray, "clear");
    const result = R.applyMove(h, move, h.revision);
    if (!result) throw Error("Fixture invalid");
    h = result.state;
    return { before, move, after: h };
  };
  advance();
  const short = new C.PlayCapture(() => t);
  short.setActive(true);
  short.start(h);
  for (let i = 0; i < 6; i++) {
    t += 1000;
    const m = advance();
    short.record(m.before, m.move, m.after);
  }
  short.stop();
  advance();
  t += 30000;
  short.start(h);
  for (let i = 0; i < 6; i++) {
    t += 1000;
    const m = advance();
    short.record(m.before, m.move, m.after);
  }
  short.stop();
  const shortRecord = short.snapshot(),
    shortReplay = V.replayRecord(shortRecord);
  if (shortReplay.moves.length !== 12 || shortReplay.segments.length !== 2)
    throw Error("Lost segment");
  if (shortReplay.moves.some((m) => m.activeIntervalMs !== 1000))
    throw Error("Recording gap entered decision intervals");
  await fs.mkdir("docs/qa/preplay-reliability", { recursive: true });
  await fs.writeFile(
    "docs/qa/preplay-reliability/synthetic-midgame.json",
    JSON.stringify(shortRecord) + "\n",
  );
  const report = {
    source:
      "Synthetic integrity test; not a human playtest or a balance comparison",
    dealer: "unchanged flow-v4",
    seedRange: [250001, seed],
    limit: {
      attemptedMoves: accepted,
      storedMoves: replay.moves.length,
      segments: replay.segments.length,
      bytes: Buffer.byteLength(json),
      stopReason: record.stopped,
      sha256: createHash("sha256").update(json).digest("hex"),
    },
    midgame: {
      moves: shortReplay.moves.length,
      segments: shortReplay.segments.length,
      initialMoves: shortReplay.segments[0].initialMoves,
      activeIntervalsMs: shortReplay.moves.map((m) => m.activeIntervalMs),
    },
  };
  await fs.writeFile(
    "docs/qa/preplay-reliability/capture-integrity.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} finally {
  await server.close();
}
