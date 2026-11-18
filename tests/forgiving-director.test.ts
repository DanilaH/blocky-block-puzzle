import { it, expect } from "vitest";
import {
  SHAPES,
  newGame,
  applyMove,
  emptyBoard,
  proveTray,
  shapeById,
  place,
  placements,
  random,
  type GameState,
} from "../src/core/rules";
import {
  forgivingDirectorDeal,
  initialForgivingDirector,
  observeForgivingDirector,
  validForgivingDirector,
} from "../src/core/forgiving-director";
import { WorkBudget, catalog, toRows } from "../src/core/director-search";
import {
  assessTrio,
  assessForgivingTrio,
} from "../src/core/director-robustness";
import { shortReward } from "../src/core/director-goal-tools";
import { initialRhythmV4, advanceRhythmV4 } from "../src/core/rhythm";
import { createProfile, validProfile } from "../src/core/profile";
import { prepareReward, applyReceipt } from "../src/core/monetization";
import { chooseMixed } from "../scripts/director/mixed-players";
import { verifyMixedDeal } from "../scripts/director/verify-mixed-deal";
import { verifyForgivingDeal } from "../scripts/director/verify-forgiving-deal";
import failures from "../docs/qa/director-mixed/failures.json";

it("rejects historical reliefs which passed first-move proofs but kill a plausible second move", () => {
  const examples = failures.examples.filter(
    (f) => f.phase === "relief" && f.style === "plausible",
  );
  expect(examples).toHaveLength(2);
  for (const f of examples) {
    const board = f.board.flatMap((r) =>
        Array.from({ length: 8 }, (_, x) => Number(!!(r & (1 << x)))),
      ),
      route = proveTray(board, f.tray, 100000)!;
    const path = route.map(
      (m) =>
        catalog()[
          SHAPES.findIndex((s) => s.id === f.tray[m.slot]!.shapeId)
        ]!.find((o) => o.x === m.x && o.y === m.y)!,
    );
    expect(assessTrio(f.board, path, new WorkBudget(), 3).adequate).toBe(true);
    const assessed = assessForgivingTrio(f.board, path, new WorkBudget(), true);
    expect(assessed.adequate).toBe(false);
    expect(
      assessed.roots.some((r) =>
        r.seconds?.choices.some((s) => s.status === "unsolvable"),
      ),
    ).toBe(true);
    const deal = forgivingDirectorDeal(board, 1141001, f.atMove, {
      ...initialRhythmV4(),
      dryMoves: 5,
    });
    verifyMixedDeal(board, deal);
    expect(
      deal.diagnostic.actual === "emergency" ||
        deal.diagnostic.robustness.adequate,
    ).toBe(true);
  }
});

it("keeps incomplete rankings and exhausted continuations unknown instead of certifying help", () => {
  const b = emptyBoard(),
    d = forgivingDirectorDeal(b, 91),
    path = d.witness.map(
      (m) =>
        catalog()[
          SHAPES.findIndex((s) => s.id === d.tray[m.slot]!.shapeId)
        ]!.find((o) => o.x === m.x && o.y === m.y)!,
    );
  const meter = new WorkBudget(512),
    r = assessForgivingTrio(toRows(b), path, meter, true);
  expect(r.adequate).toBe(false);
  expect(r.roots.some((r) => r.status === "unsolvable")).toBe(false);
  for (const budget of [512, 1000, 6000, 24000]) {
    const deal = forgivingDirectorDeal(
      b,
      91,
      30,
      initialRhythmV4(),
      initialForgivingDirector(),
      budget,
    );
    verifyMixedDeal(b, deal);
    expect(deal.diagnostic.checks).toBeLessThanOrEqual(budget);
    if (
      ["relief", "recovery", "rest", "gentle", "prepare", "friendly"].includes(
        deal.diagnostic.actual,
      )
    ) {
      expect(deal.diagnostic.robustness.adequate).toBe(true);
      expect(deal.diagnostic.robustness.secondRequired).toBe(3);
    }
  }
});

