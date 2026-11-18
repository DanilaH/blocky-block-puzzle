import fs from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createServer } from "vite";
const dir = "docs/qa/director-sequences",
  data = JSON.parse(gunzipSync(await fs.readFile(`${dir}/evidence.json.gz`)));
const server = await createServer({ server: { middlewareMode: true } });
try {
  const R = await server.ssrLoadModule("/src/core/rules.ts");
  const rows = [];
  for (const split of ["development", "confirmation"])
    for (const critical of [false, true])
      for (const mode of [
        "baseline",
        "recovery-once",
        "recovery-always",
        "protected-diversity",
        "recovery-diverse",
      ]) {
        const runs = data.runs.filter(
            (r) =>
              r.split === split && r.critical === critical && r.mode === mode,
          ),
          steps = runs.flatMap((r) => r.steps);
        const first = runs.map((r) => r.steps[0]);
        rows.push({
          split,
          critical,
          mode,
          episodes: runs.length,
          complete: runs.filter((r) => r.complete).length,
          steps: steps.length,
          firstComplete: first.filter((s) => s.complete).length,
          meanFirstEndOccupied: first.length
            ? first.reduce((n, s) => n + s.endOccupied, 0) / first.length
            : null,
          meanTrayCells: steps.length
            ? steps.reduce(
                (n, s) =>
                  n +
                  s.before.tray.reduce(
                    (a, t) => a + R.shapeById(t.shapeId).cells.length,
                    0,
                  ),
                0,
              ) / steps.length
            : null,
          protectedChanges: steps.filter((s) => s.choice.protectedChange)
            .length,
          guardUnknownSteps: steps.filter((s) => s.choice.guardUnknown).length,
          allClears: steps.reduce((n, s) => n + s.allClears, 0),
          lines: steps.reduce((n, s) => n + s.lines, 0),
          moves: steps.reduce((n, s) => n + s.moves.length, 0),
        });
      }
  await fs.writeFile(
    `${dir}/diagnostics.json`,
    JSON.stringify(rows, null, 2) + "\n",
  );
  console.log(
    JSON.stringify(
      rows.filter((r) => r.critical || r.mode === "recovery-always"),
      null,
      2,
    ),
  );
} finally {
  await server.close();
}
