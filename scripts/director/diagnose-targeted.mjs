import fs from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createServer } from "vite";
const dir = "docs/qa/director-targeted",
  data = JSON.parse(gunzipSync(await fs.readFile(`${dir}/evidence.json.gz`)));
const server = await createServer({ server: { middlewareMode: true } });
try {
  const A = await server.ssrLoadModule("/scripts/difficulty/analyze.ts");
  const rows = [],
    failures = [];
  for (const split of ["development", "confirmation"])
    for (const style of ["clear", "space", "three", "plausible"]) {
      const runs = data.runs.filter(
        (r) => r.mode === "baseline" && r.split === split && r.style === style,
      );
      const steps = runs.flatMap((r) =>
        r.steps.map((s) => ({ id: r.id, ...s })),
      );
      const fail = steps.filter((s) => !s.complete);
      const tp = fail.filter((s) => s.choice.risky).length;
      rows.push({
        split,
        style,
        steps: steps.length,
        failures: fail.length,
        truePositive: tp,
        falseNegative: fail.length - tp,
        falsePositive: steps.filter((s) => s.complete && s.choice.risky).length,
        trueNegative: steps.filter((s) => s.complete && !s.choice.risky).length,
        recall: fail.length ? tp / fail.length : null,
      });
      for (const s of fail) {
        const a = A.analyze(s.before.board, s.before.tray, 100000);
        const m = s.moves[0];
        const first = m
          ? a.first.find(
              (o) =>
                o.move.slot === m.slot && o.move.x === m.x && o.move.y === m.y,
            )
          : null;
        failures.push({
          id: s.id,
          split,
          style,
          step: s.step,
          modelRisk: s.choice.baseRisk,
          triggered: s.choice.risky,
          actualPlaced: s.moves.length,
          initialStatus: a.status,
          analysisComplete: a.complete,
          safeRatio: a.safeRatio,
          safeRatioBounds: a.safeRatioBounds,
          firstChosenStatus: first?.status ?? null,
        });
      }
    }
  const summary = {
    note: "Post-hoc diagnosis, not a tuned classifier. Rows are dependent synthetic episodes; no human accuracy claim.",
    rows,
    failures,
  };
  await fs.writeFile(
    `${dir}/diagnostics.json`,
    JSON.stringify(summary, null, 2) + "\n",
  );
  console.log(
    JSON.stringify(
      {
        rows,
        initiallySolvable: failures.filter(
          (f) => f.initialStatus === "solvable",
        ).length,
        initiallyUnknown: failures.filter((f) => f.initialStatus === "unknown")
          .length,
        firstMoveAlreadyDead: failures.filter(
          (f) => f.firstChosenStatus === "unsolvable",
        ).length,
      },
      null,
      2,
    ),
  );
} finally {
  await server.close();
}
