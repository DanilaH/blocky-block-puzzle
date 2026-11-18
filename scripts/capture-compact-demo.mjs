import { chromium } from "@playwright/test";
import { preview } from "vite";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const output = process.env.STUDY_OUTPUT || "/tmp/blocky-compact-demo";
await fs.mkdir(output, { recursive: true });
const fixture = JSON.parse(
  await fs.readFile("src/diagnostics/phone-clear-fixture.json", "utf8"),
);
const server = await preview({
  build: { outDir: process.env.APP_DIST || "dist" },
  preview: { host: "127.0.0.1", port: 5191, strictPort: true },
});
const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport: { width: 392, height: 872 },
    deviceScaleFactor: 2.75,
    isMobile: true,
    hasTouch: true,
    recordVideo: { dir: output, size: { width: 392, height: 872 } },
  });
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // A development-only comparison URL cannot enable the old renderer in production.
  await page.goto("http://127.0.0.1:5191/?effectsStudy=legacy");
  const ready = () =>
    page.waitForFunction(
      () =>
        document.querySelector("#board canvas") &&
        document.querySelector("#app").getAttribute("aria-busy") !== "true",
    );
  await ready();
  await page.evaluate(async (f) => {
    const request = indexedDB.open("blocky-classic", 1);
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction("save", "readwrite"),
      store = tx.objectStore("save"),
      get = store.get("current");
    get.onsuccess = () => {
      const p = get.result;
      p.revision++;
      p.tutorialStep = 4;
      p.game = f.before;
      p.wardrobe = f.beforeWardrobe;
      p.best = p.festivalBest = p.progressionBest = 500;
      p.settings = { ...f.settings, sound: false, haptics: false };
      store.put(p, "current");
    };
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, fixture);
  await page.reload();
  await ready();
  assert.equal(
    await page.locator("html").getAttribute("data-effects"),
    "compact",
  );
  await page.locator(".piece").first().click();
  const b = await page.locator("#board").boundingBox();
  await page.waitForTimeout(600);
  await page
    .locator("#board")
    .click({ position: { x: (b.width * 6.5) / 8, y: (b.height * 0.5) / 8 } });
  await page.locator(".compact-reward").waitFor({ state: "visible" });
  await page.screenshot({ path: `${output}/compact-reward.png` });
  const visible = await page.evaluate(() => ({
    score: document.querySelector("#score").textContent,
    reward: document.querySelector(".compact-reward").textContent,
    count: document.querySelectorAll(".reward-event").length,
    backing: [
      document.querySelector("#board canvas").width,
      document.querySelector("#board canvas").height,
    ],
  }));
  assert.equal(visible.score.replace(/\D/g, ""), "1574");
  assert.equal(visible.count, 1);
  await page.waitForTimeout(2200);
  assert.equal(await page.locator(".reward-event,.hud-notice").count(), 0);
  assert.deepEqual(errors, []);
  const video = page.video();
  await context.close();
  await fs.rename(await video.path(), `${output}/recording.webm`);
  await fs.writeFile(
    `${output}/proof.json`,
    JSON.stringify(
      { production: true, legacyDevFlagIgnored: true, ...visible, errors },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify({ production: true, ...visible, errors }));
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
