import { test, expect } from "@playwright/test";
test("play, cancel drag, hint receipt, reload and responsive bounds", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("#tray button")).toHaveCount(3);
  await expect(page.locator("#board canvas")).toBeVisible();
  const first = page.locator("#tray button").first(),
    board = page.locator("#board");
  const a = (await first.boundingBox())!,
    b = (await board.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(5, 5);
  await page.mouse.up();
  await expect(page.locator("#score")).toHaveText("0");
  await first.click();
  await board.click({ position: { x: 3, y: 3 } });
  await expect(page.locator("#score")).not.toHaveText("0");
  const score = await page.locator("#score").textContent();
  await page.locator("#hint").click();
  await expect(page.locator("#hint-count")).toHaveText("2");
  await page.reload();
  await expect(page.locator("#score")).toHaveText(score!);
  await expect(page.locator("#hint-count")).toHaveText("2");
  await page.locator("#hint").click();
  await expect(page.locator("#hint-count")).toHaveText("2");
  await page.locator("#pause").click();
  await expect(page.locator("dialog")).toBeVisible();
  await page.locator("#resume").click();
  await expect(page.locator("dialog")).not.toBeVisible();
  for (const size of [
    { width: 320, height: 568 },
    { width: 360, height: 640 },
    { width: 844, height: 390 },
    { width: 640, height: 360 },
    { width: 1024, height: 768 },
  ]) {
    await page.setViewportSize(size);
    await page.waitForTimeout(100);
    const bounds = await page.locator("#board").boundingBox();
    const ad = await page.locator("#ad-slot").boundingBox();
    const hint = await page.locator("#hint").boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(ad!.y + 1);
    expect(hint!.y + hint!.height).toBeLessThanOrEqual(ad!.y + 1);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(size.width);
  }
  expect(errors).toEqual([]);
});
test("real pointer drag places once and orientation cancels", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("#board canvas")).toBeVisible();
  const first = page.locator("#tray button").first(),
    a = (await first.boundingBox())!,
    b = (await page.locator("#board").boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator("#score")).not.toHaveText("0");
  const score = await page.locator("#score").textContent();
  const second = (await page.locator("#tray button").nth(1).boundingBox())!;
  await page.mouse.move(
    second.x + second.width / 2,
    second.y + second.height / 2,
  );
  await page.mouse.down();
  await page.setViewportSize({ width: 844, height: 390 });
  await page.mouse.up();
  await expect(page.locator("#score")).toHaveText(score!);
});
test("backup recovery preserves the last complete profile", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#tray button")).toHaveCount(3);
  await page.locator("#hint").click();
  await expect(page.locator("#hint-count")).toHaveText("2");
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("blocky-classic", 1);
      request.onsuccess = () => {
        const db = request.result,
          tx = db.transaction("save", "readwrite");
        tx.objectStore("save").put({ broken: true }, "current");
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  });
  await page.reload();
  await expect(page.locator("#tray button")).toHaveCount(3);
  await expect(page.locator("#toast")).toContainText("Восстановлена");
  await expect(page.locator("#hint-count")).toHaveText("3");
});
test("captures the working visual direction in portrait and landscape", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("#tray button")).toHaveCount(3);
  await page.evaluate(async () => {
    const rules = await import("/src/core/rules.ts");
    const req = indexedDB.open("blocky-classic", 1);
    await new Promise<void>((resolve) => {
      req.onsuccess = () => resolve();
    });
    const db = req.result;
    const tx = db.transaction("save", "readwrite"),
      store = tx.objectStore("save"),
      read = store.get("current");
    read.onsuccess = () => {
      const p = read.result;
      let g = rules.newGame(1234, p.game.gameId);
      for (let n = 0; n < 11 && g.status === "playing"; n++) {
        for (let slot = 0; slot < 3; slot++) {
          if (g.tray[slot].used) continue;
          const possible = rules.placements(
            g.board,
            rules.shapeById(g.tray[slot].shapeId),
          );
          if (possible.length) {
            const move = possible[(n * 7) % possible.length];
            g = rules.applyMove(g, { slot, ...move }, g.revision).state;
            break;
          }
        }
      }
      store.put(
        { ...p, revision: p.revision + 1, game: g, best: g.score },
        "current",
      );
    };
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await page.reload();
  await expect(page.locator("#board canvas")).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: "docs/qa/preview-portrait.png" });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: "docs/qa/preview-landscape.png" });
});
