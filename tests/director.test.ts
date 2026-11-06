import { it, expect } from "vitest";
import { newGame, place, shapeById } from "../src/core/rules";
import { analyze } from "../scripts/difficulty/analyze";
import {
  initialDirector,
  select,
  observe,
  revived,
} from "../scripts/director/policy";
it("keeps original opening, deterministic selection and immutable inputs", () => {
  const g = newGame(1777, "test", "flow-v4"),
    d = initialDirector(19),
    before = JSON.stringify([g, d]);
  expect(select(g, d).tray).toEqual(g.tray);
  expect(select({ ...g, moves: 40 }, d)).toEqual(
    select({ ...g, moves: 40 }, d),
  );
  expect(JSON.stringify([g, d])).toBe(before);
});
it("budget exhaustion preserves the baseline rather than inventing an impossible tray", () => {
  const g = { ...newGame(200, "test", "flow-v4"), moves: 60 };
  const s = select(g, initialDirector(3), { candidates: 3, checks: 0 });
  expect(s.tray).toEqual(g.tray);
  expect(s.diagnostic.fallback).toBe(true);
  expect(s.diagnostic.checks).toBe(0);
});
it("all selected experimental trays have a replayable route", () => {
  for (let seed = 1; seed <= 8; seed++) {
    const g = { ...newGame(seed * 1777, "test", "flow-v4"), moves: 40 },
      s = select(g, { ...initialDirector(seed), phase: "challenge" });
    const a = analyze(g.board, s.tray, 1000000);
    expect(a.status).toBe("solvable");
    let b = g.board;
    for (const m of a.witness!)
      b = place(b, shapeById(s.tray[m.slot]!.shapeId), m.x, m.y).board;
  }
});
it("all-clear preserves mastery; gifts do not train skill; recovery has a fixed graceful exit", () => {
  const d = { ...initialDirector(5), skill: 0.8, evidence: 7 };
  const gift = observe(d, {
    success: true,
    lines: 3,
    allClear: true,
    occupied: 0,
    difficulty: 0,
  });
  expect(gift.skill).toBe(0.8);
  expect(gift.evidence).toBe(7);
  let r = revived(d);
  const g = { ...newGame(41, "revive-test", "flow-v4"), moves: 50 };
  r = observe(r, {
    success: true,
    lines: 1,
    allClear: false,
    occupied: 15,
    difficulty: 0,
  });
  expect(r.recovery).toBe(3); // finishing the pre-revive partial tray consumes no new supported deal
  for (let i = 0; i < 3; i++) {
    r = select(g, r, { candidates: 1, checks: 0 }).director;
    r = observe(r, {
      success: true,
      lines: 1,
      allClear: false,
      occupied: 15,
      difficulty: 0,
    });
  }
  expect(r.phase).toBe("build");
  expect(r.recovery).toBe(0);
  expect(r.skill).toBe(0.8);
});
it("dryness forces relief and a successful difficult tray increases skill gradually", () => {
  const d = { ...initialDirector(12), phase: "challenge" as const, dry: 2 };
  const n = observe(d, {
    success: true,
    lines: 0,
    allClear: false,
    occupied: 25,
    difficulty: 0.8,
  });
  expect(n.phase).toBe("payoff");
  expect(n.skill).toBeGreaterThan(d.skill);
  expect(n.skill - d.skill).toBeLessThan(0.1);
});

it("serialized director resumes identical decisions and limits motif history", () => {
  const g = { ...newGame(1777, "resume", "flow-v4"), moves: 80 };
  let d = {
    ...initialDirector(71),
    phase: "challenge" as const,
    skill: 0.85,
    evidence: 10,
  };
  const a = select(g, d),
    b = select(g, JSON.parse(JSON.stringify(d)));
  expect(a).toEqual(b);
  let state = a.director;
  for (let i = 0; i < 8; i++)
    state = select(g, state, { candidates: 1, checks: 1000 }).director;
  expect(state.recent.length).toBe(6);
});
it("failed difficult episodes lower estimated skill without erasing prior evidence", () => {
  const d = { ...initialDirector(5), skill: 0.8, evidence: 5 };
  const n = observe(d, {
    success: false,
    lines: 0,
    allClear: false,
    occupied: 40,
    difficulty: 0.8,
  });
  expect(n.skill).toBeLessThan(d.skill);
  expect(n.evidence).toBeGreaterThan(d.evidence);
  expect(n.phase).toBe("payoff");
  expect(revived(n).skill).toBe(n.skill);
  expect(revived(n).evidence).toBe(n.evidence);
});

