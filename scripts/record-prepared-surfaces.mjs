import { chromium } from "@playwright/test";
import { createServer } from "vite";
import fs from "node:fs/promises";
import assert from "node:assert/strict";

// Visual capture only. Recording is deliberately separate from the RAF study.
const out = process.env.CAPTURE_DIR || "/tmp/blocky-prepared-capture";
await fs.mkdir(out, { recursive: true });
const server = await createServer({
  server: { host: "127.0.0.1", port: 5197, strictPort: true },
});
await server.listen();
const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport: { width: 392, height: 872 },
    deviceScaleFactor: 2.75,
    isMobile: true,
    hasTouch: true,
    recordVideo: { dir: out, size: { width: 392, height: 872 } },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    "http://127.0.0.1:5197/?clearTrace=full&effectsStudy=legacy&themeSurfaces=generated",
  );
  await page.waitForFunction(
    () => !!window.__blockyFullDiagnostic && window.__themeSurfaces?.ready,
  );
  await page.evaluate(() => window.__blockyFullDiagnostic.prepare("baseline"));
  // Hide the diagnostic controls for this visual-only clip.
  await page.addStyleTag({
    content: "#full-clear-panel{display:none!important}",
  });
  await page.waitForTimeout(350);
  await page.screenshot({ path: out + "/before.png" });
  const run = page.evaluate(() => window.__blockyFullDiagnostic.measure(8000));
  await page.waitForTimeout(500);
  await page.screenshot({ path: out + "/transition.png" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: out + "/celebration.png" });
  const row = await run;
  assert(row.valid, JSON.stringify(row.validation));
  assert.equal(row.state.proof.festival.spawned, 148);
  assert.equal(row.state.proof.rewardDomCreated, 3);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: out + "/settled.png" });
  await page.waitForTimeout(300);
  const video = page.video();
  await context.close();
  const path = await video.path();
  await fs.writeFile(
    out + "/capture.json",
    JSON.stringify({ video: path, proof: row.state.proof, errors }, null, 2) +
      "\n",
  );
  console.log(JSON.stringify({ video: path, proof: row.state.proof, errors }));
} finally {
  await browser.close();
  await server.close();
}
