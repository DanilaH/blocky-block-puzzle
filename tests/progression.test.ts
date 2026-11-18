import { expect, it } from "vitest";
import { comboMultiplier, scoreBreakdown, newGame } from "../src/core/rules";
import {
  createProfile,
  validProfile,
  bestFor,
  recordScore,
} from "../src/core/profile";
import {
  seriesVisual,
  themeFor,
  labelDevelopment,
  SERIES_STEPS,
} from "../src/game/themes";
import { percussionLevels } from "../src/game/music-layers";
it("legacy multiplier stays capped, new progression continues past 100", () => {
  expect(comboMultiplier(100)).toBe(5);
  expect(
    [6, 8, 10, 13, 16, 20, 23, 100].map((s) => comboMultiplier(s, true)),
  ).toEqual([5, 6, 8, 10, 12, 15, 16, 41]);
  expect(scoreBreakdown(4, 2, 13, false, true, true).total).toBe(3004);
  expect(scoreBreakdown(4, 2, 13, false, true).total).toBe(1504);
  expect(scoreBreakdown(4, 2, 13, true, true, true).empty).toBe(1000);
});
it("v4 records do not overwrite v3 records and old profiles remain valid", () => {
  const p = createProfile(newGame(31, "record"));
  p.game.scoringVersion = "festival-v3";
  p.festivalBest = 400;
  expect(validProfile(p)).toBe(true);
  expect(bestFor(p)).toBe(400);
  const g = { ...p.game, scoringVersion: "festival-v4" as const, score: 800 };
  const next = { ...p, game: g, ...recordScore(p, g) };
  expect(validProfile(next)).toBe(true);
  expect(next.festivalBest).toBe(400);
  expect(bestFor(next)).toBe(800);
  expect(bestFor(p)).toBe(400);
});
it("reachable theme stages and bounded labels continue at high series", () => {
  expect(SERIES_STEPS.map((s) => themeFor(seriesVisual(s)))).toEqual([
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  ]);
  expect(labelDevelopment(2).size).toBeLessThan(labelDevelopment(10).size);
  expect(labelDevelopment(10000).size).toBeLessThanOrEqual(1.3);
  expect(labelDevelopment(10000).hold).toBeLessThanOrEqual(650);
});
it("percussion adds distinct parts at 2, 4, 6 and releases at zero", () => {
  expect(
    [0, 2, 4, 6].map((s) => percussionLevels(s).filter((v) => v > 0).length),
  ).toEqual([0, 1, 2, 3]);
  expect(percussionLevels(10)[2]).toBeGreaterThan(percussionLevels(6)[2]!);
  expect(percussionLevels(0)).toEqual([0, 0, 0]);
});
