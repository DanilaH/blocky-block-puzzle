import fs from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { createServer } from "vite";
const dir = "docs/qa/director-signals-census";
const server = await createServer({ server: { middlewareMode: true } });
try {
  const R = await server.ssrLoadModule("/src/core/rules.ts"),
    A = await server.ssrLoadModule("/scripts/difficulty/analyze.ts"),
    B = await server.ssrLoadModule("/scripts/director/resilience.ts"),
    P = await server.ssrLoadModule("/scripts/difficulty/players.ts");
  const corpus = [];
  for (const [split, offset] of [["confirmation", 151000]])
    for (let i = 1; i <= 16; i++)
      for (const collector of ["clear", "plausible"]) {
        const seed = offset + i;
        let g = R.newGame(seed, "signal-" + seed, "flow-v4");
        while (g.status === "playing" && g.moves <= 120) {
          if (
            g.moves >= 12 &&
            g.moves % 3 === 0 &&
            g.tray.every((s) => !s.used)
          )
            corpus.push({
              id: `${split}-${seed}-${collector}-${g.moves}`,
              split,
              seed,
              collector,
              state: structuredClone(g),
            });
          const m = P.choose(
            g.board,
            g.tray,
            collector,
            R.random(seed + g.moves).value,
          );
          if (!m) break;
          g = R.applyMove(g, m, g.revision).state;
        }
      }
  const bounds = (first) =>
    first.length
      ? [
          first.filter((f) => f.status === "unsolvable").length / first.length,
          first.filter((f) => f.status !== "solvable").length / first.length,
        ]
      : [0, 0];
  const records = [];
  for (const p of corpus) {
    const t0 = performance.now();
    const models = ["lines", "space"].map((t) =>
      B.resilience(p.state.board, p.state.tray, t),
    );
    const oldMs = performance.now() - t0;
    const t1 = performance.now();
    const a = A.analyze(p.state.board, p.state.tray, 100000);
    const firstMs = performance.now() - t1;
    const first = bounds(a.first),
      maxLines = Math.max(0, ...a.first.map((f) => f.immediateLines)),
      tempt = maxLines
        ? bounds(a.first.filter((f) => f.immediateLines === maxLines))
        : [0, 0];
    let rng = (p.seed ^ p.state.moves) >>> 0 || 1;
    const next = () => {
      const x = R.random(rng);
      rng = x.state;
      return x.value;
    };
    const sampled = a.first
      .filter((f) => f.status === "solvable")
      .map((f) => ({ f, rank: next() }))
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 8)
      .map((x) => x.f);
    const t2 = performance.now();
    const children = sampled.map((f) => {
      const board = R.place(
        p.state.board,
        R.shapeById(p.state.tray[f.move.slot].shapeId),
        f.move.x,
        f.move.y,
      ).board;
      const tray = p.state.tray.map((s, i) => ({
        ...s,
        used: i === f.move.slot,
      }));
      const n = A.analyze(board, tray, 20000);
      return {
        move: f.move,
        board,
        tray,
        analysis: n,
        bounds: bounds(n.first),
      };
    });
    const secondMs = performance.now() - t2;
    const second = children.length
      ? [
          children.reduce((n, c) => n + c.bounds[0], 0) / children.length,
          children.reduce((n, c) => n + c.bounds[1], 0) / children.length,
        ]
      : [0, 1];
    const combined = [
      Math.max(first[0], tempt[0], second[0]),
      Math.max(first[1], tempt[1], second[1]),
    ];
    const old = models.every((m) => m.complete)
      ? Number(Math.min(...models.map((m) => m.success)) <= 0.9)
      : null;
    const outcomes = [];
    for (const style of ["clear", "space", "three", "plausible"]) {
      const o = P.playTray(
        p.state.board,
        p.state.tray,
        style,
        p.seed + p.state.moves,
      );
      let board = p.state.board;
      const used = new Set();
      for (const m of o.moves) {
        if (used.has(m.slot)) throw Error("reused slot");
        used.add(m.slot);
        board = R.place(
          board,
          R.shapeById(p.state.tray[m.slot].shapeId),
          m.x,
          m.y,
        ).board;
      }
      if (board.filter(Boolean).length !== o.endOccupied)
        throw Error("bad replay");
      outcomes.push({ style, ...o });
    }
    records.push({
      id: p.id,
      split: p.split,
      old,
      signals: { first, tempt, second, combined },
      models,
      analysis: a,
      children,
      outcomes,
      timing: { oldMs, firstMs, secondMs },
    });
    if (records.length % 24 === 0)
      console.log(`analyzed ${records.length}/${corpus.length}`);
  }
  function evaluate(split, name, threshold, style = "learning") {
    const pairs = records
      .filter((r) => r.split === split)
      .flatMap((r) =>
        r.outcomes
          .filter(
            (o) =>
              style === "all" ||
              (style === "learning" && o.style !== "three") ||
              o.style === style,
          )
          .map((o) => ({ r, o })),
      );
    const c = {
      n: pairs.length,
      tp: 0,
      fp: 0,
      tn: 0,
      fn: 0,
      unknownFail: 0,
      unknownSuccess: 0,
    };
    for (const { r, o } of pairs) {
      const b = r.signals[name];
      const pred =
        name === "old"
          ? r.old
          : b[0] >= threshold
            ? 1
            : b[1] < threshold
              ? 0
              : null;
      if (pred === null) {
        c[o.success ? "unknownSuccess" : "unknownFail"]++;
      } else if (pred) c[o.success ? "fp" : "tp"]++;
      else c[o.success ? "tn" : "fn"]++;
    }
    c.failures = c.tp + c.fn + c.unknownFail;
    c.successes = c.fp + c.tn + c.unknownSuccess;
    c.recall = c.failures ? c.tp / c.failures : null;
    c.fpr = c.successes ? c.fp / c.successes : null;
    c.coverage = c.n ? (c.n - c.unknownFail - c.unknownSuccess) / c.n : 0;
    return c;
  }
  const thresholds = [0.05, 0.1, 0.2, 0.35, 0.5],
    tuning = {},
    chosen = {},
    results = [];
  Object.assign(chosen, {
    first: 0.35,
    tempt: 0.5,
    second: 0.35,
    combined: 0.35,
  });
  for (const split of ["confirmation"])
    for (const style of ["learning", "clear", "space", "three", "plausible"])
      for (const name of ["old", "first", "tempt", "second", "combined"]) {
        if (name !== "old" && chosen[name] === null) continue;
        results.push({
          split,
          style,
          name,
          threshold: name === "old" ? 0.1 : chosen[name],
          ...evaluate(split, name, chosen[name], style),
        });
      }
  const oldRecall = results.find(
    (r) =>
      r.split === "confirmation" && r.style === "learning" && r.name === "old",
  ).recall;
  const accepted = Object.keys(chosen).filter((name) => {
    const s = results.find(
      (r) =>
        r.split === "confirmation" && r.style === "learning" && r.name === name,
    );
    return (
      s &&
      s.failures >= 20 &&
      s.recall >= 0.6 &&
      s.recall >= oldRecall + 0.2 &&
      results
        .filter((r) => r.split === "confirmation" && r.name === name)
        .every((r) => r.fpr <= 0.15 && r.coverage >= 0.8)
    );
  });
  const summary = {
    positions: corpus.length,
    replays: corpus.length * 4,
    chosen,
    tuning,
    accepted,
    results,
  };
  const timings = Object.fromEntries(
    ["oldMs", "firstMs", "secondMs"].map((k) => {
      const a = records.map((r) => r.timing[k]).sort((a, b) => a - b);
      return [
        k,
        {
          p50: a[Math.floor(a.length * 0.5)],
          p95: a[Math.floor(a.length * 0.95)],
          max: a.at(-1),
        },
      ];
    }),
  );
  summary.timings = timings;
  const hash = createHash("sha256")
    .update(await fs.readFile("scripts/director/signals-census.mjs"))
    .digest("hex");
  await fs.writeFile(
    `${dir}/evidence.json.gz`,
    gzipSync(JSON.stringify({ hash, corpus, records })),
  );
  await fs.writeFile(
    `${dir}/summary.json`,
    JSON.stringify(summary, null, 2) + "\n",
  );
  console.log(
    JSON.stringify(
      {
        ...summary,
        tuning: undefined,
        results: results.filter((r) => r.style === "learning"),
      },
      null,
      2,
    ),
  );
} finally {
  await server.close();
}