it("finds an obvious one-piece reward without requiring three exact finishing pieces", () => {
  const rows = [15, 0, 0, 0, 0, 0, 0, 0],
    p = shortReward(
      rows,
      new WorkBudget(),
      SHAPES.map((_, i) => i),
    )!;
  expect(p).toHaveLength(1);
  expect(SHAPES[p[0]!.shape]!.id).toBe("I4-0");
  const board = rows.flatMap((r) =>
    Array.from({ length: 8 }, (_, x) => Number(!!(r & (1 << x)))),
  );
  const d = forgivingDirectorDeal(board, 1141002, 15, {
    ...initialRhythmV4(),
    cycleMoves: 15,
  });
  verifyMixedDeal(board, d);
});

it("constructs a replayable preparation and payoff under one shared budget", () => {
  const rows = [127, 0, 127, 0, 127, 0, 127, 0],
    meter = new WorkBudget(),
    route = shortReward(
      rows,
      meter,
      SHAPES.map((_, i) => i),
      6,
      4,
    )!;
  expect(route.length).toBeGreaterThanOrEqual(4);
  expect(route.length).toBeLessThanOrEqual(6);
  let b = rows.flatMap((r) =>
    Array.from({ length: 8 }, (_, x) => Number(!!(r & (1 << x)))),
  );
  for (let i = 0; i < route.length; i++) {
    const op = route[i]!;
    b = place(b, SHAPES[op.shape]!, op.x, op.y).board;
    if (i === 2) expect(b.some(Boolean)).toBe(true);
  }
  expect(b.every((c) => !c)).toBe(true);
  expect(meter.used).toBeLessThanOrEqual(meter.limit);
});

it("revalidates a matching stored payoff and keeps its obvious reward", () => {
  const rows = [15, 0, 0, 0, 0, 0, 0, 0],
    board = rows.flatMap((r) =>
      Array.from({ length: 8 }, (_, x) => Number(!!(r & (1 << x)))),
    );
  const shape = (id: string) => SHAPES.findIndex((s) => s.id === id);
  const prepared = [
    {
      rows,
      route: [
        { shape: shape("I4-0"), x: 4, y: 0 },
        { shape: shape("I2-0"), x: 0, y: 0 },
        { shape: shape("I2-0"), x: 2, y: 0 },
      ],
    },
  ];
  const d = forgivingDirectorDeal(
    board,
    1141002,
    15,
    { ...initialRhythmV4(), cycleMoves: 15 },
    { ...initialForgivingDirector(), prepared },
  );
  expect(d.diagnostic.planStatus).toBe("matched");
  expect(d.diagnostic.goalFound).toBe(true);
  verifyForgivingDeal(board, d);
});

it("persists complete preparation proofs and cancels them after an actual reward", () => {
  let g = newGame(1141002, "forgiving-save", "director-v4");
  for (let i = 0; i < 50 && g.status === "playing"; i++) {
    expect(validProfile({ ...createProfile(g), best: g.score })).toBe(true);
    const old = structuredClone(g),
      m = chooseMixed(g.board, g.tray, "three", 0).move!,
      a = applyMove(g, m, g.revision)!;
    expect(applyMove(JSON.parse(JSON.stringify(g)), m, g.revision)).toEqual(a);
    expect(g).toEqual(old);
    expect(applyMove(a.state, m, g.revision)).toBeNull();
    g = a.state;
  }
  expect(observeForgivingDirector(g.forgivingDirector!, true)).toMatchObject({
    rest: 1,
    prepared: [],
  });
  for (const state of [
    undefined,
    { ...g.forgivingDirector!, version: 3 },
    { ...g.forgivingDirector!, rest: 2 },
    { ...g.forgivingDirector!, prepared: [{ rows: [], route: [] }] },
  ]) {
    expect(validForgivingDirector(state as never)).toBe(false);
    expect(
      validProfile({
        ...createProfile({ ...g, forgivingDirector: state } as GameState),
        best: g.score,
      }),
    ).toBe(false);
  }
});

