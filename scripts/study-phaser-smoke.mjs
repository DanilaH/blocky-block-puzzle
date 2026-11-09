import { foregroundServer } from "./study-foreground-server.mjs";
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
const output =
  process.env.STUDY_OUTPUT ||
  "/workspace/scratch/03c53152a52e/phaser-study/native-smoke";
await fs.mkdir(output, { recursive: true });
const server = await foregroundServer(),
  browser = await chromium.launch();
try {
  for (const variant of ["viewport", "phaser"]) {
    const context = await browser.newContext({
        viewport: { width: 392, height: 872 },
        deviceScaleFactor: 2.75,
        isMobile: true,
      }),
      p = await context.newPage(),
      errors = [];
    p.on("pageerror", (e) => {
      errors.push(e.message);
      console.log("PAGEERROR", e.stack);
    });
    await p.goto(
      `http://127.0.0.1:5199/?clearTrace=full&foregroundStudy=${variant === "phaser" ? "rewards" : "baseline"}&studyPixels=native&studyRenderer=phaser&studyBatch=${process.env.STUDY_BATCH || "extern"}`,
    );
    await p.waitForFunction(() => !!window.__blockyFullDiagnostic);
    await p.evaluate(() => window.__blockyFullDiagnostic.prepare("baseline"));
    await p.waitForFunction(
      () => window.__foregroundStudy.snapshot().shared?.ready,
    );
    console.log(
      "READY",
      variant,
      await p.evaluate(() => window.__foregroundStudy.snapshot()),
    );
    const run = p.evaluate(async () => ({
      row: await window.__blockyFullDiagnostic.measure(8000),
      study: window.__foregroundStudy.snapshot(),
    }));
    await p.waitForTimeout(700);
    await p.screenshot({ path: `${output}/${variant}-700.png` });
    const result = await run;
    await fs.writeFile(
      `${output}/${variant}.json`,
      JSON.stringify({ result, errors }, null, 2),
    );
    console.log(
      "RESULT",
      variant,
      result.row.valid,
      result.row.validation,
      result.study,
      errors,
    );
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
