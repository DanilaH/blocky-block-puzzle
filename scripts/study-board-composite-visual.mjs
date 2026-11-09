import { foregroundServer } from "./study-foreground-server.mjs";
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import sharp from "sharp";
import assert from "node:assert/strict";
const out = "/workspace/scratch/03c53152a52e/phaser-study/board-under-visual";
await fs.mkdir(out, { recursive: true });
const server = await foregroundServer(),
  browser = await chromium.launch(),
  results = [];
const phases = process.env.STUDY_PHASES
  ? process.env.STUDY_PHASES.split(",").map(Number)
  : [0, 80, 180, 350, 550, 900, 1200];
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
    await p.goto(
      `http://127.0.0.1:5199/?clearTrace=full&foregroundStudy=baseline&studyPixels=original&studyRenderer=${mode === "original" ? "canvas" : mode}`,
    );
    await p.waitForFunction(() => !!window.__blockyFullDiagnostic);
    await p.evaluate(() => window.__blockyFullDiagnostic.prepare("baseline"));
    await p.waitForTimeout(1350);
    await p.addStyleTag({
      content:
        ".ambient-canvas,.world-background,.festival-canvas,.festival-rear{visibility:hidden!important}#full-clear-panel{display:none!important}",
    });
    const setup = await p.evaluate(async () => {
      const game = window.__foregroundStudy.sharedGame,
        scene = game.scene.getScene("board"),
        { THEMES } = await import("/src/game/themes.ts"),
        { tileTransitionDuration } = await import(
          "/src/game/tile-study-config.ts"
        );
      game.loop.sleep();
      const baseTime = performance.now();
      window.__qaTime = baseTime;
      Object.defineProperty(performance, "now", {
        value: () => window.__qaTime,
      });
      scene.setTheme(5, THEMES[5].accent);
      const animations = document.querySelector("#board").getAnimations();
      for (const a of animations) a.pause();
      window.__boardVisual = {
        game,
        scene,
        animations,
        baseTime,
        duration: tileTransitionDuration(scene.calm, 5),
      };
      return {
        duration: window.__boardVisual.duration,
        composite: window.__foregroundStudy.snapshot().composite,
      };
    });
    const clip = await p.locator(".board-wrap").boundingBox();
    for (const at of phases) {
      const actual = await p.evaluate((at) => {
        const { game, scene, animations, duration, baseTime } =
          window.__boardVisual;
        window.__qaTime = baseTime + at;
        for (const a of animations) a.currentTime = at;
        scene.draw();
        game.renderer.preRender();
        game.scene.render(game.renderer);
        game.renderer.postRender();
        const gl = game.renderer.gl,
          pixel = new Uint8Array(4);
        gl.readPixels(448, 576, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        return {
          pixel: [...pixel],
          attrs: gl.getContextAttributes(),
          blend: {
            src: gl.getParameter(gl.BLEND_SRC_RGB),
            dst: gl.getParameter(gl.BLEND_DST_RGB),
          },
          css: getComputedStyle(document.querySelector("#board"))
            .backgroundColor,
          camera: scene.cameras.main.backgroundColor.rgba,
          board: document
            .querySelector("#board")
            .getBoundingClientRect()
            .toJSON(),
        };
      }, at);
      await p.screenshot({ path: `${out}/${mode}-${at}.png`, clip });
      results.push({ mode, at, ...setup, actual });
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
  for (const mode of ["gpu-bed-under"])
    for (const at of phases) {
      const a = await sharp(`${out}/original-${at}.png`)
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true }),
        b = await sharp(`${out}/${mode}-${at}.png`)
          .ensureAlpha()
          .raw()
          .toBuffer();
      assert.equal(a.data.length, b.length);
      let sum = 0,
        max = 0,
        over = 0;
      for (let i = 0; i < b.length; i += 4) {
        let m = 0;
        for (let c = 0; c < 3; c++) {
          const d = Math.abs(a.data[i + c] - b[i + c]);
          sum += d;
          max = Math.max(max, d);
          m = Math.max(m, d);
        }
        if (m > 8) over++;
      }
      results.push({
        mode,
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
