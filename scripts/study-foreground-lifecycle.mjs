import { foregroundServer } from "./study-foreground-server.mjs";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const output =
  process.env.STUDY_OUTPUT ||
  "/workspace/scratch/03c53152a52e/foreground-study/lifecycle.json";
const server = await foregroundServer(),
  browser = await chromium.launch(),
  results = [];
try {
  for (const variant of ["rewards", "both", "gpu"]) {
    const context = await browser.newContext({
        viewport: { width: 392, height: 872 },
        deviceScaleFactor: 2.75,
        isMobile: true,
      }),
      page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(
      `http://127.0.0.1:5199/?clearTrace=full&foregroundStudy=${variant === "gpu" ? "rewards" : variant}&studyPixels=native&studyRenderer=${variant === "gpu" ? "webgl" : "canvas"}`,
    );
    await page.waitForFunction(() => !!window.__blockyFullDiagnostic);
    await page.evaluate(async () => {
      await window.__blockyFullDiagnostic.prepare("baseline");
      document.querySelector("#full-clear-panel").style.pointerEvents = "none";
    });
    const measurement = page.evaluate(() =>
      window.__blockyFullDiagnostic.measure(1800),
    );
    await page.waitForFunction(
      () => window.__foregroundStudy.snapshot().active > 0,
    );
    await page.locator("#pause").click();
    const state = () =>
      page.evaluate(() => ({
        snapshot: window.__foregroundStudy.snapshot(),
        score: document.querySelector("#score").textContent,
        visibility: getComputedStyle(document.querySelector("#score"))
          .visibility,
        dialog: document.querySelector("#dialog").open,
        dom: document.querySelectorAll(".reward-event,.hud-notice").length,
      }));
    const paused = await state();
    await page.waitForTimeout(180);
    const later = await state();
    await measurement;
    for (const s of [paused, later]) {
      assert.equal(s.snapshot.active, 0);
      assert.equal(s.snapshot.ink.active, 0);
      assert.equal(s.score, "1\u00a0574");
      assert.equal(s.visibility, "visible");
      assert.equal(s.dom, 0);
      assert.deepEqual(s.snapshot.errors, []);
      assert.deepEqual(s.snapshot.ink.errors, []);
    }
    assert.equal(paused.snapshot.draws, later.snapshot.draws);
    if (paused.snapshot.gpu) {
      assert.equal(paused.snapshot.gpu.frames, later.snapshot.gpu.frames);
      assert.equal(later.snapshot.gpu.glError, 0);
      assert.equal(later.snapshot.gpu.contextLost, false);
    }
    results.push({ variant, paused, later, errors });
    assert.deepEqual(errors, []);
    await context.close();
  }
  // Decode completion after an immediate pause must not restart a stopped renderer.
  const context = await browser.newContext({
      viewport: { width: 392, height: 872 },
      deviceScaleFactor: 2.75,
    }),
    page = await context.newPage();
  await page.goto(
    "http://127.0.0.1:5199/?clearTrace=full&foregroundStudy=rewards&studyPixels=native&studyRenderer=webgl",
  );
  await page.waitForFunction(() => !!window.__blockyFullDiagnostic);
  await page.evaluate(async () => {
    await window.__blockyFullDiagnostic.prepare("baseline");
    document.querySelector("#full-clear-panel").style.pointerEvents = "none";
  });
  const before = await page.evaluate(() => {
    window.__foregroundPresent("all-clear", "Чистое поле!", 1000);
    document.querySelector("#pause").click();
    return window.__foregroundStudy.snapshot();
  });
  await page.waitForTimeout(250);
  const after = await page.evaluate(() => window.__foregroundStudy.snapshot());
  assert.equal(before.active, 0);
  assert.equal(after.active, 0);
  assert.equal(before.gpu.frames, after.gpu.frames);
  assert.equal(after.gpu.glError, 0);
  assert.deepEqual(after.errors, []);
  const graphics = await page.evaluate(() => {
    const gl = document.querySelector(".study-gpu-rewards").getContext("webgl");
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      vendor: gl.getParameter(ext?.UNMASKED_VENDOR_WEBGL ?? gl.VENDOR),
      renderer: gl.getParameter(ext?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER),
    };
  });
  results.push({ variant: "gpu-cold-cancel", before, after, graphics });
  await context.close();
  await fs.writeFile(output, JSON.stringify({ results }, null, 2) + "\n");
  console.log(JSON.stringify({ passed: results.length, graphics }));
} finally {
  await browser.close();
  await server.close();
}
