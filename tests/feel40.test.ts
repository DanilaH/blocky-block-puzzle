import { it, expect } from "vitest";
import {
  newGame,
  applyMove,
  deal,
  place,
  shapeById,
  emptyBoard,
} from "../src/core/rules";
import {
  initialRhythmV4,
  advanceRhythmV4,
  validRhythmV4,
} from "../src/core/rhythm";
import {
  startReviveOffer,
  acceptReviveOffer,
  expireReviveOffer,
} from "../src/core/revive-offer";
import { createProfile, validProfile } from "../src/core/profile";
import {
  revivePlan,
  validRevivePlan,
  prepareReward,
  applyReceipt,
} from "../src/core/monetization";
import { clearSignature } from "../src/game/clear-signature";
it("offers expire exactly at five seconds, survive reload, and accepted ads may finish later", () => {
  let g = newGame(11, "timer", "flow-v4");
  g.status = "over";
  g.board = Array.from(
    { length: 64 },
    (_, i) => ((i % 8) + Math.floor(i / 8)) % 2,
  );
  g.tray.forEach((s) => (s.shapeId = "O3-0"));
  g = startReviveOffer(g, 1000);
  expect(startReviveOffer(structuredClone(g), 4000)).toEqual(g);
  expect(acceptReviveOffer(g, 5999).reviveOffer?.accepted).toBe(true);
  expect(acceptReviveOffer(g, 6000).reviveOffer?.expired).toBe(true);
  expect(revivePlan(expireReviveOffer(g, 6000))).toBeNull();
  const accepted = acceptReviveOffer(g, 5999);
  expect(expireReviveOffer(accepted, 999999)).toEqual(accepted);
  const p = createProfile(accepted);
  p.game = accepted;
  expect(validProfile(p)).toBe(true);
  expect(validRevivePlan(accepted, revivePlan(accepted)!)).toBe(true);
  const intent = prepareReward(p, "receipt", "revive");
  expect(
    applyReceipt(intent, { id: "earned", intentId: "receipt" }).game.reviveUsed,
  ).toBe(true);
  expect(() => prepareReward({ ...p, game: g }, "early", "revive")).toThrow();
});
it("completed series gets one atomic bonus, ordinary placements and legacy saves do not", () => {
  const g = {
    ...newGame(22, "series", "flow-v4"),
    scoringVersion: "festival-v4" as const,
    seriesBonusVersion: 1 as const,
    streak: 5,
    streakMisses: 2,
  };
  g.tray = [0, 1, 2].map((i) => ({
    shapeId: "S1-0",
    color: i + 1,
    used: false,
  }));
  const result = applyMove(g, { slot: 0, x: 0, y: 0 }, g.revision)!;
  expect(result.finishedStreak).toBe(5);
  expect(result.seriesBonus).toBe(750);
  expect(result.state.score).toBe(result.points);
  expect(
    applyMove(result.state, { slot: 1, x: 1, y: 0 }, result.state.revision)!
      .seriesBonus,
  ).toBe(0);
  expect(
    applyMove(
      { ...g, seriesBonusVersion: undefined },
      { slot: 0, x: 0, y: 0 },
      g.revision,
    )!.seriesBonus,
  ).toBe(0);
});
it("theme earn resets buildup, encore is rare and cannot chain on a short cycle", () => {
  const r = {
    ...initialRhythmV4(),
    cycleMoves: 30,
    pressure: 90,
    reliefMoves: 15,
  };
  const normal = advanceRhythmV4(r, emptyBoard(), 3, true, 0.5);
  expect(normal).toMatchObject({
    cycleMoves: 0,
    pressure: 0,
    reliefMoves: 0,
    encoreDeals: 0,
  });
  const encore = advanceRhythmV4(r, emptyBoard(), 3, true, 0.01);
  expect(encore.encoreDeals).toBe(1);
  expect(advanceRhythmV4(encore, emptyBoard(), 3, true, 0.01).encoreDeals).toBe(
    0,
  );
  expect(validRhythmV4(normal)).toBe(true);
});
it.each(Array.from({ length: 25 }, (_, i) => i + 1))(
  "dealer bans repeated family bags and preserves replay for seed %i",
  (seed) => {
    const bag = "O3,O3,R6";
    const board = emptyBoard();
    for (let i = 0; i < 8; i++) board[16 + i] = 1;
    const rhythm = {
      ...initialRhythmV4(),
      cycleMoves: 50,
      pressure: 100,
      recentBags: [bag, bag],
    };
    const original = JSON.stringify({ board, rhythm });
    const d = deal(board, seed, "flow-v4", 50, bag, rhythm);
    expect(
      d.tray
        .map((s) => shapeById(s.shapeId).family)
        .sort()
        .join(","),
    ).not.toBe(bag);
    let b = board;
    for (const m of d.witness!)
      b = place(b, shapeById(d.tray[m.slot]!.shapeId), m.x, m.y).board;
    expect(JSON.stringify({ board, rhythm })).toBe(original);
    expect(deal(board, seed, "flow-v4", 50, bag, rhythm)).toEqual(d);
  },
);
it("line geometry distinguishes parallel triples, four lines and intersections", () => {
  expect(clearSignature(Array.from({ length: 24 }, (_, i) => i)).kind).toBe(
    "triple",
  );
  expect(clearSignature(Array.from({ length: 32 }, (_, i) => i)).kind).toBe(
    "quad",
  );
  expect(
    clearSignature([
      ...Array.from({ length: 8 }, (_, i) => i),
      ...Array.from({ length: 8 }, (_, i) => i * 8),
    ]).kind,
  ).toBe("cross");
});
