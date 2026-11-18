/** Recompute player decisions, native transitions, RNG, proofs and final hashes. */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { runtime, hash, sourceHashes, playerSeed } from './architecture/runtime.mjs';
const root = 'docs/qa/dealer-architecture';
const checks = { games: 0, actions: 0, trays: 0, snapshotTrays: 0, rootProofs: 0, negativeRoots: 0, secondProofs: 0, goalWitnesses: 0, dataSha256: {} };
for (const catalogue of ['full', 'common']) {
  const raw = await fs.readFile(`${root}/games-${catalogue}.json.gz`), data = JSON.parse(gunzipSync(raw));
  checks.dataSha256[catalogue] = hash(raw); assert.deepEqual(await sourceHashes(), data.source);
  const rt = await runtime(catalogue), { R, A, SR } = rt;
  try {
    for (const run of data.runs) {
      const version = run.policy === 'random-proved' ? 'solvable-v1' : run.policy;
      let g = R.newGame(run.seed, `architecture-${run.seed}`, version), rng = playerSeed(run.seed), di = 0;
      if (run.policy === 'random-proved') {
        const d = SR.strictRandomDeal(R.emptyBoard(), run.seed);
        g = { ...g, tray: d.tray, rngState: d.rngState, dealerFallbacks: Number(d.fallback) };
      }
      g = { ...g, scoringVersion: 'festival-v4', seriesBonusVersion: 1 };
      function checkDeal() {
        const d = run.deals[di++]; assert.equal(d.move, g.moves); assert.deepEqual(d.board, A.toRows(g.board));
        assert.deepEqual(d.tray, g.tray); rt.verify(g.board, d); checks.trays++;
      }
      checkDeal();
      for (let i = 0; i < run.actions.length; i++) {
        const r = R.random(rng); rng = r.state;
        const m = rt.choose(g.board, g.tray, run.style, r.value);
        assert.deepEqual([m.slot, m.x, m.y], run.actions[i]);
        const before = g, refill = g.tray.filter(s => !s.used).length === 1;
        const a = R.applyMove(g, m, g.revision); assert(a); g = a.state;
        if (refill && run.policy === 'random-proved') {
          const d = SR.strictRandomDeal(g.board, before.rngState);
          g = { ...g, tray: d.tray, rngState: d.rngState, dealerFallbacks: before.dealerFallbacks + Number(d.fallback),
            status: R.hasMove(g.board, d.tray) ? 'playing' : 'over' };
        }
        if (refill) checkDeal();
        assert.deepEqual([a.lines, Number(a.allClear), g.board.filter(Boolean).length, a.points, R.shapeById(before.tray[m.slot].shapeId).family], run.events[i]);
        checks.actions++;
      }
      assert.equal(hash(g), run.finalHash); assert.equal(di, run.deals.length); checks.games++;
    }
  } finally { await rt.server.close(); }
}
const raw = await fs.readFile(`${root}/snapshots.json.gz`), snapshots = JSON.parse(gunzipSync(raw));
checks.dataSha256.snapshots = hash(raw);
for (const catalogue of ['full', 'common']) {
  const rt = await runtime(catalogue), { R, A } = rt;
  // A separate mask implementation exhausts only <=2 remaining pieces here.
  const canFinish = (board, tray) => {
    if (tray.every(s => s.used)) return true;
    for (const op of A.actions(board, tray)) {
      const next = A.transition(board, op);
      if (canFinish(next.rows, tray.map((s, i) => ({ ...s, used: s.used || i === op.slot })))) return true;
    }
    return false;
  };
  try {
    for (const row of snapshots.results.filter(r => r.catalogue === catalogue)) {
      const board = A.toBoard(row.board); rt.verify(board, row); checks.snapshotTrays++;
      for (const b of row.branches) {
        const first = R.place(board, R.shapeById(row.tray[b.move.slot].shapeId), b.move.x, b.move.y);
        const t = row.tray.map((s, i) => ({ ...s, used: i === b.move.slot }));
        if (b.witness) {
          let n = first.board; const used = new Set([b.move.slot]);
          for (const m of b.witness) { assert(!used.has(m.slot)); used.add(m.slot);
            const s = R.shapeById(t[m.slot].shapeId); assert(R.fits(n, s, m.x, m.y)); n = R.place(n, s, m.x, m.y).board; }
          assert.equal(used.size, 3); checks.rootProofs++;
        }
        if (b.status === 'impossible') { assert(!canFinish(A.toRows(first.board), t)); checks.negativeRoots++; }
        for (const s of b.seconds) {
          const second = R.place(first.board, R.shapeById(t[s.move.slot].shapeId), s.move.x, s.move.y);
          const t2 = t.map((v, i) => ({ ...v, used: v.used || i === s.move.slot }));
          const possible = canFinish(A.toRows(second.board), t2);
          if (s.status !== 'unknown') assert.equal(possible, s.status === 'found');
          if (s.goalWitness) { const m = s.goalWitness, shape = R.shapeById(t2[m.slot].shapeId);
            assert(R.fits(second.board, shape, m.x, m.y)); assert(R.place(second.board, shape, m.x, m.y).board.every(c => !c)); checks.goalWitnesses++; }
          if (s.rewardFound) assert(first.board.every(c => !c) || second.board.every(c => !c) || s.goalWitness);
          checks.secondProofs++;
        }
      }
    }
  } finally { await rt.server.close(); }
}
checks.source = await sourceHashes();
checks.verifierSha256 = hash(await fs.readFile('scripts/director/replay-architecture.mjs'));
await fs.writeFile(`${root}/replay.json`, JSON.stringify(checks, null, 2) + '\n');
console.log(JSON.stringify({ ...checks, source: undefined }));
