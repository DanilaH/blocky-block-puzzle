import { test, expect } from "@playwright/test";
async function seed(page: any, calm = false) {
  await page.goto("/");
  await page.locator(".piece").first().waitFor();
  await page.evaluate(async (calm: boolean) => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    const { newGame } = await import("/src/core/rules.ts");
    const s = new IndexedSave(),
      p = (await s.load()).profile;
    p.revision++;
    p.tutorialStep = 4;
    delete p.metrics;
    p.hint = null;
    p.game = newGame(11, "result-motion", "flow-v4");
    p.game.board = Array.from({ length: 64 }, (_, i) =>
      ((i % 8) + Math.floor(i / 8)) % 2 ? 3 : 0,
    );
    p.game.tray.forEach((slot) => (slot.shapeId = "O3-0"));
    p.game.status = "over";
    p.game.score = 14650;
    p.game.reviveOffer = { accepted: false, deadline: 5001, expired: true };
    p.best = p.festivalBest = 14650;
    p.settings.calm = calm;
    await s.write(p);
  }, calm);
  await page.reload();
  await page.locator("#again").waitFor();
}
test("result counts intermediate values then exposes final score and action", async ({
  page,
}) => {
  await seed(page);
  await expect(page.locator("#dialog")).toHaveAttribute(
    "data-counting",
    "true",
  );
  await page.waitForTimeout(400);
  const n = Number(
    (await page.locator(".result-score").textContent())!.replace(/\s/g, ""),
  );
  expect(n).toBeGreaterThan(0);
  expect(n).toBeLessThan(14650);
  await expect(page.locator("#dialog")).toHaveAttribute(
    "data-counting",
    "false",
  );
  await expect(page.locator(".result-score")).toHaveText("14 650");
  await page.locator("#again").click();
  await expect(page.locator("#dialog")).not.toBeVisible();
  await expect(page.locator("#score")).toHaveText("0");
});
test("skip and background settle presentation without changing saved score", async ({
  page,
}) => {
  await seed(page);
  await page.locator(".result-total").click();
  await expect(page.locator(".result-score")).toHaveText("14 650");
  await seed(page);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator("#dialog")).toHaveAttribute(
    "data-counting",
    "false",
  );
  await expect(page.locator(".result-score")).toHaveText("14 650");
  const score = await page.evaluate(async () => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    return (await new IndexedSave().load()).profile.game.score;
  });
  expect(score).toBe(14650);
});
test("calm result shows exact score immediately", async ({ page }) => {
  await seed(page, true);
  await expect(page.locator("#dialog")).toHaveAttribute(
    "data-counting",
    "false",
  );
  await expect(page.locator(".result-score")).toHaveText("14 650");
});
