import { expect, it } from "vitest";
import { flowDeal } from "../src/core/flow-dealer";
import {
  newGame,
  applyMove,
  place,
  shapeById,
  emptyBoard,
  deal,
  random,
  placements,
} from "../src/core/rules";
import { createProfile, validProfile } from "../src/core/profile";
it("v2 routes replay legally, are deterministic and keep bounded search on sparse and congested boards", () => {
  let rng = 0x842709;
  let successful = 0;
  for (let i = 0; i < 60; i++) {
    const board = emptyBoard();
    for (let k = 0; k < 64; k++) {
      const r = random(rng);
      rng = r.state;
      if (r.value < (i % 5) * 0.13) board[k] = 1;
    }
    const before = JSON.stringify(board),
      d = flowDeal(board, rng, 30);
    expect(JSON.stringify(board)).toBe(before);
    expect(d).toEqual(flowDeal(board, rng, 30));
    if (!d) continue;
    successful++;
    expect(d.visited).toBeLessThan(40000);
    let b = board;
    const slots = new Set();
    for (const m of d.witness) {
      expect(slots.has(m.slot)).toBe(false);
      slots.add(m.slot);
      const shape = shapeById(d.tray[m.slot]!.shapeId);
      expect(placements(b, shape)).toContainEqual({ x: m.x, y: m.y });
      b = place(b, shape, m.x, m.y).board;
    }
    expect(slots.size).toBe(3);
  }
  expect(successful).toBeGreaterThan(45);
}, 30000);
it("v1 and v2 remain explicit persisted policies and resume the same next move after reload", () => {
  for (const policy of ["flow-v1", "flow-v2"] as const) {
    let g = newGame(1777, "resume", policy);
    for (let i = 0; i < 5; i++) {
      const slot = g.tray.findIndex(
        (s) => !s.used && placements(g.board, shapeById(s.shapeId)).length,
      );
      const m = {
        slot,
        ...placements(g.board, shapeById(g.tray[slot]!.shapeId))[0]!,
      };
      const p = { ...createProfile(g), best: g.score };
      expect(validProfile(p)).toBe(true);
      const copy = JSON.parse(JSON.stringify(p));
      expect(applyMove(copy.game, m, g.revision)).toEqual(
        applyMove(g, m, g.revision),
      );
      g = applyMove(g, m, g.revision)!.state;
      expect(g.dealerVersion).toBe(policy);
    }
  }
});

it("bounded-search misses on a congested board retain a complete legal route", () => {
  const board = Array.from(
    { length: 64 },
    (_, i) => ((i % 8) + Math.floor(i / 8)) % 2,
  );
  for (let seed = 1; seed < 30; seed++) {
    const d = deal(board, seed, "flow-v2", 80);
    expect(d.witness).not.toBeNull();
    let b = board;
    for (const m of d.witness!) {
      const shape = shapeById(d.tray[m.slot]!.shapeId);
      expect(placements(b, shape)).toContainEqual({ x: m.x, y: m.y });
      b = place(b, shape, m.x, m.y).board;
    }
  }
});
