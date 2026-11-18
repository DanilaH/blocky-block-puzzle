// Offline reduction of retained experimental runs; no game/app imports.
import fs from "node:fs/promises";
import crypto from "node:crypto";
const directory = process.argv[2] || "docs/qa/phone-clear-050";
const names = ["screen", "ink", "flat", "confirm", "integrated"];
const contexts = [],
  batches = [];
for (const name of names) {
  const bytes = await fs.readFile(
    `/tmp/blocky-phone${name === "integrated" ? "051" : "050"}-${name}.json`,
  );
  const data = JSON.parse(bytes);
  if (!data.manifest.completed) throw Error(`Incomplete batch: ${name}`);
  const episodes = data.results.map((row) => {
    const context = JSON.stringify(row.manifest);
    let contextIndex = contexts.findIndex((c) => JSON.stringify(c) === context);
    if (contextIndex < 0) contextIndex = contexts.push(row.manifest) - 1;
    return {
      condition: row.condition,
      round: row.round,
      repeat: row.repeat,
      cold: row.cold,
      contextIndex,
      summary: row.summary,
      gl: row.gl,
      metrics: row.metrics,
      marks: row.marks.map((m) => ({
        ...m,
        at: +(m.at - row.start).toFixed(3),
      })),
      raf: row.raf.map((f) => [
        +(f.at - row.start).toFixed(3),
        +f.ms.toFixed(3),
      ]),
      errors: row.errors,
      final: {
        score: row.final.game.score,
        streak: row.final.game.streak,
        moves: row.final.game.moves,
        boardEmpty: row.final.game.board.every((n) => n === 0),
        shownTheme: row.final.shownTheme,
      },
    };
  });
  batches.push({
    name,
    sourceSha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    manifest: data.manifest,
    episodes,
  });
}

const median = (values) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const gates = [];
for (const stage of ["confirm", "integrated"]) {
  const results = batches.find((b) => b.name === stage).episodes;
  for (const fixtureIndex of [0, 1, 2])
    for (const atlas of stage === "integrated" ? [false] : [false, true]) {
      const select = (old) =>
        results.filter(
          (r) =>
            r.condition.fixtureIndex === fixtureIndex &&
            r.condition.oldEnergyBorder === old &&
            (old || !!r.condition.vfxAtlas === atlas),
        );
      const base = select(true),
        candidate = select(false);
      const counts = (rows, repeat) =>
        rows
          .filter((r) => r.repeat === repeat)
          .sort((a, b) => a.round - b.round)
          .map((r) => r.summary.raf.over25);
      const baselineWarm = counts(base, 1),
        candidateWarm = counts(candidate, 1);
      const baselineCold = counts(base, 0),
        candidateCold = counts(candidate, 0);
      if (baselineWarm.length !== 3 || candidateWarm.length !== 3)
        throw Error("Missing repeats");
      const reduction = 1 - median(candidateWarm) / median(baselineWarm);
      const noWarmRegression = candidateWarm.every(
        (n, i) => n <= baselineWarm[i] + 2,
      );
      const noColdRegression =
        median(candidateCold) <= median(baselineCold) + 2;
      gates.push({
        stage,
        fixtureIndex,
        atlas,
        baselineWarm,
        candidateWarm,
        baselineCold,
        candidateCold,
        reduction,
        noWarmRegression,
        noColdRegression,
        performancePassed:
          reduction >= 0.1 && noWarmRegression && noColdRegression,
      });
    }
}
const invalid = await fs.readFile("/tmp/blocky-phone050-invalid-camera.json");
await fs.mkdir(directory, { recursive: true });
await fs.writeFile(
  `${directory}/measurements.json`,
  JSON.stringify({
    schema: "blocky-phone-clear-050-research-v1",
    contexts,
    batches,
    gates,
    excluded: [
      {
        reason:
          "Backing resized without camera sync; superseded by all completed batches",
        episodes: JSON.parse(invalid).results.length,
        sourceSha256: crypto.createHash("sha256").update(invalid).digest("hex"),
      },
    ],
    limitations:
      "Chromium141/SwiftShader instrumentation; not physical Android FPS. Two old positions have controlled proxy themes. See report.",
  }) + "\n",
);
await fs.copyFile(
  "/tmp/blocky-phone050-confirm-fixtures.json",
  `${directory}/confirmation-fixtures.json`,
);
console.log(JSON.stringify(gates, null, 2));
