import fs from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
const root = "docs/qa/director-package2";
const folders = [
  "rejected-v1",
  "rejected-v1/holdout",
  "rejected-v2",
  "rejected-v2/holdout",
  "rejected-v2/long",
  "rejected-v3",
  "rejected-v3/long",
  "rejected-v4",
  "rejected-v4/long",
  "",
  "long",
];
let sessions = 0,
  moves = 0;
const experiments = [];
for (const folder of folders) {
  const dir = root + (folder ? "/" + folder : "");
  const g = JSON.parse(gunzipSync(await fs.readFile(dir + "/games.json.gz")));
  const s = JSON.parse(await fs.readFile(dir + "/summary.json", "utf8"));
  sessions += g.length;
  moves += g.reduce((n, r) => n + r.moves, 0);
  const deals = g
    .filter((r) => r.variant === "director")
    .flatMap((r) => r.deals);
  experiments.push({
    folder: folder || "final",
    sessions: g.length,
    offset: s.offset,
    limit: s.limit,
    openingMatches: s.openingMatches,
    selectionCalls: deals.length,
    substitutions: deals.filter((d) => d.source !== "baseline").length,
    qualified: deals.filter((d) => d.qualified).length,
    recipes: deals
      .filter((d) => d.source !== "baseline")
      .reduce((a, d) => ((a[d.recipe] = (a[d.recipe] ?? 0) + 1), a), {}),
    summary: s.summary,
  });
}
const hashes = {};
for (const f of ["policy.ts", "recipes.ts", "benchmark.mjs", "profiles.mjs"])
  hashes[f] = createHash("sha256")
    .update(await fs.readFile("scripts/director/" + f))
    .digest("hex");
const result = {
  schema: 1,
  status: "experimental-not-accepted",
  productionPolicy: "flow-v4-unchanged",
  sessions,
  moves,
  profiles: 96,
  hashes,
  experiments,
  limits: [
    "No human calibration or physical Android test.",
    "Six seeds per strategy per batch; no population or statistical significance claims.",
    "Censored 180/600 move runs are not completed session durations.",
    "Legacy v1/v2 retained as rejected probes; historical recovery accounting differs from current fixed policy.",
    "Final conservative policy is too inactive: substitutions must not be confused with selection calls.",
    "Director is separate experiment state, not connected to production storage or UI.",
  ],
};
await fs.writeFile(
  root + "/evaluation.json",
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify({ sessions, moves, status: result.status }));
