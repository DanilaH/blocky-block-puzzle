import { it, expect } from "vitest";
import { newGame, applyMove, type Board } from "../src/core/rules";
import {
  rewardDirectorDeal,
  initialRewardDirector,
} from "../src/core/reward-director";
import { initialRhythmV4 } from "../src/core/rhythm";
import { createProfile, validProfile } from "../src/core/profile";
import { chooseMixed } from "../scripts/director/mixed-players";
import { verifyConstructiveDeal } from "../scripts/director/verify-constructive-deal";
import { prepareReward, applyReceipt } from "../src/core/monetization";

it("replays branched preparations and payoffs and resumes v6 without changing v5 saves", () => {
  let g = newGame(1741003, "constructive-test", "director-v6"),
    proofs = 0;
  const legacy = newGame(1741003, "legacy-test", "director-v5");
  expect(legacy.rewardDirector!.version).toBe(5);
  for (let i = 0; i < 72 && g.status === "playing"; i++) {
    const profile = { ...createProfile(g), best: g.score };
    expect(validProfile(profile)).toBe(true);
    const wrong = structuredClone(profile);
    wrong.game.rewardDirector!.version = 5;
    expect(validProfile(wrong)).toBe(false);
    if (g.moves % 3 === 0) {
      const d = rewardDirectorDeal(
        g.board,
        1741003 + g.moves,
        g.moves,
        g.rhythm,
        g.rewardDirector,
        24000,
        6,
      );
      proofs += verifyConstructiveDeal(g.board, d).constructionProofs;
      expect(d.diagnostic.checks).toBeLessThanOrEqual(24000);
    }
    const before = structuredClone(g),
      move = chooseMixed(g.board, g.tray, "three", 0).move!;
    const a = applyMove(g, move, g.revision)!;
    expect(applyMove(JSON.parse(JSON.stringify(g)), move, g.revision)).toEqual(
      a,
    );
    expect(g).toEqual(before);
    g = a.state;
  }
  expect(proofs).toBeGreaterThan(0);
  const wrongLegacy = { ...createProfile(legacy) };
  wrongLegacy.game = structuredClone(legacy);
  wrongLegacy.game.rewardDirector!.version = 6;
  expect(validProfile(wrongLegacy)).toBe(false);
});

it("retains legal bounded fallback and honest soft labels when v6 construction is cut off", () => {
  const b: Board = [126, 0, 0, 0, 0, 0, 0, 0].flatMap((r) =>
    Array.from({ length: 8 }, (_, x) => Number(!!(r & (1 << x)))),
  );
  for (const budget of [512, 1000, 6000, 24000]) {
    const d = rewardDirectorDeal(
      b,
      1741002,
      30,
      { ...initialRhythmV4(), cycleMoves: 30 },
      initialRewardDirector(6),
      budget,
      6,
    );
    verifyConstructiveDeal(b, d);
    expect(d.diagnostic.checks).toBeLessThanOrEqual(budget);
  }
});

it("keeps v6 through rewarded revive and exactly three recovery refills", () => {
  let g = newGame(1741001, "constructive-revive", "director-v6");
  for (let i = 0; i < 360 && g.status === "playing"; i++)
    g = applyMove(
      g,
      chooseMixed(g.board, g.tray, "bounded", 0.6).move!,
      g.revision,
    )!.state;
  expect(g.status).toBe("over");
  const p = prepareReward(
    { ...createProfile(g), best: g.score },
    "constructive-intent",
    "revive",
  );
  let r = applyReceipt(p, {
    id: "constructive-receipt",
    intentId: "constructive-intent",
  }).game;
  expect(r.dealerVersion).toBe("director-v6");
  expect(r.rewardDirector!.version).toBe(6);
  expect(r.rhythm!.recoveryDeals).toBe(3);
  for (let i = 0; i < 9; i++)
    r = applyMove(
      r,
      chooseMixed(r.board, r.tray, "three", 0).move!,
      r.revision,
    )!.state;
  expect(r.rhythm!.recoveryDeals).toBe(0);
  expect(validProfile({ ...createProfile(r), best: r.score })).toBe(true);
});
