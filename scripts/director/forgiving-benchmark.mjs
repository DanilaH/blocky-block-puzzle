import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { mixedRuntime } from "./mixed-runtime.mjs";
const { server, R, H, MP, A } = await mixedRuntime();
const D = await server.ssrLoadModule("/src/core/forgiving-director.ts"),
  V = await server.ssrLoadModule("/scripts/director/verify-forgiving-deal.ts");
const D2 = await server.ssrLoadModule("/src/core/goal-director.ts");
const hash = (v) =>
  createHash("sha256")
    .update(typeof v === "string" ? v : JSON.stringify(v))
    .digest("hex");
const files = [
  "src/core/mixed-director.ts",
  "src/core/director-robustness.ts",
  "src/core/director-goal-tools.ts",
  "src/core/goal-director.ts",
  "src/core/director-search.ts",
  "src/core/rules.ts",
  "src/core/profile.ts",
  "src/core/monetization.ts",
  "src/core/rhythm.ts",
  "src/core/shapes.json",
  "src/game/move-calculator.ts",
  "scripts/difficulty/players.ts",
  "scripts/director/mixed-players.ts",
  "scripts/director/verify-mixed-deal.ts",
  "src/core/forgiving-director.ts",
  "scripts/director/verify-forgiving-deal.ts",
  "scripts/director/forgiving-benchmark.mjs",
  "docs/qa/director-forgiving/protocol.md",
];
const sourceHashes = async () =>
  Object.fromEntries(
    await Promise.all(
      files.map(async (f) => [f, hash(await fs.readFile(f, "utf8"))]),
    ),
  );
const source = await sourceHashes(),
  runs = [],
  timing = [],
  output = "docs/qa/director-forgiving/results.json.gz";
let proofCount = 0,
  negativeCount = 0,
  rootCount = 0,
  secondCount = 0,
  preparationCount = 0,
  maxWork = 0;
try {
  for (const [split, offset] of [
    ["development", 1341000],
    ["confirmation", 1361000],
  ])
    for (let i = 1; i <= 8; i++)
      for (const style of MP.mixedStyles)
        for (const mode of ["baseline", "candidate"]) {
          const seed = offset + i,
            version = mode === "baseline" ? "director-v2" : "director-v4",
            begin = performance.now();
          let g = R.newGame(seed, "forgiving-study-" + seed, version),
            playerRng = createHash("sha256")
              .update("mixed-player:" + seed)
              .digest()
              .readUInt32LE(0);
          timing.push({
            split,
            seed,
            style,
            mode,
            move: 0,
            ms: performance.now() - begin,
          });
          const actions = [],
            events = [],
            deals = [];
          function record(d, input) {
            assert.deepEqual(d.tray, g.tray);
            assert.equal(d.rngState, g.rngState);
            assert.deepEqual(
              d.director,
              mode === "baseline" ? g.goalDirector : g.forgivingDirector,
            );
            maxWork = Math.max(maxWork, d.diagnostic.checks);
            assert(d.diagnostic.checks <= 24000);
            if (mode === "candidate") {
              const p = V.verifyForgivingDeal(g.board, d);
              rootCount += p.safe;
              secondCount += p.seconds;
              preparationCount += p.prepared;
              negativeCount += p.negative;
            } else {
              let b = g.board;
              const used = new Set();
              for (const m of d.witness) {
                assert(!used.has(m.slot));
                used.add(m.slot);
                const s = R.shapeById(d.tray[m.slot].shapeId);
                assert(R.fits(b, s, m.x, m.y));
                b = R.place(b, s, m.x, m.y).board;
              }
              assert.equal(used.size, 3);
            }
            proofCount++;
            deals.push({
              move: g.moves,
              board: A.toRows(g.board),
              tray: d.tray,
              witness: d.witness,
              diagnostic: d.diagnostic,
              input,
              outputRng: d.rngState,
              outputDirector: d.director,
            });
          }
          record(
            mode === "baseline"
              ? D2.goalDirectorDeal(g.board, seed)
              : D.forgivingDirectorDeal(g.board, seed),
            { seed, moves: 0 },
          );
          while (g.status === "playing" && g.moves < 360) {
            const roll = R.random(playerRng);
            playerRng = roll.state;
            const choice = MP.chooseMixed(g.board, g.tray, style, roll.value);
            assert(choice.move);
            const before = g,
              refill = g.tray.filter((s) => !s.used).length === 1,
              start = performance.now(),
              a = R.applyMove(g, choice.move, g.revision);
            assert(a);
            g = a.state;
            if (refill) {
              timing.push({
                split,
                seed,
                style,
                mode,
                move: g.moves,
                ms: performance.now() - start,
              });
              const rhythm = H.advanceRhythmV4(
                before.rhythm,
                g.board,
                a.lines,
                a.allClear,
                R.random(before.rngState).value,
              );
              const saved =
                mode === "baseline"
                  ? D2.observeGoalDirector(before.goalDirector, a.allClear)
                  : D.observeForgivingDirector(
                      before.forgivingDirector,
                      a.allClear,
                    );
              const input = {
                seed: before.rngState,
                moves: g.moves,
                rhythm,
                saved,
              };
              record(
                mode === "baseline"
                  ? D2.goalDirectorDeal(
                      g.board,
                      input.seed,
                      g.moves,
                      rhythm,
                      saved,
                    )
                  : D.forgivingDirectorDeal(
                      g.board,
                      input.seed,
                      g.moves,
                      rhythm,
                      saved,
                    ),
                input,
              );
            }
            actions.push([choice.move.slot, choice.move.x, choice.move.y]);
            events.push([
              a.lines,
              Number(a.allClear),
              g.board.filter(Boolean).length,
              Number(choice.perturbed),
              Number(choice.different),
            ]);
          }
          const row = {
            split,
            seed,
            style,
            mode,
            moves: g.moves,
            ended: g.status === "over",
            censored: g.status === "playing",
            score: g.score,
            actions,
            events,
            deals,
            finalHash: hash(g),
          };
          runs.push(row);
          await fs.writeFile(
            output + ".checkpoint",
            gzipSync(JSON.stringify({ source, runs, timing })),
          );
          console.log(
            JSON.stringify({
              split,
              seed,
              style,
              mode,
              moves: g.moves,
              ended: row.ended,
              clears: events.reduce((s, e) => s + e[1], 0),
              deals: deals.length,
            }),
          );
        }
  assert.deepEqual(
    await sourceHashes(),
    source,
    "Source changed during frozen study",
  );
  const data = {
    schema: "blocky-forgiving-study-v1",
    source,
    limit: 360,
    runs,
    timing,
    proofCount,
    rootCount,
    secondCount,
    preparationCount,
    negativeCount,
    maxWork,
    environment: {
      node: process.version,
      vite: JSON.parse(await fs.readFile("node_modules/vite/package.json"))
        .version,
      typescript: JSON.parse(
        await fs.readFile("node_modules/typescript/package.json"),
      ).version,
      vitest: JSON.parse(await fs.readFile("node_modules/vitest/package.json"))
        .version,
      lockedInstall: true,
    },
  };
  await fs.writeFile(output, gzipSync(JSON.stringify(data) + "\n"));
  await fs.rm(output + ".checkpoint");
  console.log(
    JSON.stringify({
      output,
      games: runs.length,
      moves: runs.reduce((s, r) => s + r.moves, 0),
      proofCount,
      rootCount,
      secondCount,
      preparationCount,
      negativeCount,
      maxWork,
    }),
  );
} finally {
  await server.close();
}
