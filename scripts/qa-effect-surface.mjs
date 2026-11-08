import { createServer } from "vite";
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import sharp from "sharp";
const server = await createServer({
  cacheDir: "/tmp/blocky-effect-visual-cache",
  server: { host: "127.0.0.1", port: 5199 },
});
await server.listen();
const browser = await chromium.launch({ headless: true });
const output = "/tmp/blocky-effect-visual";
await fs.mkdir(output, { recursive: true });
const cases = [];
try {
  for (const backend of ["canvas2d", "webgl"]) {
    const context = await browser.newContext({
      viewport: { width: 392, height: 872 },
      deviceScaleFactor: 2.75,
      isMobile: true,
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      let seed = 12345;
      Math.random = () =>
        (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    });
    if (backend === "canvas2d")
      await page.route("**/src/game/effect-surface.ts", async (route) => {
        const response = await route.fetch(),
          source = await response.text();
        const code = source.replace(
          'gl = canvas.getContext("webgl"',
          'gl = null; false && canvas.getContext("webgl"',
        );
        if (code === source) throw Error("Missing Canvas2D transform");
        await route.fulfill({ response, body: code });
      });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    for (const variant of [0, 1, 2]) {
      await page.goto(
        "http://127.0.0.1:5199/e2e/fixtures/effect-viewport.html",
      );
      await page.waitForFunction(() => !!window.effects);
      await page.evaluate(async (variant) => {
        const { atmosphere: a, festival: f, board } = window.effects;
        const load = async (path) => {
          const i = new Image();
          i.src = path;
          await i.decode();
          return i;
        };
        f.setTextures(
          await load("/assets/vfx/chip.webp"),
          await load("/assets/vfx/flash.webp"),
        );
        a.set(20, true, false);
        a.origin(board, [6, 7]);
        a.impulse(3);
        a.last = 1000;
        a.wave = 1000;
        a.time = 0;
        f.setPalette(5);
        f.burst(board, [6, 7], 2, true, false, undefined, 110, variant);
        f.last = 1000;
      }, variant);
      let previous = 0;
      for (const time of [350, 900, 1700]) {
        const result = await page.evaluate(
          ({ previous, time }) => {
            const { atmosphere: a, festival: f } = window.effects;
            for (let at = previous + 10; at <= time; at += 10) {
              a.draw(1000 + at);
              f.draw(1000 + at);
            }
            const out = document.createElement("canvas");
            out.width = f.canvas.width;
            out.height = f.canvas.height;
            const g = out.getContext("2d");
            g.fillStyle = "#233f57";
            g.fillRect(0, 0, out.width, out.height);
            g.drawImage(a.canvas, 0, 0);
            g.drawImage(f.canvas, 0, 0);
            return {
              png: out.toDataURL().split(",")[1],
              state: JSON.stringify(f.sparks),
              size: [f.canvas.width, f.canvas.height],
              backend: [
                a.canvas.dataset.effectRenderer,
                f.canvas.dataset.effectRenderer,
              ],
            };
          },
          { previous, time },
        );
        previous = time;
        const file = `${output}/${backend}-${variant}-${time}.png`;
        await fs.writeFile(file, Buffer.from(result.png, "base64"));
        delete result.png;
        cases.push({
          ...result,
          backend,
          variant,
          time,
          file,
          surfaces: result.backend,
        });
      }
    }
    if (errors.length) throw Error(errors.join(";"));
    await context.close();
  }
  const comparisons = [];
  for (const a of cases.filter((c) => c.backend === "canvas2d")) {
    const b = cases.find(
      (c) =>
        c.backend === "webgl" && c.variant === a.variant && c.time === a.time,
    );
    const x = await sharp(a.file).raw().toBuffer(),
      y = await sharp(b.file).raw().toBuffer();
    let sum = 0,
      max = 0,
      over25 = 0;
    for (let i = 0; i < x.length; i++) {
      const d = Math.abs(x[i] - y[i]);
      sum += d;
      max = Math.max(max, d);
      if (d > 25) over25++;
    }
    comparisons.push({
      variant: a.variant,
      time: a.time,
      stateMatches: a.state === b.state,
      size: b.size,
      backend: b.surfaces,
      meanChannelDifference: sum / x.length,
      maxChannelDifference: max,
      channelsOver25Fraction: over25 / x.length,
    });
  }
  await fs.mkdir("docs/qa/effect-surface", { recursive: true });
  await fs.writeFile(
    "docs/qa/effect-surface/visual-comparison.json",
    JSON.stringify(
      {
        scope:
          "Same deterministic particles and 10ms steps. Canvas2D against WebGL, DPR1.5 backing; rasterizer antialiasing differs. Images include atmosphere and festival; rear SVG implementation unchanged.",
        comparisons,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify(comparisons, null, 2));
} finally {
  await browser.close();
  await server.close();
}
