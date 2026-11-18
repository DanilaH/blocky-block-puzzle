/** D79 C1: offline-only next-tray experiment. No production consumer. */
import { SHAPES, random, type Board, type Move } from '../../../src/core/rules';
import { WorkBudget, catalog, canPlace, transition, proveIds, packagePath, toRows, occupied, type Operation, type Rows } from '../../../src/core/director-search';
import { boardGeometry, directorBeam, finishGoal } from '../../../src/core/director-goal-tools';

export interface LocalHistory { sinceClear: number; recentBags: string[] }
export const initialLocalHistory = (): LocalHistory => ({ sinceClear: 0, recentBags: [] });
export function observeLocalHistory(h: LocalHistory, earned: boolean): LocalHistory {
  return { ...h, sinceClear: earned ? 0 : Math.min(1000000, h.sinceClear + 1) };
}
type Choice = { move: Move; op: Operation; rows: Rows; lines: number; clear: boolean; rect: number };
type SecondProof = { move: Move; complete: boolean; status: 'found' | 'unknown' | 'unsolvable'; witnesses: Move[][]; lines: number; reward: number; rect: number };
type RootProof = { move: Move; complete: boolean; status: 'found' | 'unknown' | 'unsolvable'; seconds: SecondProof[] };

function largestRectangle(rows: Rows) {
  const heights = Array<number>(8).fill(0); let best = 0;
  for (const row of rows) {
    for (let x = 0; x < 8; x++) heights[x] = row & 1 << x ? 0 : heights[x]! + 1;
    for (let l = 0; l < 8; l++) { let min = 8;
      for (let r = l; r < 8; r++) { min = Math.min(min, heights[r]!); best = Math.max(best, min * (r - l + 1)); }
    }
  }
  return best;
}
const signature = (ids: number[]) => ids.map(i => SHAPES[i]!.family).sort().join(',');
const sameBag = (path: Operation[]) => path.map(p => p.shape).sort((a, b) => a - b).join(',');

