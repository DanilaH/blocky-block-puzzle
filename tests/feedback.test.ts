import { expect, it } from "vitest";
import {
  contactScale,
  waveOrigins,
  clearWaveDelay,
} from "../src/game/feedback";
it("clears outward from right edge rather than starting at left", () => {
  const o = waveOrigins([7]);
  expect(clearWaveDelay(7, [0], [], o)).toBe(40);
  expect(clearWaveDelay(0, [0], [], o)).toBe(236);
});
it("cross shares an origin and center placement reaches both ends symmetrically", () => {
  const o = waveOrigins([27, 28]);
  expect(clearWaveDelay(24, [3], [3, 4], o)).toBe(
    clearWaveDelay(31, [3], [3, 4], o),
  );
  expect(clearWaveDelay(27, [3], [3, 4], o)).toBe(40);
  expect(clearWaveDelay(3, [3], [3, 4], o)).toBe(124);
});
it("contact settles without repeated oscillation", () => {
  expect(contactScale(0)).toBe(0.94);
  expect(contactScale(35)).toBeCloseTo(1.015);
  expect(contactScale(80)).toBeLessThan(contactScale(35));
  expect(contactScale(120)).toBe(1);
  expect(contactScale(1000)).toBe(1);
});
