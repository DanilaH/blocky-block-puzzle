import { createServer } from "vite";
import fs from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { candidatePool, overlap, key } from "./actuator-pool.mjs";
const server = await createServer({ server: { middlewareMode: true } });
const modes = ["baseline", "risk-unprotected", "risk-guarded"];
const styles = ["clear", "space", "three", "plausible"];
const dir = "docs/qa/director-targeted";
try {
  const R = await server.ssrLoadModule("/src/core/rules.ts"),
    P = await server.ssrLoadModule("/scripts/difficulty/players.ts"),
    B = await server.ssrLoadModule("/scripts/director/resilience.ts"),
    A = await server.ssrLoadModule("/scripts/difficulty/analyze.ts");
  function riskModels(g) {
    return ["lines", "space"].map((t) => B.resilience(g.board, g.tray, t));
  }
  function riskScore(models) {
    return models.every((m) => m.complete)
      ? Math.min(...models.map((m) => m.success))
      : null;
  }
  const corpus = [];
  for (const [split, offset] of [
    ["development", 111000],
    ["confirmation", 121000],
  ])
    for (let i = 1; i <= 8; i++)
      for (const collector of ["clear", "plausible"]) {
        const seed = offset + i;
        let g = R.newGame(seed, "targeted-" + seed, "flow-v4"),
          history = [],
          ordinary = null,
          stress = null;
        while (g.status === "playing" && g.moves <= 120) {
          if (g.tray.every((s) => !s.used)) {
            if (g.moves >= 12) {
              const risk = riskScore(riskModels(g));
              const p = {
                split,
                seed,
                collector,
                state: structuredClone(g),
                history: structuredClone(history),
                risk,
              };
              ordinary ??= p;
              if (risk !== null && (!stress || risk < stress.risk)) stress = p;
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
          ["risk", stress],
        ])
          if (p && !(kind === "risk" && p.state.moves === ordinary.state.moves))
            corpus.push({
              ...p,
              kind,
              id: `${split}-${seed}-${collector}-${kind}`,
              critical: p.risk !== null && p.risk <= 0.9,
            });
      }
  const runs = [];
  let cache = new Map();
  let timings = [],
    unknownChecks = 0,
    proofMisses = 0;
  function select(p, mode, step, lastHelp) {
    const start = performance.now(),
      models = riskModels(p.state),
      score = riskScore(models),
      risky = score !== null && score <= 0.9;
    const eligible = risky && step - lastHelp >= 3;
    const fallback = {
      tray: p.state.tray,
      changed: false,
      repeat: overlap(p.state.tray, p.history),
      reason: !risky ? "no-risk" : !eligible ? "cooldown" : "no-candidate",
      risky,
      eligible,
      baseRisk: score,
      baseTray: p.state.tray,
    };
    if (mode === "baseline" || !eligible) {
      timings.push(performance.now() - start);
      return fallback;
    }
    const k = JSON.stringify([
      p.seed,
      p.state.board,
      p.state.tray,
      p.state.moves,
      p.state.rhythm,
      p.history,
    ]);
    let pool = cache.get(k);
    if (!pool) {
      pool = candidatePool(R, B, p);
      cache.set(k, pool);
      proofMisses += pool.filter((c) => !c.witness).length;
    }
    const base = pool[0],
      cells = (t) =>
        t.reduce((n, s) => n + R.shapeById(s.shapeId).cells.length, 0);
    let choices = pool.filter(
      (c) =>
        c.witness &&
        c.known &&
        c.success >= score + 0.05 - 1e-9 &&
        c.models.every((m, i) => m.success + 1e-9 >= models[i].success),
    );
    let guardUnknown = false;
    if (mode === "risk-guarded") {
      choices = choices.filter(
        (c) =>
          cells(c.tray) >= 0.9 * cells(base.tray) &&
          c.repeat <= base.repeat + 0.05 + 1e-9 &&
          c.models.every(
            (m, i) => m.expectedLines + 1e-9 >= 0.95 * models[i].expectedLines,
          ),
      );
      const exact = (c) => {
        if (!("allClear" in c)) {
          c.allClear = A.analyze(p.state.board, c.tray, 50000).allClearPossible;
          if (c.allClear === null) unknownChecks++;
        }
        return c.allClear;
      };
      if (choices.length) {
        const a = exact(base);
        guardUnknown = a === null;
        if (a === null) choices = [];
        else
          choices = choices.filter((c) => {
            const b = exact(c);
            guardUnknown ||= b === null;
            return b !== null && (!a || b);
          });
      }
    }
    choices.sort((a, b) => b.success - a.success || a.repeat - b.repeat);
    timings.push(performance.now() - start);
    if (!choices.length) return { ...fallback, guardUnknown };
    const c = choices[0];
    return {
      ...fallback,
      tray: c.tray,
      changed: true,
      repeat: c.repeat,
      reason: c.source,
      proof: c.witness,
      chosenRisk: c.success,
      guardUnknown,
    };
  }
  for (const p of corpus) {
    cache = new Map();
    for (const style of styles)
      for (const mode of modes) {
        let g = structuredClone(p.state),
          history = structuredClone(p.history);
        const steps = [];
        let lastHelp = -3;
        for (let step = 0; step < 6 && g.status === "playing"; step++) {
          if (g.tray.some((s) => s.used)) throw Error("not refill");
          const input = { seed: p.seed, state: g, history };
          const frozen = JSON.stringify(input);
          const choice = select(input, mode, step, lastHelp);
          if (choice.changed) lastHelp = step;
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
        const riskyFirst = chosen
          .map((r, i) => ({ r, b: bases[i] }))
          .filter((p) => p.r.critical);
        const firstDelta = riskyFirst.length
          ? sum(
              riskyFirst,
              ({ r, b }) =>
                Number(r.steps[0].complete) - Number(b.steps[0].complete),
            ) / riskyFirst.length
          : null;
        const eligibleCount = sum(
          chosen,
          (r) => r.steps.filter((s) => s.choice.eligible).length,
        );
        const interventionRate = eligibleCount
          ? sum(chosen, (r) => r.steps.filter((s) => s.choice.changed).length) /
            eligibleCount
          : 0;
        const pass =
          mode === "risk-guarded" &&
          criticalPositions >= 8 &&
          interventionRate >= 0.2 &&
          firstDelta !== null &&
          firstDelta >= 0.05 &&
          successDelta >= -0.02 &&
          linesRatio >= 0.9 &&
          (acRatio === null || acRatio >= 0.9) &&
          repeatRatio !== null &&
          repeatRatio <= 1.1;
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
          firstDelta,
          eligibleCount,
          interventionRate,
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
    accepted: ["risk-guarded"].filter((mode) =>
      summaries.filter((s) => s.mode === mode).every((s) => s.pass),
    ),
    summaries,
  };
  const hashes = {};
  for (const f of [
    "scripts/director/targeted.mjs",
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
