// Engineering only; these seeds never enter the acceptance splits.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import { mixedRuntime } from "./mixed-runtime.mjs";
const { server, R, H, MP } = await mixedRuntime();
const D = await server.ssrLoadModule("/src/core/reward-director.ts"),
  V = await server.ssrLoadModule("/scripts/director/verify-reward-deal.ts");
const args = process.argv.slice(2),
  arg = (k, f) => (args.includes(k) ? args[args.indexOf(k) + 1] : f),
  seeds = Number(arg("--seeds", "6")),
  limit = Number(arg("--limit", "180")),
  styles = arg("--styles", "clear,three,plausible,lapse").split(",");
try {
  for (let seed = 1741001; seed <= 1741000 + seeds; seed++)
    for (const style of styles) {
      let g = R.newGame(seed, "mix-engineering-" + seed, "director-v6"),
        rng = createHash("sha256").update("mixed-player:"+seed).digest().readUInt32LE(0),
        clears = 0,
        lines = 0,
        first = null,
        robust = 0,
        deals = 0,
        maxWork = 0,
        attempted = 0,
        constructed = 0,
        prepared = 0,
        lateClears = 0;
      const sources = {};
      const kinds = {},
        offered = [];
      function audit(d) {
        maxWork = Math.max(maxWork, d.diagnostic.checks);
        assert(maxWork <= 24000);
        deals++;
        sources[d.diagnostic.source]=(sources[d.diagnostic.source]??0)+1;
        prepared += d.director.prepared.length;
        robust += Number(d.diagnostic.robustness.adequate);
        kinds[d.diagnostic.actual] = (kinds[d.diagnostic.actual] ?? 0) + 1;
        attempted += Number(d.diagnostic.goalAttempted);
        constructed += Number(d.diagnostic.goalConstructed);
        V.verifyRewardDeal(g.board, d);
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
        if (d.diagnostic.goalFound) offered.push(g.moves);
      }
      audit(D.rewardDirectorDeal(g.board, seed,0,undefined,undefined,24000,6));
      while (g.status === "playing" && g.moves < limit) {
        const roll = R.random(rng);
        rng = roll.state;
        const move = MP.chooseMixed(g.board, g.tray, style, roll.value).move,
          before = g,
          refill = g.tray.filter((s) => !s.used).length === 1;
        const moved = R.applyMove(g, move, g.revision);
        assert(moved);
        g = moved.state;
        lines += moved.lines;
        if (moved.allClear) {
          clears++;
          lateClears += Number(g.moves > 12);
          first ??= g.moves;
        }
        if (refill) {
          const rhythm = H.advanceRhythmV4(
            before.rhythm,
            g.board,
            moved.lines,
            moved.allClear,
            R.random(before.rngState).value,
          );
          const d = D.rewardDirectorDeal(
            g.board,
            before.rngState,
            g.moves,
            rhythm,
            D.observeRewardDirector(before.rewardDirector, moved.allClear),24000,6,
          );
          assert.deepEqual(d.tray, g.tray);
          audit(d);
        }
      }
      console.log(
        JSON.stringify({
          seed,
          style,
          moves: g.moves,
          ended: g.status === "over",
          clears,
          first,
          lines,
          robust,
          deals,
          maxWork,
          kinds,sources,
          goals: offered.length,
          attempted,
          constructed,
          prepared,
          lateClears,
        }),
      );
    }
} finally {
  await server.close();
}
