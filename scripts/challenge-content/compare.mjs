/** Frozen factorial rollout. Synthetic snapshots remain ignored. */
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createServer } from "vite";
import {challengeSeedPlan} from './seed-plan.mjs';
const stage = process.argv[2];
assert(
  ["development", "development-r2", "development-r3", "holdout", "development-v2", "holdout-v2"].includes(
    stage,
  ),
);
const out = process.argv[3] ?? "artifacts/challenge-content";
const start =
    stage === "development"
      ? 8102001
      : stage === "development-r2"
        ? 8104001
        : stage === "development-r3"
          ? 8105001
          : 8103001,
  arms = ["control", "starts", "tasks", "full"];
const durations = { bounded: 2200, clear: 1500, three: 3200, lapse: 2400 };
const verified=stage.endsWith('-v2'),plan=verified?challengeSeedPlan(stage):Array.from({length:8},(_,i)=>({caseId:start+i,seed:start+i}));
const expectedRuns=plan.length*16;
const server = await createServer({
  server: { middlewareMode: true, hmr: false, watch: null },
});
const digest = (v) =>
  crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");
try {
  const R = await server.ssrLoadModule("/src/core/rules.ts"),
    P = await server.ssrLoadModule("/scripts/director/mixed-players.ts");
  const O = await server.ssrLoadModule("/scripts/challenge-content/oracle.ts"),
    C = await server.ssrLoadModule("/src/platform/play-capture.ts");
  const games = [],
    cases = [];
  await fs.mkdir(out, { recursive: true });
  for (const [styleIndex, style] of Object.keys(durations).entries())
    for (const [seedIndex,{seed,caseId}] of plan.entries()) {
      const offset = (seedIndex + styleIndex) % 4,
        order = [...arms.slice(offset), ...arms.slice(0, offset)];
      for (const arm of order) {
        let trace,
          player = (seed ^ 0x85ebca6b) >>> 0,
          active = 0;
        let g = R.newGame(
          seed,
          `challenge-${stage}-${style}-${seed}-${arm}`,
          arm === "control" ? "director-v2" : verified?"director-challenge-v2":"director-challenge-v1",
          (t) => (trace = t),
          arm,
        );
        const row = {
          seed,
          ...(verified?{caseId}:{}),
          style,
          arm,
          moves: 0,
          ended: false,
          lines: 0,
          ordinary: 0,
          allClears: 0,
          lateMoves: 0,
          lateRewards: 0,
          deals: 0,
          eligibleDeals: 0,
          chain: 0,
          choice: 0,
          content: 0,
          unknown: 0,
          ...(verified?{proofUnknowns:0,admissionReasons:{}}:{}),
          focus: 0,
          selected: 0,
          changed: 0,
          novelChain: 0,
          novelChoice: 0,
          fallback: 0,
          work: [],
          generationMs: [],
          phases: {},
          sources: {},
          maxStateBytes: 0,
        };
        function issued(t) {
          const i = t.input,
            a = O.inspectChoices(i.board, g.tray);
          O.verifyWitness(i.board, g.tray, t.validation.witness);
          assert.notEqual(a.status, "UNSOLVABLE");
          assert(t.validation.work <= t.validation.limit);
          const c = t.challenge;
          if(verified&&c?.admission){row.proofUnknowns+=c.admission.unknownProofs;row.admissionReasons[c.admission.reason]=(row.admissionReasons[c.admission.reason]??0)+1;}
          let counterfactual;
          if(verified&&i.moves>0){
            const ctx=i.context;counterfactual=R.deal(i.board,i.seed,'director-v2',i.moves,i.previous,ctx.rhythm,ctx.director,ctx.goalDirector);
            assert.equal(counterfactual.rngState,g.rngState,'Refinement changed RNG');assert.deepEqual(counterfactual.goalDirector,g.goalDirector,'Refinement changed controller');
            const actualChanged=JSON.stringify(counterfactual.tray)!==JSON.stringify(g.tray);
            if(c){assert.equal(c.changedHand,actualChanged,'Incorrect actual change flag');assert.deepEqual(c.initialPieceIds,counterfactual.tray.map(s=>s.shapeId));}
            if(actualChanged){assert(c?.selected&&c.admission?.accepted,'Unadmitted change');assert(c.admission.accepted.lines>=c.admission.baseline.lines);assert.equal(c.admission.accepted.clears,c.admission.baseline.clears);}
            else assert.deepEqual(t.validation.witness,counterfactual.witness,'Miss changed the witnessed route');
          }
          if (c?.task === "CHAIN") assert(a.chain, "False claimed CHAIN");
          if (c?.task === "CHOICE") {
            const bad = c.certificate.badFirst,
              proof = a.first.find(
                (p) => JSON.stringify(p.move) === JSON.stringify(bad),
              );
            assert(
              proof && proof.status === "UNSOLVABLE",
              "False/unknown certified CHOICE",
            );
          }
          row.deals++;
          row.fallback += Number(t.fallback);
          row.work.push(t.validation.work);
          row.unknown += Number(!a.complete);
          row.sources[t.source] = (row.sources[t.source] ?? 0) + 1;
          if (c)
            row.phases[c.selectedPhase] =
              (row.phases[c.selectedPhase] ?? 0) + 1;
          if (i.moves >= 36) {
            row.eligibleDeals++;
            row.chain += Number(a.chain);
            row.choice += Number(a.choice);
            row.content += Number(a.chain || a.choice);
          }
          if (c?.focus) {
            row.focus++;
            row.selected += Number(c.selected);
            row.changed += Number(c.changedHand);
            const ctx = i.context;
            const d = counterfactual??R.deal(
              i.board,
              i.seed,
              "director-v2",
              i.moves,
              i.previous,
              ctx.rhythm,
              ctx.director,
              ctx.goalDirector,
            );
            const before = O.inspectChoices(i.board, d.tray),
              novelChain = before.complete && a.chain && !before.chain,
              novelChoice = before.complete && a.choice && !before.choice;
            row.novelChain += Number(novelChain);
            row.novelChoice += Number(novelChoice);
            if (novelChain || novelChoice)
              cases.push({
                stage,
                seed,
                style,
                arm,
                at: i.moves,
                input: t.input,
                trace: t,
                baselineIds: d.tray.map((s) => s.shapeId),
                baseline: {
                  chain: before.chain,
                  choice: before.choice,
                  complete: before.complete,
                },
                assessment: {
                  chain: a.chain,
                  choice: a.choice,
                  complete: a.complete,
                },
                novelChain,
                novelChoice,
              });
          }
          row.maxStateBytes = Math.max(
            row.maxStateBytes,
            JSON.stringify(g.challengeV2State??g.challengeState ?? null).length,
          );
        }
        issued(trace);
        while (g.status === "playing" && g.moves < 300) {
          const roll = R.random(player);
          player = roll.state;
          const m = P.chooseMixed(g.board, g.tray, style, roll.value).move;
          assert(m);
          const refill = g.tray.filter((s) => !s.used).length === 1;
          active += durations[style];
          const begin = performance.now();
          const r = R.applyMove(g, m, g.revision, true, { activeMs: active });
          const ms = performance.now() - begin;
          assert(r);
          g = r.state;
          if (refill) row.generationMs.push(ms);
          row.lines += r.lines;
          row.ordinary += Number(r.lines > 0 && !r.allClear);
          row.allClears += Number(r.allClear);
          if (g.moves > 72) {
            row.lateMoves++;
            row.lateRewards += Number(r.allClear);
          }
          if (r.decision) issued(r.decision);
        }
        row.moves = g.moves;
        row.ended = g.status === "over";
        row.finalHash = C.stateHash(g);
        row.contentHash = digest(row);
        games.push(row);
        await fs.writeFile(
          `${out}/${stage}.json`,
          JSON.stringify(
            {
              provenance: "Synthetic only; frozen factorial",
              stage,
              cap: 300,
              ...(verified?{seedPlan:plan,expectedRuns}:{}),
              durations,
              games,
            },
            null,
            2,
          ) + "\n",
        );
        await fs.writeFile(
          `${out}/${stage}.cases.json`,
          JSON.stringify(cases, null, 2) + "\n",
        );
        console.log(
          `${games.length}/${expectedRuns} ${style} ${seed} ${arm} moves=${row.moves} content=${row.content}/${row.eligibleDeals} new=${row.novelChain}/${row.novelChoice} rewards=${row.allClears}`,
        );
      }
    }
} finally {
  await server.close();
}
