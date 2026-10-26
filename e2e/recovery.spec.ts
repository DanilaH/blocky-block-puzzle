import { test, expect } from "@playwright/test";
test.use({ viewport: { width: 390, height: 844 } });
async function ready(page) {
  await page.goto("/");
  await page.locator("#lesson-skip").click();
  await page.evaluate(async () => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    const a = new IndexedSave(),
      p = (await a.load()).profile;
    p.revision++;
    p.game.tray = [0, 1, 2].map((i) => ({
      shapeId: "S1-0",
      color: i + 1,
      used: false,
    }));
    await a.write(p);
  });
  await page.reload();
  await page.locator("#board canvas").waitFor();
}
async function delay(page) {
  await page.evaluate(async () => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    const w = IndexedSave.prototype.write;
    IndexedSave.prototype.write = async function (p) {
      await new Promise((r, j) => {
        window.finish = r;
        window.fail = () => j(new Error("test failure"));
      });
      return w.call(this, p);
    };
  });
}
for (const fail of [false, true])
  test(`pause reports pending move; restart blocked; failure=${fail}`, async ({
    page,
  }) => {
    await ready(page);
    await delay(page);
    await page.locator(".piece").first().click();
    await page.locator("#board").click({ position: { x: 20, y: 20 } });
    await page.locator("#pause").click();
    await expect(page.locator("#save-status")).toHaveText("Сохраняем…");
    await expect(page.locator("#restart")).toBeDisabled();
    await expect(page.locator("#sound")).toBeDisabled();
    await page.evaluate((f) => (f ? window.fail() : window.finish()), fail);
    await expect(page.locator("#restart")).toBeEnabled();
    await expect(page.locator("#save-status")).toHaveText("Партия сохранена");
    if (fail)
      await expect(page.locator(".dialog-status")).toContainText(
        "Не удалось сохранить ход",
      );
    await page.locator("#resume").click();
    await expect(page.locator("#score")).toHaveText(fail ? "0" : "1");
    await page.reload();
    await expect(page.locator("#score")).toHaveText(fail ? "0" : "1");
  });
for (const fail of [false, true])
  test(`hint remains busy through save; failure=${fail}`, async ({ page }) => {
    await ready(page);
    await delay(page);
    await page.locator("#hint").click();
    await page.waitForFunction(() => typeof window.finish === "function");
    await expect(page.locator("#hint")).toHaveAttribute("aria-busy", "true");
    await expect(page.locator("#hint")).toBeDisabled();
    await expect(page.locator("#hint-label")).toHaveText("Сохраняем…");
    await expect(page.locator("#hint-count")).toHaveText("3");
    await page.evaluate((f) => (f ? window.fail() : window.finish()), fail);
    await expect(page.locator("#hint")).not.toHaveAttribute(
      "aria-busy",
      "true",
    );
    await expect(page.locator("#hint")).toBeEnabled();
    await expect(page.locator("#hint-count")).toHaveText(fail ? "3" : "2");
    await page.reload();
    await expect(page.locator("#hint-count")).toHaveText(fail ? "3" : "2");
    if (!fail) {
      await page.locator("#hint").click();
      await expect(page.locator("#hint-count")).toHaveText("2");
    }
  });
