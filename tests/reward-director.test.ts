import { it, expect } from "vitest";
import {
  SHAPES,
  newGame,
  applyMove,
  place,
  fits,
  type Board,
} from "../src/core/rules";
import { WorkBudget } from "../src/core/director-search";
import { compactReward } from "../src/core/director-goal-tools";
import {
  rewardDirectorDeal,
  initialRewardDirector,
  observeRewardDirector,
} from "../src/core/reward-director";
import { initialRhythmV4 } from "../src/core/rhythm";
import { createProfile, validProfile } from "../src/core/profile";
import { chooseMixed } from "../scripts/director/mixed-players";
import { verifyRewardDeal } from "../scripts/director/verify-reward-deal";
import { prepareReward, applyReceipt } from "../src/core/monetization";
const boardOf = (rows: number[]): Board =>
  rows.flatMap((r) =>
    Array.from({ length: 8 }, (_, x) => Number(!!(r & (1 << x)))),
  );

it("replays compact one-, two- and three-piece rewards using public rules within the shared budget", () => {
  for (const rows of [
    [15, 0, 0, 0, 0, 0, 0, 0],
    [5, 0, 0, 0, 0, 0, 0, 0],
    [3, 3, 3, 3, 3, 3, 3, 0],
  ]) {
    const meter = new WorkBudget(),
      route = compactReward(
        rows,
        meter,
        SHAPES.map((_, i) => i),
      );
    expect(route).not.toBeNull();
    let b = boardOf(rows);
    for (const op of route!) {
      const shape = SHAPES[op.shape]!;
      expect(fits(b, shape, op.x, op.y)).toBe(true);
      b = place(b, shape, op.x, op.y).board;
    }
    expect(b.some(Boolean)).toBe(false);
    expect(meter.used).toBeLessThanOrEqual(meter.limit);
  }
  const meter = new WorkBudget(512);
  meter.ceiling = 0;
  expect(
    compactReward(
      [15, 0, 0, 0, 0, 0, 0, 0],
      meter,
      SHAPES.map((_, i) => i),
    ),
  ).toBeNull();
  expect(meter.used).toBe(0);
});

it("gives an existing reward opportunity priority over a due load and cancels it after earning the reward", () => {
  const rows = [15, 0, 0, 0, 0, 0, 0, 0],
    shape = (id: string) => SHAPES.findIndex((s) => s.id === id);
  const saved = {
    ...initialRewardDirector(),
    sinceLoad: 5,
    prepared: [
      {
        rows,
        route: [
          { shape: shape("I4-0"), x: 4, y: 0 },
          { shape: shape("I2-0"), x: 0, y: 0 },
          { shape: shape("I2-0"), x: 2, y: 0 },
        ],
      },
    ],
  };
  const before = structuredClone(saved),
    d = rewardDirectorDeal(
      boardOf(rows),
      1141002,
      30,
      { ...initialRhythmV4(), cycleMoves: 30 },
      saved,
    );
  expect(d.diagnostic.requested).toBe("gift");
  expect(d.diagnostic.planStatus).toBe("matched");
  expect(d.diagnostic.goalFound).toBe(true);
  verifyRewardDeal(boardOf(rows), d);
  expect(saved).toEqual(before);
  expect(observeRewardDirector(saved, true)).toMatchObject({
    rest: 1,
    prepared: [],
  });
});

it("certifies sampled endings and saved payoffs, retains deterministic saves, and rejects damaged reward state", () => {
  let g = newGame(1141003, "reward-path-test", "director-v5"),
    prepared = 0,
    samples = 0;
  for (let i = 0; i < 120 && g.status === "playing"; i++) {
    expect(validProfile({ ...createProfile(g), best: g.score })).toBe(true);
    if (g.moves % 3 === 0) {
      // An independent direct deal is a fresh audit position, never a player input.
      const d = rewardDirectorDeal(
        g.board,
        1141003 + g.moves,
        g.moves,
        g.rhythm,
        g.rewardDirector,
      );
      const proof = verifyRewardDeal(g.board, d);
      prepared += proof.prepared;
      samples += d.diagnostic.preparationSamples.length;
      if (d.director.prepared.length)
        expect(
          d.diagnostic.preparationCoverage!.coverage,
        ).toBeGreaterThanOrEqual(0.6);
    }
    const old = structuredClone(g),
      move = chooseMixed(g.board, g.tray, "three", 0).move!,
      a = applyMove(g, move, g.revision)!;
    expect(applyMove(JSON.parse(JSON.stringify(g)), move, g.revision)).toEqual(
      a,
    );
    expect(g).toEqual(old);
    g = a.state;
  }
  expect(samples).toBeGreaterThan(0);
  expect(prepared).toBeGreaterThan(0);
  const broken = structuredClone(g);
  broken.rewardDirector!.prepared = [{ rows: [0], route: [] }];
  expect(validProfile({ ...createProfile(broken), best: broken.score })).toBe(
    false,
  );
});

it("keeps exhausted help honest and the emergency witness legal", () => {
  for (const budget of [512, 1000, 6000, 24000]) {
    const b = boardOf([126, 0, 0, 0, 0, 0, 0, 0]),
      d = rewardDirectorDeal(
        b,
        1141002,
        30,
        initialRhythmV4(),
        initialRewardDirector(),
        budget,
      );
    verifyRewardDeal(b, d);
    expect(d.diagnostic.checks).toBeLessThanOrEqual(budget);
    if (d.diagnostic.actual !== "load" && d.diagnostic.actual !== "emergency")
      expect(d.diagnostic.robustness.adequate).toBe(true);
  }
});

it("preserves the new director through a single revive and its three recovery refills", () => {
  let g = newGame(1141001, "reward-revive", "director-v5");
  for (let i = 0; i < 360 && g.status === "playing"; i++)
    g = applyMove(
      g,
      chooseMixed(g.board, g.tray, "bounded", 0.6).move!,
      g.revision,
    )!.state;
  expect(g.status).toBe("over");
  const p = prepareReward(
    { ...createProfile(g), best: g.score },
    "reward-revive",
    "revive",
  );
  const revived = applyReceipt(p, {
    id: "reward-receipt",
    intentId: "reward-revive",
  }).game;
  expect(revived.dealerVersion).toBe("director-v5");
  expect(revived.rhythm!.recoveryDeals).toBe(3);
  expect(validProfile({ ...createProfile(revived), best: revived.score })).toBe(
    true,
  );
  let r = revived;
  for (let i = 0; i < 9; i++)
    r = applyMove(
      r,
      chooseMixed(r.board, r.tray, "three", 0).move!,
      r.revision,
    )!.state;
  expect(r.rhythm!.recoveryDeals).toBe(0);
});
