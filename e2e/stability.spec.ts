import { test, expect, type Page } from "@playwright/test";
test.use({ viewport: { width: 390, height: 844 }, video: "on" });
async function ready(page: Page) {
  await page.goto("/");
  await page.locator("#lesson-skip").click();
  await expect(page.locator("#lesson")).toBeHidden();
}
test("settings serialize visible input and restore confirmed values after a failed write", async ({
  page,
}) => {
  await ready(page);
  await page.evaluate(async () => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    const write = IndexedSave.prototype.write;
    IndexedSave.prototype.write = async function (p) {
      await new Promise((r) => setTimeout(r, 350));
      if ((window as any).failSetting) throw new Error("audit write failure");
      return write.call(this, p);
    };
  });
  await page.locator("#pause").click();
  await page.locator("#sound").uncheck();
  await expect(page.locator("#calm")).toBeDisabled();
  await expect(page.locator("#calm")).not.toBeChecked();
  await page.locator("#calm").check();
  await expect(page.locator("#calm")).toBeEnabled();
  await page.reload();
  await page.locator("#pause").click();
  await expect(page.locator("#sound")).not.toBeChecked();
  await expect(page.locator("#calm")).toBeChecked();
  await page.evaluate(async () => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    IndexedSave.prototype.write = async () => {
      throw new Error("write failed");
    };
  });
  await page.locator("#calm").click();
  await expect(page.locator("#calm")).toBeChecked();
  await expect(page.locator(".dialog-status")).toContainText("не сохранена");
  await expect(page.locator("#sound")).toBeEnabled();
});
test("renderer sleeps through pause and background, resumes after resize and context recovery", async ({
  page,
}) => {
  await ready(page);
  await page.evaluate(async () => {
    const { BoardScene } = await import("/src/game/BoardScene.ts");
    const draw = BoardScene.prototype.draw;
    BoardScene.prototype.draw = function (...args) {
      if (!(window as any).auditGame) {
        (window as any).auditGame = this.game;
        (window as any).frames = 0;
        this.game.events.on("postrender", () => (window as any).frames++);
      }
      return draw.apply(this, args);
    };
  });
  await page.setViewportSize({ width: 391, height: 844 });
  await expect
    .poll(() => page.evaluate(() => !!(window as any).auditGame))
    .toBe(true);
  await page.locator("#pause").click();
  await page.evaluate(() => {
    (window as any).frames = 0;
  });
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => (window as any).frames)).toBe(0);
  await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
  });
  await page.setViewportSize({ width: 568, height: 320 });
  await page.waitForTimeout(200);
  expect(
    await page.evaluate(() => (window as any).auditGame.loop.running),
  ).toBe(false);
  await page.locator("#resume").click();
  await expect
    .poll(() => page.evaluate(() => (window as any).frames))
    .toBeGreaterThan(0);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  expect(
    await page.evaluate(() => (window as any).auditGame.loop.running),
  ).toBe(false);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  expect(
    await page.evaluate(() => (window as any).auditGame.loop.running),
  ).toBe(true);
  await page.evaluate(() => {
    const gl = (window as any).auditGame.renderer.gl;
    (window as any).loseContext = gl.getExtension("WEBGL_lose_context");
    (window as any).loseContext.loseContext();
  });
  await expect
    .poll(() => page.evaluate(() => (window as any).auditGame.loop.running))
    .toBe(false);
  await page.evaluate(() => (window as any).loseContext.restoreContext());
  await expect
    .poll(() => page.evaluate(() => (window as any).auditGame.loop.running))
    .toBe(true);
  await page.screenshot({ path: "docs/qa/feel-0.8/context-restored.png" });
});
test("compact controls keep 48px targets and rules explain points", async ({
  page,
}) => {
  await ready(page);
  for (const [width, height] of [
    [568, 320],
    [640, 360],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    const h = (await page.locator("#hint").boundingBox())!,
      ad = (await page.locator("#ad-slot").boundingBox())!;
    expect(h.height).toBeGreaterThanOrEqual(48);
    expect(h.y + h.height).toBeLessThanOrEqual(ad.y);
  }
  await page.locator("#pause").click();
  await page.locator("#rules").click();
  await expect(page.locator(".dialog-body")).toContainText("100 очков");
  await expect(page.locator(".dialog-body")).toContainText("14 очков");
  await page.screenshot({ path: "docs/qa/feel-0.8/rules-landscape.png" });
  await page.locator("#practice").click();
  await expect(page.locator("#lesson-skip")).toBeVisible();
  const skip = (await page.locator("#lesson-skip").boundingBox())!;
  expect(skip.height).toBeGreaterThanOrEqual(48);
});
