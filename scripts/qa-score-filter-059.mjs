// Static pixel calibration of equivalent glyph shadows, not a frame-rate test.
import fs from "node:fs/promises";
import { chromium } from "@playwright/test";
import sharp from "sharp";
const output = "/workspace/scratch/03c53152a52e/analysis059/filter-visual";
await fs.mkdir(output, { recursive: true });
const css = (await Promise.all(["style", "enamel", "classic", "arcade"].map(name => fs.readFile(new URL(`../src/${name}.css`, import.meta.url), "utf8")))).join("\n");
const browser = await chromium.launch();
const rows = [];
try {
  const page = await browser.newPage({ viewport: { width: 392, height: 872 }, deviceScaleFactor: 2.75 });
  await page.setContent(`<!doctype html><html data-presentation="classic"><head><style>${css}</style><style>:root{--world-ink:#325376;--world-bg:#f4f3ee}body,#app{background:#f4f3ee}.score-panel{position:absolute;inset:0}</style></head><body><div id="app"><section class="score-panel"><div><div id="score" class="score">1 574</div></div></section></div></body></html>`);
  const clip = await page.locator("#score").boundingBox();
  clip.x -= 38; clip.y -= 38; clip.width += 76; clip.height += 76;
  for (const at of [0, 80, 180, 350, 550]) {
    const buffers = [];
    for (const mode of ["old", "filter"]) {
      await page.evaluate(({ mode, at }) => {
        const el = document.querySelector("#score");
        el.getAnimations().forEach(a => a.cancel());
        el.style.willChange = "transform,filter";
        el.style.textShadow = mode === "filter" ? "none" : "";
        const a = el.animate(mode === "old" ? [
          { textShadow: "0 0 18px #8edaff" },
          { textShadow: "0 2px 2px #00000026" },
        ] : [
          { filter: "drop-shadow(0 0 9px #8edaff)" },
          { filter: "drop-shadow(0 2px 1px #00000026)" },
        ], { duration: 600, easing: "cubic-bezier(.2,.8,.25,1)", fill: "both" });
        a.pause(); a.currentTime = at;
      }, { mode, at });
      const buffer = await page.screenshot({ clip });
      await fs.writeFile(`${output}/${mode}-${at}.png`, buffer);
      buffers.push(await sharp(buffer).ensureAlpha().raw().toBuffer());
    }
    let total = 0, max = 0, changed = 0;
    for (let i = 0; i < buffers[0].length; i += 4) {
      let local = 0;
      for (let channel = 0; channel < 3; channel++) { const d = Math.abs(buffers[0][i + channel] - buffers[1][i + channel]); total += d; max = Math.max(max, d); local = Math.max(local, d); }
      if (local > 8) changed++;
    }
    const row = { atMs: at, meanChannelError: total / (buffers[0].length / 4 * 3), maxChannelError: max, percentPixelsOver8: changed / (buffers[0].length / 4) * 100 };
    rows.push(row); console.log(JSON.stringify(row));
  }
} finally { await browser.close(); }
await fs.writeFile(`${output}/result.json`, JSON.stringify(rows, null, 2));
