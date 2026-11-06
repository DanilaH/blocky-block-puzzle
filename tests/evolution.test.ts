import { expect, it } from "vitest";
import { seriesPitch, themeFor, themeAccent, THEMES } from "../src/game/themes";
import { rankMoves, praiseFor } from "../src/core/praise";
import { newGame, applyMove } from "../src/core/rules";
import { findHint } from "../src/core/hints";
it("real series pitch survives preparation moves, caps and resets only with streak", () => {
  let g = newGame(1, "pitch");
  g.streak = 5;
  g.board[0] = 1;
  g.tray = [0, 1, 2].map(() => ({ shapeId: "S1-0", color: 1, used: false }));
  for (let i = 0; i < 3; i++) {
    g = applyMove(g, { slot: i, x: i + 1, y: 2 }, g.revision)!.state;
    expect(seriesPitch(g.streak)).toBe(i < 2 ? 10 : 0);
  }
  expect(seriesPitch(100)).toBe(17);
});
it("theme boundaries and post-100 variations remain bounded", () => {
  THEMES.forEach((t, i) => {
    expect(themeFor(t.at)).toBe(i);
    if (i) expect(themeFor(t.at - 1)).toBe(i - 1);
  });
  expect(themeFor(10000)).toBe(10);
  expect(themeAccent(100)).not.toBe(themeAccent(125));
  expect(themeAccent(200)).toBe(themeAccent(100));
});
it("complete praise comparison agrees with hint, preserves state and rejects stale/cutoff", () => {
  const g = newGame(1, "rank");
  g.board = Array(64).fill(1);
  [0, 1, 8, 20].forEach((i) => (g.board[i] = 0));
  g.tray = [0, 1, 2].map((i) => ({ shapeId: "S1-0", color: 1, used: i > 0 }));
  const snapshot = JSON.stringify(g);
  const result = rankMoves(g, 1000),
    hint = findHint(g, 1000);
  expect(result.depth).toBe(1);
  expect(result.choices[0]!.move).toEqual(hint.move);
  expect(JSON.stringify(g)).toBe(snapshot);
  expect(
    praiseFor(
      result,
      { ...g, revision: g.revision + 1 },
      result.choices[0]!.move,
    ),
  ).toBeNull();
  expect(rankMoves(g, -1).depth).toBe(0);
  expect(rankMoves(newGame(2, "empty")).choices).toEqual([]);
});
