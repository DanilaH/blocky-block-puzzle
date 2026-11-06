import { createServer } from "vite";
import fs from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
const dir = process.env.DIFFICULTY_OUT || "docs/qa/difficulty-package1";
const perTag = Number(process.env.DIFFICULTY_PER_TAG || 8);
const budget = Number(process.env.DIFFICULTY_BUDGET || 1000000);
const offset = Number(process.env.DIFFICULTY_OFFSET || 0);
const server = await createServer({ server: { middlewareMode: true } });
try {
  const R = await server.ssrLoadModule("/src/core/rules.ts"),
    M = await server.ssrLoadModule("/src/core/monetization.ts");
  const A = await server.ssrLoadModule("/scripts/difficulty/analyze.ts"),
    P = await server.ssrLoadModule("/scripts/difficulty/players.ts");
  const tags = [
    "opening",
    "crowded",
    "fragmented",
    "long-series",
    "before-all-clear",
    "after-all-clear",
    "before-loss",
    "after-revive",
  ];
  const buckets = Object.fromEntries(tags.map((t) => [t, []]));
  let simulatedMoves = 0,
    games = 0;
  function holes(b) {
    let n = 0;
    for (let i = 0; i < 64; i++)
      if (
        !b[i] &&
        [
          i % 8 > 0 ? i - 1 : -1,
          i % 8 < 7 ? i + 1 : -1,
          i >= 8 ? i - 8 : -1,
          i < 56 ? i + 8 : -1,
        ].every((j) => j < 0 || b[j])
      )
        n++;
    return n;
  }
  function keep(tag, g, seed, style, nextMove = null) {
    const bucket = buckets[tag];
    if (
      bucket.length >= perTag ||
      bucket.some((x) => x.seed === seed && x.style === style)
    )
      return;
    bucket.push({ tag, seed, style, nextMove, state: structuredClone(g) });
  }
  // Recorded simulations: clear-first, full-tray planner, and random stress player. No hand-edited fields.
  collect: for (let n = 1; n <= 32; n++)
    for (const style of ["clear", "three", "scatter"]) {
      const seed = (offset + n) * 1777;
      let g = {
        ...R.newGame(seed, "difficulty-" + seed, "flow-v4"),
        scoringVersion: "festival-v4",
        seriesBonusVersion: 1,
      };
      games++;
      keep("opening", g, seed, style);
      while (g.status === "playing" && g.moves < 240) {
        const choices =
          style === "scatter" ? A.actions(A.toRows(g.board), g.tray) : [];
        const m =
          style === "scatter"
            ? choices[R.random((seed ^ g.moves) >>> 0).state % choices.length]
            : P.choose(g.board, g.tray, style);
        if (!m) throw Error("No player action");
        const v = R.applyMove(g, m, g.revision);
        simulatedMoves++;
        if (g.board.filter(Boolean).length >= 28)
          keep("crowded", g, seed, style, m);
        if (holes(g.board) >= 2) keep("fragmented", g, seed, style, m);
        if (g.streak >= 5) keep("long-series", g, seed, style, m);
        if (v.allClear) keep("before-all-clear", g, seed, style, m);
        if (v.state.status === "over") {
          keep("before-loss", g, seed, style, m);
          const plan = M.revivePlan(v.state);
          if (plan) keep("after-revive", plan.game, seed, style);
        }
        g = v.state;
        if (v.allClear) keep("after-all-clear", g, seed, style);
      }
      if (tags.every((t) => buckets[t].length >= perTag)) break collect;
    }
  const corpus = Object.values(buckets)
    .flat()
    .map((p, i) => ({ ...p, id: "p" + String(i).padStart(3, "0") }));
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "positions.json.gz"),
    gzipSync(
      JSON.stringify(
        {
          schema: 1,
          offset,
          perTag,
          simulatedMoves,
          games,
          coverage: Object.fromEntries(tags.map((t) => [t, buckets[t].length])),
          positions: corpus,
        },
        null,
        2,
      ),
    ),
  );
  console.log(
    JSON.stringify({
      phase: "collected",
      games,
      simulatedMoves,
      positions: corpus.length,
      coverage: Object.fromEntries(tags.map((t) => [t, buckets[t].length])),
    }),
  );
  const results = [];
  for (const p of corpus) {
    // Original tray may be partially used. Alternative is evaluated only at a true refill boundary.
    const candidates = [{ name: "actual", tray: p.state.tray }];
    if (p.state.tray.every((s) => !s.used))
      candidates.push({
        name: "alternative",
        tray: R.deal(
          p.state.board,
          p.seed ^ 0x315abc,
          "flow-v4",
          p.state.moves,
          "",
          p.state.rhythm,
        ).tray,
      });
    // Counterfactual catalog controls, sampled before any solver outcome is known.
    for (let k = 0; k < 3; k++) {
      let seed = (p.seed ^ p.state.moves ^ Math.imul(k + 1, 0x6ac690c5)) >>> 0;
      const tray = Array.from({ length: 3 }, () => {
        const r = R.random(seed);
        seed = r.state;
        return {
          shapeId: R.SHAPES[Math.floor(r.value * R.SHAPES.length)].id,
          used: false,
          color: 1,
        };
      });
      candidates.push({ name: "catalog-" + k, tray });
    }
    for (const c of candidates) {
      const t = performance.now(),
        metrics = A.analyze(p.state.board, c.tray, budget),
        ms = performance.now() - t;
      const outcomes = Object.fromEntries(
        P.styles.map((style) => [
          style,
          P.playTray(p.state.board, c.tray, style, p.seed),
        ]),
      );
      const { witness, first, ...compact } = metrics;
      results.push({
        id: p.id,
        tag: p.tag,
        remaining: c.tray.filter((s) => !s.used).length,
        candidate: c.name,
        tray: c.tray,
        metrics: compact,
        ms,
        witness,
        first,
        outcomes,
      });
    }
    if (results.length % 8 === 0)
      console.log(
        JSON.stringify({ phase: "analyzed", results: results.length }),
      );
  }
  const complete = results.filter(
    (r) =>
      r.metrics.complete &&
      r.metrics.status === "solvable" &&
      r.metrics.legalFirst > 0,
  );
  const bins = [
    ["narrow", 0, 0.5],
    ["middle", 0.5, 0.9],
    ["wide", 0.9, 1.001],
  ].map(([label, lo, hi]) => {
    const group = complete.filter(
      (r) => r.metrics.safeRatio >= lo && r.metrics.safeRatio < hi,
    );
    return {
      label,
      n: group.length,
      success: Object.fromEntries(
        P.styles.map((style) => [
          style,
          group.filter((r) => r.outcomes[style].success).length,
        ]),
      ),
      meanLines: group.length
        ? group.reduce((n, r) => n + (r.metrics.maxLinesOnSuccess ?? 0), 0) /
          group.length
        : null,
    };
  });
  const pairs = corpus.flatMap((p) => {
    const candidates = complete
      .filter((r) => r.id === p.id && r.remaining === 3)
      .sort((a, b) => a.metrics.safeRatio - b.metrics.safeRatio);
    const hard = candidates[0],
      easy = candidates.at(-1);
    if (!hard || !easy || easy.metrics.safeRatio - hard.metrics.safeRatio < 0.1)
      return [];
    return [
      {
        id: p.id,
        easy: easy.candidate,
        hard: hard.candidate,
        delta: easy.metrics.safeRatio - hard.metrics.safeRatio,
        outcomes: Object.fromEntries(
          P.styles.map((s) => [
            s,
            { easy: easy.outcomes[s].success, hard: hard.outcomes[s].success },
          ]),
        ),
      },
    ];
  });
  const byRemaining = [1, 2, 3].map((n) => ({
    remaining: n,
    bins: [
      ["narrow", 0, 0.5],
      ["middle", 0.5, 0.9],
      ["wide", 0.9, 1.001],
    ].map(([label, lo, hi]) => {
      const a = complete.filter(
        (r) =>
          r.remaining === n &&
          r.metrics.safeRatio >= lo &&
          r.metrics.safeRatio < hi,
      );
      return {
        label,
        n: a.length,
        success: Object.fromEntries(
          P.styles.map((s) => [
            s,
            a.filter((r) => r.outcomes[s].success).length,
          ]),
        ),
      };
    }),
  }));
  const times = results.map((r) => r.ms).sort((a, b) => a - b);
  const summary = {
    uniqueBoardTrays: new Set(
      results.map((r) =>
        JSON.stringify([
          corpus.find((p) => p.id === r.id).state.board.map((v) => Number(!!v)),
          r.tray.map((s) => [s.shapeId, s.used]),
        ]),
      ),
    ).size,
    schema: 1,
    offset,
    budget,
    corpusPositions: corpus.length,
    candidates: results.length,
    complete: results.filter((r) => r.metrics.complete).length,
    unknown: results.filter((r) => r.metrics.status === "unknown").length,
    incomplete: results.filter((r) => !r.metrics.complete).length,
    byRemaining,
    provenImpossible: results.filter((r) => r.metrics.status === "unsolvable")
      .length,
    bins,
    pairs,
    success: Object.fromEntries(
      P.styles.map((s) => [
        s,
        {
          success: complete.filter((r) => r.outcomes[s].success).length,
          total: complete.length,
        },
      ]),
    ),
    analysisMs: {
      p50: times[Math.floor(times.length * 0.5)],
      p95: times[Math.floor(times.length * 0.95)],
      max: times.at(-1),
    },
    notes: [
      "Stratified diagnostic positions, not an unbiased retention or session-length sample.",
      "Actual trays can be partly used; compare horizons only on 3 remaining pieces.",
      "Thresholds 0.5/0.9 and paired difference 0.1 fixed before this run.",
      "Unknown/exhausted searches excluded from exact bins. No human validation.",
    ],
  };
  await fs.writeFile(
    path.join(dir, "results.json.gz"),
    gzipSync(JSON.stringify({ summary, results }, null, 2)),
  );
  console.log(JSON.stringify(summary));
} finally {
  await server.close();
}
