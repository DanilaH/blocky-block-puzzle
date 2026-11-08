// Frozen lettering comparison. It deliberately excludes particle/background timing.
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const out = "/tmp/blocky-reward-056-visual";
await fs.mkdir(out, { recursive: true });
const server = await createServer({
  cacheDir: "/tmp/blocky-raster-056-qa",
  server: { host: "127.0.0.1", port: 5194, strictPort: true },
});
await server.listen();
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const raster of [false, true]) {
    const context = await browser.newContext({
      viewport: { width: 392, height: 872 },
      deviceScaleFactor: 2.75,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://127.0.0.1:5194/?clearTrace=1&test=fast");
    await page.waitForFunction(
      () => document.querySelector("#phone-clear-start")?.disabled === false,
    );
    await page.addStyleTag({
      content:
        "#app,#phone-clear-panel,.world-background,.ambient-canvas,.festival-canvas{display:none!important}body{background:#142d47!important}.reward-event::before{display:none!important}",
    });
    const geometry = await page.evaluate(async (raster) => {
      const { RewardLabels } = await import("/src/game/reward-label.ts");
      const renderer = new RewardLabels();
      const before = [],
        after = [];
      for (const [index, { tier, text, important }] of [
        { tier: "combo", text: "ДВОЙНАЯ! ×1,5", important: false },
        { tier: "all-clear", text: "Чистое поле!", important: true },
        { tier: "series", text: "Серия 10!", important: true },
      ].entries()) {
        const node = document.createElement("span");
        node.className = "reward-event";
        node.dataset.tier = tier;
        node.dataset.step = "5";
        node.style.cssText = `left:196px;top:${175 + index * 255}px`;
        const label = document.createElement("span");
        label.className = "reward-praise";
        label.style.fontSize = "34px";
        if (important)
          Array.from(text).forEach((letter, i) => {
            const el = document.createElement("i");
            el.textContent = letter;
            el.style.setProperty("--letter", String(i));
            label.append(el);
          });
        else label.textContent = text;
        node.append(label);
        document.body.append(node);
        const b = label.getBoundingClientRect();
        before.push([b.x, b.y, b.width, b.height]);
        if (raster) renderer.prepare(label, important);
        const a = label.getBoundingClientRect();
        after.push([a.x, a.y, a.width, a.height]);
      }
      // Freeze the actual raster painter at the same ages as the CSS reference.
      renderer.frame?.();
      renderer.frame = null;
      window.__renderer = renderer;
      return { before, after, stats: renderer.snapshot() };
    }, raster);
    assert.deepEqual(geometry.before, geometry.after);
    for (const phase of [0, 325, 650, 975]) {
      await page.evaluate(
        ({ phase, raster }) => {
          if (raster) {
            const r = window.__renderer;
            for (const label of r.labels) r.draw(label, label.started + phase);
          } else
            document.getAnimations().forEach((a) => {
              a.pause();
              a.currentTime = phase;
            });
        },
        { phase, raster },
      );
      await page.screenshot({
        path: `${out}/${raster ? "new" : "old"}-${phase}.png`,
      });
    }
    assert.deepEqual(errors, []);
    results.push({ raster, geometry, errors });
    await context.close();
  }
  await fs.writeFile(
    "docs/qa/rewards-056/glyph-geometry.json",
    JSON.stringify(
      {
        scope:
          "Frozen CSS/raster lettering at identical phases. Images visually inspected separately; not pixel-identical text antialiasing",
        phases: [0, 325, 650, 975],
        results,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
  await server.close();
}
