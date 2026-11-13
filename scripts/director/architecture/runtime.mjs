import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';

export const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
export const playerSeed = seed => createHash('sha256').update(`architecture-player:${seed}`).digest().readUInt32LE(0);
export const styles = ['clear', 'space', 'three', 'bounded', 'lapse', 'bounded-reward', 'three-reward'];
export const policies = ['flow-v4', 'director-v2', 'random-proved'];
export async function runtime(catalogue = 'full') {
  const shapes = JSON.parse(await fs.readFile('src/core/shapes.json', 'utf8'));
  const allowed = catalogue === 'common' ? shapes.filter(s => !['D3', 'L5'].includes(s.family)) : shapes;
  const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true },
    plugins: catalogue === 'common' ? [{ name: 'offline-common-catalogue', enforce: 'pre',
      load(id) { if (id.replaceAll('\\', '/').endsWith('/src/core/shapes.json')) return JSON.stringify(allowed); } }] : [] });
  try {
    const load = path => server.ssrLoadModule(path);
    const R = await load('/src/core/rules.ts');
    const [H, G, P, A, MP, RP, SR] = await Promise.all([
      '/src/core/rhythm.ts', '/src/core/goal-director.ts',
      '/scripts/difficulty/players.ts', '/scripts/difficulty/analyze.ts', '/scripts/director/mixed-players.ts',
      '/scripts/director/architecture/players.ts', '/scripts/director/architecture/strict-random.ts',
    ].map(load));
    assert.deepEqual(R.SHAPES.map(s => s.id), allowed.map(s => s.id));
    function choose(board, tray, style, roll) {
      if (style.endsWith('-reward')) return RP.chooseReward(board, tray, style.split('-')[0], roll);
      if (style === 'space') return P.choose(board, tray, style, roll);
      return MP.chooseMixed(board, tray, style, roll).move;
    }
    function verify(board, d) {
      assert(d.witness, 'every issued comparator tray needs a complete positive proof');
      let b = board; const used = new Set();
      for (const m of d.witness) {
        assert(!used.has(m.slot)); used.add(m.slot);
        const s = R.shapeById(d.tray[m.slot].shapeId); assert(R.fits(b, s, m.x, m.y));
        b = R.place(b, s, m.x, m.y).board;
      }
      assert.equal(used.size, 3);
    }
    return { server, R, H, G, P, A, MP, RP, SR, choose, verify, catalogue, shapes: allowed };
  } catch (error) { await server.close(); throw error; }
}
export async function sourceHashes() {
  const files = [];
  async function walk(dir) { for (const ent of await fs.readdir(dir, { withFileTypes: true })) {
    const p = `${dir}/${ent.name}`;
    if (ent.isDirectory()) await walk(p); else if (/\.(ts|json|mjs)$/.test(p)) files.push(p);
  } }
  await walk('src/core'); await walk('scripts/director/architecture');
  files.push('scripts/difficulty/players.ts', 'scripts/difficulty/analyze.ts', 'scripts/director/mixed-players.ts',
    'docs/qa/dealer-architecture/protocol.md', 'package-lock.json');
  return Object.fromEntries(await Promise.all(files.sort().map(async p => [p, hash(await fs.readFile(p))])));
}
