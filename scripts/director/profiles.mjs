import { createServer } from "vite";
import fs from "node:fs/promises";
import { gzipSync, gunzipSync } from "node:zlib";
const server = await createServer({ server: { middlewareMode: true } });
try {
  const R = await server.ssrLoadModule("/src/core/rules.ts"),
    D = await server.ssrLoadModule("/scripts/director/policy.ts"),
    A = await server.ssrLoadModule("/scripts/difficulty/analyze.ts"),
    P = await server.ssrLoadModule("/scripts/difficulty/players.ts");
  const corpus = JSON.parse(
    gunzipSync(
      await fs.readFile(
        "docs/qa/difficulty-package1/holdout/positions.json.gz",
      ),
    ),
  ).positions;
  const seen = new Set(),
    cases = corpus
      .filter((p) => {
        const k = JSON.stringify(p.state.board.map(Boolean));
        if (seen.has(k) || p.state.board.filter(Boolean).length < 12)
          return false;
        seen.add(k);
        return true;
      })
      .slice(0, 32);
  const results = [];
  for (const p of cases)
    for (const profile of ["uncertain", "expert", "recovery"]) {
      const g = {
        ...p.state,
        moves: Math.max(40, p.state.moves),
        tray: R.deal(
          p.state.board,
          p.seed,
          "flow-v4",
          p.state.moves,
          "",
          p.state.rhythm,
        ).tray,
      };
      let d = { ...D.initialDirector(p.seed), phase: "challenge" };
      if (profile === "expert") d = { ...d, skill: 0.85, evidence: 10 };
      if (profile === "recovery") d = D.revived(d);
      const s = D.select(g, d),
        a = A.analyze(g.board, s.tray, 1000000);
      if (!a.witness) throw Error("Selected tray has no verified route");
      let board = g.board;
      for (const m of a.witness) {
        const shape = R.shapeById(s.tray[m.slot].shapeId);
        if (!R.fits(board, shape, m.x, m.y)) throw Error("Invalid witness");
        board = R.place(board, shape, m.x, m.y).board;
      }
      results.push({
        id: p.id,
        profile,
        diagnostic: s.diagnostic,
        safeRatio: a.safeRatio,
        orderFreedom: a.orderFreedom,
        preparation: a.minMovesToClearOnSuccess,
        allClear: a.allClearPossible,
        outcomes: Object.fromEntries(
          ["clear", "two", "three", "plausible"].map((style) => [
            style,
            P.playTray(g.board, s.tray, style, p.seed).success,
          ]),
        ),
      });
    }
  const summary = ["uncertain", "expert", "recovery"].map((profile) => {
    const a = results.filter((r) => r.profile === profile);
    return {
      profile,
      n: a.length,
      recipes: a.reduce(
        (c, r) => (
          (c[r.diagnostic.recipe] = (c[r.diagnostic.recipe] ?? 0) + 1),
          c
        ),
        {},
      ),
      meanSafe: a.reduce((n, r) => n + (r.safeRatio ?? 0), 0) / a.length,
      success: Object.fromEntries(
        ["clear", "two", "three", "plausible"].map((s) => [
          s,
          a.filter((r) => r.outcomes[s]).length,
        ]),
      ),
    };
  });
  await fs.writeFile(
    "docs/qa/director-package2/profiles.json",
    JSON.stringify({ summary, results }, null, 2),
  );
  console.log(JSON.stringify(summary));
} finally {
  await server.close();
}
