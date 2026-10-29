import { expect, it } from "vitest";
import { scoreBreakdown, comboMultiplier } from "../src/core/scoring";
import { applyMove, newGame } from "../src/core/rules";
import {
  bestFor,
  recordScore,
  createProfile,
  validProfile,
} from "../src/core/profile";
import { MusicalChain } from "../src/game/festival";
it("line rewards, real multipliers and independent empty-board bonus", () => {
  expect(
    [1, 2, 3, 4].map((n) => scoreBreakdown(4, n, 1, false, true).total),
  ).toEqual([104, 304, 604, 1004]);
  expect(scoreBreakdown(4, 2, 4, true, true)).toEqual({
    placement: 4,
    lines: 300,
    combo: 600,
    empty: 1000,
    total: 1904,
  });
  expect([1, 2, 3, 4, 5, 6, 100].map(comboMultiplier)).toEqual([
    1, 1.5, 2, 3, 4, 5, 5,
  ]);
  expect(scoreBreakdown(4, 0, 5, false, true).total).toBe(4);
});
it("old games keep exact scores; new games use new scale without changing RNG/board", () => {
  const old = newGame(3, "score");
  old.board = Array(64).fill(0);
  for (let x = 1; x < 8; x++) old.board[x] = 2;
  old.tray[0] = { shapeId: "S1-0", color: 1, used: false };
  old.streak = 3;
  const a = applyMove(old, { slot: 0, x: 0, y: 0 }, old.revision)!;
  const b = applyMove(
    { ...old, scoringVersion: "festival-v3" },
    { slot: 0, x: 0, y: 0 }, old.revision,
  )!;
  expect(a.points).toBe(126);
  expect(b.points).toBe(1301);
  expect(a.state.board).toEqual(b.state.board);
  expect(a.state.rngState).toBe(b.state.rngState);
  let g = b.state;
  for (let i = 0; i < 3; i++) {
    g = {
      ...g,
      tray: [{ shapeId: "S1-0", color: 1, used: false }, ...g.tray.slice(1)],
    };
    g = applyMove(g, { slot: 0, x: i, y: 3 }, g.revision)!.state;
    expect(g.streak).toBe(i < 2 ? 4 : 0);
  }
});
it("records survive switching and revival across scoring versions", () => {
  let p = createProfile(newGame(3, "old"));
  p.best = 999;
  const newer = {
    ...newGame(4, "new"),
    scoringVersion: "festival-v3" as const,
    score: 5000,
  };
  p = { ...p, game: newer };
  p = { ...p, ...recordScore(p, newer) };
  expect(bestFor(p)).toBe(5000);
  expect(p.legacyBest).toBe(999);
  p = { ...p, game: { ...newGame(3, "revived"), score: 1100 } };
  p = { ...p, ...recordScore(p, p.game) };
  expect(bestFor(p)).toBe(1100);
  expect(p.festivalBest).toBe(5000);
  expect(validProfile(p)).toBe(true);
  expect(validProfile({ ...p, festivalBest: -1 })).toBe(false);
});
it("every nearby clear rises in pitch, saturates and resets after silence", () => {
  const chain = new MusicalChain();
  expect(
    [0, 300, 600, 900, 1200, 1500, 1800, 2100, 2400].map((t) => chain.next(t)),
  ).toEqual([0, 3, 5, 7, 10, 12, 15, 17, 17]);
  expect(chain.next(5301)).toBe(0);
  chain.next(5400);
  chain.reset();
  expect(chain.next(5500)).toBe(0);
});
