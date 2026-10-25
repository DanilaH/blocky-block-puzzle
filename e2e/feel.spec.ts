import { test, expect, type Page } from "@playwright/test";
async function fixture(page: Page, kind = "normal") {
  await page.goto("/");
  await expect(page.locator(".piece")).toHaveCount(3);
  await page.evaluate(async (kind) => {
    const { newGame } = await import("/src/core/rules.ts");
    const { dayKey } = await import("/src/core/profile.ts");
    const r = indexedDB.open("blocky-classic", 1);
    await new Promise<void>((resolve) => (r.onsuccess = () => resolve()));
    const db = r.result,
      tx = db.transaction("save", "readwrite"),
      s = tx.objectStore("save"),
      read = s.get("current");
    read.onsuccess = () => {
      const p = read.result;
      p.tutorialStep = 4;
      p.game = newGame(1234, p.game.gameId);
      p.hint = null;
      p.best = 150;
      p.freeDay = dayKey();
      p.freeHints = kind === "no-hints" ? 0 : 3;
      p.earnedHints = 0;
      p.settings.calm = false;
      p.game.score = 100;
      p.game.moves = 12;
      p.game.tray = [
        { shapeId: "I2-1", color: 1, used: false },
        { shapeId: "I2-1", color: 2, used: false },
        { shapeId: "S1-0", color: 6, used: false },
      ];
      if (kind === "record") {
        for (let y = 0; y < 4; y++)
          for (let x = 1; x < 8; x++) p.game.board[y * 8 + x] = y + 1;
        p.game.board[63] = 3;
      }
      if (kind === "end") {
        p.game.board = Array.from({ length: 64 }, (_, i) =>
          ((i % 8) + Math.floor(i / 8)) % 2 ? 3 : 0,
        );
        for (let i = 1; i < 8; i++) p.game.board[i] = 1;
        p.game.tray = [
          { shapeId: "S1-0", color: 1, used: false },
          { shapeId: "O3-0", color: 2, used: false },
          { shapeId: "O3-0", color: 6, used: false },
        ];
        p.best = 105;
      }
      p.revision++;
      s.put(p, "current");
    };
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, kind);
  await page.reload();
  await expect(page.locator("#board canvas")).toBeVisible();
}
async function lastMove(page: Page) {
  await page.locator(".piece").first().click();
  await page.locator("#board").click({ position: { x: 4, y: 4 } });
  await expect(page.locator("#score")).toHaveText("111");
}
test("final clear completes before result; Escape returns to final board; reload keeps result", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page, "end");
  await lastMove(page);
  await expect(page.locator("dialog")).not.toBeVisible();
  await expect(page.locator("#burst")).toContainText("Новый рекорд");
  await expect(page.locator("#again")).toBeVisible();
  await expect(page.locator(".result-heading")).toHaveText("Лучший результат");
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog")).not.toBeVisible();
  await expect(page.locator("#play-again")).toBeVisible();
  await page.reload();
  await expect(page.locator("#again")).toBeVisible();
  await page.locator("#look-board").click();
  await expect(page.locator("dialog")).not.toBeVisible();
});
test("interrupted ending resumes once; nested Back returns to pause", async ({
  page,
}) => {
  await fixture(page, "end");
  await lastMove(page);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.waitForTimeout(750);
  await expect(page.locator("dialog")).not.toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator("#again")).toBeVisible();
  await page.locator("#again").click();
  await page.locator("#pause").click();
  await page.locator("#rules").click();
  await page.keyboard.press("Escape");
  await expect(page.locator("#resume")).toBeVisible();
  await page.locator("#restart").click();
  await page.keyboard.press("Escape");
  await expect(page.locator("#resume")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog")).not.toBeVisible();
});
test("record survives recent combo and drag source returns after cancel", async ({
  page,
}) => {
  await fixture(page, "record");
  const b = (await page.locator("#board").boundingBox())!;
  await page.locator(".piece").first().click();
  await page.locator("#board").click({ position: { x: 4, y: 4 } });
  await expect(page.locator("#score")).toHaveText("142");
  await expect(page.locator("#burst")).toContainText("Комбо");
  await page.locator(".piece").nth(1).click();
  await page
    .locator("#board")
    .click({ position: { x: 4, y: b.width / 4 + 4 } });
  await expect(page.locator("#score")).toHaveText("194");
  await expect(page.locator("#burst")).toContainText("Новый рекорд");
  const p = (await page.locator(".piece").nth(2).boundingBox())!;
  await page.mouse.move(p.x + p.width / 2, p.y + p.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await expect(page.locator(".piece.selected .mini-shape")).toHaveCSS(
    "opacity",
    "0.16",
  );
  await page.mouse.move(2, 2);
  await page.mouse.up();
  await expect(page.locator(".piece").nth(2).locator(".mini-shape")).toHaveCSS(
    "opacity",
    "1",
  );
});
test("landscape messages remain visible and tablet uses available width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 568, height: 320 });
  await fixture(page, "no-hints");
  await expect(page.locator("#hint-label")).toBeVisible();
  await page.locator("#hint").click();
  await expect(page.locator("#toast")).toBeVisible();
  await expect(page.locator("#toast")).toContainText("закончились");
  const toast = (await page.locator("#toast").boundingBox())!,
    hint = (await page.locator("#hint").boundingBox())!,
    ad = (await page.locator("#ad-slot").boundingBox())!;
  expect(toast.y).toBeGreaterThanOrEqual(hint.y + hint.height);
  expect(toast.y + toast.height).toBeLessThanOrEqual(ad.y);
  await page.screenshot({ path: "docs/qa/feel-0.7/landscape-status.png" });
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForTimeout(150);
  expect((await page.locator("#board").boundingBox())!.width).toBeGreaterThan(
    450,
  );
  await page.screenshot({ path: "docs/qa/feel-0.7/tablet.png" });
});
test("save errors stay inside settings and restart dialogs", async ({
  page,
}) => {
  await fixture(page);
  await page.locator("#pause").click();
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    Reflect.set(window, "restoreWrites", () => {
      IDBDatabase.prototype.transaction = original;
    });
    IDBDatabase.prototype.transaction = function (...args) {
      if (args[1] === "readwrite") throw new Error("Injected save failure");
      return original.apply(this, args);
    };
  });
  await page.locator("#sound").click();
  await expect(page.locator(".dialog-status")).toHaveText(
    "Настройка не сохранена",
  );
  await expect(page.locator("#sound")).toBeChecked();
  await page.locator("#restart").click();
  await page.locator("#new-game").click();
  await expect(page.locator(".dialog-status")).toContainText(
    "Предыдущая сохранена",
  );
  await expect(page.locator("#score")).toHaveText("100");
  await page.screenshot({ path: "docs/qa/feel-0.7/save-error.png" });
  await page.evaluate(() => Reflect.get(window, "restoreWrites")());
  await page.locator("#new-game").click();
  await expect(page.locator("dialog")).not.toBeVisible();
  await expect(page.locator("#score")).toHaveText("0");
});
