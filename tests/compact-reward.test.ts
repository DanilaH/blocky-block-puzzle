import { describe, expect, it } from "vitest";
import { compactMoveReward } from "../src/game/compact-reward";

const move = {
  points: 1574,
  lines: 2,
  allClear: true,
  newRecord: true,
  finishedStreak: 0,
  multiplier: 1.5,
  praise: null,
} as const;

describe("compact move reward", () => {
  it("combines all-clear, combo and record with the full saved move total", () => {
    expect(compactMoveReward(move)).toEqual({
      tier: "all-clear",
      label: "Чистое поле! ×1,5 · Рекорд!",
      points: 1574,
    });
  });
  it("includes the placement points when a completed series pays", () => {
    expect(
      compactMoveReward({
        ...move,
        lines: 0,
        allClear: false,
        finishedStreak: 8,
        points: 404,
      }),
    ).toEqual({
      tier: "series",
      label: "Серия 8 завершена · Рекорд!",
      points: 404,
    });
  });
  it("does not create a competing label for an ordinary placement", () => {
    expect(
      compactMoveReward({
        ...move,
        lines: 0,
        allClear: false,
        newRecord: false,
      }),
    ).toBeNull();
  });
  it("retains an earned record and a praised move without a line", () => {
    expect(
      compactMoveReward({ ...move, lines: 0, allClear: false })?.tier,
    ).toBe("record");
    expect(
      compactMoveReward({
        ...move,
        lines: 0,
        allClear: false,
        newRecord: false,
        praise: "excellent",
      })?.label,
    ).toBe("Отличный ход!");
  });
});
