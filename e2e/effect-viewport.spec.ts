import { test, expect } from "@playwright/test";
test.use({
  viewport: { width: 392, height: 872 },
  deviceScaleFactor: 2.75,
  isMobile: true,
});
test("effect draw does not query viewport geometry and retains its backing resolution", async ({
  page,
}) => {
  await page.goto("/e2e/fixtures/effect-viewport.html");
  await page.waitForFunction(() => !!(window as any).effects);
  const result = await page.evaluate(() => {
    const { atmosphere: a, festival: f, board } = (window as any).effects;
    a.set(110, true, false);
    a.origin(board, [1]);
    f.setPalette(5);
    f.burst(board, [], 2, true, false, undefined, 110, 2);
    const sizes = [a, f].map((e) => [e.canvas.width, e.canvas.height]);
    for (const key of ["innerWidth", "innerHeight", "devicePixelRatio"])
      Object.defineProperty(window, key, {
        configurable: true,
        get() {
          throw Error("Viewport read during draw: " + key);
        },
      });
    for (let t = 0; t < 2400; t += 17) {
      a.draw(performance.now() + t);
      f.draw(performance.now() + t);
    }
    f.stop();
    return sizes;
  });
  expect(result).toEqual([
    [588, 1308],
    [588, 1308],
  ]);
});
test("resize and resume refresh effect size and clear obsolete ring geometry", async ({
  page,
}) => {
  await page.goto("/e2e/fixtures/effect-viewport.html");
  await page.waitForFunction(() => !!(window as any).effects);
  await page.evaluate(() => {
    const { atmosphere: a, festival: f, board } = (window as any).effects;
    a.set(110, true, false);
    f.burst(board, [], 2, true, false, undefined, 110, 2);
  });
  await page.setViewportSize({ width: 872, height: 392 });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const { atmosphere: a, festival: f } = (window as any).effects;
        return [
          a.canvas.width,
          a.canvas.height,
          f.canvas.width,
          f.canvas.height,
          f.rear.childElementCount,
        ];
      }),
    )
    .toEqual([1308, 588, 1308, 588, 0]);
  const resumed = await page.evaluate(() => {
    const { atmosphere: a, festival: f, board } = (window as any).effects;
    a.set(110, false, false);
    f.stop();
    // A background viewport/DPR change whose resize event was not delivered.
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 410,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 800,
    });
    Object.defineProperty(window, "devicePixelRatio", {
      configurable: true,
      value: 1,
    });
    a.set(110, true, false);
    f.burst(board, [], 2, true, false, undefined, 110, 2);
    a.draw(performance.now());
    f.draw(performance.now());
    return [a.canvas.width, a.canvas.height, f.canvas.width, f.canvas.height];
  });
  expect(resumed).toEqual([410, 800, 410, 800]);
});
