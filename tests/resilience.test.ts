import { it, expect } from "vitest";
import { resilience } from "../scripts/director/resilience";
import { analyze } from "../scripts/difficulty/analyze";
import { constructTasks } from "../scripts/director/recipes";
import fixture from "../scripts/director/order-board.json";
const singles = Array.from({ length: 3 }, () => ({
  shapeId: "S1-0",
  used: false,
  color: 1,
}));
it("accounts for all probability mass and detects failures after a legal first move", () => {
  const tasks = constructTasks(fixture.board, fixture.seed);
  let late = false;
  for (const p of tasks.proposals)
    for (const taste of ["lines", "space"] as const) {
      const a = resilience(fixture.board, p.tray, taste);
      expect(a.complete).toBe(true);
      expect(a.success! + a.failureAt.reduce((n, x) => n + x, 0)).toBeCloseTo(
        1,
        10,
      );
      expect(analyze(fixture.board, p.tray, 1000000).status).toBe("solvable");
      late ||= a.failureAt[1]! + a.failureAt[2]! > 0;
    }
  expect(late).toBe(true);
});
it("keeps exhausted search unknown, not failure or certainty", () => {
  const a = resilience(Array(64).fill(0), singles, "lines", 4, 0);
  expect(a.complete).toBe(false);
  expect(a.success).toBeNull();
  expect(a.expectedLines).toBeNull();
  expect(a.successBounds).toEqual([0, 1]);
});
it("handles used slots and terminal boards without mutations", () => {
  const board = Array(64).fill(0),
    tray = structuredClone(singles);
  tray[1]!.used = true;
  const before = JSON.stringify([board, tray]);
  const a = resilience(board, tray);
  expect(a.success).toBeCloseTo(1);
  expect(a.expectedOccupied).toBeCloseTo(2);
  expect(a.expectedLines).toBe(0);
  expect(a).toEqual(resilience(board, tray));
  expect(JSON.stringify([board, tray])).toBe(before);
  expect(resilience(Array(64).fill(1), singles).failureAt).toEqual([1, 0, 0]);
  expect(
    resilience(
      board,
      tray.map((s) => ({ ...s, used: true })),
    ).success,
  ).toBe(1);
});
it("rejects invalid budgets and shape identifiers", () => {
  expect(() => resilience([], singles)).toThrow();
  expect(() => resilience(Array(64).fill(0), singles, "lines", 0)).toThrow();
  expect(() =>
    resilience(Array(64).fill(0), singles, "lines", 4, -1),
  ).toThrow();
  expect(() =>
    resilience(Array(64).fill(0), [
      { shapeId: "invalid", used: false, color: 1 },
    ]),
  ).toThrow();
});
