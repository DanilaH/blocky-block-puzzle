import { test, expect, type Page } from "@playwright/test";
test.use({ video: { mode: "on", size: { width: 390, height: 844 } } });
async function fixture(page: Page, kind = "base") {
  await page.goto("/");
  await expect(page.locator("#tray button")).toHaveCount(3);
  await page.evaluate(async (kind) => {
    const { newGame } = await import("/src/core/rules.ts");
    const req = indexedDB.open("blocky-classic", 1);
    await new Promise<void>((r) => (req.onsuccess = () => r()));
    const db = req.result,
      tx = db.transaction("save", "readwrite"),
      s = tx.objectStore("save"),
      read = s.get("current");
    read.onsuccess = () => {
      const p = read.result;
      p.tutorialStep = 4;
      p.game = newGame(1234, p.game.gameId);
      p.best = 1000;
      p.hint = null;
      p.settings.calm = false;
      p.game.tray = [
        { shapeId: "I5-1", color: 1, used: false },
        { shapeId: "O3-0", color: 4, used: false },
        { shapeId: "S1-0", color: 2, used: false },
      ];
      if (kind !== "base") {
        p.game.tray = p.game.tray.map((x) => ({ ...x, shapeId: "S1-0" }));
        p.game.board = Array(64).fill(0);
        for (let i = 1; i < 8; i++) p.game.board[i] = (i % 6) + 1;
        if (kind === "cross")
          for (let i = 1; i < 8; i++) p.game.board[i * 8] = (i % 6) + 1;
        if (kind === "triple") {
          for (let y = 1; y < 3; y++)
            for (let x = 1; x < 8; x++) p.game.board[y * 8 + x] = (x % 6) + 1;
          p.game.tray[0].shapeId = "I3-1";
        }
        if (kind !== "allClear") p.game.board[63] = 3;
      }
      if (kind === "record") p.best = 5;
      if (kind === "over") {
        p.game.board = Array.from({ length: 64 }, (_, i) =>
          ((i % 8) + Math.floor(i / 8)) % 2 ? 3 : 0,
        );
        p.game.tray = p.game.tray.map((x) => ({ ...x, shapeId: "O3-0" }));
        p.game.status = "over";
      }
      p.revision++;
      s.put(p, "current");
    };
    await new Promise<void>((r, j) => {
      tx.oncomplete = () => r();
      tx.onerror = () => j(tx.error);
    });
    db.close();
  }, kind);
  await page.reload();
  await expect(page.locator("#board canvas")).toBeVisible();
  await expect(page.locator("#app")).not.toHaveAttribute("aria-busy", "true");
}
test("keyboard selection and rejected tap preserve control", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);
  const single = page.locator("#tray button").nth(2);
  await single.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#score")).toHaveText("0");
  await page.keyboard.press("Enter");
  await expect(page.locator("#score")).toHaveText("1");
  await page.locator("#tray button").nth(1).click();
  await page.locator("#board").click({ position: { x: 4, y: 4 } });
  await expect(page.locator("#score")).toHaveText("1");
  await expect(page.locator("#tray button").nth(1)).toHaveClass(/selected/);
  await page.locator("#board").click({ position: { x: 120, y: 120 } });
  await expect(page.locator("#score")).toHaveText("10");
});
test("all shapes stay inside slots through rotation; dialog actions remain visible", async ({
  page,
}) => {
  await fixture(page);
  for (const [width, height] of [
    [390, 844],
    [320, 568],
    [360, 640],
    [844, 390],
    [640, 360],
    [768, 1024],
    [1024, 768],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(120);
    const violations = await page.evaluate(
      () =>
        [...document.querySelectorAll(".piece .mini-shape")].filter((e) => {
          const a = e.getBoundingClientRect(),
            b = e.parentElement!.getBoundingClientRect();
          return (
            a.x < b.x - 1 ||
            a.y < b.y - 1 ||
            a.right > b.right + 1 ||
            a.bottom > b.bottom + 1
          );
        }).length,
    );
    expect(violations).toBe(0);
    const board = (await page.locator("#board").boundingBox())!,
      tray = (await page.locator("#tray").boundingBox())!,
      hint = (await page.locator("#hint").boundingBox())!,
      ad = (await page.locator("#ad-slot").boundingBox())!;
    if (height > width) expect(tray.y).toBeGreaterThan(board.y + board.height);
    expect(hint.y + hint.height).toBeLessThanOrEqual(ad.y + 1);
    await page.screenshot({
      path: `docs/qa/feel-0.8/polish-${width}x${height}.png`,
    });
  }
  await page.setViewportSize({ width: 640, height: 360 });
  await page.locator("#pause").click();
  for (const id of ["resume", "rules", "restart"]) {
    const r = (await page.locator("#" + id).boundingBox())!;
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.y + r.height).toBeLessThanOrEqual(360);
  }
  await page.screenshot({ path: "docs/qa/feel-0.8/polish-pause.png" });
  await page.locator("#rules").click();
  const b = (await page.locator("#back-pause").boundingBox())!;
  expect(b.y + b.height).toBeLessThan(360);
  await page.screenshot({ path: "docs/qa/feel-0.8/polish-rules.png" });
});
test("hint identifies source; pause cancels all cosmetic animations", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);
  await page.locator("#hint").click();
  await expect(page.locator(".hinted")).toHaveCount(1);
  const toast = (await page.locator("#toast").boundingBox())!,
    hint = (await page.locator("#hint").boundingBox())!;
  expect(toast.y + toast.height).toBeLessThan(hint.y);
  await fixture(page, "cross");
  await page.locator("#tray button").first().click();
  await page.locator("#board").click({ position: { x: 4, y: 4 } });
  await page.locator("#pause").click();
  await expect(page.locator("#burst")).toHaveText("");
  expect(
    await page.evaluate(
      () =>
        document.getAnimations().filter((a) => {
          const target = (a.effect as KeyframeEffect)?.target;
          return target instanceof Element && !target.closest("dialog");
        }).length,
    ),
  ).toBe(0);
  await expect
    .poll(() => page.evaluate(() => document.getAnimations().length))
    .toBe(0);
});
test("recorded showcase: placement, return, clear hierarchy and calm mode", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);
  const p = (await page.locator("#tray button").first().boundingBox())!;
  await page.mouse.move(p.x + p.width / 2, p.y + p.height / 2);
  await page.mouse.down();
  await page.mouse.move(8, 8, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  for (const kind of ["line", "cross", "triple", "allClear", "record"]) {
    await fixture(page, kind);
    await page.locator("#tray button").first().click();
    await page.locator("#board").click({ position: { x: 4, y: 4 } });
    await page.waitForTimeout(70);
    await page.screenshot({ path: `docs/qa/feel-0.8/polish-${kind}.png` });
    await page.waitForTimeout(800);
  }
  await fixture(page, "over");
  await expect(page.locator("#again")).toBeVisible();
  await page.screenshot({ path: "docs/qa/feel-0.8/polish-result.png" });
  await page.locator("#look-board").click();
  await expect(page.locator("#play-again")).toBeVisible();
  await page.screenshot({ path: "docs/qa/feel-0.8/polish-result-board.png" });
  await page.locator("#play-again").click();
  await expect(page.locator("#score")).toHaveText("0");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await fixture(page, "cross");
  await page.locator("#tray button").first().click();
  await page.locator("#board").click({ position: { x: 4, y: 4 } });
  await page.screenshot({ path: "docs/qa/feel-0.8/polish-calm.png" });
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
});

test("touch can place at bottom edge in both orientations", async ({
  page,
}) => {
  for (const [width, height] of [
    [390, 844],
    [640, 360],
  ]) {
    await page.setViewportSize({ width, height });
    await fixture(page);
    const p = (await page.locator("#tray button").first().boundingBox())!,
      b = (await page.locator("#board").boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: p.x + p.width / 2, y: p.y + p.height / 2 }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: b.x + b.width / 16, y: b.y + b.height - 1 }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect(page.locator("#score")).toHaveText("5");
    await cdp.detach();
  }
});
