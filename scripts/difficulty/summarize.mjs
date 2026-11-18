import fs from "node:fs/promises";
import { gunzipSync } from "node:zlib";
const root = process.argv[2] || "docs/qa/difficulty-package1";
async function read(dir) {
  const p = JSON.parse(
      gunzipSync(await fs.readFile(dir + "/positions.json.gz")).toString(
        "utf8",
      ),
    ),
    r = JSON.parse(
      gunzipSync(await fs.readFile(dir + "/results.json.gz")).toString("utf8"),
    );
  return { p, r };
}
const discovery = await read(root),
  holdout = await read(root + "/holdout");
function key(bundle, r) {
  const p = bundle.p.positions.find((p) => p.id === r.id);
  return JSON.stringify([
    p.state.board.map((v) => Number(!!v)),
    r.tray.map((s) => [s.shapeId, s.used]),
  ]);
}
const seen = new Set(discovery.r.results.map((r) => key(discovery, r))),
  novel = [];
let duplicates = 0;
for (const r of holdout.r.results) {
  const k = key(holdout, r);
  if (seen.has(k)) {
    duplicates++;
    continue;
  }
  seen.add(k);
  novel.push(r);
}
const styles = Object.keys(novel[0].outcomes);
function bins(list) {
  return [
    ["narrow", 0, 0.5],
    ["middle", 0.5, 0.9],
    ["wide", 0.9, 1.001],
  ].map(([label, lo, hi]) => {
    const a = list.filter(
      (r) =>
        r.remaining === 3 &&
        r.metrics.complete &&
        r.metrics.status === "solvable" &&
        r.metrics.safeRatio >= lo &&
        r.metrics.safeRatio < hi,
    );
    return {
      label,
      n: a.length,
      success: Object.fromEntries(
        styles.map((s) => [s, a.filter((r) => r.outcomes[s].success).length]),
      ),
    };
  });
}
const paired = Object.fromEntries(
  styles.map((s) => [
    s,
    {
      easyOnly: holdout.r.summary.pairs.filter(
        (p) => p.outcomes[s].easy && !p.outcomes[s].hard,
      ).length,
      hardOnly: holdout.r.summary.pairs.filter(
        (p) => !p.outcomes[s].easy && p.outcomes[s].hard,
      ).length,
      both: holdout.r.summary.pairs.filter(
        (p) => p.outcomes[s].easy && p.outcomes[s].hard,
      ).length,
      neither: holdout.r.summary.pairs.filter(
        (p) => !p.outcomes[s].easy && !p.outcomes[s].hard,
      ).length,
    },
  ]),
);
const summary = {
  schema: 1,
  totalPositions: discovery.p.positions.length + holdout.p.positions.length,
  totalEvaluations: discovery.r.results.length + holdout.r.results.length,
  totalSimulatedMoves: discovery.p.simulatedMoves + holdout.p.simulatedMoves,
  totalCollectionGames: discovery.p.games + holdout.p.games,
  novelHoldoutCandidates: novel.length,
  removedDuplicates: duplicates,
  novelHoldoutBins: bins(novel),
  pairedHoldoutBoards: holdout.r.summary.pairs.length,
  paired,
  limitations: [
    "Positions are stratified and dependent within sessions; rates are diagnostic, not population estimates.",
    "Catalog controls are uniform orientation samples, not proposed production generation.",
    "No human difficulty or engagement calibration.",
    "Narrow safe-first ratio does not imply difficult full-tray search.",
    "Paired extremes are chosen by the metric, not outcomes; not independent from the bin analysis.",
  ],
};
await fs.writeFile(
  root + "/summary.json",
  JSON.stringify(summary, null, 2) + "\n",
);
console.log(JSON.stringify(summary, null, 2));
