import { createServer } from "vite";
import fs from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { candidatePool, overlap, key } from "./actuator-pool.mjs";
const server = await createServer({ server: { middlewareMode: true } });
const modes = [
  "baseline",
  "recovery-once",
  "recovery-always",
  "protected-diversity",
  "recovery-diverse",
];
const styles = ["clear", "space", "three", "plausible"];
const dir = "docs/qa/director-sequences";
try {
  const R = await server.ssrLoadModule("/src/core/rules.ts"),
    P = await server.ssrLoadModule("/scripts/difficulty/players.ts"),
    B = await server.ssrLoadModule("/scripts/director/resilience.ts"),
    A = await server.ssrLoadModule("/scripts/difficulty/analyze.ts");
  const corpus = [];
  for (const [split, offset] of [
    ["development", 91000],
    ["confirmation", 101000],
  ])
    for (let i = 1; i <= 4; i++)
      for (const collector of ["clear", "plausible"]) {
        const seed = offset + i;
        let g = R.newGame(seed, "sequence-" + seed, "flow-v4"),
          history = [],
          ordinary = null,
          stress = null;
        while (g.status === "playing" && g.moves <= 90) {
          if (g.tray.every((s) => !s.used)) {
            if (g.moves >= 12) {
              const p = {
                split,
                seed,
                collector,
                state: structuredClone(g),
                history: structuredClone(history),
              };
              ordinary ??= p;
              if (
                !stress ||
                g.board.filter(Boolean).length >
                  stress.state.board.filter(Boolean).length
              )
                stress = p;
            }
            history = [...history, structuredClone(g.tray)].slice(-4);
          }
          const m = P.choose(
            g.board,
            g.tray,
            collector,
            R.random(seed + g.moves).value,
          );
          if (!m) break;
          g = R.applyMove(g, m, g.revision).state;
        }
        for (const [kind, p] of [
          ["ordinary", ordinary],
          ["stress", stress],
        ])
          if (
            p &&
            !(kind === "stress" && p.state.moves === ordinary.state.moves)
          )
            corpus.push({
              ...p,
              kind,
              id: `${split}-${seed}-${collector}-${kind}`,
              critical: p.state.board.filter(Boolean).length >= 32,
            });
      }
  // Coverage extension declared after initial run: unchanged policies/gates,
  // only new critical states, never selected by intervention outcomes.
  for (const [split, offset] of [
    ["development", 91200],
    ["confirmation", 101200],
  ]) {
    for (
      let i = 1;
      i <= 32 &&
      corpus.filter((p) => p.split === split && p.critical).length < 8;
      i++
    ) {
      const seed = offset + i;
      let g = R.newGame(seed, "critical-" + seed, "flow-v4"),
        history = [],
        best = null;
      while (g.status === "playing" && g.moves <= 180) {
        if (g.tray.every((s) => !s.used)) {
          if (
            g.moves >= 12 &&
            g.board.filter(Boolean).length >= 32 &&
            (!best ||
              g.board.filter(Boolean).length >
                best.state.board.filter(Boolean).length)
          )
            best = {
              split,
              seed,
              collector: "plausible",
              state: structuredClone(g),
              history: structuredClone(history),
              kind: "critical-supplement",
              id: `${split}-${seed}-critical-supplement`,
              critical: true,
            };
          history = [...history, structuredClone(g.tray)].slice(-4);
        }
        const m = P.choose(
          g.board,
          g.tray,
          "plausible",
          R.random(seed + g.moves).value,
        );
        if (!m) break;
        g = R.applyMove(g, m, g.revision).state;
      }
      if (best) corpus.push(best);
    }
  }
  const runs = [];
  let cache = new Map();
  let timings = [],
    unknownChecks = 0,
    proofMisses = 0;
  function select(p, mode, step) {
    const started = performance.now();
    if (mode === "baseline" || (mode === "recovery-once" && step > 0))
      return {
        tray: p.state.tray,
        changed: false,
        repeat: overlap(p.state.tray, p.history),
        reason: "baseline",
      };
    const cacheKey = JSON.stringify([
      p.seed,
      p.state.board,
      p.state.tray,
      p.state.moves,
      p.state.rhythm,
      p.history,
    ]);
    let pool = cache.get(cacheKey);
    if (!pool) {
      pool = candidatePool(R, B, p);
      cache.set(cacheKey, pool);
      proofMisses += pool.filter((c) => !c.witness).length;
    }
    const base = pool[0];
    let selected = base;
    if (mode !== "protected-diversity") {
      const eligible = pool
        .filter(
          (c) =>
            c.witness && c.known && base.known && c.success >= base.success,
        )
        .sort((a, b) => a.occupied - b.occupied);
      if (eligible.length && eligible[0].occupied < base.occupied - 1e-9)
        selected = eligible[0];
    }
    const target = selected;
    let guardUnknown = false;
    if (mode === "protected-diversity" || mode === "recovery-diverse") {
      const exact = (c) => {
        if (!("allClear" in c)) {
          c.allClear = A.analyze(p.state.board, c.tray, 50000).allClearPossible;
          if (c.allClear === null) unknownChecks++;
        }
        return c.allClear;
      };
      const options = pool.filter(
        (c) =>
          c.witness &&
          c.known &&
          target.known &&
          c.repeat < target.repeat - 1e-9 &&
          c.models.every(
            (m, i) =>
              m.success + 1e-9 >= target.models[i].success &&
              m.expectedLines + 1e-9 >= target.models[i].expectedLines &&
              m.expectedOccupied <= target.models[i].expectedOccupied + 1e-9,
          ),
      );
      if (options.length) {
        const targetClear = exact(target);
        guardUnknown = targetClear === null;
        if (targetClear !== null) {
          const safe = options
            .filter((c) => {
              const v = exact(c);
              guardUnknown ||= v === null;
              return v !== null && (!targetClear || v);
            })
            .sort((a, b) => a.repeat - b.repeat);
          if (safe.length) selected = safe[0];
        }
      }
    }
    timings.push(performance.now() - started);
    return {
      tray: selected.tray,
      changed: key(selected.tray) !== key(base.tray),
      repeat: selected.repeat,
      reason: selected === base ? "fallback" : selected.source,
      guardUnknown,
      proof: selected === base ? null : selected.witness,
      protectedChange: selected !== target,
      targetTray: target.tray,
    };
  }
  for (const p of corpus) {
    cache = new Map();
    for (const style of styles)
      for (const mode of modes) {
        let g = structuredClone(p.state),
          history = structuredClone(p.history);
        const steps = [];
        for (let step = 0; step < 6 && g.status === "playing"; step++) {
          if (g.tray.some((s) => s.used)) throw Error("not refill");
          const input = { seed: p.seed, state: g, history };
          const frozen = JSON.stringify(input);
          const choice = select(input, mode, step);
          if (JSON.stringify(input) !== frozen) throw Error("mutation");
          g = { ...g, tray: structuredClone(choice.tray) };
          history = [...history, structuredClone(g.tray)].slice(-4);
          let lines = 0,
            allClears = 0;
          const moves = [];
          const before = structuredClone(g);
          for (let j = 0; j < 3; j++) {
            const m = P.choose(
              g.board,
              g.tray,
              style,
              R.random(p.seed + g.moves).value,
            );
            if (!m) break;
            const placed = R.place(
              g.board,
              R.shapeById(g.tray[m.slot].shapeId),
              m.x,
              m.y,
              g.tray[m.slot].color,
            );
            const v = R.applyMove(g, m, g.revision);
            if (JSON.stringify(v.state.board) !== JSON.stringify(placed.board))
              throw Error("board mismatch");
            lines += placed.lines;
            allClears += Number(v.allClear);
            moves.push(m);
            g = v.state;
            if (g.status !== "playing") break;
          }
          const complete = moves.length === 3;
          steps.push({
            step,
            before,
            choice,
            moves,
            lines,
            allClears,
            complete,
            endOccupied: g.board.filter(Boolean).length,
            after: structuredClone(g),
          });
          if (!complete) break;
        }
        runs.push({
          id: p.id,
          split: p.split,
          critical: p.critical,
          kind: p.kind,
          style,
          mode,
          steps,
          complete: steps.length === 6 && steps.every((s) => s.complete),
        });
      }
    console.log(`finished ${p.id} (${runs.length} episodes)`);
  }
  const summaries = [];
  const sum = (a, f) => a.reduce((n, x) => n + f(x), 0);
  for (const split of ["development", "confirmation"])
    for (const style of ["all", ...styles])
      for (const mode of modes) {
        const chosen = runs.filter(
          (r) =>
            r.split === split &&
            r.mode === mode &&
            (style === "all" || r.style === style),
        );
        const bases = chosen.map((r) =>
          runs.find(
            (b) =>
              b.id === r.id && b.style === r.style && b.mode === "baseline",
          ),
        );
        const countMoves = (a) =>
          sum(a, (r) => sum(r.steps, (s) => s.moves.length));
        const moves = countMoves(chosen),
          baseMoves = countMoves(bases);
        const rate = (a, f) => sum(a, (r) => sum(r.steps, f)) / countMoves(a);
        const linesRatio =
          rate(chosen, (s) => s.lines) / rate(bases, (s) => s.lines);
        const ac = rate(chosen, (s) => s.allClears),
          bac = rate(bases, (s) => s.allClears);
        const acRatio = bac ? ac / bac : null;
        const repeat = (a) =>
          sum(a, (r) => sum(r.steps, (s) => s.choice.repeat)) /
          sum(a, (r) => r.steps.length);
        const repeatRatio = repeat(bases)
          ? repeat(chosen) / repeat(bases)
          : null;
        const successDelta =
          (chosen.filter((r) => r.complete).length -
            bases.filter((r) => r.complete).length) /
          chosen.length;
        const changed =
          sum(chosen, (r) => r.steps.filter((s) => s.choice.changed).length) /
          sum(chosen, (r) => r.steps.length);
        const criticalPairs = chosen
          .map((r, i) => ({ r, b: bases[i] }))
          .filter(
            ({ r, b }) =>
              r.critical && r.steps[0].complete && b.steps[0].complete,
          );
        const criticalDelta = criticalPairs.length
          ? sum(
              criticalPairs,
              ({ r, b }) => r.steps[0].endOccupied - b.steps[0].endOccupied,
            ) / criticalPairs.length
          : null;
        const criticalPositions = new Set(
          chosen.filter((r) => r.critical).map((r) => r.id),
        ).size;
        const pass =
          changed >= 0.2 &&
          successDelta >= -0.02 &&
          linesRatio >= 0.9 &&
          (acRatio === null || acRatio >= 0.9) &&
          (mode === "protected-diversity"
            ? repeatRatio !== null && repeatRatio <= 0.8
            : mode === "recovery-diverse"
              ? repeatRatio !== null &&
                repeatRatio <= 1.1 &&
                criticalPositions >= 8 &&
                criticalDelta !== null &&
                criticalDelta <= -2
              : false);
        summaries.push({
          split,
          style,
          mode,
          episodes: chosen.length,
          moves,
          baseMoves,
          complete: chosen.filter((r) => r.complete).length,
          baseComplete: bases.filter((r) => r.complete).length,
          successDelta,
          changed,
          linesRatio,
          allClearRatio: acRatio,
          allClears: sum(chosen, (r) => sum(r.steps, (s) => s.allClears)),
          baseAllClears: sum(bases, (r) => sum(r.steps, (s) => s.allClears)),
          repeatRatio,
          criticalPositions,
          criticalPairs: criticalPairs.length,
          criticalDelta,
          pass,
        });
      }
  timings.sort((a, b) => a - b);
  const summary = {
    positions: corpus.length,
    episodes: runs.length,
    criticalPositions: corpus.filter((p) => p.critical).length,
    unknownChecks,
    proofMisses,
    selectionMs: {
      p50: timings[Math.floor(timings.length * 0.5)],
      p95: timings[Math.floor(timings.length * 0.95)],
      max: timings.at(-1),
    },
    accepted: ["protected-diversity", "recovery-diverse"].filter((mode) =>
      summaries.filter((s) => s.mode === mode).every((s) => s.pass),
    ),
    summaries,
  };
  const hashes = {};
  for (const f of [
    "scripts/director/sequences.mjs",
    "scripts/director/actuator-pool.mjs",
  ])
    hashes[f] = createHash("sha256")
      .update(await fs.readFile(f))
      .digest("hex");
  await fs.writeFile(
    `${dir}/evidence.json.gz`,
    gzipSync(JSON.stringify({ hashes, corpus, runs })),
  );
  await fs.writeFile(
    `${dir}/summary.json`,
    JSON.stringify(summary, null, 2) + "\n",
  );
  console.log(
    JSON.stringify(
      { ...summary, summaries: summaries.filter((s) => s.style === "all") },
      null,
      2,
    ),
  );
} finally {
  await server.close();
}
