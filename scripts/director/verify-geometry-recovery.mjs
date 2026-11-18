// Independent public-rule/player replay and witness accessibility diagnosis.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { runtime, hash } from './architecture/runtime.mjs';
const out = 'docs/qa/geometry-recovery', bytes = await fs.readFile(`${out}/results.json`), data = JSON.parse(bytes);
const rt = await runtime();
try {
  const equalMove = (a, b) => a.slot === b.slot && a.x === b.x && a.y === b.y;
  const key = b => b.reduce((n, r, y) => n | BigInt(r) << BigInt(8*y), 0n).toString();
  function take(board, tray, move) {
    assert(!tray[move.slot].used);
    const s = rt.R.shapeById(tray[move.slot].shapeId); assert(rt.R.fits(board, s, move.x, move.y));
    const next = rt.R.place(board, s, move.x, move.y); tray[move.slot].used = true;
    return { board: next.board, rows: rt.A.toRows(next.board), lines: next.lines, clear: next.board.every(x => !x) };
  }
  let actual = 0, witness = 0;
  const accessibility = [];
  for (const [i, route] of data.routes.entries()) {
    if (route.status !== 'found') continue;
    let b = rt.A.toBoard(route.rows), tray;
    const choices = [];
    for (const [j, e] of route.trace.entries()) {
      if (j % 3 === 0) tray = structuredClone(route.trays[Math.floor(j/3)]);
      const move = { slot: [2, 0, 1].indexOf(j%3), x: e.x, y: e.y };
      assert.equal(tray[move.slot].shapeId, e.shapeId);
      const bounded = rt.MP.boundedOptions(b, tray), all = rt.RP.rewardOptions(b, tray, 0);
      const rank = all.findIndex(o => equalMove(o.move, move)); assert(rank >= 0);
      const maxLines = Math.max(...rt.A.actions(rt.A.toRows(b), tray).map(op => rt.A.transition(rt.A.toRows(b), op).lines));
      const n = take(b, tray, move); b = n.board; witness++;
      assert.deepEqual(n.rows, e.rows); assert.equal(n.lines, e.lines); assert.equal(n.clear, e.clear);
      if (!e.padding) choices.push({ at: j, slot: move.slot, x: move.x, y: move.y, rank: rank+1,
        options: bounded.length, withinBounded: bounded.some(o => equalMove(o.move, move)),
        valueGap: all[0].value-all[rank].value, lines: n.lines, maxImmediateLines: maxLines });
    }
    accessibility.push({ input: i, choices, firstExcluded: choices.find(c => !c.withinBounded)?.at ?? null,
      allChoicesIncluded: choices.every(c => c.withinBounded),
      requiresPassingImmediateLine: choices.some(c => c.lines < c.maxImmediateLines) });
  }
  for (const e of data.episodes) {
    let b = rt.A.toBoard(data.routes[e.input].rows), tray;
    for (let j = 0; j < e.events.length; j++) {
      const event = e.events[j];
      if (j % 3 === 0) {
        const d = e.deals[j/3]; assert.deepEqual(d.rows, rt.A.toRows(b)); tray = structuredClone(d.tray);
        if (e.mode === 'fixed') assert.deepEqual(tray, data.routes[e.input].trays[j/3]);
        else {
          const q = data.queries[d.query]; assert.equal(q.horizon, 9-j); assert.equal(q.status, 'found');
          assert.equal(q.board, key(d.rows));
        }
      }
      const options = rt.MP.boundedOptions(b, tray); assert.deepEqual(options, event.options);
      const choice = Math.min(options.length-1, Math.floor(e.quantile*options.length)); assert.equal(choice, event.choice);
      assert(equalMove(options[choice].move, event)); assert.equal(tray[event.slot].shapeId, event.shapeId);
      const n = take(b, tray, event); b = n.board; actual++;
      assert.deepEqual(n.rows, event.rows); assert.equal(n.lines, event.lines); assert.equal(n.clear, event.clear);
    }
    assert.deepEqual(rt.A.toRows(b), e.finalRows);
    if (e.status === 'dead') assert.equal(rt.MP.boundedOptions(b, tray).length, 0);
    if (e.status === 'construction-unknown' || e.status === 'no-reward-within-horizon') {
      assert.equal(e.events.length % 3, 0);
      const q = data.queries.find(q => q.horizon === 9-e.events.length && q.board === key(e.finalRows));
      assert(q); assert.equal(q.status, e.status === 'construction-unknown' ? 'unknown' : 'impossible');
    }
    if (e.mode === 'fixed') {
      const pair = data.episodes.find(p => p.mode === 'rebuild' && p.input === e.input && p.quantile === e.quantile);
      assert.deepEqual(e.deals[0].tray, pair.deals[0].tray);
      assert.deepEqual(e.events.slice(0, 3), pair.events.slice(0, 3));
    }
  }
  const dry = events => { let gap = 0, max = 0; for (const e of events) { gap = e.lines ? 0 : gap+1; max = Math.max(max, gap); } return max; };
  const summary = {};
  for (const mode of ['fixed', 'rebuild']) {
    const episodes = data.episodes.filter(e => e.mode === mode), events = episodes.flatMap(e => e.events);
    summary[mode] = { episodes: episodes.length, moves: events.length,
      statuses: Object.fromEntries([...new Set(episodes.map(e => e.status))].map(s => [s, episodes.filter(e => e.status === s).length])),
      rewardInputs: new Set(episodes.filter(e => e.status === 'reward').map(e => e.input)).size,
      allFiveRewardInputs: data.routes.filter((_, i) => episodes.filter(e => e.input === i && e.status === 'reward').length === 5).length,
      lines: events.reduce((n, e) => n+e.lines, 0), clearingMoves: events.filter(e => e.lines).length,
      maxDryGap: Math.max(...episodes.map(e => dry(e.events))),
      trays: [0, 1, 2].map(t => ({ reached: episodes.filter(e => e.events.length > t*3).length,
        lines: episodes.reduce((n, e) => n+e.events.slice(t*3, (t+1)*3).reduce((s, a) => s+a.lines, 0), 0),
        rewards: episodes.filter(e => e.events.slice(t*3, (t+1)*3).some(a => a.clear)).length })) };
  }
  const pairs = { both: 0, fixedOnly: 0, rebuildOnly: 0, neither: 0 };
  for (const fixed of data.episodes.filter(e => e.mode === 'fixed')) {
    const rebuild = data.episodes.find(e => e.mode === 'rebuild' && e.input === fixed.input && e.quantile === fixed.quantile);
    pairs[fixed.status === 'reward' ? rebuild.status === 'reward' ? 'both' : 'fixedOnly'
      : rebuild.status === 'reward' ? 'rebuildOnly' : 'neither']++;
  }
  const positive = data.routes.filter(r => r.status === 'found');
  const firstChoices = positive.map(r => rt.MP.boundedOptions(rt.A.toBoard(r.rows), r.trays[0]).length);
  const rootDiversity = positive.map(r => new Set(data.episodes.filter(e => e.mode === 'fixed' && e.input === data.routes.indexOf(r))
    .map(e => JSON.stringify([e.events[0]?.slot, e.events[0]?.x, e.events[0]?.y]))).size);
  const pop = n => { let c = 0; for (; n; n &= n-1) c++; return c; };
  function cover(rows) {
    let best = 8;
    for (let chosen = 0; chosen < 256; chosen++) {
      let columns = 0; for (let y = 0; y < 8; y++) if (!(chosen & 1 << y)) columns |= rows[y];
      best = Math.min(best, pop(chosen)+pop(columns));
    }
    return best;
  }
  const mean = xs => xs.reduce((n, x) => n+x, 0)/xs.length;
  const geometry = { initialMeanCover: mean(positive.map(r => cover(r.rows))),
    witnessAfterThreeMeanCover: mean(positive.map(r => cover(r.trace[2].rows))),
    boundedAfterThreeMeanCover: mean(data.episodes.filter(e => e.mode === 'fixed' && e.events.length >= 3)
      .map(e => cover(e.events[2].rows))) };
  const native = { queries: data.queries.length, fitChecks: data.queries.reduce((n, q) => n+q.fitChecks, 0),
    initialMinChecks: Math.min(...data.queries.filter(q => q.horizon === 9).map(q => q.fitChecks)),
    initialMaxChecks: Math.max(...data.queries.filter(q => q.horizon === 9).map(q => q.fitChecks)) };
  const output = { schema: 'blocky-geometry-recovery-public-check-v1', resultSha256: hash(bytes),
    verifierSha256: hash(await fs.readFile('scripts/director/verify-geometry-recovery.mjs')),
    publicWitnessMoves: witness, publicActualMoves: actual,
    positiveInputs: positive.length, unknownInputs: data.routes.length-positive.length,
    witnessRewardAt: positive.map(r => r.trace.findIndex(e => e.clear)+1),
    witnessLines: positive.map(r => r.trace.filter(e => !e.padding).reduce((n, e) => n+e.lines, 0)),
    witnessMaxDryGap: Math.max(...positive.map(r => dry(r.trace.filter(e => !e.padding)))),
    paddedSingles: positive.reduce((n, r) => n+r.trace.filter(e => e.padding).length, 0),
    firstChoices, rootDiversity, summary, pairs, native, geometry,
    routesWithAllChoicesIncluded: accessibility.filter(a => a.allChoicesIncluded).length,
    routesPassingImmediateLine: accessibility.filter(a => a.requiresPassingImmediateLine).length,
    excludedOnFirst: accessibility.filter(a => a.firstExcluded === 0).length, accessibility };
  await fs.writeFile(`${out}/checks-public.json`, JSON.stringify(output, null, 2)+'\n');
  console.log(JSON.stringify(Object.fromEntries(Object.entries(output).filter(([k]) =>
    !['accessibility', 'firstChoices', 'rootDiversity', 'witnessRewardAt', 'witnessLines'].includes(k)))));
} finally { await rt.server.close(); }
