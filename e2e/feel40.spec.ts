import { test, expect } from "@playwright/test";
async function lost(page) {
  await page.goto("/");
  await expect(page.locator("#app")).not.toHaveAttribute("aria-busy", "true");
  await page.evaluate(async () => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    const { newGame } = await import("/src/core/rules.ts");
    const s = new IndexedSave(),
      p = (await s.load()).profile;
    p.revision++;
    p.tutorialStep = 4;
    p.settings.calm = true;
    p.game = newGame(11, "timer", "flow-v4");
    p.game.status = "over";
    p.game.board = Array.from(
      { length: 64 },
      (_, i) => ((i % 8) + Math.floor(i / 8)) % 2,
    );
    p.game.tray.forEach((s) => (s.shapeId = "O3-0"));
    await s.write(p);
  });
  await page.reload();
  await expect(page.locator("#revive-clock")).toBeVisible();
}
const saved = (page) =>
  page.evaluate(async () => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    return (await new IndexedSave().load()).profile;
  });
test("standalone offer precedes results; five seconds expires durably across reload", async ({
  page,
}) => {
  await lost(page);
  const original = await saved(page);
  await expect(page.locator("#again")).toHaveCount(0);
  await expect(page.locator(".result-score")).toHaveCount(0);
  await page.waitForTimeout(5300);
  await page.reload();
  await expect(page.locator("#again")).toBeVisible();
  await expect(page.locator("#watch-reward")).toHaveCount(0);
  const after = await saved(page);
  expect(after.game.reviveOffer.expired).toBe(true);
  expect(after.game.board).toEqual(original.game.board);
  expect(after.game.rngState).toBe(original.game.rngState);
});
test("accepted decision survives slow or unavailable ads; explicit finish is final", async ({
  page,
}) => {
  await lost(page);
  await page.locator("#watch-reward").click();
  await expect(page.locator("#watch-reward")).toBeVisible();
  await page.waitForTimeout(5300);
  expect((await saved(page)).game.reviveOffer.accepted).toBe(true);
  await page.reload();
  await expect(page.locator("#watch-reward")).toBeVisible();
  await expect(page.locator("#revive-clock")).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(page.locator("#again")).toBeVisible();
  await expect(page.locator("#watch-reward")).toHaveCount(0);
  await page.reload();
  await expect(page.locator("#watch-reward")).toHaveCount(0);
  expect((await saved(page)).game.reviveOffer.expired).toBe(true);
});
test("all themes are selectable and manual selection does not change dealer state", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#lesson-skip").click();
  const before = await saved(page);
  await page.locator("#pause").click();
  await page.locator("#themes").click();
  await expect(page.locator("[data-theme]")).toHaveCount(11);
  await page.locator('[data-theme="10"]').click();
  expect((await saved(page)).game).toEqual(before.game);
  await page.reload();
  expect((await saved(page)).wardrobe.selected).toBe(10);
});
test("dense canvas preserves logical drag and placement coordinates", async ({
  browser,
}) => {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
  });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.locator("#lesson-skip").click();
  const size = await page.locator("#board canvas").evaluate((c) => ({
    backing: c.width,
    css: c.getBoundingClientRect().width,
  }));
  expect(size.backing).toBe(1024);
  expect(size.css).toBeLessThan(390);
  await page.evaluate(async () => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    const s = new IndexedSave(),
      p = (await s.load()).profile;
    p.revision++;
    p.game.tray[0] = { shapeId: "S1-0", color: 1, used: false };
    p.game.board = Array(64).fill(0);
    await s.write(p);
  });
  await page.reload();
  await page.locator('[data-slot="0"]').click();
  const box = await page.locator("#board").boundingBox();
  await page.locator("#board").click({
    position: { x: (box.width * 7.5) / 8, y: (box.height * 7.5) / 8 },
  });
  await expect.poll(async () => (await saved(page)).game.board[63]).toBe(1);
  await ctx.close();
});

test("Back declines the standalone offer permanently", async ({ page }) => {
  await lost(page);
  await expect(page.locator("#again")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator("#again")).toBeVisible();
  expect((await saved(page)).game.reviveOffer.expired).toBe(true);
  await page.reload();
  await expect(page.locator("#watch-reward")).toHaveCount(0);
});
