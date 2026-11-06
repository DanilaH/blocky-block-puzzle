import { expect, it } from "vitest";
import { TileMaterialBlend } from "../src/game/tile-material";
import {
  tileMaterialForTheme,
  tileTransitionDuration,
} from "../src/game/tile-study-config";
import { themeFor } from "../src/game/themes";
it("material milestones keep all subsequent palettes and reset with the series", () => {
  expect(
    [0, 5, 6, 19, 20, 75, 100, 10000].map((s) =>
      tileMaterialForTheme(themeFor(s)),
    ),
  ).toEqual([
    "plastic",
    "enamel",
    "enamel",
    "enamel",
    "chrome",
    "chrome",
    "chrome",
    "chrome",
  ]);
  expect(tileTransitionDuration(true, 5)).toBe(250);
  expect(tileTransitionDuration(false, 0)).toBe(1800);
});
it("an interrupted material change resumes from the visible blend, without jumps", () => {
  const blend = new TileMaterialBlend();
  blend.set("enamel", 100, 1000);
  expect(blend.sample(600)).toEqual([0.5, 0]);
  blend.set("chrome", 600, 1000);
  expect(blend.sample(600)).toEqual([0.5, 0]);
  expect(blend.sample(1100)).toEqual([0.75, 0.5]);
  blend.set("plastic", 1100, 1800);
  expect(blend.sample(1100)).toEqual([0.75, 0.5]);
  expect(blend.sample(2000)).toEqual([0.375, 0.25]);
  expect(blend.sample(2900)).toEqual([0, 0]);
  expect(blend.set("plastic", 3000, 1000)).toBe(false);
  blend.set("chrome", 3000, 0);
  expect(blend.sample(3000)).toEqual([1, 1]);
});
