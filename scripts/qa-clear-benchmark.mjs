// Production-route smoke. Uses real timers; no dev-only accelerated timings.
import { preview } from "vite";
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const out = process.argv[2] || "/tmp/blocky-clear-production";
await fs.mkdir(out, { recursive: true });
const server = await preview({
  preview: { host: "127.0.0.1", port: 5198, strictPort: true },
});
let browser;
try {
  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 392, height: 872 },
    deviceScaleFactor: 2.75,
  });
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.status() >= 400 && r.url().includes("/assets/"))
      errors.push(`${r.status()} ${new URL(r.url()).pathname}`);
  });
  await page.goto("http://127.0.0.1:5198/diagnostics/clear.html?test=fast");
  await page.locator("#bench-start").waitFor();
  await page.waitForFunction(
    () => !document.querySelector("#bench-start").disabled,
  );
  await page.locator("#bench-start").click();
  console.log("Production benchmark started; expected ~70 seconds");
  await page.waitForTimeout(3500);
  await page.screenshot({ path: out + "/during.png" });
  await page.waitForFunction(
    () => !document.querySelector("#bench-export").disabled,
    {},
    { timeout: 120000 },
  );
  const event = page.waitForEvent("download");
  await page.locator("#bench-export").click();
  const download = await event;
  const bytes = await fs.readFile(await download.path());
  const report = JSON.parse(bytes);
  assert.equal(report.completed, true);
  assert.equal(report.episodes.length, 14);
  assert.equal(report.settleMs, 2100);
  assert.equal(report.measurementMs, 2400);
  assert(bytes.length < 1000000);
  assert(report.episodes.every((r) => r.sample.sampleCount > 20));
  assert(
    report.episodes
      .filter((r) => r.profile.id === "baseline")
      .every(
        (r) =>
          r.sample.phases.some((p) => p.name === "themeReveal") &&
          r.sample.phases.some((p) => p.name === "allClearFestival"),
      ),
  );
  assert.deepEqual(errors, []);
  await fs.writeFile(out + "/report.json", bytes);
  await page.screenshot({ path: out + "/finished.png" });
  console.log(
    JSON.stringify(
      {
        bytes: bytes.length,
        episodes: report.episodes.length,
        completed: report.completed,
        renderer: report.renderer,
        errors,
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  await server.httpServer.close();
}
