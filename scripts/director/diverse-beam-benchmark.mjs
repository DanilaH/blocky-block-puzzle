import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createServer } from "vite";
const server = await createServer({ server: { middlewareMode: true } });
const out = process.argv[2] || "docs/qa/feel47/diverse-beam.json";
try {
  const R = await server.ssrLoadModule("/src/core/rules.ts"),
    H = await server.ssrLoadModule("/src/core/rhythm.ts"),
    P = await server.ssrLoadModule("/scripts/difficulty/players.ts"),
    D = await server.ssrLoadModule("/scripts/director/diverse-beam.ts");
  const bag = (t) =>
    t
      .map((s) => R.shapeById(s.shapeId).family)
      .sort()
      .join(",");
  const runs = [];
  let proofs = 0;
  for (const [split, offset] of [
    ["development", 201000],
    ["confirmation", 211000],
  ])
    for (let i = 1; i <= 4; i++)
      for (const style of ["clear", "three", "plausible"])
        for (const mode of ["baseline", "candidate"]) {
          const seed = offset + i;
          let g = R.newGame(seed, "diverse-" + seed, "flow-v4"),
            lines = 0,
            clears = 0,
            repeats = 0,
            deals = 0,
            misses = 0;
          const history = [],
            moves = [];
          while (g.status === "playing" && g.moves < 120) {
            if (g.tray.every((s) => !s.used)) {
              const k = bag(g.tray);
              repeats += Number(history.slice(-4).includes(k));
              history.push(k);
              deals++;
            }
            const m = P.choose(
              g.board,
              g.tray,
              style,
              R.random(seed + g.moves).value,
            );
            if (!m) break;
            const result = R.applyMove(g, m, g.revision);
            assert.ok(result);
            let n = result.state;
            lines += result.lines;
            clears += Number(result.allClear);
            moves.push(m);
            if (
              mode === "candidate" &&
              g.tray.filter((s) => !s.used).length === 1
            ) {
              const rhythm = H.advanceRhythmV4(
                g.rhythm,
                n.board,
                result.lines,
                result.allClear,
                R.random(g.rngState).value,
              );
              const d = D.diverseBeamDeal(
                n.board,
                g.rngState,
                g.moves + 1,
                bag(g.tray),
                rhythm,
              );
              if (!d) misses++;
              else {
                let b = n.board;
                const used = new Set();
                for (const w of d.witness) {
                  assert.ok(!used.has(w.slot));
                  used.add(w.slot);
                  const shape = R.shapeById(d.tray[w.slot].shapeId);
                  assert.ok(R.fits(b, shape, w.x, w.y));
                  b = R.place(b, shape, w.x, w.y).board;
                }
                assert.equal(used.size, 3);
                proofs++;
                n = {
                  ...n,
                  tray: d.tray,
                  rngState: d.rngState,
                  rhythm: {
                    ...n.rhythm,
                    recentBags: [
                      ...(n.rhythm.recentBags ?? []).slice(0, -1),
                      bag(d.tray),
                    ],
                  },
                  status: R.hasMove(n.board, d.tray) ? "playing" : "over",
                };
              }
            }
            g = n;
          }
          runs.push({
            split,
            seed,
            style,
            mode,
            moveCount: g.moves,
            lines,
            clears,
            repeats,
            deals,
            misses,
            survived: g.status === "playing",
            moves,
            final: g,
          });
        }
  const summary = [];
  const sum = (rs, k) => rs.reduce((n, r) => n + Number(r[k]), 0);
  for (const split of ["development", "confirmation"])
    for (const style of ["all", "clear", "three", "plausible"]) {
      const b = runs.filter(
        (r) =>
          r.split === split &&
          r.mode === "baseline" &&
          (style === "all" || r.style === style),
      );
      const n = runs.filter(
        (r) =>
          r.split === split &&
          r.mode === "candidate" &&
          (style === "all" || r.style === style),
      );
      const ratio = (k) =>
        sum(b, k)
          ? sum(n, k) / sum(n, "moveCount") / (sum(b, k) / sum(b, "moveCount"))
          : null;
      const repeatRatio = sum(b, "repeats")
        ? sum(n, "repeats") /
          sum(n, "deals") /
          (sum(b, "repeats") / sum(b, "deals"))
        : null;
      const survivalDelta = sum(n, "survived") - sum(b, "survived");
      summary.push({
        split,
        style,
        baseMoves: sum(b, "moveCount"),
        newMoves: sum(n, "moveCount"),
        baseRepeats: sum(b, "repeats"),
        newRepeats: sum(n, "repeats"),
        repeatRatio,
        lineRatio: ratio("lines"),
        clearRatio: ratio("clears"),
        baseClears: sum(b, "clears"),
        newClears: sum(n, "clears"),
        survivalDelta,
        misses: sum(n, "misses"),
        pass:
          (style !== "all" || (repeatRatio !== null && repeatRatio <= 0.8)) &&
          (ratio("lines") === null || ratio("lines") >= 0.95) &&
          (ratio("clears") === null || ratio("clears") >= 0.9) &&
          survivalDelta >= 0 &&
          sum(n, "misses") / sum(n, "deals") <= 0.02,
      });
    }
  await fs.mkdir(out.slice(0, out.lastIndexOf("/")), { recursive: true });
  await fs.writeFile(
    out,
    JSON.stringify(
      {
        gates:
          "Frozen before first run: repeats/deal -20% overall each split; lines/move >=95%, clears/move >=90%, no reduced cap survival each style; candidate search misses <=2%. Null search falls back to baseline in offline harness; no app integration.",
        proofs,
        summary,
        runs,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await server.close();
}