import { constructTasks } from "../scripts/director/recipes";
import orderBoard from "../scripts/director/order-board.json";
it("constructs replayable dependency proposals on a recorded dense board", () => {
  const tasks = constructTasks(orderBoard.board, orderBoard.seed);
  expect(tasks.proposals.length).toBeGreaterThan(0);
  expect(tasks.proposals.length).toBeLessThanOrEqual(2);
  expect(tasks).toEqual(constructTasks(orderBoard.board, orderBoard.seed));
  for (const p of tasks.proposals) {
    const a = analyze(orderBoard.board, p.tray, 1000000);
    expect(a.status).toBe("solvable");
    let b = orderBoard.board;
    for (const m of a.witness!)
      b = place(b, shapeById(p.tray[m.slot]!.shapeId), m.x, m.y).board;
  }
});
it("does not invent an ordering task when all shapes fit the empty board", () => {
  expect(constructTasks(Array(64).fill(0), 42).proposals).toEqual([]);
});

it("preserves achievable clears and terminal occupancy bounds for uncertain players", () => {
  for (let seed = 1; seed <= 6; seed++) {
    const g = {
      ...newGame(seed * 1777, "guards", "flow-v4"),
      board: orderBoard.board,
      moves: 80,
    };
    // Three singles provide a solvable control on this recorded dense board.
    g.tray = [
      { shapeId: "S1-0", used: false, color: 1 },
      { shapeId: "S1-0", used: false, color: 1 },
      { shapeId: "S1-0", used: false, color: 1 },
    ];
    const base = analyze(g.board, g.tray, 1000000),
      s = select(g, initialDirector(seed));
    const candidate = analyze(g.board, s.tray, 1000000);
    expect(candidate.maxLinesOnSuccess!).toBeGreaterThanOrEqual(
      base.maxLinesOnSuccess!,
    );
    expect(candidate.endOccupiedRange![0]).toBeLessThanOrEqual(
      base.endOccupiedRange![0]!,
    );
    expect(candidate.endOccupiedRange![1]).toBeLessThanOrEqual(
      base.endOccupiedRange![1]!,
    );
  }
});

it("does not substitute a tray before qualification, during payoff or during recovery", () => {
  const g = { ...newGame(1777, "qualification", "flow-v4"), moves: 80 };
  for (const d of [
    { ...initialDirector(4), phase: "challenge" as const },
    {
      ...initialDirector(4),
      skill: 0.9,
      evidence: 10,
      phase: "payoff" as const,
    },
    revived({ ...initialDirector(4), skill: 0.9, evidence: 10 }),
  ]) {
    const result = select(g, d);
    expect(result.tray).toEqual(g.tray);
    expect(result.diagnostic.checked).toBe(1);
  }
});

it("learns planning from realized above-baseline rewards, not guaranteed gift trays", () => {
  const d = initialDirector(4);
  const gift = {
    success: true,
    lines: 3,
    allClear: true,
    occupied: 0,
    difficulty: 0,
    planning: { expectedLines: 3, maxLines: 3 },
  };
  expect(observe(d, gift).skill).toBe(d.skill);
  const planned = {
    ...gift,
    allClear: false,
    planning: { expectedLines: 1, maxLines: 3 },
  };
  let n = d;
  for (let i = 0; i < 8; i++) n = observe(n, planned);
  expect(n.evidence).toBe(4);
  expect(n.skill).toBeGreaterThan(0.6);
  const failed = observe(n, { ...planned, success: false, lines: 0 });
  expect(failed.skill).toBeLessThan(n.skill);
  expect(observe(revived(d), planned).skill).toBe(d.skill);
});
