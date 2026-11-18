import { test, expect, type Page } from "@playwright/test";

async function saved(page: Page) {
  return page.evaluate(async () => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    return (await new IndexedSave().load()).profile;
  });
}

for (const failShown of [false, true]) test(`Back waits for offer impression save without losing the decision; failure=${failShown}`, async ({ page }) => {
  await page.goto("/");
  await page.locator("#lesson-skip").click();
  await page.evaluate(async () => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    const { newGame } = await import("/src/core/rules.ts");
    const save = new IndexedSave(), p = (await save.load()).profile;
    p.revision++; p.tutorialStep = 4; p.hint = null; delete p.metrics;
    p.game = newGame(1234, "back-during-impression", "director-budget-v1");
    p.game.board = Array.from({ length: 64 }, (_, i) => ((i % 8) + Math.floor(i / 8)) % 2 ? 3 : 0);
    p.game.tray.forEach(s => { s.shapeId = "O3-0"; });
    p.game.status = "over";
    await save.write(p);
  });
  await page.route("**/src/platform/save.ts", async route => {
    const response = await route.fetch(), body = await response.text();
    const needle = "async write(profile) {";
    expect(body).toContain(needle);
    await route.fulfill({ response, body: body.replace(needle, `${needle}
      if (profile.game.reviveOffer?.shown && !profile.game.reviveOffer.expired && !window.heldOfferShown) {
        window.heldOfferShown = true;
        await new Promise((resolve, reject) => { window.releaseOfferShown = () => ${failShown ? 'reject(new Error("delayed shown save failed"))' : 'resolve()'}; });
      }
    `) });
  });
  await page.reload();
  await expect(page.locator("#revive-clock")).toBeVisible();
  await page.waitForFunction(() => (window as any).heldOfferShown);
  const before = await saved(page);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  expect((await saved(page)).game.reviveOffer.decision).toBeUndefined();
  await page.evaluate(() => (window as any).releaseOfferShown());
  // Much shorter than the five-second offer: deadline expiry must not mask a lost Back.
  await expect(page.locator("#again")).toBeVisible({ timeout: 1500 });
  const after = await saved(page);
  expect(after.game.reviveOffer.decision).toBe("back");
  expect(after.game.reviveOffer.expired).toBe(true);
  expect(after.game.reviveUsed).toBe(before.game.reviveUsed);
  expect(after.game.assistBudget).toEqual(before.game.assistBudget);
  const events = await page.evaluate(() => (window as any).__blockyAnalytics.snapshot().map((e: any) => e.name));
  expect(events.filter(name => name === "run_closed")).toHaveLength(1);
  expect(events.filter(name => name === "revive_offer_decided")).toHaveLength(1);
});
