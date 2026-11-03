import { test, expect, type Page } from "@playwright/test";
async function events(page: Page, name: string) {
  return page.evaluate(
    (name) =>
      (window as any).__blockyAnalytics
        .snapshot()
        .filter((e: any) => e.name === name),
    name,
  );
}
test("real play emits start once, hint spends once, reload resumes without a second start", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator("#lesson-skip").click();
  expect(await events(page, "first_open")).toHaveLength(1);
  await expect
    .poll(() => events(page, "tutorial_skip").then((e) => e.length))
    .toBe(1);
  expect(await events(page, "game_start")).toHaveLength(0);
  await page.locator("#tray button").first().click();
  await page.locator("#board").click({ position: { x: 3, y: 3 } });
  await expect
    .poll(() => events(page, "game_start").then((e) => e.length))
    .toBe(1);
  await page.locator("#pause").click();
  await page.locator("#sound").uncheck();
  await expect
    .poll(() => events(page, "audio_setting").then((e) => e.length))
    .toBe(1);
  await page.locator("#resume").click();
  await page.locator("#pause").click();
  await page.locator("#menu-hint").click();
  await expect(page.locator("#hint-count")).toHaveText("2");
  expect(await events(page, "hint_applied")).toHaveLength(1);
  await page.locator("#pause").click();
  await page.locator("#menu-hint").click();
  expect(await events(page, "hint_applied")).toHaveLength(1);
  expect(await events(page, "game_start")).toHaveLength(1);
  await page.reload();
  await expect(page.locator("#board canvas")).toBeVisible();
  await expect
    .poll(() => events(page, "game_resume").then((e) => e.length))
    .toBe(1);
  expect(await events(page, "first_open")).toHaveLength(0);
  expect(await events(page, "game_start")).toHaveLength(0);
  await page.locator("#pause").click();
  await page.locator("#restart").click();
  await page.locator("#new-game").click();
  await expect
    .poll(() => events(page, "game_end").then((e) => e.length))
    .toBe(1);
  expect((await events(page, "game_end"))[0].params.reason).toBe("restart");
  expect(await events(page, "game_start")).toHaveLength(0);
});
test("legacy reward ledger compacts on a real saved setting and remains valid after reload", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#lesson-skip").click();
  await page.evaluate(async () => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    const { prepareReward, applyReceipt } = await import(
      "/src/core/monetization.ts"
    );
    const save = new IndexedSave();
    let p = (await save.load()).profile;
    p = prepareReward(p, "paid", "hints");
    p = applyReceipt(p, { id: "token", intentId: "paid" });
    p = prepareReward(p, "pending", "hints");
    await save.write(p);
  });
  await page.reload();
  await page.locator("#pause").click();
  await page.locator("#sound").uncheck();
  await expect(page.locator("#save-status")).toHaveText("Партия сохранена");
  await page.reload();
  await expect(page.locator("#board canvas")).toBeVisible();
  const result = await page.evaluate(async () => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    const { applyReceipt } = await import("/src/core/monetization.ts");
    const p = (await new IndexedSave().load()).profile;
    return {
      p,
      duplicate: applyReceipt(p, { id: "late-token", intentId: "paid" })
        .earnedHints,
      pending: applyReceipt(p, { id: "fresh-token", intentId: "pending" })
        .earnedHints,
    };
  });
  expect(result.p.ads.intents[0].snapshot).toBeUndefined();
  expect(result.p.ads.intents[1].snapshot).toBeDefined();
  expect(result.p.ads.ledgerVersion).toBe(2);
  expect(result.duplicate).toBe(3);
  expect(result.pending).toBe(6);
});
