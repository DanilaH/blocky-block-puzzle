/** Offline ablation only. Existing players and production rules are unchanged. */
import { type Board, type Slot, type Move } from '../../../src/core/rules';
import { actions, transition, toRows, occupied } from '../../difficulty/analyze';

function geometry(rows: number[]) {
  const pop = (n: number) => { let c = 0; for (; n; n &= n - 1) c++; return c; };
  let edges = 0, holes = 0;
  for (let y = 0; y < 8; y++) {
    const row = rows[y]!, empty = ~row & 255;
    edges += pop((row ^ row << 1) & 255) + pop(row ^ (rows[y + 1] ?? 0));
    const near = ((empty << 1) | (empty >> 1) | (~(rows[y - 1] ?? 255) & 255) | (~(rows[y + 1] ?? 255) & 255)) & 255;
    holes += pop(empty & ~near);
  }
  return -occupied(rows) * 2 - edges - holes * 20;
}

// Only the all-clear term is new: same 16-wide beam, line/space weights,
// tie order and bounded <=20 top-five choice as the original players.
// 1000 is the displayed Festival all-clear bonus; this is not a human model.
export function rewardOptions(board: Board, tray: Slot[], bonus = 1000) {
  return actions(toRows(board), tray).map(op => {
    const n = transition(toRows(board), op);
    return { move: { slot: op.slot, x: op.x, y: op.y },
      value: n.lines * 200 + geometry(n.rows) + Number(occupied(n.rows) === 0) * bonus };
  }).sort((a, b) => b.value - a.value);
}
export function chooseReward(board: Board, tray: Slot[], style: 'bounded' | 'three', roll = 0, bonus = 1000): Move | null {
  if (style === 'bounded') {
    const ranked = rewardOptions(board, tray, bonus);
    const options = ranked.filter(x => x.value >= (ranked[0]?.value ?? 0) - 20).slice(0, 5);
    return options[Math.min(options.length - 1, Math.floor(roll * options.length))]?.move ?? null;
  }
  let beam = [{ rows: toRows(board), used: 0, lines: 0, rewards: 0, first: null as Move | null, value: 0 }];
  for (let depth = 0; depth < Math.min(3, tray.filter(s => !s.used).length); depth++) {
    const children = beam.flatMap(p => actions(p.rows, tray, p.used).map(op => {
      const n = transition(p.rows, op), lines = p.lines + n.lines;
      const rewards = p.rewards + Number(occupied(n.rows) === 0);
      return { rows: n.rows, used: p.used | 1 << op.slot, lines, rewards,
        first: p.first ?? { slot: op.slot, x: op.x, y: op.y },
        value: lines * 200 + geometry(n.rows) + rewards * bonus };
    }));
    if (!children.length) break;
    children.sort((a, b) => b.value - a.value);
    beam = children.slice(0, 16);
  }
  return beam[0]?.first ?? null;
}
