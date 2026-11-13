// D81 engineering-only multi-tray probe; no runtime consumer.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { runtime, hash } from './architecture/runtime.mjs';

const exec = promisify(execFile), out = 'docs/qa/geometry-recovery';
const sourceFiles = ['scripts/director/geometry-recovery.cpp', 'scripts/director/geometry-recovery.mjs',
  'docs/qa/geometry-recovery/protocol.md', 'scripts/director/mixed-players.ts',
  'scripts/difficulty/analyze.ts', 'src/core/rules.ts', 'src/core/shapes.json'];
const sources = Object.fromEntries(await Promise.all(sourceFiles.map(async p => [p, hash(await fs.readFile(p))])));
const inputBytes = await fs.readFile('docs/qa/reward-reachability/results.json');
const input = JSON.parse(inputBytes), rt = await runtime();
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'blocky-recovery-'));
try {
  const exe = path.join(tmp, 'search');
  await exec('g++', ['-std=c++17', '-O3', '-Wall', '-Wextra', 'scripts/director/geometry-recovery.cpp', '-o', exe]);
  const ops = rt.shapes.flatMap((s, shape) => Array.from({ length: 9-s.height }, (_, y) =>
    Array.from({ length: 9-s.width }, (_, x) => ({ shape, shapeId: s.id, x, y,
      mask: s.cells.reduce((n, [dx, dy]) => n | 1n << BigInt((y+dy)*8+x+dx), 0n).toString() }))).flat());
  const header = [ops.length, ...ops.map(o => `${o.shape} ${o.x} ${o.y} ${o.mask}`)].join('\n');
  const mask = rows => rows.reduce((n, r, y) => n | BigInt(r) << BigInt(y*8), 0n).toString();
  const fromRows = rows => rt.A.toBoard(rows);
  const cache = new Map(), queries = [];
  async function search(boards, horizon) {
    const missing = [...new Map(boards.map(b => [mask(rt.A.toRows(b)), b])).entries()]
      .filter(([b]) => !cache.has(`${horizon}:${b}`));
    if (missing.length) {
      const plain = `${header}\n${missing.length}\n${missing.map(([b]) => b).join('\n')}\n`;
      const start = performance.now();
      // execFile has no stdin option. Spawn directly, keeping file contents local.
      const { spawn } = await import('node:child_process');
      const result = await new Promise((resolve, reject) => {
        const child = spawn(exe, ['96', String(horizon)]), stdout = [], stderr = [];
        child.stdout.on('data', c => stdout.push(c)); child.stderr.on('data', c => stderr.push(c));
        child.on('error', reject); child.on('close', code => code === 0 ? resolve(JSON.parse(Buffer.concat(stdout)))
          : reject(Error(`native exit ${code}: ${Buffer.concat(stderr)}`)));
        child.stdin.end(plain);
      });
      assert.equal(result.cases.length, missing.length);
      for (const [i, c] of result.cases.entries()) {
        assert.equal(c.board, missing[i][0]);
        const row = { horizon, ...c };
        queries.push(row); cache.set(`${horizon}:${c.board}`, row);
      }
      console.log(JSON.stringify({ stage: 'native', horizon, boards: missing.length,
        found: result.cases.filter(c => c.status === 'found').length, seconds: (performance.now()-start)/1000 }));
    }
    return boards.map(b => cache.get(`${horizon}:${mask(rt.A.toRows(b))}`));
  }
  function execute(board, p) {
    const shape = rt.R.shapeById(p.shapeId); assert(rt.R.fits(board, shape, p.x, p.y));
    const n = rt.R.place(board, shape, p.x, p.y);
    return { board: n.board, lines: n.lines, clear: n.board.every(x => !x) };
  }
  function packageRoute(board, ids, length) {
    const placements = ids.map(i => ({ shapeId: ops[i].shapeId, x: ops[i].x, y: ops[i].y }));
    let b = board;
    const trace = [];
    for (const p of placements) { const n = execute(b, p); b = n.board; trace.push({ ...p, rows: rt.A.toRows(b), lines: n.lines, clear: n.clear, padding: false }); }
    assert(trace.some(t => t.clear));
    while (trace.length < length) {
      const cell = b.findIndex(x => !x); assert(cell >= 0);
      const p = { shapeId: 'S1-0', x: cell%8, y: Math.floor(cell/8) }, n = execute(b, p);
      b = n.board; trace.push({ ...p, rows: rt.A.toRows(b), lines: n.lines, clear: n.clear, padding: true });
    }
    const trays = [];
    for (let i = 0; i < trace.length; i += 3) {
      const group = trace.slice(i, i+3); assert.equal(group.length, 3);
      trays.push([2, 0, 1].map(j => ({ shapeId: group[j].shapeId, used: false, color: j+1 })));
    }
    return { trace, trays };
  }
  const boards = input.cases.map(c => fromRows(c.rows)), initial = await search(boards, 9);
  const routes = initial.map((q, i) => ({ seed: input.cases[i].seed, move: input.cases[i].move,
    rows: input.cases[i].rows, query: queries.indexOf(q), status: q.status,
    ...(q.status === 'found' ? packageRoute(boards[i], q.ops, 9) : {}) }));
  const quantiles = [0, .25, .5, .75, .999999], episodes = [];
  for (let i = 0; i < routes.length; i++) {
    if (routes[i].status !== 'found') continue;
    for (const quantile of quantiles) for (const mode of ['fixed', 'rebuild']) episodes.push({
      input: i, quantile, mode, board: [...boards[i]], events: [], deals: [], status: 'playing' });
  }
  for (let wave = 0; wave < 3; wave++) {
    const rebuild = episodes.filter(e => e.mode === 'rebuild' && e.status === 'playing');
    const found = wave === 0 ? rebuild.map(e => initial[e.input]) : await search(rebuild.map(e => e.board), 9-wave*3);
    const rebuilt = new Map(rebuild.map((e, i) => [e, found[i]]));
    for (const e of episodes.filter(e => e.status === 'playing')) {
      let tray, query = null;
      if (e.mode === 'fixed') tray = structuredClone(routes[e.input].trays[wave]);
      else {
        const q = rebuilt.get(e); query = queries.indexOf(q);
        if (q.status !== 'found') { e.status = q.status === 'impossible' ? 'no-reward-within-horizon' : 'construction-unknown'; continue; }
        tray = packageRoute(e.board, q.ops, Math.ceil(q.ops.length/3)*3).trays[0];
      }
      e.deals.push({ at: e.events.length, rows: rt.A.toRows(e.board), tray: structuredClone(tray), query });
      for (let j = 0; j < 3; j++) {
        const options = rt.MP.boundedOptions(e.board, tray);
        if (!options.length) { e.status = 'dead'; break; }
        const choice = Math.min(options.length-1, Math.floor(e.quantile*options.length)), move = options[choice].move;
        const p = { shapeId: tray[move.slot].shapeId, x: move.x, y: move.y }, n = execute(e.board, p);
        e.board = n.board; tray[move.slot].used = true;
        e.events.push({ ...move, ...p, options, choice, lines: n.lines, clear: n.clear, rows: rt.A.toRows(e.board) });
        if (n.clear) { e.status = 'reward'; break; }
      }
    }
    console.log(JSON.stringify({ stage: 'players', wave: wave+1, playing: episodes.filter(e => e.status === 'playing').length,
      reward: episodes.filter(e => e.status === 'reward').length }));
  }
  for (const e of episodes) { if (e.status === 'playing') e.status = 'horizon'; e.finalRows = rt.A.toRows(e.board); delete e.board; }
  const result = { schema: 'blocky-geometry-recovery-v1', sources, inputSha256: hash(inputBytes),
    catalogueSize: rt.shapes.length, placements: ops.length, quantiles, routes, queries, episodes };
  await fs.writeFile(`${out}/results.json`, JSON.stringify(result, null, 2)+'\n');
  assert.deepEqual(Object.fromEntries(await Promise.all(sourceFiles.map(async p => [p, hash(await fs.readFile(p))]))), sources);
  console.log(JSON.stringify({ output: `${out}/results.json`, boards: routes.length,
    paths: routes.filter(r => r.status === 'found').length, episodes: episodes.length,
    statuses: Object.fromEntries(['fixed', 'rebuild'].map(m => [m, Object.fromEntries([...new Set(episodes.map(e => e.status))]
      .map(s => [s, episodes.filter(e => e.mode === m && e.status === s).length]))])) }));
} finally { await rt.server.close(); await fs.rm(tmp, { recursive: true, force: true }); }
