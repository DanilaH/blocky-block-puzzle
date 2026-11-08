import { test, expect } from "@playwright/test";
import sharp from "sharp";
test.use({ viewport: { width: 600, height: 400 }, deviceScaleFactor: 1 });
test("cached beds match intermediate board colors and the grid without repainting a color tween", async ({
  page,
}) => {
  await page.goto("/e2e/fixtures/board-backdrop.html");
  await page.waitForFunction(() => !!(window as any).beds);
  for (const [from, to] of [
    [0xc9dbe7, 0x46647a],
    [0x46647a, 0x0b2451],
  ]) {
    await page.evaluate(
      ({ from, to }) => {
        const { reference, backdrop } = (window as any).beds;
        reference.getAnimations().forEach((a: Animation) => a.cancel());
        reference.style.backgroundColor =
          "#" + to.toString(16).padStart(6, "0");
        const animation = reference.animate(
          [
            { backgroundColor: "#" + from.toString(16).padStart(6, "0") },
            { backgroundColor: "#" + to.toString(16).padStart(6, "0") },
          ],
          { duration: 1000, easing: "linear" },
        );
        animation.pause();
        backdrop.set(from, to, 1000);
        backdrop.animation.pause();
      },
      { from: from!, to: to! },
    );
    for (const time of [0, 250, 500, 750, 999]) {
      await page.evaluate((time) => {
        const { reference, backdrop } = (window as any).beds;
        reference.getAnimations()[0].currentTime = time;
        backdrop.animation.currentTime = time;
      }, time);
      const a = await page.locator("[data-test=reference]").screenshot(),
        b = await page.locator("[data-test=candidate]").screenshot();
      const x = await sharp(a).raw().toBuffer(),
        y = await sharp(b).raw().toBuffer();
      let sum = 0,
        max = 0;
      for (let i = 0; i < x.length; i++) {
        const d = Math.abs(x[i]! - y[i]!);
        sum += d;
        max = Math.max(max, d);
      }
      expect(sum / x.length).toBeLessThan(0.8);
      expect(max).toBeLessThanOrEqual(4);
    }
  }
});
test("interrupted fades replace the previous bed, pause settles it, shutdown removes it", async ({
  page,
}) => {
  await page.goto("/e2e/fixtures/board-backdrop.html");
  const result = await page.evaluate(() => {
    const { candidate, backdrop } = (window as any).beds;
    backdrop.set(0xc9dbe7, 0x46647a, 1000);
    const first = backdrop.animation;
    backdrop.set(0x90a2b3, 0x0b2451, 1800);
    const interrupted = {
      first: first.playState,
      count: candidate.getAnimations({ subtree: true }).length,
      color: backdrop.previous.style.backgroundColor,
    };
    backdrop.finish();
    const paused = {
      count: candidate.getAnimations({ subtree: true }).length,
      color: candidate.style.backgroundColor,
    };
    backdrop.destroy();
    return {
      interrupted,
      paused,
      children: candidate.childElementCount,
      staticBoard: candidate.dataset.staticBoard,
      compositedBed: candidate.dataset.compositedBed,
    };
  });
  expect(result.interrupted).toEqual({
    first: "idle",
    count: 1,
    color: "rgb(144, 162, 179)",
  });
  expect(result.paused).toEqual({ count: 0, color: "rgb(11, 36, 81)" });
  expect(result.children).toBe(0);
  expect(result.staticBoard).toBeUndefined();
  expect(result.compositedBed).toBeUndefined();
});
