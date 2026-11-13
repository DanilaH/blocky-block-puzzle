import { createServer } from "vite";
import fs from "node:fs/promises";
import { gunzipSync, gzipSync } from "node:zlib";
const server = await createServer({ server: { middlewareMode: true } });
try {
  const R = await server.ssrLoadModule("/src/core/rules.ts"),
    A = await server.ssrLoadModule("/scripts/difficulty/analyze.ts"),
    B = await server.ssrLoadModule("/scripts/director/resilience.ts"),
    P = await server.ssrLoadModule("/scripts/difficulty/players.ts");
  const corpus = JSON.parse(
    gunzipSync(
      await fs.readFile(
        "docs/qa/difficulty-package1/holdout/positions.json.gz",
      ),
    ),
  ).positions;
  const results = [];
  for (const p of corpus) {
    const tray = p.state.tray,
      board = p.state.board;
    const exact = A.analyze(board, tray, 1000000);
    const models = ["lines", "space"].map((t) => B.resilience(board, tray, t));
    const outcomes = [];
    for (const style of [
      "clear",
      "space",
      "combo",
      "two",
      "three",
      "plausible",
    ])
      for (let roll = 0; roll < (style === "plausible" ? 8 : 1); roll++) {
        const o = P.playTray(board, tray, style, p.seed + roll * 7919);
        let b = board,
          used = new Set();
        for (const m of o.moves) {
          if (
            tray[m.slot].used ||
            used.has(m.slot) ||
            !R.fits(b, R.shapeById(tray[m.slot].shapeId), m.x, m.y)
          )
            throw Error("illegal replay");
          used.add(m.slot);
          b = R.place(b, R.shapeById(tray[m.slot].shapeId), m.x, m.y).board;
        }
        if (b.filter(Boolean).length !== o.endOccupied)
          throw Error("replay mismatch");
        outcomes.push({ style, roll, ...o });
      }
    results.push({ id: p.id, safeRatio: exact.safeRatio, models, outcomes });
  }
  const summary = {
    positions: results.length,
    replayed: results.reduce((n, r) => n + r.outcomes.length, 0),
    firstSafeButLaterRisk: results.filter(
      (r) =>
        r.safeRatio === 1 &&
        r.models.some((m) => m.complete && m.success < 0.99),
    ).length,
    optimisticDisagreements: results.filter(
      (r) =>
        r.models.every((m) => m.complete && m.success >= 0.98) &&
        r.outcomes.some((o) => !o.success),
    ).length,
    modelUnknown: results.filter((r) => r.models.some((m) => !m.complete))
      .length,
  };
  await fs.mkdir("docs/qa/director-resilience", { recursive: true });
  await fs.writeFile(
    "docs/qa/director-resilience/model-validation.json.gz",
    gzipSync(JSON.stringify({ summary, results })),
  );
  console.log(JSON.stringify(summary));
} finally {
  await server.close();
}
