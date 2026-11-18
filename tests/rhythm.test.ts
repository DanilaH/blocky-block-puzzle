import { expect, it } from "vitest";
import {
  initialRhythm,
  advanceRhythm,
  assistance,
  recoveryRhythm,
} from "../src/core/rhythm";
import {
  newGame,
  applyMove,
  deal,
  place,
  shapeById,
  placements,
  emptyBoard,
} from "../src/core/rules";
import { createProfile, validProfile } from "../src/core/profile";
import {
  revivePlan,
  prepareReward,
  applyReceipt,
  claimRevive,
} from "../src/core/monetization";
it("pressure builds from board/drought, releases after clears and ignores elapsed time", () => {
  let r = initialRhythm();
  const b = Array.from({ length: 64 }, (_, i) => (i < 36 ? 1 : 0));
  expect(assistance(r)).toBe(0);
  for (let n = 0; n < 6; n++) {
    const next = advanceRhythm(r, b, 0, false);
    expect(next.pressure - r.pressure).toBeLessThanOrEqual(14);
    r = next;
  }
  expect(assistance(r)).toBeGreaterThan(0.7);
  const released = advanceRhythm(r, emptyBoard(), 1, true);
  expect(released.pressure).toBeLessThan(25);
  expect(released.dryMoves).toBe(0);
  expect(advanceRhythm(released, b, 0, false).pressure).toBeLessThan(40);
});
it("all support levels produce replayable bounded routes and preserve the input", () => {
  for (let seed = 1; seed <= 30; seed++) {
    const board: number[] = Array.from({ length: 64 }, (_, i) =>
      (i * seed + seed) % 13 < seed % 5 ? 1 : 0,
    );
    board[0] = 0;
    const rhythm = {
      pressure: seed % 2 ? 0 : 100,
      dryMoves: seed % 12,
      recoveryDeals: seed % 4,
      reliefMoves: 0,
    };
    const before = JSON.stringify(board),
      d = deal(board, seed, "flow-v3", 30, "", rhythm);
    expect(d).toEqual(deal(board, seed, "flow-v3", 30, "", rhythm));
    expect(JSON.stringify(board)).toBe(before);
    expect(d.witness).not.toBeNull();
    let b = board;
    for (const m of d.witness!) {
      const shape = shapeById(d.tray[m.slot]!.shapeId);
      expect(placements(b, shape)).toContainEqual({ x: m.x, y: m.y });
      b = place(b, shape, m.x, m.y).board;
    }
  }
});
it("recovery lasts exactly three refills and survives serialized moves", () => {
  let g = newGame(513, "recovery", "flow-v3");
  g.rhythm = recoveryRhythm();
  for (let round = 0; round < 4; round++) {
    const d = deal(g.board, g.rngState, "flow-v3", g.moves, "", g.rhythm);
    g = { ...g, tray: d.tray, rngState: d.rngState };
    for (const m of d.witness!) {
      const old = g.rhythm!.recoveryDeals;
      const used = g.tray.filter((s) => s.used).length;
      const p = createProfile(g);
      p.best = g.score;
      expect(validProfile(JSON.parse(JSON.stringify(p)))).toBe(true);
      const result = applyMove(g, m, g.revision)!;
      expect(result).toEqual(
        applyMove(JSON.parse(JSON.stringify(g)), m, g.revision),
      );
      g = result.state;
      expect(g.rhythm!.recoveryDeals).toBe(
        used === 2 ? Math.max(0, old - 1) : old,
      );
    }
  }
  expect(g.rhythm!.recoveryDeals).toBe(0);
  const p = createProfile(g);
  p.best = g.score;
  p.game.rhythm!.pressure = 101;
  expect(validProfile(p)).toBe(false);
});
it("recovery is granted atomically once, including delayed revive; hint ads never affect it", () => {
  const g = newGame(3, "lost", "flow-v3");
  g.board = Array.from(
    { length: 64 },
    (_, i) => ((i % 8) + Math.floor(i / 8)) % 2,
  );
  g.tray = [0, 1, 2].map(() => ({ shapeId: "O3-0", color: 1, used: false }));
  g.status = "over";
  const p = createProfile(g),
    prepared = prepareReward(p, "revive", "revive");
  expect(prepared.game.rhythm).toEqual(initialRhythm());
  expect(validProfile(prepared)).toBe(true);
  const a = applyReceipt(prepared, { id: "receipt", intentId: "revive" });
  expect(a.game.rhythm).toEqual(recoveryRhythm());
  expect(validProfile(a)).toBe(true);
  expect(applyReceipt(a, { id: "receipt2", intentId: "revive" }).game).toEqual(
    a.game,
  );
  expect(revivePlan(a.game)).toBeNull();
  prepared.game = newGame(4, "other", "flow-v3");
  const late = applyReceipt(prepared, { id: "late", intentId: "revive" });
  expect(late.game.rhythm).toEqual(initialRhythm());
  const claimed = claimRevive(JSON.parse(JSON.stringify(late)), "revive");
  expect(claimed.game.rhythm).toEqual(recoveryRhythm());
  expect(validProfile(claimed)).toBe(true);
  const hint = applyReceipt(prepareReward(p, "hint", "hints"), {
    id: "hint-receipt",
    intentId: "hint",
  });
  expect(hint.game).toEqual(p.game);
});
