import { test, expect } from "@playwright/test";
test("grid remains visible at high density and interrupted theme changes settle", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
  });
  const page = await context.newPage();
  await page.goto("/");
  await page.locator("#lesson-skip").click();
  const board = page.locator("#board");
  await expect
    .poll(() => board.evaluate((e) => getComputedStyle(e).backgroundImage))
    .toContain("data:image/svg+xml");
  expect(
    await page
      .locator("#board canvas")
      .evaluate((e: HTMLCanvasElement) => e.width),
  ).toBe(1024);
  await page.locator("#pause").click();
  await page.locator("#themes").click();
  await page.locator('[data-theme="1"]').click();
  await page.waitForTimeout(150);
  const intermediate = await board.evaluate(
    (e) => getComputedStyle(e).backgroundColor,
  );
  expect(intermediate).not.toBe("rgb(11, 36, 81)");
  await page.locator('[data-theme="2"]').click();
  await expect
    .poll(() => board.evaluate((e) => getComputedStyle(e).backgroundColor))
    .toBe("rgb(189, 143, 167)");
  await page.reload();
  await expect
    .poll(() => board.evaluate((e) => getComputedStyle(e).backgroundColor))
    .toBe("rgb(189, 143, 167)");
  await expect
    .poll(() => board.evaluate((e) => getComputedStyle(e).backgroundImage))
    .toContain("data:image/svg+xml");
  await page.setViewportSize({ width: 844, height: 390 });
  const bounds = await board.boundingBox();
  expect(bounds!.width).toBeCloseTo(bounds!.height, 0);
  await context.close();
});
