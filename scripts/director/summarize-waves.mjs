import fs from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
const root = "docs/qa/director-waves";
const folders = [
  "guaranteed-discovery",
  "neutral-discovery",
  "guaranteed-long",
  "neutral-long",
  "neutral-control",
  "neutral-holdout",
  "fallible-holdout",
  "reward-long",
  "reward-holdout",
];
const runs = [],
  unique = new Set();
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
for (const name of folders) {
  const summary = JSON.parse(await fs.readFile(`${root}/${name}/summary.json`));
  const games = JSON.parse(
    gunzipSync(await fs.readFile(`${root}/${name}/games.json.gz`)),
  );
  const short = name.endsWith("discovery");
  const policy = summary.policy + (short ? "-short" : "");
  for (const g of games)
    unique.add(
      [
        g.variant === "baseline" ? "flow-v4" : policy,
        g.style,
        g.seed,
        summary.limit,
      ].join(":"),
    );
  const selected = games.filter((g) => g.variant === "director");
  const deals = selected.flatMap((g) =>
    g.deals.filter((d) => d.move <= g.moves),
  );
  const geometry = [];
  for (const style of new Set(games.map((g) => g.style)))
    for (const variant of ["baseline", "director"]) {
      const group = games.filter(
          (g) => g.style === style && g.variant === variant,
        ),
        t = group.flatMap((g) => g.trajectory ?? []);
      geometry.push({
        style,
        variant,
        moves: t.length,
        meanOccupied: mean(t.map((x) => x.occupied)),
        meanIsolated: mean(
          t.filter((x) => x.isolated !== undefined).map((x) => x.isolated),
        ),
        meanLargestRectangle: mean(
          t
            .filter((x) => x.largestRectangle !== undefined)
            .map((x) => x.largestRectangle),
        ),
        meanSquares: mean(
          t.filter((x) => x.squares !== undefined).map((x) => x.squares),
        ),
        clearPer100Moves:
          (100 * group.reduce((n, g) => n + g.clears, 0)) /
          group.reduce((n, g) => n + g.moves, 0),
      });
    }
  const fatalities = selected
    .filter((g) => g.dead)
    .map((g) => {
      const d = g.deals.filter((d) => d.move <= g.moves).at(-1);
      return {
        seed: g.seed,
        style: g.style,
        move: g.moves,
        source: d?.source,
        sampledStatus: d?.sampledStatus,
        stepsSinceDeal: g.moves - (d?.move ?? 0),
      };
    });
  runs.push({
    name,
    policy,
    challengeTrays: short ? 2 : 6,
    sessions: games.length,
    moves: games.reduce((n, g) => n + g.moves, 0),
    openingMatches: summary.openingMatches,
    selections: deals.length,
    neutral: deals.filter((d) => d.source === "neutral-weighted").length,
    knownImpossibleNeutral: deals.filter(
      (d) =>
        d.source === "neutral-weighted" && d.sampledStatus === "unsolvable",
    ).length,
    reward: deals.filter((d) => d.source === "reward-constructed").length,
    summary: summary.summary,
    geometry,
    fatalities,
  });
}
const modules = [
  "wave.ts",
  "wave-short.ts",
  "geometry.ts",
  "policy-v7.ts",
  "policy-neutral-control.ts",
  "benchmark.mjs",
  "summarize-waves.mjs",
];
const sha256 = Object.fromEntries(
  await Promise.all(
    modules.map(async (f) => [
      f,
      createHash("sha256")
        .update(await fs.readFile("scripts/director/" + f))
        .digest("hex"),
    ]),
  ),
);
const result = {
  status: "rejected-experiments-production-unchanged",
  sessions: runs.reduce((n, r) => n + r.sessions, 0),
  uniqueConditions: unique.size,
  moves: runs.reduce((n, r) => n + r.moves, 0),
  sha256,
  runs,
};
await fs.writeFile(
  root + "/evaluation.json",
  JSON.stringify(result, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    ...result,
    runs: runs.map((r) => ({
      name: r.name,
      neutral: r.neutral,
      impossible: r.knownImpossibleNeutral,
      reward: r.reward,
      geometry: r.geometry,
    })),
  }),
);
