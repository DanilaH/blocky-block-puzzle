// Production-byte check; no /src imports or DEV hooks. Video is visual evidence,
// never a frame-timing comparison. Run after npm run build.
import { chromium } from "@playwright/test";
import { preview } from "vite";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const out = process.env.CAPTURE_DIR || "/tmp/blocky062-production";
await fs.mkdir(out, { recursive: true });
const server = await preview({
  preview: { host: "127.0.0.1", port: 5198, strictPort: true },
});
const browser = await chromium.launch();
const errors = [];
try {
  const context = await browser.newContext({
    viewport: { width: 392, height: 872 },
    deviceScaleFactor: 2.75,
    isMobile: true,
    hasTouch: true,
    recordVideo: { dir: out, size: { width: 392, height: 872 } },
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    "http://127.0.0.1:5198/?effectsStudy=compact&themeSurfaces=flat",
  );
  await page.waitForFunction(
    () => document.documentElement.dataset.themeSurfaces === "generated",
  );
  assert.equal(await page.getAttribute("html", "data-effects"), "legacy");
  assert.equal(
    await page.evaluate(() => typeof window.__themeSurfaces),
    "undefined",
  );
  const fixture = JSON.parse(
    await fs.readFile("src/diagnostics/phone-clear-fixture.json", "utf8"),
  );
  await page.evaluate(async (f) => {
    const req = indexedDB.open("blocky-classic", 1);
    await new Promise((ok, no) => {
      req.onsuccess = ok;
      req.onerror = no;
    });
    const db = req.result,
      tx = db.transaction("save", "readwrite"),
      s = tx.objectStore("save"),
      r = s.get("current");
    r.onsuccess = () => {
      const p = r.result;
      p.revision++;
      p.game = structuredClone(f.before);
      p.wardrobe = structuredClone(f.beforeWardrobe);
      p.tutorialStep = 4;
      p.best = p.festivalBest = p.progressionBest = 100000;
      p.settings = { ...f.settings, sound: false, haptics: false };
      s.put(p, "current");
    };
    await new Promise((ok, no) => {
      tx.oncomplete = ok;
      tx.onerror = no;
    });
    db.close();
  }, fixture);
  await page.reload();
  await page.waitForFunction(
    () => document.documentElement.dataset.themeSurfaces === "generated",
  );
  await page.locator(".piece").first().click();
  const box = await page.locator("#board").boundingBox();
  await page.waitForTimeout(300);
  await page
    .locator("#board")
    .click({
      position: { x: (box.width * 6.5) / 8, y: (box.height * 0.5) / 8 },
    });
  await page.waitForTimeout(700);
  await page.screenshot({ path: out + "/celebration.png" });
  await page.waitForTimeout(7300);
  assert.equal(
    (await page.locator("#score").textContent()).replace(/\D/g, ""),
    "1574",
  );
  assert.equal(await page.locator(".compact-reward").count(), 0);
  assert.equal(await page.locator(".reward-event,.hud-notice").count(), 0);
  assert.equal(await page.locator("#board canvas").count(), 1);
  assert.equal(await page.locator(".prepared-surface>img").count(), 1);
  const video = page.video();
  await context.close();
  await fs.writeFile(
    out + "/visual.json",
    JSON.stringify({ video: await video.path(), errors }, null, 2) + "\n",
  );
  // Same production bundle, complete one-button comparison including real saves.
  const c = await browser.newContext({
    viewport: { width: 392, height: 872 },
    deviceScaleFactor: 2.75,
    isMobile: true,
    hasTouch: true,
  });
  const p = await c.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto("http://127.0.0.1:5198/?clearTrace=surfaces&test=fast");
  await p.waitForFunction(() => !!window.__blockySurfaceComparison);
  await p.locator("#surface-start").click();
  await p.waitForFunction(
    () =>
      window.__blockySurfaceComparison.report?.completed ||
      (!window.__blockySurfaceComparison.running &&
        window.__blockySurfaceComparison.report),
    {},
    { timeout: 125000 },
  );
  const report = await p.evaluate(
    () => window.__blockySurfaceComparison.report,
  );
  assert.equal(report.protocol.measurementMs, 8000);
  assert.equal(report.protocol.traces, false);
  assert.equal(report.completed, true, report.error);
  assert.equal(report.episodes.length, 10);
  assert(report.episodes.every((r) => r.valid));
  assert.equal(report.summary.improved, false);
  await fs.writeFile(out + "/comparison.json", JSON.stringify(report));
  assert.deepEqual(errors, []);
  await c.close();
  console.log(
    JSON.stringify({
      production: true,
      devFlagsIgnored: true,
      episodes: report.episodes.length,
      reportBytes: Buffer.byteLength(JSON.stringify(report)),
      sourceCommit: report.sourceCommit,
      errors,
    }),
  );
} finally {
  await browser.close();
  await server.httpServer.close();
}
