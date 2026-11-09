import { foregroundServer } from "./study-foreground-server.mjs";
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import sharp from "sharp";
import assert from "node:assert/strict";
const out = "/workspace/scratch/03c53152a52e/phaser-study/geometry";
await fs.mkdir(out, { recursive: true });
const s = await foregroundServer(),
  b = await chromium.launch(),
  results = [];
try {
  for (const viewport of [
    { width: 392, height: 872 },
    { width: 320, height: 568 },
    { width: 872, height: 392 },
  ]) {
    let reference;
    for (const mode of ["original", "viewport"]) {
      const c = await b.newContext({
          viewport,
          deviceScaleFactor: 2.75,
          isMobile: true,
        }),
        p = await c.newPage(),
        errors = [];
      p.on("pageerror", (e) => errors.push(e.message));
      await p.goto(
        `http://127.0.0.1:5199/?clearTrace=full&foregroundStudy=baseline&studyPixels=${mode === "original" ? "original" : "native"}&studyRenderer=${mode === "original" ? "canvas" : "phaser"}`,
      );
      await p.waitForFunction(() => !!window.__blockyFullDiagnostic);
      await p.evaluate(() => window.__blockyFullDiagnostic.prepare("baseline"));
      if (mode !== "original")
        await p.waitForFunction(
          () => window.__foregroundStudy.snapshot().shared.ready,
        );
      await p.waitForTimeout(1350);
      await p.addStyleTag({
        content:
          ".ambient-canvas,.world-background,.festival-canvas,.festival-rear{visibility:hidden!important}#full-clear-panel{display:none!important}",
      });
      const geometry = await p.evaluate(() =>
        Object.fromEntries(
          ["#board", "#board canvas", ".board-wrap", "#score"].map(
            (selector) => {
              const e = document.querySelector(selector),
                r = e.getBoundingClientRect();
              return [
                selector,
                {
                  x: r.x,
                  y: r.y,
                  width: r.width,
                  height: r.height,
                  backing:
                    e instanceof HTMLCanvasElement
                      ? [e.width, e.height]
                      : undefined,
                },
              ];
            },
          ),
        ),
      );
      const clip = await p.locator(".board-wrap").boundingBox();
      await p.screenshot({
        path: `${out}/${viewport.width}-${mode}.png`,
        clip,
      });
      assert.deepEqual(errors, []);
      results.push({
        viewport,
        mode,
        geometry,
        study: await p.evaluate(() => window.__foregroundStudy.snapshot()),
      });
      if (mode === "original") reference = geometry;
      else
        for (const selector of ["#board", ".board-wrap", "#score"])
          assert.deepEqual(geometry[selector], reference[selector], selector);
      await c.close();
    }
    const a = await sharp(`${out}/${viewport.width}-original.png`)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true }),
      d = await sharp(`${out}/${viewport.width}-viewport.png`)
        .ensureAlpha()
        .raw()
        .toBuffer();
    assert.equal(a.data.length, d.length);
    let sum = 0,
      max = 0,
      over = 0;
    for (let i = 0; i < d.length; i += 4) {
      let m = 0;
      for (let k = 0; k < 3; k++) {
        const v = Math.abs(a.data[i + k] - d[i + k]);
        sum += v;
        max = Math.max(max, v);
        m = Math.max(m, v);
      }
      if (m > 8) over++;
    }
    results.push({
      viewport,
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
  await b.close();
  await s.close();
}