export function localChoiceDeal(board: Board, seed: number, moves = 0, history = initialLocalHistory(), mode: 'ranked' | 'random' = 'ranked', limit = 24000) {
  const meter = new WorkBudget(limit), rows = toRows(board), pool: { path: Operation[]; source: string }[] = [];
  let rng = seed;
  const roll = () => { const r = random(rng); rng = r.state; return r.value; };
  const rank = SHAPES.map((_, i) => ({ i, r: roll() })).sort((a, b) => a.r - b.r).map(x => x.i);
  const reverse = roll() < .5, maxArea = moves < 9 ? 6 : 9;
  const add = (path: Operation[], source: string) => {
    if (!pool.some(p => sameBag(p.path) === sameBag(path))) pool.push({ path, source });
  };
  const ordinary = directorBeam({ rows, meter, rank, reverse, width: 6, work: Math.min(6000, meter.ceiling),
    allow: id => SHAPES[id]!.cells.length <= maxArea,
    key: node => sameBag(node.path) + ':' + node.rows.join(','),
    score: node => { const g = boardGeometry(node.rows);
      return node.lines * 120 + node.clears * 80 + g.fullness * .7 - g.holes * 40 - g.edges - Math.abs(g.occupied - 18) * 1.5;
    } });
  for (const n of ordinary) { add(n.path, 'ordinary'); if (pool.length === 3) break; }
  if (occupied(rows) && history.sinceClear >= 9 && meter.used < meter.ceiling) {
    const cap = meter.ceiling; meter.ceiling = Math.min(cap, meter.used + 3500);
    const path = finishGoal(rows, meter, rank, new Set(rank.filter(id => SHAPES[id]!.cells.length <= maxArea)));
    meter.ceiling = cap; if (path) add(path, 'current-all-clear');
  }
  const shuffle = [0, 1, 2].map(i => ({ i, r: roll() })).sort((a, b) => a.r - b.r).map(x => x.i);
  const selectionRoll = roll(); // exactly the same RNG schedule in both variants
  const rectangles = new Map<string, number>();
  const rectangle = (b: Rows) => { const key = b.join(','); let n = rectangles.get(key);
    if (n === undefined) { n = largestRectangle(b); rectangles.set(key, n); } return n; };
  function choices(b: Rows, ids: number[], used: Set<number>) {
    const list: Choice[] = []; let complete = true;
    outer: for (let slot = 0; slot < ids.length; slot++) {
      if (used.has(slot)) continue;
      for (const op of catalog()[ids[slot]!]!) {
        const fits = canPlace(b, op, meter); if (fits === null) { complete = false; break outer; } if (!fits) continue;
        const next = transition(b, op, meter); if (!next) { complete = false; break outer; }
        list.push({ move: { slot, x: op.x, y: op.y }, op, rows: next.rows, lines: next.lines, clear: next.clear, rect: rectangle(next.rows) });
      }
    }
    return { list, complete };
  }
  const attractive = (list: Choice[], n: number) => {
    const clear = [...list].sort((a, b) => (b.lines * 100 + Number(b.clear) * 1000 + b.rect * .05) - (a.lines * 100 + Number(a.clear) * 1000 + a.rect * .05));
    const space = [...list].sort((a, b) => (b.rect * 2 + b.lines * 20) - (a.rect * 2 + a.lines * 20));
    return [...new Map([...clear.slice(0, n), ...space.slice(0, n)].map(x => [JSON.stringify(x.move), x])).values()];
  };
  const assessments = pool.map((candidate, ci) => {
    const ids = shuffle.map(i => candidate.path[i]!.shape), cap = meter.ceiling;
    const end = meter.used + Math.floor((cap - meter.used) / (pool.length - ci));
    meter.ceiling = end;
    const first = choices(rows, ids, new Set()), roots = attractive(first.list, 2), proofs: RootProof[] = [];
    let lineSum = 0, rewardSum = 0, rectSum = 0, outcomes = 0, safeRoots = 0;
    for (let ri = 0; ri < roots.length; ri++) {
      const root = roots[ri]!, rootCap = meter.ceiling;
      meter.ceiling = meter.used + Math.floor((end - meter.used) / (roots.length - ri));
      const seconds = choices(root.rows, ids, new Set([root.move.slot])), picked = attractive(seconds.list, 2), secondProofs: SecondProof[] = [];
      for (let si = 0; si < picked.length; si++) {
        const second = picked[si]!, secondCap = meter.ceiling;
        meter.ceiling = meter.used + Math.floor((secondCap - meter.used) / (picked.length - si));
        const last = choices(second.rows, ids, new Set([root.move.slot, second.move.slot]));
        const finals = attractive(last.list, 1), witnesses = finals.map(f => [root.move, second.move, f.move]);
        const lines = finals.reduce((n, f) => n + root.lines + second.lines + f.lines, 0);
        const reward = finals.reduce((n, f) => n + Number(root.clear || second.clear || f.clear), 0);
        const rect = finals.reduce((n, f) => n + f.rect, 0);
        lineSum += lines; rewardSum += reward; rectSum += rect; outcomes += finals.length;
        secondProofs.push({ move: second.move, complete: last.complete,
          status: finals.length ? 'found' : last.complete ? 'unsolvable' : 'unknown', witnesses, lines, reward, rect });
        meter.ceiling = secondCap;
      }
      const safe = secondProofs.some(s => s.status === 'found'); safeRoots += Number(safe);
      // Only a complete enumeration of every second action could certify an
      // impossible first action. A sampled miss always remains unknown.
      proofs.push({ move: root.move, complete: seconds.complete && picked.length === seconds.list.length && secondProofs.every(s => s.complete),
        status: safe ? 'found' : 'unknown', seconds: secondProofs });
      meter.ceiling = rootCap;
    }
    meter.ceiling = cap;
    const bag = signature(ids), repeated = history.recentBags.filter(b => b === bag).length;
    const accessible = roots.length ? safeRoots / roots.length : 0;
    const rewardWeight = 200 * Math.min(1, history.sinceClear / 18);
    const meanLines = outcomes ? lineSum / outcomes : 0, meanReward = outcomes ? rewardSum / outcomes : 0;
    const directLines = roots.length ? roots.reduce((n, r) => n + r.lines, 0) / roots.length : 0;
    const score = meanLines * 80 + directLines * 40 + meanReward * rewardWeight + (outcomes ? rectSum / outcomes * .2 : 0) - repeated * 120;
    return { index: ci, source: candidate.source, bag, score, meanLines, meanReward, directLines, accessible,
      eligible: safeRoots >= Math.min(2, roots.length) && roots.length > 0, firstComplete: first.complete,
      roots: proofs, ...packagePath(candidate.path, shuffle) };
  });
  if (!pool.length) {
    meter.ceiling = meter.limit;
    const id = SHAPES.findIndex(s => s.id === 'S1-0'), proof = proveIds(rows, [id, id, id], meter);
    if (!proof.path) throw Error('Local candidate has no proved emergency route');
    return { ...packagePath(proof.path, shuffle), rngState: rng, fallback: true,
      diagnostic: { version: 1, mode, checks: meter.used, limit, chosen: -1, weakAssessment: true, pool: assessments, source: 'singletons-reserve' } };
  }
  const eligible = assessments.filter(a => a.eligible), ranked = [...(eligible.length ? eligible : assessments)].sort((a, b) => b.score - a.score);
  const near = ranked.filter(a => a.score >= ranked[0]!.score - 40).slice(0, 2);
  const chosen = mode === 'random' ? assessments[Math.floor(selectionRoll * assessments.length)]! : near[Math.floor(selectionRoll * near.length)]!;
  const packaged = packagePath(pool[chosen.index]!.path, shuffle);
  return { ...packaged, rngState: rng, fallback: false,
    diagnostic: { version: 1, mode, checks: meter.used, limit, chosen: chosen.index, weakAssessment: !eligible.length,
      pool: assessments, source: chosen.source } };
}
