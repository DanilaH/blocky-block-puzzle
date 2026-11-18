import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { runtime, hash, sourceHashes, styles, policies, playerSeed } from './runtime.mjs';

const oldRaw = await fs.readFile('docs/qa/director-constructive/results.json.gz');
const old = JSON.parse(gunzipSync(oldRaw));
const candidates = old.runs.filter(r => r.mode === 'baseline').flatMap(r => r.deals.filter(d => d.move >= 12)
  .map(d => ({ origin: { split: r.split, seed: r.seed, style: r.style, move: d.move }, ...d })));
const selected = [], seen = new Set();
for (const [lo, hi] of [[0, 11], [12, 23], [24, 35], [36, 64]]) {
  let n = 0;
  for (const d of candidates.filter(d => { const c = d.board.reduce((n, x) => n + x.toString(2).replaceAll('0', '').length, 0); return c >= lo && c <= hi; })
    .sort((a, b) => hash(a.origin).localeCompare(hash(b.origin)))) {
    const key = d.board.join(','); if (seen.has(key)) continue;
    selected.push({ ...d, stratum: [lo, hi] }); seen.add(key); if (++n === 12) break;
  }
  assert.equal(n, 12, `insufficient unique boards in ${lo}-${hi}`);
}
const source = await sourceHashes(), results = [], shortRewards = [];
function play(rt, board, tray, style, rng) {
  const { R, A } = rt;
  let b = board, t = structuredClone(tray), lines = 0, earned = false; const actions = [];
  for (let i = 0; i < 3 && R.hasMove(b, t); i++) {
    const r = R.random(rng); rng = r.state;
    const m = rt.choose(b, t, style, r.value); assert(m);
    const p = R.place(b, R.shapeById(t[m.slot].shapeId), m.x, m.y);
    b = p.board; t[m.slot].used = true; lines += p.lines; earned ||= b.every(c => !c); actions.push(m);
  }
  return { actions, lines, earned, completed: t.every(s => s.used), endpoint: A.toRows(b) };
}
function branches(rt, board, tray) {
  const { R, MP, RP, SR } = rt;
  const ordinary = (b, t) => MP.boundedOptions(b, t);
  const aware = (b, t) => { const options = RP.rewardOptions(b, t); return options.filter(x => x.value >= (options[0]?.value ?? 0) - 20).slice(0, 5); };
  const union = (a, b, count) => [...new Map([...a.slice(0, count), ...b.slice(0, count)].map(x => [JSON.stringify(x.move), x.move])).values()];
  return union(ordinary(board, tray), aware(board, tray), 5).map(m => {
    const first = R.place(board, R.shapeById(tray[m.slot].shapeId), m.x, m.y);
    const t = tray.map((s, i) => ({ ...s, used: i === m.slot }));
    const rootProof = SR.solveRemaining(first.board, t, 8000);
    const seconds = union(ordinary(first.board, t), aware(first.board, t), 3).map(second => {
      const placed = R.place(first.board, R.shapeById(t[second.slot].shapeId), second.x, second.y);
      const t2 = t.map((s, i) => ({ ...s, used: s.used || i === second.slot }));
      const proof = SR.solveRemaining(placed.board, t2, 1000);
      const slot = t2.findIndex(s => !s.used), shape = R.shapeById(t2[slot].shapeId);
      let goal = first.board.every(c => !c) || placed.board.every(c => !c), goalWitness = null;
      for (const p of R.placements(placed.board, shape)) if (R.place(placed.board, shape, p.x, p.y).board.every(c => !c)) {
        goal = true; goalWitness = { slot, ...p }; break;
      }
      return { move: second, status: proof.status, checks: proof.checks, rewardFound: goal, goalWitness };
    });
    return { move: m, status: rootProof.status, checks: rootProof.checks, witness: rootProof.witness, seconds };
  });
}
for (const catalogue of ['full', 'common']) {
  const rt = await runtime(catalogue);
  try {
    for (const snapshot of selected) for (const policy of policies) {
      const board = rt.A.toBoard(snapshot.board), input = snapshot.input;
      const before = performance.now();
      const d = policy === 'random-proved' ? rt.SR.strictRandomDeal(board, input.seed)
        : rt.R.deal(board, input.seed, policy, snapshot.move, input.rhythm?.recentBags?.at(-1) ?? '', input.rhythm, undefined, input.saved);
      const ms = performance.now() - before;
      rt.verify(board, d);
      if (catalogue === 'full' && policy === 'director-v2') assert.deepEqual(d.tray, snapshot.tray);
      const plays = [];
      for (const style of styles) for (let roll = 0; roll < 5; roll++) plays.push({ style, roll,
        ...play(rt, board, d.tray, style, playerSeed(hash(snapshot.origin) + ':' + roll)) });
      results.push({ catalogue, policy, origin: snapshot.origin, stratum: snapshot.stratum, board: snapshot.board,
        input, tray: d.tray, witness: d.witness, fallback: d.fallback, ms, diagnostic: d.diagnostic ?? null,
        branches: branches(rt, board, d.tray), plays });
    }
    if (catalogue === 'full') for (const run of old.runs.filter(r => r.mode === 'candidate')) {
      for (const d of run.deals.filter(d => d.diagnostic.goalFound && d.move + 3 <= run.moves)) {
        let rng = createHash('sha256').update('mixed-player:' + run.seed).digest().readUInt32LE(0);
        for (let i = 0; i < d.move; i++) rng = rt.R.random(rng).state;
        const board = rt.A.toBoard(d.board);
        const original = play(rt, board, d.tray, run.style, rng);
        assert.equal(original.earned, run.events.slice(d.move, d.move + 3).some(e => e[1]));
        if (!['bounded', 'three'].includes(run.style)) continue;
        const aware = play(rt, board, d.tray, run.style + '-reward', rng);
        shortRewards.push({ seed: run.seed, split: run.split, style: run.style, move: d.move,
          board: d.board, tray: d.tray, source: d.diagnostic.source, original, aware });
      }
    }
  } finally { await rt.server.close(); }
}
assert.deepEqual(await sourceHashes(), source);
const output = 'docs/qa/dealer-architecture/snapshots.json.gz';
await fs.writeFile(output, gzipSync(JSON.stringify({ schema: 'blocky-architecture-snapshots-v1', source,
  recordedDataSha256: hash(oldRaw), selected, results, shortRewards })));
console.log(JSON.stringify({ output, inputs: selected.length, comparisons: results.length,
  recordedRewardTrays: shortRewards.length, recovered: shortRewards.filter(x => !x.original.earned && x.aware.earned).length }));
