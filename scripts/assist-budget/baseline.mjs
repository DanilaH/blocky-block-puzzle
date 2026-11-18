/** Frozen source census before candidate configuration. No human/revenue inference. */
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createServer } from "vite";
const output = process.argv[2];
if (!output) throw Error("Usage: node scripts/assist-budget/baseline.mjs OUTPUT");
const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null } });
try {
  const R = await server.ssrLoadModule("/src/core/rules.ts");
  const H = await server.ssrLoadModule("/src/core/rhythm.ts");
  const G = await server.ssrLoadModule("/src/core/goal-director.ts");
  const P = await server.ssrLoadModule("/scripts/director/mixed-players.ts");
  const games = [], contexts = [];
  for (const style of ["bounded", "clear", "three", "lapse"])
    for (let seed = 7601001; seed <= 7601008; seed++)
      for (const policy of ["director-v2", "composition-v2"]) {
        let g = R.newGame(seed, `baseline-${style}-${seed}`, policy), player = (seed ^ 0x85ebca6b) >>> 0;
        const row = { style, seed, policy, moves: 0, ended: false, lines: 0, clearMoves: 0,
          ordinaryClearMoves: 0, allClears: 0, deals: 0, roles: {}, requests: {}, sources: {},
          goalFound: 0, certificates: {}, generationMs: [], work: [], lateAllClears: 0,
          lateClearMoves: 0, lateMoves: 0, fallback: 0 };
        const issue = (d, before) => {
          assert.deepEqual(d.tray, g.tray);
          assert.equal(d.rngState, g.rngState);
          assert.deepEqual(d.goalDirector, g.goalDirector);
          const q = d.diagnostic;
          row.deals++;
          for (const [key, value] of [["roles", q?.actual ?? g.goalDirector.last], ["requests", q?.requested ?? "opening"], ["sources", q?.source ?? "opening-catalog"]])
            row[key][value] = (row[key][value] ?? 0) + 1;
          row.goalFound += Number(q?.goalFound ?? false);
          row.fallback += Number(d.fallback);
          if (q?.certificate) row.certificates[q.certificate.kind] = (row.certificates[q.certificate.kind] ?? 0) + 1;
          row.work.push((q?.checks ?? 0) + (d.composition?.checks ?? 0));
          // At most one reproducible context per policy/role, no private owner input.
          const key = `${policy}:${q?.actual ?? "opening"}`;
          if (!contexts.some(c => c.key === key)) contexts.push({ key, before, expected: g });
        };
        issue(R.deal(R.emptyBoard(), seed, policy), { initialSeed: seed, policy });
        while (g.status === "playing" && g.moves < 300) {
          const roll = R.random(player); player = roll.state;
          const move = P.chooseMixed(g.board, g.tray, style, roll.value).move;
          assert(move);
          const before = g, refill = g.tray.filter(s => !s.used).length === 1, at = performance.now();
          const moved = R.applyMove(g, move, g.revision); assert(moved); g = moved.state;
          if (refill) row.generationMs.push(performance.now() - at);
          row.lines += moved.lines; row.clearMoves += Number(moved.lines > 0);
          row.ordinaryClearMoves += Number(moved.lines > 0 && !moved.allClear);
          row.allClears += Number(moved.allClear);
          if (g.moves > 72) {
            row.lateMoves++; row.lateAllClears += Number(moved.allClear);
            row.lateClearMoves += Number(moved.lines > 0 && !moved.allClear);
          }
          if (refill) {
            const rhythm = H.advanceRhythmV4(before.rhythm, g.board, moved.lines, moved.allClear, R.random(before.rngState).value);
            const director = G.observeGoalDirector(before.goalDirector, moved.allClear);
            const d = R.deal(g.board, before.rngState, policy, g.moves, "", rhythm, undefined, director);
            issue(d, { state: before, move });
          }
        }
        row.moves = g.moves; row.ended = g.status === "over"; games.push(row);
        console.log(`${style} ${seed} ${policy} ${row.moves} ${row.ended ? "ended" : "censored"}`);
        await fs.mkdir(output, { recursive: true });
        await fs.writeFile(`${output}/baseline.json`, JSON.stringify({ protocol: "PROTOCOL.md", cap: 300, revive: false, games }, null, 2) + "\n");
      }
  await fs.writeFile(`${output}/baseline-contexts.json`, JSON.stringify(contexts, null, 2) + "\n");
} finally { await server.close(); }
