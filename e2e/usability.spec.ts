import { test, expect } from "@playwright/test";
for (const [width, height] of [
  [320, 480],
  [568, 320],
]) {
  test(`recovery actions are reachable without rotating ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.locator("#board canvas").waitFor();
    await page.evaluate(async () => {
      const r = indexedDB.open("blocky-classic", 1);
      const db = await new Promise<any>(
        (ok) => (r.onsuccess = () => ok(r.result)),
      );
      const t = db.transaction("save", "readwrite");
      t.objectStore("save").put({ bad: true }, "current");
      t.objectStore("save").put({ bad: true }, "backup");
      await new Promise((ok) => (t.oncomplete = ok));
      db.close();
    });
    await page.reload();
    await page.locator("#recover").waitFor();
    // No Playwright auto-scroll: normal touch users must see both actions.
    for (const id of ["retry", "recover"]) {
      const r = await page.locator("#" + id).boundingBox();
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.y + r.height).toBeLessThanOrEqual(height);
    }
    await page.locator("#recover").click();
    await page.locator("#cancel-recovery").click();
    await expect(page.locator("#recover")).toBeVisible();
  });
}
test("short portrait keeps useful board size with system insets in lesson and game", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 320, height: 480 });
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", {
    insets: { top: 24, bottom: 24, left: 0, right: 0 },
  });
  await page.goto("/");
  await page.locator("#board canvas").waitFor();
  for (const lesson of [true, false]) {
    if (!lesson) await page.locator("#lesson-skip").click();
    const board = await page.locator("#board").boundingBox(),
      tray = await page.locator("#tray").boundingBox(),
      ad = await page.locator("#ad-slot").boundingBox();
    expect(board.width).toBeGreaterThanOrEqual(200);
    expect(board.y).toBeGreaterThanOrEqual(24);
    expect(board.y + board.height).toBeLessThanOrEqual(tray.y);
    expect(tray.y + tray.height).toBeLessThanOrEqual(ad.y);
  }
});
test("blocked figures explain their state and three rejected drags reveal tap control", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator("#lesson-skip").click();
  await page.evaluate(async () => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    const a = new IndexedSave(),
      q = (await a.load()).profile;
    q.revision++;
    q.game.board = Array.from({ length: 64 }, (_, i) =>
      (i + Math.floor(i / 8)) % 2 ? 4 : 0,
    );
    q.game.tray = ["I5-1", "S1-0", "O3-0"].map((shapeId, i) => ({
      shapeId,
      color: i + 1,
      used: false,
    }));
    await a.write(q);
  });
  await page.reload();
  await page.locator(".piece").first().click();
  await expect(page.locator("#toast")).toContainText("Освободите место");
  const before = await page.locator("#score").innerText();
  for (let i = 0; i < 3; i++) {
    const r = await page.locator(".piece").nth(1).boundingBox();
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
    await page.mouse.down();
    await page.mouse.move(2, 2, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(180);
  }
  await expect(page.locator("#toast")).toContainText("Можно без переноса");
  await expect(page.locator("#score")).toHaveText(before);
});
test("result shows remaining shapes and field review preserves their visibility", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#lesson-skip").click();
  await page.evaluate(async () => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    const a = new IndexedSave(),
      q = (await a.load()).profile;
    q.revision++;
    q.game.board = Array.from({ length: 64 }, (_, i) =>
      (i + Math.floor(i / 8)) % 2 ? 4 : 0,
    );
    q.game.tray = ["I5-1", "O3-0", "I5-0"].map((shapeId, i) => ({
      shapeId,
      color: i + 1,
      used: i === 1,
    }));
    q.game.status = "over";
    await a.write(q);
  });
  await page.reload();
  await expect(page.locator(".result-piece")).toHaveCount(2);
  await expect(page.locator(".result-piece .mini-cell")).toHaveCount(10);
  await page.locator("#look-board").click();
  expect(
    await page
      .locator(".piece.unavailable .mini-shape")
      .first()
      .evaluate((e) => getComputedStyle(e).opacity),
  ).toBe("1");
});