it("never spends a stored payoff on a different actual board", () => {
  const rows = [15, 0, 0, 0, 0, 0, 0, 0],
    board = rows.flatMap((r) =>
      Array.from({ length: 8 }, (_, x) => Number(!!(r & (1 << x)))),
    );
  const fake = {
    rows: [1, 0, 0, 0, 0, 0, 0, 0],
    route: [
      { shape: 0, x: 0, y: 0 },
      { shape: 0, x: 1, y: 0 },
      { shape: 0, x: 2, y: 0 },
    ],
  };
  const saved = { ...initialForgivingDirector(), prepared: [fake] },
    d = forgivingDirectorDeal(
      board,
      33,
      15,
      { ...initialRhythmV4(), cycleMoves: 15 },
      saved,
    );
  expect(d.diagnostic.planStatus).not.toBe("matched");
  verifyMixedDeal(board, d);
  expect(saved.prepared).toEqual([fake]);
});

it("preserves saved load spacing and separately certifies the release after it", () => {
  const rhythm = { ...initialRhythmV4(), cycleMoves: 30 },
    saved = { ...initialForgivingDirector(), sinceLoad: 5 };
  const d = forgivingDirectorDeal(emptyBoard(), 99, 30, rhythm, saved);
  verifyMixedDeal(emptyBoard(), d);
  if (d.diagnostic.actual === "load") {
    expect(d.diagnostic.large).toBeGreaterThanOrEqual(1);
    expect(d.director.sinceLoad).toBe(0);
    const release = forgivingDirectorDeal(
      emptyBoard(),
      100,
      33,
      rhythm,
      d.director,
    );
    verifyMixedDeal(emptyBoard(), release);
    expect(release.diagnostic.requested).toBe("relief");
    expect(release.diagnostic.robustness.secondRequired).toBe(3);
  }
});

it("applies revive once and keeps the three-refill recovery allowance", () => {
  const g = newGame(3, "forgiving-revive", "director-v4");
  g.board = Array.from(
    { length: 64 },
    (_, i) => ((i % 8) + Math.floor(i / 8)) % 2,
  );
  g.tray = [
    { shapeId: "O3-0", color: 1, used: false },
    { shapeId: "S1-0", color: 1, used: true },
    { shapeId: "S1-0", color: 1, used: true },
  ];
  g.status = "over";
  const p = applyReceipt(prepareReward(createProfile(g), "revive", "revive"), {
    id: "receipt",
    intentId: "revive",
  });
  expect(validProfile(p)).toBe(true);
  expect(p.game.rhythm!.recoveryDeals).toBe(3);
  expect(applyReceipt(p, { id: "duplicate", intentId: "revive" }).game).toEqual(
    p.game,
  );
  let current = p.game,
    route = [{ slot: 0, ...placements(current.board, shapeById("O3-0"))[0]! }];
  for (let round = 0; round < 4; round++)
    for (const move of route) {
      const old = current,
        refill = old.tray.filter((s) => s.used).length === 2,
        a = applyMove(old, move, old.revision)!;
      expect(a).not.toBeNull();
      current = JSON.parse(JSON.stringify(a.state));
      expect(current.rhythm!.recoveryDeals).toBe(
        refill
          ? Math.max(0, old.rhythm!.recoveryDeals - 1)
          : old.rhythm!.recoveryDeals,
      );
      if (refill) {
        const rhythm = advanceRhythmV4(
          old.rhythm!,
          current.board,
          a.lines,
          a.allClear,
          random(old.rngState).value,
        );
        const d = forgivingDirectorDeal(
          current.board,
          old.rngState,
          current.moves,
          rhythm,
          observeForgivingDirector(old.forgivingDirector!, a.allClear),
        );
        expect(d.tray).toEqual(current.tray);
        verifyForgivingDeal(current.board, d);
        expect(d.diagnostic.requested === "recovery").toBe(round < 3);
        route = d.witness;
      }
    }
  expect(current.rhythm!.recoveryDeals).toBe(0);
});
