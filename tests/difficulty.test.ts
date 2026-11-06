import { describe, it, expect } from "vitest";
import {
  analyze,
  actions,
  transition,
  toRows,
  toBoard,
} from "../scripts/difficulty/analyze";
import { playTray, styles } from "../scripts/difficulty/players";
import {
  SHAPES,
  placements,
  place,
  shapeById,
  type Slot,
  type Board,
} from "../src/core/rules";
const slot = (id: string): Slot => ({ shapeId: id, used: false, color: 1 });
function brute(b: Board, t: Slot[]): boolean {
  if (t.every((s) => s.used)) return true;
  return t.some(
    (s, i) =>
      !s.used &&
      placements(b, shapeById(s.shapeId)).some((p) =>
        brute(
          place(b, shapeById(s.shapeId), p.x, p.y).board,
          t.map((v, j) => ({ ...v, used: v.used || i === j })),
        ),
      ),
  );
}
describe("offline tray difficulty", () => {
  it("distinguishes exhausted budget from impossible and replays found witnesses", () => {
    const b = Array(64).fill(0),
      t = [slot("S1-0"), slot("S1-0"), slot("S1-0")];
    const limited = analyze(b, t, 0);
    expect(limited.status).toBe("unknown");
    expect(limited.safeRatio).toBeNull();
    expect(limited.unknownFirst).toBe(192);
    const a = analyze(b, t, 1000000);
    expect(a.status).toBe("solvable");
    expect(a.complete).toBe(true);
    expect(a.safeRatio).toBe(1);
    expect(a.viableSlotOrders.length).toBe(6);
    let board = b;
    for (const m of a.witness!)
      board = place(board, shapeById(t[m.slot]!.shapeId), m.x, m.y).board;
    expect(board.filter(Boolean)).toHaveLength(3);
  });
  it("matches the array rules for every shape including crossing clears", () => {
    const b = Array(64).fill(0);
    for (let i = 0; i < 8; i++) {
      b[3 * 8 + i] = 1;
      b[i * 8 + 3] = 1;
    }
    b[27] = 0;
    for (const s of SHAPES) {
      const t = [slot(s.id)],
        ops = actions(toRows(b), t);
      expect(ops.length).toBe(placements(b, s).length);
      for (const op of ops) {
        const fast = transition(toRows(b), op),
          slow = place(b, s, op.x, op.y);
        expect(toBoard(fast.rows)).toEqual(slow.board.map((v) => Number(!!v)));
        expect(fast.lines).toBe(slow.lines);
      }
    }
  });
  it("agrees with independent exhaustive root classification on dense boards", () => {
    let seed = 19;
    for (let k = 0; k < 20; k++) {
      const b = Array.from({ length: 64 }, () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return Number(seed / 4294967296 < 0.76);
      });
      // No already completed rows/columns in a live post-clear board.
      for (let i = 0; i < 8; i++) {
        b[i * 8 + i] = 0;
      }
      const t = [
        slot("S1-0"),
        slot(SHAPES[(k * 7 + 3) % SHAPES.length]!.id),
        slot(SHAPES[(k * 11 + 5) % SHAPES.length]!.id),
      ];
      const a = analyze(b, t, 2000000);
      expect(a.complete).toBe(true);
      for (const r of a.first) {
        const m = r.move,
          next = place(b, shapeById(t[m.slot]!.shapeId), m.x, m.y).board;
        expect(r.status === "solvable").toBe(
          brute(
            next,
            t.map((s, i) => ({ ...s, used: i === m.slot })),
          ),
        );
      }
      expect(a.status === "solvable").toBe(brute(b, t));
    }
  });
  it("handles used slots and deterministic players without mutating inputs", () => {
    const b = Array(64).fill(0),
      t = [{ ...slot("S1-0"), used: true }, slot("S1-0"), slot("S1-0")],
      before = JSON.stringify([b, t]);
    const a = analyze(b, t, 1000000);
    expect(a.viableSlotOrders).toEqual(["12", "21"]);
    expect(a.orderFreedom).toBe(1);
    for (const style of styles) {
      expect(playTray(b, t, style, 42)).toEqual(playTray(b, t, style, 42));
      expect(playTray(b, t, style, 42).success).toBe(true);
    }
    expect(JSON.stringify([b, t])).toBe(before);
  });
  it("proves a tray impossible when it has no legal first placement", () => {
    const b = Array.from({ length: 64 }, (_, i) =>
      Number((i + (i >> 3)) % 2 === 0),
    );
    const s = SHAPES.find((s) => s.cells.length === 9)!;
    expect(analyze(b, [slot(s.id)], 0).status).toBe("unsolvable");
  });
});

import orderFixture from "../scripts/difficulty/order-fixture.json";
it("keeps exact metrics invariant under slot permutation and bounds every incomplete search", () => {
  const b = orderFixture.board,
    t = orderFixture.tray;
  const exact = analyze(b, t, 2000000);
  expect(exact.complete).toBe(true);
  expect(exact.safeRatio).toBeCloseTo(orderFixture.expected.safeRatio);
  expect(exact.orderFreedom).toBeCloseTo(orderFixture.expected.orderFreedom);
  const swapped = analyze(b, [t[2]!, t[0]!, t[1]!], 2000000);
  expect(swapped.safeRatio).toBe(exact.safeRatio);
  expect(swapped.orderFreedom).toBe(exact.orderFreedom);
  expect(swapped.maxLinesOnSuccess).toBe(exact.maxLinesOnSuccess);
  for (const budget of [0, 1, 20, 200]) {
    const partial = analyze(b, t, budget);
    expect(partial.checks).toBeLessThanOrEqual(budget);
    expect(partial.safeRatioBounds![0]).toBeLessThanOrEqual(exact.safeRatio!);
    expect(partial.safeRatioBounds![1]).toBeGreaterThanOrEqual(
      exact.safeRatio!,
    );
    if (!partial.complete) {
      expect(partial.safeRatio).toBeNull();
      expect(partial.maxLinesOnSuccess).toBeNull();
    }
    if (partial.witness) {
      let board = [...b];
      for (const m of partial.witness) {
        expect(placements(board, shapeById(t[m.slot]!.shapeId))).toContainEqual(
          { x: m.x, y: m.y },
        );
        board = place(board, shapeById(t[m.slot]!.shapeId), m.x, m.y).board;
      }
    }
  }
});
it("a fully used tray is complete, even with zero search budget", () => {
  const a = analyze(
    Array(64).fill(0),
    [{ shapeId: "S1-0", color: 1, used: true }],
    0,
  );
  expect(a.status).toBe("solvable");
  expect(a.complete).toBe(true);
  expect(a.witness).toEqual([]);
  expect(a.orderFreedom).toBe(1);
});
