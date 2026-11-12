import { expect, it } from 'vitest';
import { emptyBoard, SHAPES, place, fits, shapeById, type Slot } from '../src/core/rules';
import { choose } from '../scripts/difficulty/players';
import { boundedOptions, chooseMixed } from '../scripts/director/mixed-players';
import { chooseReward, rewardOptions } from '../scripts/director/architecture/players';
import { solveRemaining, strictRandomDeal } from '../scripts/director/architecture/strict-random';

const tray = (ids: string[]): Slot[] => ids.map(shapeId => ({ shapeId, color: 1, used: false }));
it('isolates bonus awareness without changing old tie order or beam at zero bonus', () => {
  const boards = [emptyBoard(), Array.from({ length: 64 }, (_, i) => Number(i < 7 || i === 16))];
  for (const b of boards) for (const t of [tray(['I2-0', 'S1-0', 'I2-1']), tray(['O3-0', 'R6-0', 'I4-1'])]) {
    const options = rewardOptions(b, t, 0).filter((x, _, a) => x.value >= a[0]!.value - 20).slice(0, 5);
    expect(options).toEqual(boundedOptions(b, t));
    for (const r of [0, .3, .8, .999]) expect(chooseReward(b, t, 'bounded', r, 0)).toEqual(chooseMixed(b, t, 'bounded', r).move);
    expect(chooseReward(b, t, 'three', 0, 0)).toEqual(choose(b, t, 'three'));
  }
});
it('recognizes the recorded S1 reward without removing the distracting I2', () => {
  const b = emptyBoard(); for (let x = 0; x < 8; x++) if (x !== 3) b[8 + x] = 1;
  const t = tray(['I2-0', 'S1-0', 'I2-1']);
  for (const roll of [0, .25, .5, .75, .999]) {
    const m = chooseReward(b, t, 'bounded', roll)!;
    expect(place(b, shapeById(t[m.slot]!.shapeId), m.x, m.y).board.every(c => !c)).toBe(true);
  }
});
it('distinguishes budget unknown from exhaustive impossibility', () => {
  expect(solveRemaining(emptyBoard(), tray(['O3-0']), 0).status).toBe('unknown');
  const full = Array(64).fill(1);
  expect(solveRemaining(full, tray(['S1-0']), 100).status).toBe('impossible');
});
it('replays every slot in random and emergency proofs, within the declared placement budget', () => {
  for (const budget of [512, 24000]) for (const seed of [1, 57, 2141001]) {
    let b = emptyBoard(); for (let i = 0; i < 61; i++) b[i] = 1;
    const d = strictRandomDeal(b, seed, budget), used = new Set();
    expect(d.diagnostic.checks).toBeLessThanOrEqual(budget);
    expect(d).toEqual(strictRandomDeal(b, seed, budget));
    for (const m of d.witness) {
      expect(used.has(m.slot)).toBe(false); used.add(m.slot);
      const s = SHAPES.find(s => s.id === d.tray[m.slot]!.shapeId)!;
      expect(fits(b, s, m.x, m.y)).toBe(true); b = place(b, s, m.x, m.y).board;
    }
    expect(used.size).toBe(3);
    if (budget === 512) expect(d.fallback).toBe(true);
  }
});
