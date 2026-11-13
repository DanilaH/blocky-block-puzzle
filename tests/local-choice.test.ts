import { expect, it } from 'vitest';
import { emptyBoard, shapeById, fits, place, type Board, type Move, type Slot } from '../src/core/rules';
import { actions, toRows, transition } from '../scripts/difficulty/analyze';
import { localChoiceDeal, initialLocalHistory, observeLocalHistory } from '../scripts/director/local-choice/dealer';

function replay(board: Board, tray: Slot[], path: Move[]) {
  const used = new Set<number>(); let b = board;
  for (const m of path) {
    expect(used.has(m.slot)).toBe(false); used.add(m.slot);
    const shape = shapeById(tray[m.slot]!.shapeId); expect(fits(b, shape, m.x, m.y)).toBe(true);
    const op = actions(toRows(b), tray.map((s, i) => ({ ...s, used: used.has(i) && i !== m.slot }))).find(o => o.slot === m.slot && o.x === m.x && o.y === m.y)!;
    const next = place(b, shape, m.x, m.y); expect(toRows(next.board)).toEqual(transition(toRows(b), op).rows); b = next.board;
  }
  expect(used.size).toBe(3);
}
it('replays each output and every sampled positive continuation independently', () => {
  const b = emptyBoard(); for (let x = 0; x < 7; x++) b[8 + x] = 1;
  for (const board of [emptyBoard(), b]) for (const seed of [1, 55, 2441001]) {
    const d = localChoiceDeal(board, seed, 24, { sinceClear: 24, recentBags: [] });
    replay(board, d.tray, d.witness); expect(d.diagnostic.checks).toBeLessThanOrEqual(24000);
    for (const a of d.diagnostic.pool) { replay(board, a.tray, a.witness);
      for (const r of a.roots) for (const s of r.seconds) for (const w of s.witnesses) replay(board, a.tray, w);
    }
  }
});
it('keeps generation, proofs and output RNG identical in the selection ablation', () => {
  const b = emptyBoard(), h = { sinceClear: 18, recentBags: [] };
  const ranked = localChoiceDeal(b, 579, 18, h), control = localChoiceDeal(b, 579, 18, h, 'random');
  expect(ranked.rngState).toBe(control.rngState); expect(ranked.diagnostic.pool).toEqual(control.diagnostic.pool);
  expect(localChoiceDeal(b, 579, 18, h)).toEqual(ranked); expect(b).toEqual(emptyBoard()); expect(h.recentBags).toEqual([]);
});
it('uses a proved reserve at low work and updates history only on actual events', () => {
  const b = emptyBoard(), h = initialLocalHistory();
  const d = localChoiceDeal(b, 331, 0, h, 'ranked', 512);
  expect(d.fallback).toBe(true); expect(d.diagnostic.checks).toBeLessThanOrEqual(512); replay(b, d.tray, d.witness);
  expect(observeLocalHistory(h, false).sinceClear).toBe(1); expect(observeLocalHistory({ sinceClear: 50, recentBags: ['I2,I2,S1'] }, true)).toEqual({ sinceClear: 0, recentBags: ['I2,I2,S1'] });
});
