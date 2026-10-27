import { test, expect, type Page } from "@playwright/test";
async function saved(page: Page) {
  return page.evaluate(async () => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    return (await new IndexedSave().load()).profile;
  });
}
async function setup(page: Page) {
  await page.goto("/");
  await page.locator("#lesson-skip").click();
  await page.locator("#pause").click();
  await page.locator("#restart").click();
}
test("dealer choice only commits with a new game; survives reload; cancel keeps exact game", async ({
  page,
}) => {
  await setup(page);
  const initial = await saved(page);
  await page.locator("#dealer-choice").selectOption("assist-v1");
  await page.locator("#keep-game").click();
  expect((await saved(page)).game).toEqual(initial.game);
  await page.locator("#pause").click();
  await page.locator("#restart").click();
  await expect(page.locator("#dealer-choice")).toHaveValue("initial-v1");
  await page.locator("#dealer-choice").selectOption("assist-v1");
  await page.locator("#new-game").click();
  await expect(page.locator("dialog")).not.toBeVisible();
  const assisted = await saved(page);
  expect(assisted.game.dealerVersion).toBe("assist-v1");
  expect(assisted.game.gameId).not.toBe(initial.game.gameId);
  expect(assisted.best).toBe(initial.best);
  expect(assisted.freeHints).toBe(initial.freeHints);
  await page.reload();
  await page.locator("#pause").click();
  await expect(page.locator(".dealer-note")).toContainText(
    "с умеренной помощью",
  );
  expect((await saved(page)).game).toEqual(assisted.game);
  await page.locator("#restart").click();
  await expect(page.locator("#dealer-choice")).toHaveValue("assist-v1");
  await page.locator("#dealer-choice").selectOption("initial-v1");
  await page.locator("#new-game").click();
  await expect
    .poll(async () => (await saved(page)).game.dealerVersion)
    .toBe("initial-v1");
});
test("failed new-game save retains original policy, RNG and board", async ({
  page,
}) => {
  await setup(page);
  const initial = await saved(page);
  await page.locator("#dealer-choice").selectOption("assist-v1");
  await page.evaluate(async () => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    IndexedSave.prototype.write = async () => {
      throw Error("simulated write failure");
    };
  });
  await page.locator("#new-game").click();
  await expect(page.locator(".dialog-status")).toContainText(
    "Предыдущая сохранена",
  );
  expect((await saved(page)).game).toEqual(initial.game);
  await page.reload();
  expect((await saved(page)).game).toEqual(initial.game);
});
for (const [width, height] of [
  [320, 480],
  [568, 320],
  [390, 844],
])
  test(`dealer dialog fits ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await setup(page);
    await expect(page.locator("#dealer-choice")).toBeVisible();
    await page.locator("#new-game").scrollIntoViewIfNeeded();
    const b = await page.locator("#new-game").boundingBox();
    expect(b!.y).toBeGreaterThanOrEqual(0);
    expect(b!.y + b!.height).toBeLessThanOrEqual(height);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: `docs/qa/dealer-0.16/choice-${width}x${height}.png`,
    });
  });
