import { foregroundServer } from "./study-foreground-server.mjs";
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import sharp from "sharp";
import assert from "node:assert/strict";
const out = "/workspace/scratch/03c53152a52e/phaser-study/board-under-fx";
await fs.mkdir(out, { recursive: true });
const server = await foregroundServer(),
  browser = await chromium.launch(),
  results = [],
  phases = [0, 80, 180, 350, 550, 900, 1200, 1800];
try {
  for (const mode of ["original", "gpu-bed-under"]) {
    const context = await browser.newContext({
        viewport: { width: 392, height: 872 },
        deviceScaleFactor: 2.75,
        isMobile: true,
      }),
      p = await context.newPage(),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.addInitScript(() => {
      const now = performance.now.bind(performance),
        later = window.setTimeout.bind(window);
      window.__fxTimers = [];
      Object.defineProperty(performance, "now", {
        value: () => window.__fxNow ?? now(),
      });
      window.setTimeout = (...args) => {
        const id = later(...args);
        window.__fxTimers.push(id);
        return id;
      };
    });
    await p.goto(
      `http://127.0.0.1:5199/?clearTrace=full&foregroundStudy=baseline&studyPixels=original&studyRenderer=${mode === "original" ? "canvas" : mode}`,
    );
    await p.waitForFunction(() => !!window.__blockyFullDiagnostic);
    await p.evaluate(() => window.__blockyFullDiagnostic.prepare("baseline"));
    await p.waitForTimeout(1350);
    await p.addStyleTag({
      content:
        ".ambient-canvas,.world-background,.festival-canvas,.festival-rear,.board-reward,.hud-notice{visibility:hidden!important}#full-clear-panel{display:none!important}",
    });
    await p.evaluate(() => {
      window.__fxNow = performance.now();
      void window.__blockyFullDiagnostic.measure(20000).catch(() => {});
    });
    await p.waitForFunction(
      () =>
        window.__foregroundStudy.sharedGame.scene.getScene("board").state
          ?.score === 1574,
    );
    await p.evaluate(async () => {
      const game = window.__foregroundStudy.sharedGame,
        scene = game.scene.getScene("board"),
        { THEMES } = await import("/src/game/themes.ts");
      game.loop.sleep();
      for (const id of window.__fxTimers) clearTimeout(id);
      scene.setTheme(5, THEMES[5].accent);
      const animations = document.getAnimations();
      for (const a of animations) a.pause();
      window.__fxProbe = { game, scene, animations, base: window.__fxNow };
    });
    const clip = await p.locator(".board-wrap").boundingBox();
    for (const at of phases) {
      const actual = await p.evaluate((at) => {
        const { game, scene, animations, base } = window.__fxProbe;
        window.__fxNow = base + at;
        for (const a of animations) a.currentTime = at;
        scene.update();
        game.renderer.preRender();
        game.scene.render(game.renderer);
        game.renderer.postRender();
        return {
          coreScore: scene.state.score,
          composite: window.__foregroundStudy.snapshot().composite,
        };
      }, at);
      await p.screenshot({ path: `${out}/${mode}-${at}.png`, clip });
      results.push({ mode, at, actual });
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
  for (const at of phases) {
    const a = await sharp(`${out}/original-${at}.png`)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true }),
      b = await sharp(`${out}/gpu-bed-under-${at}.png`)
        .ensureAlpha()
        .raw()
        .toBuffer();
    assert.equal(a.data.length, b.length);
    let sum = 0,
      max = 0,
      over = 0;
    for (let i = 0; i < b.length; i += 4) {
      let m = 0;
      for (let k = 0; k < 3; k++) {
        const d = Math.abs(a.data[i + k] - b[i + k]);
        sum += d;
        max = Math.max(max, d);
        m = Math.max(m, d);
      }
      if (m > 8) over++;
    }
    results.push({
      at,
      diff: {
        meanChannelError: sum / (a.info.width * a.info.height * 3),
        maxChannelError: max,
        percentPixelsOver8: (over / (a.info.width * a.info.height)) * 100,
      },
    });
  }
  await fs.writeFile(out + "/result.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
  await server.close();
}
