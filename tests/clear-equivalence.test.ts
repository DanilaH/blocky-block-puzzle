import { it, expect } from "vitest";
import { clearLines, random } from "../src/core/rules";
it("mask-based clear preserves simultaneous row/column union, order and input across 1,000 boards", () => {
  let seed = 0x782bd65;
  for (let n = 0; n < 1000; n++) {
    const board = Array.from({ length: 64 }, () => {
      const r = random(seed);
      seed = r.state;
      return r.value < (n % 10) / 10 ? 1 : 0;
    });
    if (n % 2) for (let i = 0; i < 8; i++) board[(n % 8) * 8 + i] = 2;
    if (n % 3) for (let i = 0; i < 8; i++) board[i * 8 + (n % 8)] = 3;
    const before = board.slice();
    const groups = Array.from({ length: 16 }, (_, g) =>
      Array.from({ length: 8 }, (_, i) => (g < 8 ? g * 8 + i : i * 8 + g - 8)),
    );
    const full = groups.filter((indices) => indices.every((i) => board[i]));
    const cells = [...new Set(full.flat())].sort((a, b) => a - b);
    const expected = board.map((v, i) => (cells.includes(i) ? 0 : v));
    expect(clearLines(board)).toEqual({
      board: expected,
      cells,
      lines: full.length,
    });
    expect(board).toEqual(before);
  }
});
