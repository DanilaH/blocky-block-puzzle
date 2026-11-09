import { foregroundServer } from "./study-foreground-server.mjs";
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import sharp from "sharp";
const output = "/workspace/scratch/03c53152a52e/foreground-study/visual";
await fs.mkdir(output, { recursive: true });
const server = await foregroundServer(),
  browser = await chromium.launch();
const result = [];
try {
  for (const variant of ["baseline", "rewards"])
    for (const kind of ["combo", "all-clear"]) {
      const context = await browser.newContext({
        viewport: { width: 392, height: 872 },
        deviceScaleFactor: 2.75,
        isMobile: true,
      });
      const page = await context.newPage();
      await page.goto(
        `http://127.0.0.1:5199/?clearTrace=full&foregroundStudy=${variant}&studyPixels=native`,
      );
      await page.waitForFunction(() => !!window.__blockyFullDiagnostic);
      await page.evaluate(() =>
        window.__blockyFullDiagnostic.prepare("baseline"),
      );
      await page.evaluate(
        (kind) =>
          window.__foregroundPresent(
            kind,
            kind === "combo" ? "ДВОЙНАЯ! ×1,5" : "Чистое поле!",
            kind === "combo" ? 450 : 1000,
          ),
        kind,
      );
      if (variant === "rewards")
        await page.waitForFunction(
          () =>
            window.__foregroundStudy.items.size === 1 &&
            [...window.__foregroundStudy.items.values()].every((e) => e.ready),
        );
      await page.addStyleTag({
        content:
          "html,body{background:#223344!important}.ambient-canvas,.world-background,.festival-rear,#board canvas{visibility:hidden!important}#app{visibility:hidden}.board-reward{visibility:visible}#full-clear-panel{display:none!important}",
      });
      const box = await page.locator(".board-wrap").boundingBox();
      for (const at of [0, 80, 180, 350, 550, 900, 1500]) {
        await page.evaluate(
          ({ at, variant }) => {
            if (variant === "rewards") window.__foregroundStudy.seek(at);
            else
              for (const a of document
                .querySelector(".reward-event")
                .getAnimations({ subtree: true })) {
                a.pause();
                a.currentTime = at;
              }
          },
          { at, variant },
        );
        await page.screenshot({
          path: `${output}/${kind}-${variant}-${at}.png`,
          clip: box,
        });
      }
      console.log(
        kind,
        variant,
        await page.evaluate(() => window.__foregroundStudy.snapshot()),
      );
      await context.close();
    }
  for (const kind of ["combo", "all-clear"])
    for (const at of [0, 80, 180, 350, 550, 900, 1500]) {
      const a = await sharp(`${output}/${kind}-baseline-${at}.png`)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const b = await sharp(`${output}/${kind}-rewards-${at}.png`)
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
      result.push({
        kind,
        at,
        meanChannelError: sum / (a.info.width * a.info.height * 3),
        maxChannelError: max,
        percentPixelsOver8: (over / (a.info.width * a.info.height)) * 100,
      });
    }
  await fs.writeFile(`${output}/result.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
  await server.close();
}
