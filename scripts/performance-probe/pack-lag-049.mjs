import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
const directory = process.argv[2] || "/tmp";
const names = [
  [
    "atlas-screen",
    "valid exploratory",
    "No sustained rAF improvement; not accepted.",
  ],
  [
    "discard-screen",
    "exploratory unconfirmed shader intervention",
    "No sustained improvement; addition installation not captured in this batch.",
  ],
  ["tight-screen", "valid exploratory", "Manual crop prototype; all contours."],
  [
    "tight-human",
    "valid exploratory",
    "Manual crop prototype; all contours; not final native candidate.",
  ],
  [
    "native-confirm",
    "valid confirmation",
    "Only nine-slice strips; native logical trim.",
  ],
  [
    "energy-screen",
    "invalid",
    "Ink wrapper dropped optional texture key; not admissible for acceptance.",
  ],
  [
    "energy-confirm",
    "invalid",
    "Ink wrapper dropped optional texture key; not admissible for acceptance.",
  ],
  [
    "energy-confirm-valid",
    "valid confirmation",
    "Correct texture forwarding plus missing-frame assertion.",
  ],
  [
    "energy-trim-confirm",
    "valid confirmation",
    "Energy cache plus zero-alpha trim of its own large slices.",
  ],
];
const batches = [];
for (const [name, validity, note] of names) {
  const bytes = await fs.readFile(
    path.join(directory, `blocky-${name}.raw.json`),
  );
  const data = JSON.parse(bytes);
  if (!data.manifest.completed) throw Error(`Incomplete batch: ${name}`);
  const contexts = [],
    lookup = new Map();
  const episodes = data.results.map((row) => {
    const signature = JSON.stringify(row.manifest);
    let context = lookup.get(signature);
    if (context === undefined) {
      context = contexts.length;
      contexts.push(row.manifest);
      lookup.set(signature, context);
    }
    const game = { ...row.final.game, gameId: "diagnostic-game" };
    return {
      round: row.round,
      repeat: row.repeat,
      cold: row.cold,
      condition: row.condition,
      context,
      summary: row.summary,
      gl: row.gl,
      errors: row.errors,
      outcome: {
        score: game.score,
        moves: game.moves,
        occupied: game.board.filter(Boolean).length,
        stateHash: crypto
          .createHash("sha256")
          .update(JSON.stringify(game))
          .digest("hex"),
      },
      marks: row.marks.map(({ at, ...rest }) => ({
        ...rest,
        at: Math.round((at - row.start) * 1000) / 1000,
      })),
      rafSeries: row.raf.map(({ at, ms }) => [
        Math.round((at - row.start) * 1000) / 1000,
        Math.round(ms * 1000) / 1000,
      ]),
    };
  });
  batches.push({
    name,
    validity,
    note,
    sourceSha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    manifest: data.manifest,
    contexts,
    episodes,
  });
}
const pixelComparisons = (
  await fs.readFile(
    path.join(directory, "blocky-049-energy-trim-pixels.log"),
    "utf8",
  )
)
  .split("\n")
  .filter((s) => s.startsWith('{"renderer"'))
  .map((s) => JSON.parse(s));
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
function gate(name, baselineKey) {
  const batch = batches.find((x) => x.name === name);
  return [0, 1, 2].map((fixture) => {
    const base = batch.episodes.filter(
      (x) => x.condition.fixtureIndex === fixture && x.condition[baselineKey],
    );
    const candidate = batch.episodes.filter(
      (x) => x.condition.fixtureIndex === fixture && !x.condition[baselineKey],
    );
    const counts = (rows, cold) =>
      rows.filter((x) => x.cold === cold).map((x) => x.summary.raf.over25);
    const bw = counts(base, false),
      cw = counts(candidate, false),
      bc = counts(base, true),
      cc = counts(candidate, true);
    const improvement = 1 - median(cw) / median(bw);
    const warmNoLargeRegression = cw.every(
      (v, i) => v <= Math.max(bw[i] + 1, bw[i] * 1.3),
    );
    const coldNoLargeRegression =
      median(cc) <= Math.max(median(bc) + 1, median(bc) * 1.15);
    return {
      fixture,
      baselineWarm: bw,
      candidateWarm: cw,
      baselineCold: bc,
      candidateCold: cc,
      warmMedianReduction: improvement,
      warmNoLargeRegression,
      coldNoLargeRegression,
      passed:
        improvement >= 0.1 && warmNoLargeRegression && coldNoLargeRegression,
    };
  });
}
const report = {
  schema: "blocky-lag-049-research-v1",
  batches,
  pixelComparisons,
  nativeGate: gate("native-confirm", "looseInk"),
  energyGate: gate("energy-confirm-valid", "oldEnergyBorder"),
  energyTrimGate: gate("energy-trim-confirm", "oldEnergyBorder"),
};
await fs.writeFile(
  "docs/qa/lag-049/measurements.json",
  JSON.stringify(report) + "\n",
);
console.log(
  JSON.stringify(
    {
      episodes: batches.reduce((s, b) => s + b.episodes.length, 0),
      nativeGate: report.nativeGate,
      energyGate: report.energyGate,
      energyTrimGate: report.energyTrimGate,
      pixelComparisons: pixelComparisons.length,
    },
    null,
    2,
  ),
);
