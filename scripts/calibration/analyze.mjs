import fs from "node:fs/promises";
import { createServer } from "vite";
const [input, output] = process.argv.slice(2);
if (!input || !output)
  throw Error(
    "Usage: node scripts/calibration/analyze.mjs recording.json report.json",
  );
const bytes = await fs.readFile(input);
if (bytes.length > 900000) throw Error("Recording too large");
const server = await createServer({ server: { middlewareMode: true } });
try {
  const { replayRecord } = await server.ssrLoadModule(
    "/scripts/calibration/replay.ts",
  );
  const { analyze } = await server.ssrLoadModule(
    "/scripts/difficulty/analyze.ts",
  );
  const { choose } = await server.ssrLoadModule(
    "/scripts/difficulty/players.ts",
  );
  const { geometry } = await server.ssrLoadModule(
    "/scripts/director/geometry.ts",
  );
  const replay = replayRecord(JSON.parse(bytes));
  const rows = replay.moves.map((m) => {
    const a = analyze(m.before.board, m.before.tray, 30000);
    const chosen = a.first.find(
      (x) =>
        x.move.slot === m.event.move.slot &&
        x.move.x === m.event.move.x &&
        x.move.y === m.event.move.y,
    );
    const bots = Object.fromEntries(
      ["clear", "space", "two", "three"].map((s) => [
        s,
        choose(m.before.board, m.before.tray, s),
      ]),
    );
    return {
      segment: m.segment,
      move: m.after.moves,
      score: m.after.score,
      activeIntervalMs: m.activeIntervalMs,
      hinted: m.event.hinted,
      lines: m.lines,
      allClear: m.allClear,
      geometry: geometry(m.after.board),
      choice: chosen?.status ?? "unknown",
      avoidableDeadEnd:
        chosen?.status === "unsolvable" &&
        a.first.some((x) => x.status === "solvable"),
      actual: m.event.move,
      bots,
    };
  });
  const times = rows.map((r) => r.activeIntervalMs).sort((a, b) => a - b);
  const report = {
    schema: "blocky-calibration-v1",
    source:
      "user-provided recording; provenance not independently authenticated",
    limitations: [
      "Active intervals include interaction, calculation and saving; not pure thinking time.",
      "Different moves from a bot are not automatically mistakes.",
      "Unknown search outcomes are not failures.",
      "Checkpoints are segment boundaries; unrecorded transitions are not replay-verified.",
      "No retuning of dealer or invented target duration is performed.",
    ],
    summary: {
      moves: rows.length,
      segments: replay.segments.length,
      scoreGain: replay.moves.reduce(
        (n, m) => n + m.after.score - m.before.score,
        0,
      ),
      fullClears: rows.filter((r) => r.allClear).length,
      rewardMoves: rows.filter((r) => r.lines > 0).length,
      hintedMoves: rows.filter((r) => r.hinted).length,
      unhintedAvoidableDeadEnds: rows.filter(
        (r) => r.avoidableDeadEnd && !r.hinted,
      ).length,
      unknownChoices: rows.filter((r) => r.choice === "unknown").length,
      medianActiveIntervalMs: times[Math.floor(times.length / 2)] ?? null,
    },
    segments: replay.segments,
    rows,
  };
  await fs.writeFile(output, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report.summary));
} finally {
  await server.close();
}
