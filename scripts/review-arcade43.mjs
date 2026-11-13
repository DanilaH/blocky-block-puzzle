// Prepared visual fixture and all-theme asset/layout review; not a human playtest.
import { createServer } from "vite";
import { chromium } from "playwright";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const out = process.env.CAPTURE_DIR;
if (!out) throw Error("CAPTURE_DIR required");
await fs.mkdir(out, { recursive: true });
const server = await createServer({
  server: { host: "127.0.0.1", port: 5197 },
});
await server.listen();
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5197");
  await page.locator("#lesson-skip").click();
  await page.evaluate(async () => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    const { newGame } = await import("/src/core/rules.ts");
    const s = new IndexedSave(),
      p = (await s.load()).profile;
    p.revision++;
    p.tutorialStep = 4;
    delete p.metrics;
    p.hint = null;
    p.best = p.festivalBest = 12608;
    p.game = {
      ...newGame(11, "arcade-review", "flow-v4"),
      score: 7366,
      streak: 4,
      moves: 20,
    };
    p.game.board = [
      1, 1, 0, 0, 0, 0, 0, 5, 1, 1, 0, 0, 0, 0, 0, 5, 2, 2, 2, 0, 0, 3, 3, 3, 6,
      6, 6, 0, 0, 0, 5, 0, 6, 0, 0, 0, 0, 5, 5, 0, 3, 3, 0, 2, 0, 0, 1, 1, 3, 3,
      2, 2, 0, 0, 1, 1, 5, 5, 5, 0, 0, 0, 2, 2,
    ];
    await s.write(p);
  });
  await page.reload();
  await page.locator(".mini-cell").first().waitFor();
  await page.waitForTimeout(2200);
  await page.screenshot({ path: out + "/game.png" });
  await page.locator("#pause").click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: out + "/pause.png" });
  await page.locator("#themes").click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: out + "/themes.png" });
  const count = await page.locator("[data-theme]").count();
  for (let i = 0; i < count; i++) {
    const tile = page.locator(`[data-theme="${i}"]`);
    await tile.scrollIntoViewIfNeeded();
    await tile.evaluate(async (el) => {
      await Promise.all(
        [...el.querySelectorAll("img")].map((img) => img.decode()),
      );
    });
    assert(
      await tile.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      "theme card overflow " + i,
    );
  }
  for (const i of [1, 5, 0]) {
    await page.locator(`[data-theme="${i}"]`).click();
    await page.waitForFunction(
      (i) =>
        document
          .querySelector(`[data-theme="${i}"]`)
          ?.getAttribute("aria-pressed") === "true",
      i,
    );
    await page.locator("#back-themes").click();
    await page.locator("#resume").click();
    await page.waitForTimeout(1900);
    await page.screenshot({ path: out + `/theme-${i}.png` });
    await page.locator("#pause").click();
    await page.locator("#themes").click();
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(
    out + "/review.json",
    JSON.stringify(
      {
        themes: count,
        allPreviewImagesDecoded: true,
        cardOverflow: false,
        pageErrors: errors,
        fixture: "prepared",
        viewport: "390x844",
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  await browser.close();
  await server.close();
}
