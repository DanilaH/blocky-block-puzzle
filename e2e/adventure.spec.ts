import { test, expect } from "@playwright/test";
async function boot(page: any) {
  await page.goto("/?mode=adventure");
  await page.waitForFunction(() => !!(window as any).__adventure);
}
async function move(page: any, m: any) {
  await page.locator(`[data-slot="${m.slot}"]`).click();
  await page.locator(`[data-cell="${m.y * 8 + m.x}"]`).click();
}
test("five levels through real input, independent classic save, reload and replay", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await boot(page);
  const classic = await page.evaluate(
    () => (window as any).__adventure.store.state.game,
  );
  await page.screenshot({ path: "docs/qa/adventure-0.35/chapter.png" });
  for (let i = 0; i < 5; i++) {
    if (!i) await page.locator('[data-level="cove-1"]').click();
    else await page.locator("#adv-next").click();
    const solution = await page.evaluate(
      (i) => (window as any).__adventure.levels[i].solution,
      i,
    );
    for (let j = 0; j < solution.length; j++) {
      await move(page, solution[j]);
      await expect
        .poll(() =>
          page.evaluate(
            () => (window as any).__adventure.store.state.campaign.active.moves,
          ),
        )
        .toBe(j + 1);
      if (i === 1 && j === 0) {
        await page.screenshot({ path: "docs/qa/adventure-0.35/ice.png" });
        await page.reload();
        await page.waitForFunction(() => !!(window as any).__adventure);
        await page.locator("#adv-continue").click();
      }
      if (i === 2 && j === 0)
        await page.screenshot({ path: "docs/qa/adventure-0.35/unlock.png" });
    }
    await expect(page.locator("#adv-result")).toBeVisible();
  }
  await page.screenshot({ path: "docs/qa/adventure-0.35/win.png" });
  expect(
    await page.evaluate(() => (window as any).__adventure.store.state.game),
  ).toEqual(classic);
  await page.locator("#adv-map").click();
  await expect(page.locator(".revealed")).toHaveCount(5);
  await expect(page.locator("#adv-next")).toHaveCount(0);
  await page.locator('[data-level="cove-1"]').click();
  const solution = await page.evaluate(
    () => (window as any).__adventure.levels[0].solution,
  );
  for (const m of solution) await move(page, m);
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).__adventure.store.state.campaign.active.status,
      ),
    )
    .toBe("won");
  expect(
    await page.evaluate(
      () => (window as any).__adventure.store.state.campaign.rewards.length,
    ),
  ).toBe(5);
  expect(errors).toEqual([]);
});
test("hint persisted without duplicate debit, actual drag, settings and short landscape", async ({
  page,
}) => {
  await page.setViewportSize({ width: 740, height: 360 });
  await boot(page);
  await page.locator('[data-level="cove-1"]').click();
  await page.locator("#adv-hint").click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).__adventure.store.state.freeHints),
    )
    .toBe(2);
  await page.reload();
  await page.waitForFunction(() => !!(window as any).__adventure);
  await page.locator("#adv-continue").click();
  await page.locator("#adv-hint").click();
  expect(
    await page.evaluate(
      () => (window as any).__adventure.store.state.freeHints,
    ),
  ).toBe(2);
  const tray = await page.locator('[data-slot="0"]').boundingBox(),
    board = await page.locator("#adv-board").boundingBox();
  await page.mouse.move(tray!.x + tray!.width / 2, tray!.y + tray!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    board!.x + (board!.width * 4) / 8,
    board!.y + (board!.height * 2.5) / 8,
    { steps: 10 },
  );
  await page.mouse.up();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).__adventure.store.state.campaign.active.moves,
      ),
    )
    .toBe(1);
  await page.screenshot({ path: "docs/qa/adventure-0.35/landscape.png" });
  await page.locator("#adv-pause").click();
  await page.locator("#adv-calm").check();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).__adventure.store.state.settings.calm,
      ),
    )
    .toBe(true);
  await page.locator("#adv-dismiss").click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
