import { expect, it } from "vitest";
import {
  deal,
  emptyBoard,
  newGame,
  place,
  shapeById,
  hasMove,
  applyMove,
  placements,
} from "../src/core/rules";
import { createProfile, validProfile } from "../src/core/profile";
it("assistance replays exactly; changed trays offer a clear and a real full-tray witness", () => {
  const board = emptyBoard();
  for (let i = 0; i < 6; i++) board[i] = 2;
  board[63] = 3;
  let changed = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const baseline = deal(board, seed, "initial-v1"),
      a = deal(board, seed, "assist-v1");
    expect(a).toEqual(deal(board, seed, "assist-v1"));
    expect(hasMove(board, a.tray)).toBe(true);
    if (JSON.stringify(a.tray) !== JSON.stringify(baseline.tray)) {
      changed++;
      expect(a.witness).not.toBeNull();
      let b = board.slice();
      const used = new Set();
      for (const m of a.witness!) {
        expect(used.has(m.slot)).toBe(false);
        used.add(m.slot);
        b = place(b, shapeById(a.tray[m.slot]!.shapeId), m.x, m.y).board;
      }
      expect(used.size).toBe(3);
      expect(
        a.tray.some((s) =>
          placements(board, shapeById(s.shapeId)).some(
            (m) => place(board, shapeById(s.shapeId), m.x, m.y).lines,
          ),
        ),
      ).toBe(true);
    }
  }
  expect(changed).toBeGreaterThan(0);
});
it("keeps default and saved policies, handles no-space and survives serialized play", () => {
  expect(newGame(1, "default").dealerVersion).toBe("initial-v1");
  expect(deal(Array(64).fill(1), 123, "assist-v1")).toEqual({
    tray: [],
    rngState: 123,
    fallback: false,
    witness: null,
  });
  let g = newGame(123, "assist", "assist-v1");
  for (let n = 0; n < 20 && g.status === "playing"; n++) {
    const m = g.tray.flatMap((s, slot) =>
      s.used
        ? []
        : placements(g.board, shapeById(s.shapeId)).map((p) => ({
            slot,
            ...p,
          })),
    )[0]!;
    const restored = JSON.parse(JSON.stringify(g));
    const a = applyMove(g, m, g.revision)!,
      b = applyMove(restored, m, restored.revision)!;
    expect(a).toEqual(b);
    g = a.state;
    const p = createProfile(g);
    p.best = g.score;
    expect(validProfile(p)).toBe(true);
  }
  expect(g.dealerVersion).toBe("assist-v1");
});
