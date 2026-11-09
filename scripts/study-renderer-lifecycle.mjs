import { foregroundServer } from "./study-foreground-server.mjs";
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const out = "/workspace/scratch/03c53152a52e/phaser-study/lifecycle-final.json";
const server = await foregroundServer(),
  browser = await chromium.launch(),
  results = [];
async function open(mode) {
  const c = await browser.newContext({
      viewport: { width: 392, height: 872 },
      deviceScaleFactor: 2.75,
      isMobile: true,
    }),
    p = await c.newPage(),
    errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  const shared = mode !== "gpu-bed-under";
  await p.goto(
    `http://127.0.0.1:5199/?clearTrace=full&foregroundStudy=${shared ? "rewards" : "baseline"}&studyRenderer=${shared ? "phaser" : mode}&studyBatch=${mode === "phaser-native" ? "native" : "extern"}&studyPixels=${shared ? "native" : "original"}`,
  );
  await p.waitForFunction(() => !!window.__blockyFullDiagnostic);
  await p.evaluate(async () => {
    await window.__blockyFullDiagnostic.prepare("baseline");
    document.querySelector("#full-clear-panel").style.pointerEvents = "none";
  });
  return { c, p, errors };
}
const snap = (p) =>
  p.evaluate(() => ({
    study: window.__foregroundStudy.snapshot(),
    score: document.querySelector("#score").textContent,
    visibility: getComputedStyle(document.querySelector("#score")).visibility,
    dom: document.querySelectorAll(".reward-event,.hud-notice").length,
  }));
try {
  for (const mode of ["phaser", "phaser-native", "gpu-bed-under"]) {
    const { c, p, errors } = await open(mode),
      run = p.evaluate(() => window.__blockyFullDiagnostic.measure(1800));
    await p.waitForFunction(
      (mode) =>
        mode === "gpu-bed-under"
          ? window.__foregroundStudy.snapshot().composite.bed?.owned
          : window.__foregroundStudy.snapshot().draws > 1,
      mode,
    );
    await p.locator("#pause").click();
    const before = await snap(p);
    await p.waitForTimeout(180);
    const after = await snap(p);
    await run;
    for (const s of [before, after]) {
      assert.equal(s.score, "1\u00a0574");
      assert.equal(s.visibility, "visible");
      assert.equal(s.dom, 0);
      assert.equal(s.study.active, 0);
      assert.equal(s.study.composite.glError, 0);
      if (s.study.composite.bed) {
        assert.equal(s.study.composite.bed.visible, false);
        assert.equal(s.study.composite.bed.maskVisible, false);
      }
      assert.deepEqual(s.study.errors, []);
    }
    assert.equal(
      before.study.phaserRenderTimes.length,
      after.study.phaserRenderTimes.length,
    );
    assert.deepEqual(errors, []);
    results.push({ mode, kind: "pause", before, after, errors });
    await c.close();
  }
  for (const mode of ["phaser-native", "gpu-bed-under"]) {
    const { c, p, errors } = await open(mode);
    const before = await p.evaluate(async (mode) => {
      if (mode === "gpu-bed-under") {
        const s = window.__foregroundStudy.sharedGame.scene.getScene("board"),
          { THEMES } = await import("/src/game/themes.ts");
        s.setTheme(5, THEMES[5].accent);
      }
      window.__foregroundPresent("all-clear", "Чистое поле!", 1000);
      document.querySelector("#pause").click();
      return window.__foregroundStudy.snapshot();
    }, mode);
    await p.waitForTimeout(250);
    const after = await p.evaluate(() => window.__foregroundStudy.snapshot());
    assert.equal(after.active, 0);
    assert.deepEqual(after.errors, []);
    assert.equal(before.shared?.redraws, after.shared?.redraws);
    assert.equal(after.composite.glError, 0);
    if (after.composite.bed) assert.equal(after.composite.bed.visible, false);
    assert.deepEqual(errors, []);
    results.push({ mode, kind: "cold-cancel", before, after, errors });
    await c.close();
  }
  {
    const { c, p, errors } = await open("gpu-bed-under");
    let run = p.evaluate(() => window.__blockyFullDiagnostic.measure(1800));
    await p.waitForFunction(
      () => window.__foregroundStudy.snapshot().composite.bed?.owned,
    );
    await p.evaluate(() => {
      const g = window.__foregroundStudy.sharedGame;
      window.__restoreProbe = {
        canvas: g.canvas,
        gl: g.renderer.gl,
        extension: g.renderer.gl.getExtension("WEBGL_lose_context"),
      };
      if (!window.__restoreProbe.extension)
        throw Error("lose-context extension unavailable");
      window.__restoreProbe.extension.loseContext();
    });
    await p.waitForFunction(() => window.__restoreProbe.gl.isContextLost());
    const lost = await p.evaluate(() => ({
      lost: window.__restoreProbe.gl.isContextLost(),
      error: window.__restoreProbe.gl.getError(),
    }));
    await p.waitForTimeout(350);
    await p.evaluate(() => window.__restoreProbe.extension.restoreContext());
    await p.waitForFunction(
      () =>
        !window.__restoreProbe.gl.isContextLost() &&
        !window.__foregroundStudy.sharedGame.renderer.contextLost,
    );
    await run;
    await p.evaluate(() => window.__blockyFullDiagnostic.prepare("baseline"));
    run = p.evaluate(() => window.__blockyFullDiagnostic.measure(1800));
    await p.waitForFunction(
      () => window.__foregroundStudy.snapshot().composite.bed?.owned,
    );
    const restored = await p.evaluate(() => {
      const g = window.__foregroundStudy.sharedGame;
      return {
        sameCanvas: g.canvas === window.__restoreProbe.canvas,
        sameContext: g.renderer.gl === window.__restoreProbe.gl,
        study: window.__foregroundStudy.snapshot(),
      };
    });
    assert(restored.sameCanvas && restored.sameContext);
    assert.equal(restored.study.composite.glError, 0);
    assert(restored.study.composite.bed.frames > 0);
    await p.screenshot({
      path: "/workspace/scratch/03c53152a52e/phaser-study/under-restored.png",
    });
    await run;
    assert.deepEqual(errors, []);
    results.push({
      mode: "gpu-bed-under",
      kind: "context-restore",
      lost,
      restored,
      errors,
    });
    await c.close();
  }
  await fs.writeFile(out, JSON.stringify({ results }, null, 2) + "\n");
  console.log(JSON.stringify({ passed: results.length }));
} finally {
  await browser.close();
  await server.close();
}
