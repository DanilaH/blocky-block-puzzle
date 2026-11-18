import fs from "node:fs/promises";
import { gzipSync } from "node:zlib";
import assert from "node:assert/strict";
import { createServer } from "vite";
import { createHash } from "node:crypto";
const dir = "docs/qa/dealer-antirepeat",
  server = await createServer({ server: { middlewareMode: true } });
try {
  const R = await server.ssrLoadModule("/src/core/rules.ts"),
    F = await server.ssrLoadModule("/src/core/flow-dealer.ts"),
    N = await server.ssrLoadModule("/scripts/director/antirepeat.ts"),
    H = await server.ssrLoadModule("/src/core/rhythm.ts"),
    P = await server.ssrLoadModule("/scripts/difficulty/players.ts");
  const bag = (t) =>
    t
      .map((s) => R.shapeById(s.shapeId).family)
      .sort()
      .join(",");
  function prove(board, tray, witness) {
    let b = board,
      lines = 0,
      clears = 0;
    const used = new Set();
    for (const m of witness) {
      assert.ok(!used.has(m.slot));
      used.add(m.slot);
      const p = R.place(b, R.shapeById(tray[m.slot].shapeId), m.x, m.y);
      b = p.board;
      lines += p.lines;
      clears += Number(b.every((v) => !v));
    }
    assert.equal(used.size, 3);
    return {
      lines,
      clears,
      area: tray.reduce((n, s) => n + R.shapeById(s.shapeId).cells.length, 0),
    };
  }
  const runs = [],
    timings = [],
    changedCases = [];
  let pairedChecks = 0;
  for (const [split, offset] of [
    ["development", 171000],
    ["confirmation", 181000],
  ])
    for (let i = 1; i <= 8; i++)
      for (const style of ["clear", "space", "three", "plausible"])
        for (const mode of ["baseline", "antirepeat"]) {
          const seed = offset + i;
          let g = R.newGame(seed, "antirepeat-" + seed, "flow-v4"),
            lines = 0,
            clears = 0,
            repeats = 0,
            deals = 0,
            changed = 0;
          const moves = [],
            history = [];
          while (g.status === "playing" && g.moves < 180) {
            if (g.tray.every((s) => !s.used)) {
              const k = bag(g.tray);
              repeats += Number(history.slice(-4).includes(k));
              deals++;
              history.push(k);
            }
            const m = P.choose(
              g.board,
              g.tray,
              style,
              R.random(seed + g.moves).value,
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
            assert.deepEqual(v.state.board, placed.board);
            lines += placed.lines;
            clears += Number(v.allClear);
            let next = v.state;
            if (g.tray.filter((s) => !s.used).length === 1) {
              const rhythm = H.advanceRhythmV4(
                g.rhythm,
                placed.board,
                placed.lines,
                v.allClear,
                R.random(g.rngState).value,
              );
              const args = [
                placed.board,
                g.rngState,
                g.moves + 1,
                bag(g.tray),
                rhythm,
              ];
              const t0 = performance.now();
              const base = F.flowDeal(...args);
              const baseMs = performance.now() - t0;
              const t1 = performance.now();
              const candidate = N.antiRepeatDeal(...args);
              const newMs = performance.now() - t1;
              timings.push({ baseMs, newMs });
              pairedChecks++;
              assert.equal(Boolean(base), Boolean(candidate));
              if (base) {
                assert.equal(base.rngState, candidate.rngState);
                assert.equal(base.visited, candidate.visited);
                assert.deepEqual(base.tray, candidate.originalTray);
                assert.deepEqual(base.witness, candidate.originalWitness);
                if (candidate.changed) {
                  const a = prove(placed.board, base.tray, base.witness),
                    b = prove(placed.board, candidate.tray, candidate.witness);
                  assert.deepEqual(a, b);
                  assert.ok(
                    candidate.proof.repeats < candidate.proof.originalRepeats,
                  );
                  assert.ok(
                    candidate.proof.value >= candidate.proof.originalValue - 20,
                  );
                  if (mode === "antirepeat") {
                    changed++;
                    changedCases.push({
                      seed,
                      style,
                      move: g.moves + 1,
                      board: placed.board,
                      rhythm,
                      base,
                      candidate,
                    });
                  }
                }
                if (mode === "antirepeat") {
                  next = {
                    ...next,
                    tray: candidate.tray,
                    rngState: candidate.rngState,
                    rhythm: {
                      ...next.rhythm,
                      recentBags: [
                        ...(next.rhythm.recentBags ?? []).slice(0, -1),
                        bag(candidate.tray),
                      ],
                    },
                    status: R.hasMove(next.board, candidate.tray)
                      ? "playing"
                      : "over",
                  };
                }
              }
            }
            moves.push(m);
            g = next;
          }
          runs.push({
            split,
            seed,
            style,
            mode,
            moves,
            moveCount: g.moves,
            survived: g.status === "playing",
            lines,
            clears,
            repeats,
            deals,
            changed,
            final: g,
          });
          if (runs.length % 16 === 0) console.log(`${runs.length}/128 runs`);
        }
  const summaries = [];
  const sum = (a, k) => a.reduce((n, r) => n + r[k], 0);
  for (const split of ["development", "confirmation"])
    for (const style of ["all", "clear", "space", "three", "plausible"]) {
      const base = runs.filter(
          (r) =>
            r.split === split &&
            r.mode === "baseline" &&
            (style === "all" || r.style === style),
        ),
        n = runs.filter(
          (r) =>
            r.split === split &&
            r.mode === "antirepeat" &&
            (style === "all" || r.style === style),
        );
      const ratio = (k) =>
        sum(base, k)
          ? sum(n, k) /
            sum(n, "moveCount") /
            (sum(base, k) / sum(base, "moveCount"))
          : null;
      const repeatRatio = sum(base, "repeats")
        ? sum(n, "repeats") /
          sum(n, "deals") /
          (sum(base, "repeats") / sum(base, "deals"))
        : null;
      const survivalDelta = sum(n, "survived") - sum(base, "survived");
      const pass =
        repeatRatio !== null &&
        (style !== "all" || repeatRatio <= 0.8) &&
        (ratio("lines") === null || ratio("lines") >= 0.9) &&
        (ratio("clears") === null || ratio("clears") >= 0.9) &&
        survivalDelta >= (style === "all" ? -0.05 * base.length : -1);
      summaries.push({
        split,
        style,
        n: base.length,
        baseMoves: sum(base, "moveCount"),
        newMoves: sum(n, "moveCount"),
        baseRepeats: sum(base, "repeats"),
        newRepeats: sum(n, "repeats"),
        repeatRatio,
        lineRatio: ratio("lines"),
        clearRatio: ratio("clears"),
        baseClears: sum(base, "clears"),
        newClears: sum(n, "clears"),
        survivalDelta,
        changes: sum(n, "changed"),
        pass,
      });
    }
  const quant = (k) => {
    const a = timings.map((x) => x[k]).sort((a, b) => a - b);
    return {
      p50: a[Math.floor(a.length * 0.5)],
      p95: a[Math.floor(a.length * 0.95)],
      max: a.at(-1),
    };
  };
  const summary = {
    runs: runs.length,
    moves: sum(runs, "moveCount"),
    pairedChecks,
    changes: changedCases.length,
    accepted: summaries.every((s) => s.pass),
    timings: { baseline: quant("baseMs"), antirepeat: quant("newMs") },
    summaries,
  };
  const hashes = {};
  for (const f of [
    "scripts/director/antirepeat.ts",
    "scripts/director/antirepeat-benchmark.mjs",
  ])
    hashes[f] = createHash("sha256")
      .update(await fs.readFile(f))
      .digest("hex");
  await fs.writeFile(
    `${dir}/evidence.json.gz`,
    gzipSync(JSON.stringify({ hashes, runs, changedCases })),
  );
  await fs.writeFile(
    `${dir}/summary.json`,
    JSON.stringify(summary, null, 2) + "\n",
  );
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await server.close();
}
