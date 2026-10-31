import { expect, it } from "vitest";
import {
  Celebration,
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
  expect(contactScale(0)).toBe(0.84);
  expect(contactScale(35)).toBeCloseTo(1.08);
  expect(contactScale(80)).toBeLessThan(contactScale(35));
  expect(contactScale(120)).toBe(1);
  expect(contactScale(1000)).toBe(1);
});

it("celebration decays, stacks within its cap and resets", () => {
  const e = new Celebration();
  expect(e.level(0)).toBe(0);
  const first = e.add(1, 100);
  expect(e.level(1100)).toBeLessThan(first);
  expect(e.add(1, 1100)).toBeGreaterThan(first);
  for (let i = 0; i < 20; i++) e.add(3, 1100);
  expect(e.level(1100)).toBe(1);
  expect(e.level(3900)).toBe(0);
  e.add(1, 4000);
  e.reset();
  expect(e.level(4000)).toBe(0);
});