async function damage(page, both = true) {
  await page.evaluate(async (both) => {
    const db = await new Promise((r, j) => {
      const q = indexedDB.open("blocky-classic", 1);
      q.onsuccess = () => r(q.result);
      q.onerror = j;
    });
    await new Promise((r, j) => {
      const t = db.transaction("save", "readwrite"),
        s = t.objectStore("save");
      s.put({ damaged: "primary" }, "current");
      if (both) s.put({ damaged: "backup" }, "backup");
      t.oncomplete = r;
      t.onerror = j;
    });
    db.close();
  }, both);
  await page.reload();
}
test("damaged copies require confirmation and are archived atomically", async ({
  page,
}) => {
  await ready(page);
  await damage(page);
  await expect(page.locator("h2")).toHaveText("Не удалось восстановить партию");
  await page.locator("#recover").click();
  await expect(page.locator("h2")).toHaveText("Начать с чистого поля?");
  await page.locator("#cancel-recovery").click();
  await expect(page.locator("#recover")).toBeVisible();
  await page.locator("#recover").click();
  await page.locator("#confirm-recovery").click();
  await expect(page.locator("#board canvas")).toBeVisible();
  await expect(page.locator("#score")).toHaveText("0");
  await expect(page.locator("#lesson")).toBeVisible();
  const archive = await page.evaluate(async () => {
    const db = await new Promise((r) => {
      const q = indexedDB.open("blocky-classic", 1);
      q.onsuccess = () => r(q.result);
    });
    return await new Promise((r) => {
      const tx = db.transaction("save"),
        s = tx.objectStore("save"),
        keys = s.getAllKeys(),
        values = s.getAll();
      tx.oncomplete = () => {
        r(
          values.result[
            keys.result.findIndex((k) => String(k).startsWith("damaged:"))
          ],
        );
        db.close();
      };
    });
  });
  expect(archive).toEqual({
    current: { damaged: "primary" },
    backup: { damaged: "backup" },
  });
});
test("recovery cannot overwrite a save repaired by another window", async ({
  page,
}) => {
  await ready(page);
  await damage(page);
  await page.locator("#recover").click();
  await page.evaluate(async () => {
    const { IndexedSave } = await import("/src/platform/save.ts"),
      { createProfile } = await import("/src/core/profile.ts"),
      { newGame } = await import("/src/core/rules.ts");
    const p = createProfile(newGame(123, "repaired"));
    p.best = 500;
    await new IndexedSave().write(p);
  });
  await page.locator("#confirm-recovery").click();
  await expect(page.locator("#recovery-status")).toContainText(
    "уже изменилось",
  );
  await page.locator("#cancel-recovery").click();
  await expect(page.locator("#best")).toHaveText("500");
});
test("valid backup recovers and transient load failure offers no destructive reset", async ({
  page,
}) => {
  await ready(page);
  await damage(page, false);
  await expect(page.locator("#board canvas")).toBeVisible();
  await expect(page.locator("#toast")).toContainText("Восстановлена");
  await page.addInitScript(() => {
    indexedDB.open = () => {
      throw new Error("unavailable");
    };
  });
  await page.reload();
  await expect(page.locator("#retry")).toBeVisible();
  await expect(page.locator("#recover")).toHaveCount(0);
});
test("conflict reloads accepted state and allows next move", async ({
  page,
  context,
}) => {
  await ready(page);
  const other = await context.newPage();
  await other.goto("/");
  await other.locator("#board canvas").waitFor();
  await page.locator(".piece").first().click();
  await page.locator("#board").click({ position: { x: 20, y: 20 } });
  await expect(page.locator("#score")).toHaveText("1");
  await other.locator(".piece").first().click();
  await other.locator("#board").click({ position: { x: 65, y: 20 } });
  await expect(other.locator("#score")).toHaveText("1");
  await expect(other.locator("#toast")).toContainText("другом окне");
  await other.locator(".piece").nth(1).click();
  await other.locator("#board").click({ position: { x: 65, y: 20 } });
  await expect(other.locator("#score")).toHaveText("2");
  await other.close();
});
test("short portrait makes board usable and keeps controls separate", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 480 });
  await ready(page);
  const b = await page.locator("#board").boundingBox(),
    tray = await page.locator("#tray").boundingBox(),
    hint = await page.locator("#hint").boundingBox(),
    ad = await page.locator("#ad-slot").boundingBox();
  // Reserve room for visible tiles as well as their touch targets.
  expect(b.width).toBeGreaterThanOrEqual(210);
  expect(b.x + b.width).toBeLessThanOrEqual(hint.x);
  expect(hint.y + hint.height).toBeLessThanOrEqual(tray.y);
  expect(hint.height).toBeGreaterThanOrEqual(48);
  expect(hint.y + hint.height).toBeLessThan(ad.y - 3);
  expect(tray.y + tray.height).toBeLessThan(ad.y - 3);
  await page.screenshot({ path: "docs/qa/feel-0.12/short-320x480.png" });
});

test("failed recovery rolls back archive and preserves both damaged records", async ({
  page,
}) => {
  await ready(page);
  await damage(page);
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      if (key === "current")
        throw new DOMException("injected quota failure", "QuotaExceededError");
      return put.call(this, value, key);
    };
  });
  await page.locator("#recover").click();
  await page.locator("#confirm-recovery").click();
  await expect(page.locator("#recovery-status")).toContainText(
    "Не удалось записать",
  );
  await expect(page.locator("#confirm-recovery")).toBeEnabled();
  const records = await page.evaluate(async () => {
    const db = await new Promise((r) => {
      const q = indexedDB.open("blocky-classic", 1);
      q.onsuccess = () => r(q.result);
    });
    return await new Promise((r) => {
      const tx = db.transaction("save"),
        s = tx.objectStore("save"),
        keys = s.getAllKeys(),
        values = s.getAll();
      tx.oncomplete = () => {
        r(Object.fromEntries(keys.result.map((k, i) => [k, values.result[i]])));
        db.close();
      };
    });
  });
  expect(records).toEqual({
    current: { damaged: "primary" },
    backup: { damaged: "backup" },
  });
});
