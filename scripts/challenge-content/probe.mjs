/** Engineering matched positions, never development/holdout acceptance. */
import { createServer } from "vite";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const server = await createServer({
  server: { middlewareMode: true, hmr: false, watch: null },
});
const verified=process.argv.includes('--verified');
try {
  const R = await server.ssrLoadModule("/src/core/rules.ts"),
    G = await server.ssrLoadModule("/src/core/goal-director.ts");
  const candidate=verified?(await server.ssrLoadModule('/src/core/verified-goal.ts')).verifiedGoalDeal:G.goalDirectorDeal;
  const P = await server.ssrLoadModule("/scripts/director/mixed-players.ts"),
    O = await server.ssrLoadModule("/scripts/challenge-content/oracle.ts");
  const cases = [];
  for (const style of ["bounded", "clear", "three", "lapse"])
    for (let seed = 8101001; seed <= 8101008; seed++) {
      let g = R.newGame(seed, `probe-${style}-${seed}`, "director-v2"),
        player = (seed ^ 0x85ebca6b) >>> 0;
      while (g.status === "playing" && g.moves < 96) {
        const roll = R.random(player);
        player = roll.state;
        const move = P.chooseMixed(g.board, g.tray, style, roll.value).move;
        const r = R.applyMove(g, move, g.revision, true);
        assert(r);
        g = r.state;
        const t = r.decision;
        if (!t || ![36, 66, 96].includes(g.moves)) continue;
        const i = t.input,
          c = i.context,
          base = G.goalDirectorDeal(
            i.board,
            i.seed,
            i.moves,
            c.rhythm,
            c.goalDirector,
          );
        const a = O.inspectChoices(i.board, base.tray),
          out = [];
        for (const focus of ["chain", "choice"]) {
          const d = candidate(
            i.board,
            i.seed,
            i.moves,
            c.rhythm,
            c.goalDirector,
            24000,
            false,
            focus,
          );
          const changed = base.tray.some(
              (v, j) => v.shapeId !== d.tray[j].shapeId,
            ),
            b = changed ? O.inspectChoices(i.board, d.tray) : a;
          if(verified){
            assert.equal(d.rngState,base.rngState);assert.deepEqual(d.director,base.director);
            if(changed){assert(d.focusResult.selected);assert(d.admission?.accepted);assert(d.admission.accepted.lines>=d.admission.baseline.lines);assert.equal(d.admission.accepted.clears,d.admission.baseline.clears);}
          }
          out.push({
            focus,
            changed,
            assessment: b,
            selected: d.focusResult.selected,
            work: d.diagnostic.checks,
          });
        }
        cases.push({ seed, style, at: g.moves, input: i, base: a, out });
      }
    }
  await fs.writeFile(
    verified?"artifacts/challenge-balance/probe.json":"artifacts/challenge-content/probe.json",
    JSON.stringify(cases, null, 2) + "\n",
  );
  const summary = {
    cases: cases.length,
    base: {
      chain: cases.filter((c) => c.base.chain).length,
      choice: cases.filter((c) => c.base.choice).length,
    },
    focus: {},
  };
  for (const focus of ["chain", "choice"]) {
    const rows = cases.map((c) => c.out.find((o) => o.focus === focus));
    summary.focus[focus] = {
      changed: rows.filter((x) => x.changed).length,
      chain: rows.filter((x) => x.assessment.chain).length,
      choice: rows.filter((x) => x.assessment.choice).length,
      unknown: rows.filter((x) => !x.assessment.complete).length,
    };
  }
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await server.close();
}
