import { test, expect } from "@playwright/test";
async function fixture(page, lost = false) {
  await page.goto("/");
  await expect(page.locator("#app")).not.toHaveAttribute("aria-busy", "true");
  await page.evaluate(async (lost) => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    const { newGame } = await import("/src/core/rules.ts");
    const a = new IndexedSave(),
      p = (await a.load()).profile;
    p.revision++;
    p.tutorialStep = 4;
    p.settings.calm = false;
    p.best = p.festivalBest = 500;
    p.game = {
      ...newGame(1234, "uiux-027"),
      moves: 12,
      score: 420,
      streak: 5,
      streakMisses: lost ? 2 : 0,
      scoringVersion: "festival-v3",
    };
    p.game.tray = [0, 1, 2].map((i) => ({
      shapeId: "S1-0",
      color: i + 1,
      used: false,
    }));
    if (!lost)
      for (let i = 1; i < 8; i++) {
        p.game.board[i] = 1;
        p.game.board[i * 8] = 2;
      }
    await a.write(p);
  }, lost);
  await page.reload();
  await expect(page.locator("#app")).not.toHaveAttribute("aria-busy", "true");
}
test("compact pause exposes settings and diagnostics is optional", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 480 });
  await fixture(page);
  await page.locator("#pause").click();
  for (const id of ["sound", "haptics", "calm"]) {
    const input = page.locator("#" + id);
    const box = await input.boundingBox();
    const body = await page.locator(".dialog-body").boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(body!.y);
    expect(box!.y + box!.height).toBeLessThanOrEqual(body!.y + body!.height);
  }
  await expect(page.locator("#perf-start")).not.toBeVisible();
  await page.getByText("Диагностика", { exact: true }).click();
  await expect(page.locator("#perf-start")).toBeVisible();
  await expect(page.locator(".dialog-actions > button")).toHaveCount(1);
});
test("compound reward preserves score, record and distinct destinations", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);
  await page.evaluate(() => {
    (window as any).scoreSamples = [];
    const sample = () => {
      const n = (id: string) =>
        Number(document.getElementById(id)!.textContent!.replace(/\D/g, ""));
      (window as any).scoreSamples.push({ score: n("score"), best: n("best") });
    };
    new MutationObserver(sample).observe(document.querySelector("#score")!, {
      childList: true,
    });
  });
  await page.locator(".piece").first().click();
  await page.locator("#board").click({ position: { x: 5, y: 5 } });
  await expect(page.locator("#burst")).toContainText("×5");
  await expect(page.locator("#burst")).toContainText("Чистое поле");
  await expect(page.locator(".best .hud-notice")).toContainText("Новый рекорд");
  await expect(page.locator("#score")).toHaveText("2 921");
  await expect(page.locator("#best")).toHaveText("2 921");
  const samples = await page.evaluate(() => (window as any).scoreSamples);
  expect(samples.length).toBeGreaterThan(2);
  expect(samples.every((s) => s.best === Math.max(500, s.score))).toBe(true);
  expect(await page.locator(".reward-event[data-tier=chain]").count()).toBe(0);
  await page.locator("#pause").click();
  await expect(page.locator(".hud-notice")).toHaveCount(0);
});
test("tap selection is explicit and series closure permits the next move", async ({
  page,
}) => {
  await fixture(page, true);
  await page.locator(".piece").first().click();
  await expect(page.locator(".piece.selected")).toHaveCSS(
    "outline-style",
    "solid",
  );
  await expect(page.locator("#caption")).toContainText("левый верхний");
  await page.locator("#board").click({ position: { x: 5, y: 5 } });
  await expect(page.locator('[data-tier="series-end"]')).toContainText(
    "Серия 5 завершена",
  );
  await page.locator(".piece").nth(1).click();
  const board = (await page.locator("#board").boundingBox())!;
  await page.locator("#board").click({ position: { x: board.width / 8 + 5, y: 5 } });
  await expect(page.locator("#score")).toHaveText("422");
});
