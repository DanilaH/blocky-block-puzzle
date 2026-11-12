import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { runtime, hash, sourceHashes, playerSeed, styles, policies } from './runtime.mjs';

const catalogue = process.argv[2] ?? 'full';
const rt = await runtime(catalogue), { R, H, G, A, SR } = rt;
const source = await sourceHashes(), runs = [], timings = [];
const output = `docs/qa/dealer-architecture/games-${catalogue}.json.gz`;
try {
  for (const [split, offset] of [['exploration', 2141000], ['replication', 2161000]])
    for (let i = 1; i <= 4; i++) for (const style of styles) for (const policy of policies) {
      const seed = offset + i, version = policy === 'random-proved' ? 'solvable-v1' : policy;
      const generate = (board, input) => {
        const begin = performance.now();
        const d = policy === 'random-proved' ? SR.strictRandomDeal(board, input.seed)
          : R.deal(board, input.seed, policy, input.moves, input.previous ?? '', input.rhythm, undefined, input.saved);
        timings.push({ split, seed, style, policy, move: input.moves, ms: performance.now() - begin });
        rt.verify(board, d); return d;
      };
      let rng = playerSeed(seed), g = R.newGame(seed, `architecture-${seed}`, version);
      const first = generate(R.emptyBoard(), { seed, moves: 0 });
      if (policy === 'random-proved') g = { ...g, tray: first.tray, rngState: first.rngState, dealerFallbacks: Number(first.fallback) };
      else { assert.deepEqual(g.tray, first.tray); assert.equal(g.rngState, first.rngState); }
      g = { ...g, scoringVersion: 'festival-v4', seriesBonusVersion: 1 };
      const actions = [], events = [], deals = [];
      function record(d, input) { deals.push({ move: g.moves, board: A.toRows(g.board), input, tray: d.tray,
        witness: d.witness, fallback: d.fallback, diagnostic: d.diagnostic ?? null }); }
      record(first, { seed, moves: 0 });
      while (g.status === 'playing' && g.moves < 240) {
        const roll = R.random(rng); rng = roll.state;
        const move = rt.choose(g.board, g.tray, style, roll.value); assert(move);
        const before = g, refill = before.tray.filter(s => !s.used).length === 1;
        const op = A.actions(A.toRows(before.board), before.tray).find(o => o.slot === move.slot && o.x === move.x && o.y === move.y);
        assert(op); const independent = A.transition(A.toRows(before.board), op);
        const a = R.applyMove(before, move, before.revision); assert(a); g = a.state;
        assert.deepEqual(A.toRows(g.board), independent.rows); assert.equal(a.lines, independent.lines);
        if (refill) {
          const input = { seed: before.rngState, moves: g.moves, previous: before.tray.map(s => R.shapeById(s.shapeId).family).sort().join(',') };
          if (policy !== 'random-proved') {
            input.rhythm = H.advanceRhythmV4(before.rhythm, g.board, a.lines, a.allClear, R.random(before.rngState).value);
            if (policy === 'director-v2') input.saved = G.observeGoalDirector(before.goalDirector, a.allClear);
          }
          const d = generate(g.board, input);
          if (policy === 'random-proved') g = { ...g, tray: d.tray, rngState: d.rngState,
            dealerFallbacks: before.dealerFallbacks + Number(d.fallback), status: R.hasMove(g.board, d.tray) ? 'playing' : 'over' };
          else { assert.deepEqual(g.tray, d.tray); assert.equal(g.rngState, d.rngState); }
          record(d, input);
        }
        actions.push([move.slot, move.x, move.y]);
        events.push([a.lines, Number(a.allClear), g.board.filter(Boolean).length, a.points, R.shapeById(before.tray[move.slot].shapeId).family]);
      }
      const row = { split, seed, style, policy, moves: g.moves, ended: g.status === 'over', censored: g.status === 'playing',
        score: g.score, actions, events, deals, finalHash: hash(g) };
      runs.push(row);
      await fs.writeFile(output + '.checkpoint', gzipSync(JSON.stringify({ source, catalogue, runs, timings })));
      console.log(JSON.stringify({ catalogue, split, seed, style, policy, moves: g.moves, ended: row.ended, clears: events.filter(e => e[1]).length }));
    }
  assert.deepEqual(await sourceHashes(), source, 'frozen source changed during collection');
  await fs.writeFile(output, gzipSync(JSON.stringify({ schema: 'blocky-architecture-games-v1', source, catalogue,
    shapes: rt.shapes, cap: 240, node: process.version, runs, timings })));
  await fs.rm(output + '.checkpoint');
  console.log(JSON.stringify({ output, games: runs.length, moves: runs.reduce((n, r) => n + r.moves, 0) }));
} finally { await rt.server.close(); }
