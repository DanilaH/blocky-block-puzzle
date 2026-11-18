// Prepared full-clear fixture. Browser visual evidence, not a human playtest.
import { createServer } from "vite";
import { chromium } from "playwright";
import fs from "node:fs/promises";
const out = process.env.CAPTURE_DIR;
if (!out) throw Error("CAPTURE_DIR required");
await fs.mkdir(out, { recursive: true });
const server = await createServer({
  server: { port: 5195, host: "127.0.0.1" },
});
await server.listen();
const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    recordVideo: { dir: out, size: { width: 390, height: 844 } },
  });
  const page = await ctx.newPage();
  await page.goto("http://127.0.0.1:5195");
  await page.locator("#lesson-skip").click();
  await page.evaluate(async () => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    const { newGame } = await import("/src/core/rules.ts");
    const a = new IndexedSave(),
      p = (await a.load()).profile;
    p.revision++;
    delete p.metrics;
    p.hint = null;
    p.tutorialStep = 4;
    p.settings.calm = false;
    p.best = p.festivalBest = 12400;
    p.game = {
      ...newGame(7, "reward42", "flow-v4"),
      score: 12400,
      streak: 10,
      moves: 20,
    };
    for (let i = 0; i < 7; i++) p.game.board[i] = 4;
    p.game.tray = [0, 1, 2].map((i) => ({
      shapeId: "S1-0",
      color: 4,
      used: false,
    }));
    await a.write(p);
  });
  await page.reload();
  await page.locator(".mini-cell").first().waitFor();
  await page.waitForTimeout(800);
  await page.locator(".piece").first().click();
  const b = await page.locator("#board").boundingBox();
  await page
    .locator("#board")
    .click({ position: { x: (b.width * 7.5) / 8, y: (b.height * 0.5) / 8 } });
  await page.locator(".reward-emblem").waitFor();
  await page.screenshot({ path: out + "/all-clear.png" });
  await page.waitForTimeout(3000);
  const video = page.video();
  await ctx.close();
  await video.saveAs(out + "/rewards.webm");
} finally {
  await browser.close();
  await server.close();
}
