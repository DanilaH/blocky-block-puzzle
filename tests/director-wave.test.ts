import { it, expect } from "vitest";
import { newGame, deal, hasMove } from "../src/core/rules";
import { analyze } from "../scripts/difficulty/analyze";
import {
  initialDirector,
  revived,
  observe,
  chooseWave,
} from "../scripts/director/wave";
import { geometry } from "../scripts/director/geometry";
import fixture from "../scripts/director/order-board.json";
it("measures disconnected cavities and full-size empty rectangles", () => {
  expect(geometry(Array(64).fill(0))).toEqual({
    occupied: 0,
    regions: 1,
    isolated: 0,
    largestRegion: 64,
    squares: 49,
    largestRectangle: 64,
  });
  expect(geometry(Array(64).fill(1)).largestRectangle).toBe(0);
  const b = Array(64).fill(1);
  b[0] = b[9] = 0;
  expect(geometry(b)).toMatchObject({
    regions: 2,
    isolated: 2,
    largestRegion: 1,
    largestRectangle: 1,
  });
});
it("caps challenge at six completed trays then allows at least two payoff trays", () => {
  let d = {
    ...initialDirector(9),
    phase: "challenge" as const,
    skill: 0.9,
    evidence: 10,
  };
  const o = {
    success: true,
    lines: 2,
    allClear: false,
    occupied: 20,
    difficulty: 0,
  };
  let n = observe(d, o);
  expect(n.phase).toBe("challenge");
  for (let i = 0; i < 4; i++) {
    n = observe(n, o);
    expect(n.phase).toBe("challenge");
  }
  n = observe(n, o);
  expect(n.phase).toBe("payoff");
  n = observe(n, o);
  expect(n.phase).toBe("payoff");
  n = observe(n, o);
  expect(n.phase).toBe("build");
  expect(observe(d, { ...o, occupied: 44 }).phase).toBe("payoff");
  expect(observe(d, { ...o, allClear: true, occupied: 0 }).phase).toBe("build");
});
it("preserves opening, unqualified trays, recovery and serialization", () => {
  const g = { ...newGame(99, "wave", "flow-v4"), moves: 60 };
  for (const d of [
    initialDirector(1),
    revived({ ...initialDirector(1), skill: 0.9, evidence: 10 }),
  ]) {
    const r = chooseWave(g, d, "neutral");
    expect(r.tray).toEqual(g.tray);
    expect(r).toEqual(chooseWave(g, JSON.parse(JSON.stringify(d)), "neutral"));
  }
  const d = {
    ...initialDirector(11),
    phase: "challenge" as const,
    skill: 0.9,
    evidence: 10,
  };
  expect(chooseWave({ ...g, moves: 3 }, d, "neutral").tray).toEqual(g.tray);
  expect(
    chooseWave(g, d, "neutral", { candidates: 1, checks: 0 }).tray,
  ).toEqual(g.tray);
});
it("neutral uses exactly one ordinary draw; guaranteed mode rejects unproved draws", () => {
  const g = {
    ...newGame(99, "wave", "flow-v4"),
    moves: 60,
    board: fixture.board,
  };
  g.tray = deal(g.board, 19, "flow-v4", 60, "", g.rhythm).tray;
  let impossible = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const d = {
      ...initialDirector(seed * 7919),
      phase: "challenge" as const,
      skill: 0.9,
      evidence: 10,
    };
    const draw = deal(g.board, d.rng, "initial-v1", g.moves);
    const n = chooseWave(g, d, "neutral"),
      a = chooseWave(g, d, "guaranteed");
    expect(n.tray).toEqual(draw.tray);
    expect(n.director.rng).toBe(draw.rngState);
    expect(hasMove(g.board, n.tray)).toBe(true);
    const proof = analyze(g.board, draw.tray, 1000000);
    if (proof.status === "unsolvable") {
      impossible++;
      expect(a.tray).toEqual(g.tray);
    }
    expect(analyze(g.board, a.tray, 1000000).status).toBe("solvable");
  }
  expect(impossible).toBeGreaterThan(0);
});

it("reward phase is a deterministic solvable boost without modifying the saved rhythm", () => {
  const g = {
    ...newGame(191, "wave", "flow-v4"),
    moves: 60,
    board: fixture.board,
  };
  g.tray = deal(g.board, 19, "flow-v4", 60, "", g.rhythm).tray;
  const d = {
    ...initialDirector(99),
    phase: "payoff" as const,
    skill: 0.9,
    evidence: 10,
  };
  const before = JSON.stringify([g, d]);
  const s = chooseWave(g, d, "reward");
  expect(s.diagnostic.source).toBe("reward-constructed");
  expect(s.diagnostic.guaranteed).toBe(true);
  expect(analyze(g.board, s.tray, 1000000).status).toBe("solvable");
  expect(s).toEqual(chooseWave(g, JSON.parse(JSON.stringify(d)), "reward"));
  expect(JSON.stringify([g, d])).toBe(before);
  expect(chooseWave(g, revived(d), "reward").diagnostic.source).toBe(
    "baseline",
  );
});
