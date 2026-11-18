import fs from "node:fs/promises";
import crypto from "node:crypto";
const directory = "docs/qa/prepared-reveal-051";
const names = ["screen", "normal", "confirm", "final", "opaque", "blend"];
const batches = [];
for (const name of names) {
  const bytes = await fs.readFile(`/tmp/prepared-reveal-${name}.json`),
    data = JSON.parse(bytes);
  if (!data.manifest.completed) throw Error(`Incomplete batch ${name}`);
  const episodes = data.results.map((r) => ({
    condition: r.condition,
    round: r.round,
    repeat: r.repeat,
    context: r.manifest,
    summary: r.summary,
    gl: r.gl,
    prepared: r.prepared,
    marks: r.marks.map((m) => ({ ...m, at: +(m.at - r.start).toFixed(3) })),
    raf: r.raf.map((v) => [+(v.at - r.start).toFixed(3), +v.ms.toFixed(3)]),
    errors: r.errors,
    final: {
      score: r.final.game.score,
      moves: r.final.game.moves,
      streak: r.final.game.streak,
      boardEmpty: r.final.game.board.every((n) => n === 0),
      theme: r.final.shownTheme,
    },
  }));
  batches.push({
    name,
    sourceSha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    manifest: data.manifest,
    episodes,
  });
}
const select = (name, key, value, repeat) =>
  batches
    .find((b) => b.name === name)
    .episodes.filter((r) => !!r.condition[key] === value && r.repeat === repeat)
    .sort((a, b) => a.round - b.round)
    .map((r) => r.summary.raf.over25);
const median = (x) => [...x].sort((a, b) => a - b)[Math.floor(x.length / 2)];
const gates = [];
for (const name of ["confirm", "final"]) {
  const baseline = select(name, "usePrepared", false, 1),
    candidate = select(name, "usePrepared", true, 1);
  gates.push({
    name,
    baseline,
    candidate,
    medianReduction: 1 - median(candidate) / median(baseline),
    passed:
      1 - median(candidate) / median(baseline) >= 0.25 &&
      candidate.every((n, i) => n <= baseline[i] + 2),
  });
}
const alpha = JSON.parse(
  await fs.readFile("/tmp/prepared-reveal-alpha.json", "utf8"),
);
const samples = JSON.parse(
  Buffer.from(
    alpha.suites[0].specs[0].tests[0].results[0].attachments.find(
      (a) => a.name === "pixels",
    ).body,
    "base64",
  ).toString(),
);
const data = {
  schema: "blocky-prepared-reveal-research-v1",
  batches,
  gates,
  additiveIdentity: { testPassed: alpha.stats.unexpected === 0, samples },
  limitations: [
    "Chromium141/SwiftShader, not physical Mali; no causal device-speed conclusion",
    "Repeat0 is first measured replay, after preparation/quality checks in prepared variants; not cold GPU",
    "Normal/confirm keep old CPU preparation and swap GPU output; final skips original normal block CPU commands",
    "Initial screen both-layer quality backing size was not separately logged; later normal/final/visual checks force896 before preparation/assessment",
    "Opaque/properAdd are exploratory diagnostic changes with different pixels, not accepted performance candidates",
  ],
};
await fs.writeFile(
  directory + "/measurements.json",
  JSON.stringify(data) + "\n",
);
console.log(
  JSON.stringify(
    {
      episodes: batches.reduce((n, b) => n + b.episodes.length, 0),
      gates,
      samples,
    },
    null,
    2,
  ),
);
