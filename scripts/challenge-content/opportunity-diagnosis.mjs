/** Seen engineering contexts only; no development or holdout acceptance. */
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createServer } from "vite";
import { challengeSeedPlan } from "./seed-plan.mjs";
const out = process.argv[2] ?? "artifacts/challenge-opportunity";
const modes = process.argv.includes("--one-line")
  ? ["shape", "one-line"]
  : ["shape", "interleaved"];
const input = "artifacts/challenge-balance/probe.json";
let bytes = await fs.readFile(input),
  fixtures = JSON.parse(bytes);
if (process.argv.includes("--from-misses")) {
  bytes = await fs.readFile(
    "artifacts/challenge-opportunity/seen-v2/engineering.json",
  );
  fixtures = JSON.parse(bytes).rows.map((r) => ({
    seed: r.seed,
    style: r.style,
    at: r.at,
    input: r.input,
    originalFocus: r.focus,
  }));
}
const server = await createServer({
  server: { middlewareMode: true, hmr: false, watch: null },
});
try {
  const R = await server.ssrLoadModule("/src/core/rules.ts"),
    G = await server.ssrLoadModule("/src/core/goal-director.ts");
  const V = await server.ssrLoadModule("/src/core/verified-goal.ts"),
    O = await server.ssrLoadModule("/scripts/challenge-content/oracle.ts");
  if (process.argv.includes("--seen-v2")) {
    const P = await server.ssrLoadModule("/scripts/director/mixed-players.ts"),
      C = await server.ssrLoadModule("/src/platform/play-capture.ts");
    const old = JSON.parse(
      await fs.readFile(
        "artifacts/challenge-balance/development-v2.json",
        "utf8",
      ),
    ).games;
    fixtures = [];
    const seen = new Set();
    let reproduced = 0;
    for (const [style, ms] of Object.entries({
      bounded: 2200,
      clear: 1500,
      three: 3200,
      lapse: 2400,
    }))
      for (const { seed, opening } of challengeSeedPlan("development-v2")) {
        const expected = old.find(
          (g) => g.seed === seed && g.style === style && g.arm === "full",
        );
        assert(expected);
        let g = R.newGame(
            seed,
            `challenge-development-v2-${style}-${seed}-full`,
            "director-challenge-v2",
            undefined,
            "full",
          ),
          player = (seed ^ 0x85ebca6b) >>> 0,
          active = 0,
          rewards = 0,
          ordinary = 0;
        while (g.status === "playing" && g.moves < 300) {
          const roll = R.random(player);
          player = roll.state;
          const m = P.chooseMixed(g.board, g.tray, style, roll.value).move;
          assert(m);
          const result = R.applyMove(g, m, g.revision, true, {
            activeMs: (active += ms),
          });
          assert(result);
          g = result.state;
          rewards += Number(result.allClear);
          ordinary += Number(result.lines > 0 && !result.allClear);
          const t = result.decision,
            key = `${style}/${opening}/${t?.challenge?.focus}`;
          if (
            t?.challenge?.admission?.reason === "no-verified-task" &&
            !seen.has(key)
          ) {
            seen.add(key);
            fixtures.push({
              seed,
              style,
              at: g.moves,
              input: t.input,
              originalFocus: t.challenge.focus,
            });
          }
        }
        assert.equal(C.stateHash(g), expected.finalHash);
        assert.equal(g.moves, expected.moves);
        assert.equal(rewards, expected.allClears);
        assert.equal(ordinary, expected.ordinary);
        reproduced++;
      }
    console.log(
      "All",
      reproduced,
      "seen full-mode outcomes exactly reproduced; selected first miss by style/opening/focus",
    );
    bytes = Buffer.from(JSON.stringify(fixtures));
  }
  const rows = [];
  for (const fixture of fixtures) {
    const i = fixture.input,
      c = i.context;
    const baseline = G.goalDirectorDeal(
      i.board,
      i.seed,
      i.moves,
      c.rhythm,
      c.goalDirector,
    );
    const original = O.inspectChoices(i.board, baseline.tray);
    for (const focus of fixture.originalFocus
      ? [fixture.originalFocus]
      : ["chain", "choice"]) {
      const pair = [];
      for (const mode of modes) {
        const ref = V.verifiedRefinement(
            focus,
            undefined,
            mode === "one-line" ? "one-line" : "strict",
          ),
          completed = ref.completed,
          select = ref.select;
        if (mode === "interleaved") ref.explorationOrder = "interleaved";
        let phase = "baseline",
          snapshot;
        const pools = { baseline: new Map(), extra: new Map() };
        ref.completed = (node, available) => {
          const key = node.path
            .map((x) => x.shape)
            .sort((a, b) => a - b)
            .join();
          const pool = pools[phase];
          if (!pool.has(key) || pool.get(key).value < node.value)
            pool.set(key, node);
          completed(node, available);
        };
        ref.select = (context) => {
          snapshot = {
            available: context.available.size,
            rank: context.rank,
            path: context.path,
            goalFound: context.goalFound,
            actual: context.actual,
            beforeWork: context.meter.used,
            value:
              context.frontier.find((n) => n.path === context.path)?.value ??
              null,
          };
          phase = "extra";
          return select(context);
        };
        const d = G.goalDirectorDeal(
          i.board,
          i.seed,
          i.moves,
          c.rhythm,
          c.goalDirector,
          24000,
          false,
          "observe",
          ref,
        );
        assert.equal(d.rngState, baseline.rngState);
        assert.deepEqual(d.director, baseline.director);
        assert(d.diagnostic.checks <= 24000);
        O.verifyWitness(i.board, d.tray, d.witness);
        const changed =
          JSON.stringify(d.tray) !== JSON.stringify(baseline.tray);
        const assessment = changed
          ? O.inspectChoices(i.board, d.tray)
          : original;
        if (changed) {
          assert(ref.selected);
          assert(ref.admission.accepted);
          assert(
            ref.admission.accepted.lines >=
              ref.admission.baseline.lines - (mode === "one-line" ? 1 : 0),
          );
          assert.equal(
            ref.admission.accepted.clears,
            ref.admission.baseline.clears,
          );
          if (mode === "one-line")
            assert(
              ref.admission.accepted.occupied <=
                ref.admission.baseline.occupied + 8,
            );
          if (focus === "chain") assert(assessment.chain);
          else {
            const bad = d.diagnostic.certificate?.badFirst;
            assert(bad);
            assert.equal(
              assessment.first.find(
                (p) =>
                  p.move.slot === bad.slot &&
                  p.move.x === bad.x &&
                  p.move.y === bad.y,
              )?.status,
              "UNSOLVABLE",
            );
            assert.equal(assessment.status, "SOLVABLE");
          }
        } else assert.deepEqual(d.witness, baseline.witness);
        const describe = (pool) => ({
          hands: pool.size,
          shapes: new Set(
            [...pool.values()].flatMap((n) => n.path.map((o) => o.shape)),
          ).size,
        });
        let poolAudit;
        if (process.argv.includes("--audit-pool") && ref.admission.baseline) {
          const all = new Map(pools.baseline);
          for (const [k, n] of pools.extra)
            if (!all.has(k) || all.get(k).value < n.value) all.set(k, n);
          poolAudit = {
            hands: all.size,
            quality: 0,
            valueBand: 0,
            tasks: 0,
            valueBandTasks: 0,
            allTasks: 0,
            taskCosts: {},
            unknown: 0,
            examples: [],
          };
          for (const node of all.values()) {
            const quality =
              node.lines >= ref.admission.baseline.lines &&
              node.clears === ref.admission.baseline.clears;
            poolAudit.quality += Number(quality);
            const band =
              snapshot.value === null || node.value >= snapshot.value - 80;
            poolAudit.valueBand += Number(band && quality);
            const tray = node.path.map((o) => ({
              shapeId: R.SHAPES[o.shape].id,
              color: 1,
              used: false,
            }));
            const a = O.inspectChoices(i.board, tray);
            poolAudit.unknown += Number(!a.complete);
            if (a.complete && a[focus]) {
              poolAudit.allTasks++;
              poolAudit.tasks += Number(quality);
              poolAudit.valueBandTasks += Number(band && quality);
              const cost = `lines:${node.lines - ref.admission.baseline.lines}/clears:${node.clears - ref.admission.baseline.clears}/band:${band}`;
              poolAudit.taskCosts[cost] = (poolAudit.taskCosts[cost] ?? 0) + 1;
              poolAudit.examples.push({
                ids: tray.map((s) => s.shapeId),
                path: node.path.map((o, slot) => ({ slot, x: o.x, y: o.y })),
                value: node.value,
                band,
                quality,
                cost,
              });
            }
          }
        }
        pair.push({
          mode,
          changed,
          reason: ref.admission.reason,
          assessment: {
            chain: assessment.chain,
            choice: assessment.choice,
            complete: assessment.complete,
          },
          novel: assessment[focus] && !original[focus],
          work: d.diagnostic.checks,
          beforeWork: snapshot.beforeWork,
          available: snapshot.available,
          goalFound: snapshot.goalFound,
          actual: snapshot.actual,
          baselinePool: describe(pools.baseline),
          extraPool: describe(pools.extra),
          admission: ref.admission,
          ids: d.tray.map((s) => s.shapeId),
          ...(poolAudit ? { poolAudit } : {}),
        });
      }
      rows.push({
        seed: fixture.seed,
        style: fixture.style,
        at: fixture.at,
        focus,
        input: i,
        original: {
          chain: original.chain,
          choice: original.choice,
          complete: original.complete,
        },
        pair,
      });
    }
  }
  const summary = {
    provenance: "Synthetic only; seen engineering contexts, not acceptance",
    sourceInputSha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    contexts: fixtures.length,
    rows: rows.length,
    modes: {},
  };
  for (const mode of modes) {
    const entries = rows.map((r) => ({
      ...r.pair.find((p) => p.mode === mode),
      focus: r.focus,
    }));
    const reasons = {};
    for (const e of entries) reasons[e.reason] = (reasons[e.reason] ?? 0) + 1;
    summary.modes[mode] = {
      changed: entries.filter((x) => x.changed).length,
      novelChain: entries.filter((x) => x.focus === "chain" && x.novel).length,
      novelChoice: entries.filter((x) => x.focus === "choice" && x.novel)
        .length,
      unknown: entries.filter((x) => !x.assessment.complete).length,
      maxWork: Math.max(...entries.map((x) => x.work)),
      certifiedButNotModelChoice: entries.filter(
        (x) => x.changed && x.focus === "choice" && !x.assessment.choice,
      ).length,
      extraHands: entries.reduce((n, x) => n + x.extraPool.hands, 0),
      extraShapes: entries.reduce((n, x) => n + x.extraPool.shapes, 0),
      reasons,
    };
    if (entries.some((x) => x.poolAudit)) {
      const costs = {};
      for (const e of entries)
        for (const [k, n] of Object.entries(e.poolAudit?.taskCosts ?? {}))
          costs[k] = (costs[k] ?? 0) + n;
      summary.modes[mode].poolAudit = {
        contextsWithTask: entries.filter((x) => x.poolAudit?.tasks).length,
        contextsWithAnyTask: entries.filter((x) => x.poolAudit?.allTasks)
          .length,
        contextsWithValueBandTask: entries.filter(
          (x) => x.poolAudit?.valueBandTasks,
        ).length,
        hands: entries.reduce((n, x) => n + (x.poolAudit?.hands ?? 0), 0),
        quality: entries.reduce((n, x) => n + (x.poolAudit?.quality ?? 0), 0),
        valueBand: entries.reduce(
          (n, x) => n + (x.poolAudit?.valueBand ?? 0),
          0,
        ),
        tasks: entries.reduce((n, x) => n + (x.poolAudit?.tasks ?? 0), 0),
        valueBandTasks: entries.reduce(
          (n, x) => n + (x.poolAudit?.valueBandTasks ?? 0),
          0,
        ),
        allTasks: entries.reduce((n, x) => n + (x.poolAudit?.allTasks ?? 0), 0),
        taskCosts: costs,
        unknown: entries.reduce((n, x) => n + (x.poolAudit?.unknown ?? 0), 0),
      };
    }
  }
  summary.pairedGains = rows
    .filter((r) => r.pair[1].novel && !r.pair[0].novel)
    .map((r) => ({ seed: r.seed, style: r.style, at: r.at, focus: r.focus }));
  summary.pairedLosses = rows
    .filter((r) => r.pair[0].novel && !r.pair[1].novel)
    .map((r) => ({ seed: r.seed, style: r.style, at: r.at, focus: r.focus }));
  await fs.mkdir(out, { recursive: true });
  await fs.writeFile(
    `${out}/engineering.json`,
    JSON.stringify({ summary, rows }, null, 2) + "\n",
  );
  await fs.writeFile(
    `${out}/engineering-summary.json`,
    JSON.stringify(summary, null, 2) + "\n",
  );
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await server.close();
}
