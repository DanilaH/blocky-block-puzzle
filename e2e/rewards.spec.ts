import { test, expect, type Page } from "@playwright/test";
test.use({ video: { mode: "on", size: { width: 390, height: 844 } } });
async function setup(page: Page, kind = "record") {
  await page.goto("/");
  await page.locator(".piece").first().waitFor();
  await page.evaluate(async (kind) => {
    const { newGame } = await import("/src/core/rules.ts");
    const { dayKey } = await import("/src/core/profile.ts");
    const r = indexedDB.open("blocky-classic", 1);
    await new Promise<void>((ok) => (r.onsuccess = () => ok()));
    const tx = r.result.transaction("save", "readwrite"),
      s = tx.objectStore("save"),
      q = s.get("current");
    q.onsuccess = () => {
      const p = q.result;
      p.tutorialStep = 4;
      p.game = newGame(1234, "reward-test");
      p.game.tray = [0, 1, 2].map((i) => ({
        shapeId: "S1-0",
        used: false,
        color: i + 1,
      }));
      for (let x = 1; x < 8; x++) p.game.board[x] = 3;
      p.game.board[63] = 2;
      if (kind === "two") for (let x = 1; x < 8; x++) p.game.board[56 + x] = 3;
      p.hint = null;
      p.best = 5;
      p.freeDay = dayKey();
      p.freeHints = kind === "depleted" ? 0 : 3;
      p.earnedHints = 0;
      p.settings.calm = kind === "calm";
      p.revision++;
      s.put(p, "current");
    };
    await new Promise<void>((ok) => (tx.oncomplete = () => ok()));
    r.result.close();
  }, kind);
  await page.reload();
  await page.locator("#board canvas").waitFor();
}
async function put(page: Page, slot: number, x: number, y: number) {
  await page.locator(".piece").nth(slot).click();
  const b = (await page.locator("#board").boundingBox())!;
  await page.locator("#board").click({
    position: { x: ((x + 0.3) * b.width) / 8, y: ((y + 0.3) * b.height) / 8 },
  });
}
test("important reward survives rapid moves with converging score; pause clears it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const kind of ["record", "calm"]) {
    await setup(page, kind);
    await page.evaluate(() => {
      const burst = document.querySelector("#burst")!;
      (window as any).rewardAt700 = null;
      const observer = new MutationObserver(() => {
        if (!burst.textContent?.includes("Новый рекорд")) return;
        observer.disconnect();
        setTimeout(() => {
          (window as any).rewardAt700 = burst.textContent;
        }, 700);
      });
      observer.observe(burst, { childList: true });
    });
    await put(page, 0, 0, 0);
    await expect(page.locator("#burst")).toContainText("Новый рекорд");
    await put(page, 1, 2, 2);
    await expect(page.locator("#burst")).toContainText("Новый рекорд");
    await expect
      .poll(() => page.evaluate(() => (window as any).rewardAt700))
      .toContain("Новый рекорд");
    await expect(page.locator("#score")).toHaveText("12");
    if (kind === "record")
      await page.screenshot({ path: "docs/qa/feel-0.8/rapid-record.png" });
    await page.locator("#pause").click();
    await expect(page.locator("#burst")).toHaveText("");
    await page.locator("#resume").click();
    await page.waitForTimeout(400);
    await expect(page.locator("#burst")).toHaveText("");
  }
});
test("reward stays inside board without intersecting score throughout animation", async ({
  page,
}) => {
  for (const [width, height] of [
    [320, 568],
    [568, 320],
    [640, 360],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await setup(page);
    await put(page, 0, 0, 0);
    await expect(page.locator("#burst")).toContainText("Новый рекорд");
    const samples = await page.evaluate(async () => {
      const data = [];
      const start = performance.now();
      while (performance.now() - start < 800) {
        const a = document.querySelector("#score")!.getBoundingClientRect(),
          b = document.querySelector(".reward-praise")!.getBoundingClientRect(),
          board = document.querySelector("#board")!.getBoundingClientRect();
        const overlap = (x: DOMRect, y: DOMRect) =>
          Math.min(x.right, y.right) > Math.max(x.left, y.left) &&
          Math.min(x.bottom, y.bottom) > Math.max(x.top, y.top);
        const burst = document.querySelector(".reward-praise")!;
        const time = Number(burst.getAnimations()[0]?.currentTime ?? -1);
        data.push({
          score: overlap(a, b),
          board:
            b.left >= board.left &&
            b.right <= board.right &&
            b.top >= board.top &&
            b.bottom <= board.bottom,
          time,
          opacity: Number(getComputedStyle(burst).opacity),
        });
        await new Promise(requestAnimationFrame);
      }
      return data;
    });
    expect(samples.every((s) => !s.score && s.board)).toBe(true);
    const readable = samples.filter((s) => s.time >= 400 && s.time <= 1000);
    expect(readable.length).toBeGreaterThan(0);
    expect(readable.every((s) => s.opacity > 0.95)).toBe(true);
    const board = (await page.locator("#board").boundingBox())!,
      ad = (await page.locator("#ad-slot").boundingBox())!,
      hint = (await page.locator("#hint").boundingBox())!;
    expect(board.y).toBeGreaterThanOrEqual(0);
    expect(hint.y + hint.height).toBeLessThanOrEqual(ad.y);
    if (width > height) expect(board.width).toBeGreaterThanOrEqual(244);
    await page.screenshot({
      path: `docs/qa/feel-0.8/reward-${width}x${height}.png`,
    });
  }
});
test("depleted and cached hint labels survive focus changes", async ({
  page,
}) => {
  await setup(page, "depleted");
  await expect(page.locator("#hint-label")).toHaveText("Подсказки завтра");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator("#hint-label")).toHaveText("Подсказки завтра");
  await setup(page);
  await page.locator("#hint").click();
  await expect(page.locator("#hint-count")).toHaveText("2");
  await expect(page.locator("#hint-label")).toHaveText("Показать ход");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator("#hint-label")).toHaveText("Показать ход");
  await expect(page.locator("#hint-count")).toHaveText("2");
});
test("two important events overlap; background clears presentation", async ({
  page,
}) => {
  await setup(page, "two");
  await put(page, 0, 0, 0);
  await expect(page.locator("#burst")).toContainText("Новый рекорд");
  await put(page, 1, 0, 7);
  await expect(page.locator("#burst")).toContainText("Новый рекорд");
  await expect(page.locator("#burst")).toContainText("Чистое поле");
  await expect(page.locator(".reward-event")).toHaveCount(2);
  await expect(page.locator("#score")).toHaveText("127");
  await setup(page, "two");
  await put(page, 0, 0, 0);
  await put(page, 1, 0, 7);
  await expect(page.locator("#score")).toHaveText("127");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForTimeout(1300);
  await expect(page.locator("#burst")).toHaveText("");
});
