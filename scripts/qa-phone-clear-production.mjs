// Actual production bundle, UI input and ordinary performance export. No transforms.
import { preview } from "vite";
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const fixture = JSON.parse(
  await fs.readFile("docs/qa/phone-clear-050/fixture-1574.json", "utf8"),
);
const output = process.argv[2] || "/tmp/blocky-051-production-clear";
await fs.mkdir(output, { recursive: true });
const server = await preview({
  build: { outDir: process.env.QA_DIST || "dist" },
  preview: { host: "127.0.0.1", port: 5196, strictPort: true },
});
let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage({
    ...(process.env.QA_VISUAL
      ? {
          recordVideo: {
            dir: output + "/video",
            size: { width: 392, height: 872 },
          },
        }
      : {}),
    viewport: { width: 392, height: 872 },
    deviceScaleFactor: 2.75,
    userAgent:
      "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.status() >= 400 && r.url().includes("/assets/"))
      errors.push(`asset ${r.status()} ${new URL(r.url()).pathname}`);
  });
  await page.goto("http://127.0.0.1:5196/");
  await page.locator(".piece").first().waitFor();
  await page.evaluate(async (fixture) => {
    const request = indexedDB.open("blocky-classic", 1);
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction("save", "readwrite"),
        store = tx.objectStore("save"),
        get = store.get("current");
      get.onsuccess = () => {
        const p = get.result;
        p.revision++;
        p.tutorialStep = 4;
        p.game = structuredClone(fixture.before);
        p.best = p.festivalBest = p.progressionBest = 100000;
        p.wardrobe = fixture.beforeWardrobe;
        p.settings = {
          ...p.settings,
          ...fixture.settings,
          sound: false,
          haptics: false,
          musicVolume: 0,
        };
        store.put(p, "current");
        store.delete("backup");
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, fixture);
  await page.reload();
  await page.locator(".piece").first().waitFor();
  const diagnostics = async () => {
    await page.locator("#pause").click();
    await page.locator(".advanced-settings > summary").click();
    await page.getByText("Диагностика", { exact: true }).click();
  };
  await diagnostics();
  await page.locator("#perf-start").click();
  await page.locator('[data-slot="0"]').click();
  const b = await page.locator("#board").boundingBox();
  await page
    .locator("#board")
    .click({ position: { x: (b.width * 5) / 8 + 3, y: 3 } });
  if (process.env.QA_VISUAL) {
    for (const [i, delay] of [220, 400, 380, 1600].entries()) {
      await page.waitForTimeout(delay);
      await page.screenshot({ path: output + `/phase-${i}.png`, scale: "css" });
    }
  } else await page.waitForTimeout(2600);
  await diagnostics();
  const event = page.waitForEvent("download");
  await page.locator("#perf-export").click();
  const bytes = await fs.readFile(await (await event).path());
  const report = JSON.parse(bytes);
  assert.equal(report.version, process.env.QA_VERSION || "0.51.0-preview");
  assert.equal(report.schemaVersion, 4);
  const clear = report.placements.find((p) => p.allClear);
  assert(clear?.fixture);
  assert.equal(clear.lines, 2);
  assert.equal(clear.fixture.expectedScore, 1574);
  assert.equal(clear.fixture.afterTheme, 1);
  assert.deepEqual(clear.fixture.move, fixture.move);
  assert.deepEqual(errors, []);
  const rows = report.frames.filter(
    (_, i) =>
      report.frameTimes[i] >= clear.at &&
      report.frameTimes[i] < clear.at + 2400,
  );
  const summary = {
    version: report.version,
    productionBundle: true,
    sourceTransforms: false,
    uiMove: clear.fixture.move,
    expectedScore: 1574,
    allClear: true,
    lines: clear.lines,
    afterTheme: clear.fixture.afterTheme,
    canvas: report.context.canvas,
    renderer: report.context.renderer,
    performanceExportBytes: bytes.length,
    clearWindow: {
      count: rows.length,
      max: Math.max(...rows),
      over25: rows.filter((v) => v > 25).length,
    },
    errors,
    physicalDevice: false,
    measurement: process.env.QA_VISUAL
      ? "Visual smoke with screenshot/video overhead; frame timings excluded"
      : "Single production-route smoke; not comparative performance acceptance",
  };
  await fs.writeFile(
    output + "/summary.json",
    JSON.stringify(summary, null, 2) + "\n",
  );
  await fs.writeFile(output + "/performance.json", bytes);
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await browser?.close();
  await server.httpServer.close();
}
