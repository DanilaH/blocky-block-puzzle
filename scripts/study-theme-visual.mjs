import { foregroundServer } from "./study-foreground-server.mjs";
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import sharp from "sharp";
const output = "/workspace/scratch/03c53152a52e/foreground-study/theme-visual";
await fs.mkdir(output, { recursive: true });
const server = await foregroundServer(),
  browser = await chromium.launch();
const results = [];
try {
  for (const variant of ["baseline", "theme"]) {
    const context = await browser.newContext({
      viewport: { width: 392, height: 872 },
      deviceScaleFactor: 2.75,
      isMobile: true,
    });
    const p = await context.newPage();
    await p.goto(
      `http://127.0.0.1:5199/?clearTrace=full&foregroundStudy=${variant}&studyPixels=native`,
    );
    await p.waitForFunction(() => !!window.__blockyFullDiagnostic);
    await p.evaluate(() => window.__blockyFullDiagnostic.prepare("baseline"));
    await p.evaluate(() => window.__foregroundInk("1\u00a0574"));
    if (variant === "theme")
      await p.waitForFunction(() => window.__foregroundStudy.ink.ready);
    await p.addStyleTag({
      content:
        "html,body{background:#223344!important}.ambient-canvas,.world-background,.festival-rear,#board canvas{visibility:hidden!important}.tray-area{visibility:hidden!important}#full-clear-panel{display:none!important}",
    });
    for (const at of [0, 80, 180, 350, 550, 900]) {
      await p.evaluate(
        ({ at, variant }) => {
          for (const a of document.getAnimations()) {
            a.pause();
            a.currentTime = at;
          }
          if (variant === "theme") window.__foregroundStudy.seek(at);
        },
        { at, variant },
      );
      await p.screenshot({
        path: `${output}/${variant}-${at}.png`,
        clip: { x: 0, y: 0, width: 392, height: 180 },
      });
    }
    console.log(
      variant,
      await p.evaluate(() => window.__foregroundStudy.snapshot()),
    );
    await context.close();
  }
  for (const at of [0, 80, 180, 350, 550, 900]) {
    const a = await sharp(`${output}/baseline-${at}.png`)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true }),
      b = await sharp(`${output}/theme-${at}.png`)
        .ensureAlpha()
        .raw()
        .toBuffer();
    let sum = 0,
      max = 0,
      over = 0;
    for (let i = 0; i < a.data.length; i += 4) {
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
      at,
      meanChannelError: sum / (a.info.width * a.info.height * 3),
      maxChannelError: max,
      percentPixelsOver8: (over / (a.info.width * a.info.height)) * 100,
    });
  }
  await fs.writeFile(`${output}/result.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
  await server.close();
}
