import { expect, it } from "vitest";
import { clearHapticLevel } from "../src/platform/haptics";
it("big multi-line clears and long series get bounded festival sequences", () => {
  expect([1,2,6,10,16,100].map(s => clearHapticLevel(1,s))).toEqual([1,2,4,6,8,8]);
  expect([1,2,3,4,8].map(n => clearHapticLevel(n,1))).toEqual([1,4,6,8,8]);
});
