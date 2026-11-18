// Public TypeScript rules independently replay all positive diagnostic fixtures.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { hash } from './architecture/runtime.mjs';
const input = await fs.readFile('docs/qa/reward-reachability/positive-fixtures.json');
const fixtures = JSON.parse(input);
const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true } });
try {
  const R = await server.ssrLoadModule('/src/core/rules.ts');
  let moves = 0, rewards = 0;
  for (const fixture of fixtures) {
    let board = fixture.rows.flatMap(row => Array.from({ length: 8 }, (_, x) => Number(Boolean(row & (1 << x)))));
    const earnedAt = [];
    for (const [index, p] of fixture.placements.entries()) {
      const shape = R.shapeById(p.shapeId);
      assert(R.fits(board, shape, p.x, p.y));
      board = R.place(board, shape, p.x, p.y).board;
      moves++;
      if (board.every(x => !x)) { rewards++; earnedAt.push(index + 1); }
    }
    assert(earnedAt.includes(fixture.rewardAt));
  }
  const output = { schema: 'blocky-exact-reward-public-check-v1', fixtures: fixtures.length, moves, rewards,
    inputSha256: hash(input), rulesSha256: hash(await fs.readFile('src/core/rules.ts')),
    scriptSha256: hash(await fs.readFile('scripts/director/verify-reward-reachability.mjs')) };
  await fs.writeFile('docs/qa/reward-reachability/public-checks.json', JSON.stringify(output, null, 2) + '\n');
  console.log(JSON.stringify(output));
} finally { await server.close(); }
