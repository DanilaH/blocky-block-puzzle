import { test, expect, type Page } from "@playwright/test";
async function put(page: Page, slot: number, x: number, y: number) {
  await page.locator(".piece").nth(slot).click();
  const b = await page.locator("#board").boundingBox();
  await page.locator("#board").click({
    position: {
      x: ((x + 0.3) * b!.width) / 8,
      y: ((y + 0.3) * b!.height) / 8,
    },
  });
}
async function profile(page: Page) {
  return page.evaluate(async () => {
    const r = indexedDB.open("blocky-classic", 1);
    await new Promise<void>((resolve) => (r.onsuccess = () => resolve()));
    const q = r.result.transaction("save").objectStore("save").get("current");
    await new Promise<void>((resolve) => (q.onsuccess = () => resolve()));
    r.result.close();
    return q.result;
  });
}
test("tutorial persists steps, rejects wrong targets and never changes real game or credits", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("#lesson")).toBeVisible();
  const original = await profile(page);
  await put(page, 0, 0, 0);
  await expect(page.locator("#lesson-text")).toContainText("1 / 3");
  await put(page, 0, 3, 4);
  await expect(page.locator("#lesson-text")).toContainText("2 / 3");
  await page.reload();
  await expect(page.locator("#lesson-text")).toContainText("2 / 3");
  await page.locator("#pause").click();
  await page.locator("#resume").click();
  await put(page, 1, 6, 4);
  await expect(page.locator("#lesson-text")).toContainText("3 / 3");
  await put(page, 2, 2, 2);
  await expect(page.locator("#lesson-skip")).toHaveText("Начать игру");
  await expect(page.locator(".piece.used")).toHaveCount(0);
  await page.screenshot({ path: "docs/qa/feel-0.7/tutorial-complete.png" });
  await page.locator("#lesson-skip").click();
  await expect(page.locator("#lesson")).toBeHidden();
  await page.reload();
  await expect(page.locator("#lesson")).toBeHidden();
  const final = await profile(page);
  expect(final.game).toEqual(original.game);
  expect(final.best).toBe(0);
  expect(final.freeHints).toBe(3);
  expect(final.tutorialStep).toBe(4);
});
test("short landscape keeps board and lesson controls above banner", async ({
  page,
}) => {
  await page.setViewportSize({ width: 568, height: 320 });
  await page.goto("/");
  await expect(page.locator("#lesson")).toBeVisible();
  const board = (await page.locator("#board").boundingBox())!;
  const skip = (await page.locator("#lesson-skip").boundingBox())!;
  const ad = (await page.locator("#ad-slot").boundingBox())!;
  expect(board.width).toBeGreaterThanOrEqual(240);
  expect(skip.y + skip.height).toBeLessThanOrEqual(ad.y);
  await page.screenshot({ path: "docs/qa/feel-0.7/tutorial-landscape.png" });
  await page.locator("#lesson-skip").click();
  await expect(page.locator("#lesson")).toBeHidden();
  await page.screenshot({ path: "docs/qa/feel-0.7/landscape-small.png" });
});
test("availability updates after a clear; streak label is not a multiplier", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#lesson-skip").click();
  await page.evaluate(async () => {
    const r = indexedDB.open("blocky-classic", 1);
    await new Promise<void>((ok) => (r.onsuccess = () => ok()));
    const tx = r.result.transaction("save", "readwrite"),
      s = tx.objectStore("save"),
      q = s.get("current");
    q.onsuccess = () => {
      const p = q.result;
      p.game.board = Array(64).fill(2);
      p.game.board[0] = 0;
      p.game.tray = [
        { shapeId: "S1-0", used: false, color: 1 },
        { shapeId: "O3-0", used: false, color: 4 },
        { shapeId: "I5-1", used: false, color: 3 },
      ];
      p.game.streak = 2;
      p.revision++;
      s.put(p, "current");
    };
    await new Promise<void>((ok) => (tx.oncomplete = () => ok()));
    r.result.close();
  });
  await page.reload();
  await expect(page.locator(".piece.unavailable")).toHaveCount(2);
  await expect(page.locator("#streak")).toHaveText("Серия 2");
  await put(page, 0, 0, 0);
  await expect(page.locator(".piece.unavailable")).toHaveCount(0);
  await expect(page.locator("#streak")).toHaveText("Серия 3");
  await expect(page.locator("#burst")).toHaveAttribute(
    "data-tier",
    "all-clear",
  );
});

test("failed tutorial save does not advance; replay and skip preserve a started game", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#lesson")).toBeVisible();
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    Reflect.set(window, "restoreWrites", () => {
      IDBDatabase.prototype.transaction = original;
    });
    IDBDatabase.prototype.transaction = function (...args) {
      if (args[1] === "readwrite") throw new Error("Injected failure");
      return original.apply(this, args);
    };
  });
  await put(page, 0, 3, 4);
  await expect(page.locator("#toast")).toContainText("Не удалось сохранить");
  expect((await profile(page)).tutorialStep).toBe(0);
  await page.locator("#lesson-skip").click();
  await expect(page.locator("#lesson")).toBeVisible();
  await page.evaluate(() => Reflect.get(window, "restoreWrites")());
  await page.locator("#lesson-skip").click();
  await expect(page.locator("#lesson")).toBeHidden();
  await put(page, 0, 0, 0);
  await expect(page.locator("#score")).not.toHaveText("0");
  const started = await profile(page);
  expect(started.game.moves).toBe(1);
  await page.locator("#pause").click();
  await page.locator("#rules").click();
  await page.locator("#practice").click();
  await expect(page.locator("#lesson")).toBeVisible();
  await put(page, 0, 3, 4);
  await expect(page.locator("#lesson-text")).toContainText("2 / 3");
  await page.reload();
  await expect(page.locator("#lesson-text")).toContainText("2 / 3");
  await page.locator("#lesson-skip").click();
  await expect(page.locator("#lesson")).toBeHidden();
  expect((await profile(page)).game).toEqual(started.game);
});
