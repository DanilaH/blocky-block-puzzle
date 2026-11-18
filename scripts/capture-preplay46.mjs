// Synthetic visual fixtures, distinct from the natural 60-move recording.
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const dir = process.env.VISUAL_DIR || "docs/qa/preplay46/visual";
const viewport = {
  width: Number(process.env.VISUAL_WIDTH || 390),
  height: Number(process.env.VISUAL_HEIGHT || 844),
};
await fs.mkdir(dir, { recursive: true });
const server = await createServer({
  server: { host: "127.0.0.1", port: 5194, strictPort: true },
});
await server.listen();
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport,
  deviceScaleFactor: 1,
  recordVideo: {
    dir: "/tmp/preplay46-video",
    size: viewport,
  },
});
const page = await context.newPage(),
  errors = [],
  samples = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.route("**/src/platform/ads.ts", async (route) => {
  const response = await route.fetch(),
    body = await response.text();
  const patched = body.replace(
    /export function nativeAds\(\) \{[\s\S]*?\n\}/,
    `export function nativeAds(){return {initialize:async()=>({enabled:true}),status:async()=>({rewarded:true,interstitial:true}),pending:async()=>({rewards:[]}),preload:async()=>{},acknowledge:async()=>{},addListener:async()=>({remove:async()=>{}}),show:async()=>({status:'closed',shown:false}),geometry:async()=>({epoch:0,geometry:{webView:{x:0,y:0,width:innerWidth,height:innerHeight},root:{width:innerWidth,height:innerHeight},adHeight:52}}),banner:async()=>{}};}`,
  );
  assert.notEqual(patched, body);
  await route.fulfill({ response, body: patched });
});
try {
  await page.goto("http://127.0.0.1:5194");
  await page.waitForFunction(() => !document.querySelector("#app").inert);
  for (const kind of (
    process.env.VISUAL_KINDS || "double,triple,cross4,allclear6,defeat"
  ).split(",")) {
    await page.evaluate(async (kind) => {
      const { IndexedSave } = await import("/src/platform/save.ts"),
        { newGame } = await import("/src/core/rules.ts");
      const save = new IndexedSave(),
        p = (await save.load()).profile;
      p.revision++;
      p.tutorialStep = 4;
      p.hint = null;
      delete p.metrics;
      p.game = {
        ...newGame(1234, "visual-" + kind, "flow-v4"),
        moves: 30,
        streak: 19,
        score: 12000,
        scoringVersion: "festival-v4",
        seriesBonusVersion: 1,
      };
      p.game.rhythm.cycleMoves = 30;
      p.best = p.festivalBest = p.progressionBest = 50000;
      p.settings.calm = false;
      p.settings.sound = true;
      p.settings.musicVolume = 0;
      p.wardrobe = { selected: 0, unlocked: [0], discoveries: 1 };
      const n = kind === "double" || kind === "cross4" ? 2 : 3,
        cross = kind === "cross4" || kind === "allclear6";
      p.game.board = Array.from({ length: 64 }, (_, i) => {
        const x = i % 8,
          y = i >> 3;
        return (y < n && x >= n) || (cross && x < n && y >= n)
          ? ((x + y) % 6) + 1
          : 0;
      });
      if (kind !== "allclear6") p.game.board[63] = 3;
      p.game.tray = [
        { shapeId: n === 2 ? "O2-0" : "O3-0", color: 2, used: false },
        { shapeId: "S1-0", color: 3, used: false },
        { shapeId: "S1-0", color: 4, used: false },
      ];
      if (kind === "defeat") {
        p.game.board = Array.from({ length: 64 }, (_, i) =>
          ((i % 8) + (i >> 3)) % 2 ? 2 : 0,
        );
        p.game.tray.forEach((s) => (s.shapeId = "O3-0"));
        p.game.tray[0].shapeId = "S1-0";
        p.game.status = "playing";
        p.best = p.progressionBest = 1000000;
        delete p.game.reviveOffer;
      }
      await save.write(p);
    }, kind);
    await page.reload();
    await page.waitForFunction(() => !document.querySelector("#app").inert);
    if (kind === "defeat") {
      await page.locator('[data-slot="0"]').click();
      await page.locator("#board").click({ position: { x: 5, y: 5 } });
      await page.waitForTimeout(150);
      await page.screenshot({ path: `${dir}/defeat-impact.png` });
      await page.locator("#watch-reward").waitFor();
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${dir}/defeat-offer.png` });
      await page.locator("#again").waitFor();
      await page.waitForTimeout(1800);
      await page.screenshot({ path: `${dir}/defeat-result.png` });
      continue;
    }
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${dir}/${kind}-before.png` });
    await page.locator('[data-slot="0"]').click();
    await page.locator("#board").click({ position: { x: 5, y: 5 } });
    let previous = 0;
    for (const ms of [120, 380, 900, 1700, 2600]) {
      await page.waitForTimeout(ms - previous);
      previous = ms;
      const state = await page.evaluate(async () => {
        const { IndexedSave } = await import("/src/platform/save.ts");
        const p = (await new IndexedSave().load()).profile;
        return {
          score: p.game.score,
          theme: p.wardrobe.selected,
          occupied: p.game.board.filter(Boolean).length,
          labels: [
            ...document.querySelectorAll(".reward-praise,.hud-notice"),
          ].map((n) => {
            const b = n.getBoundingClientRect();
            return {
              text: n.textContent,
              x: b.x,
              y: b.y,
              width: b.width,
              height: b.height,
            };
          }),
        };
      });
      samples.push({ kind, nominalMs: ms, ...state });
      await page.screenshot({ path: `${dir}/${kind}-${ms}.png` });
    }
  }
  assert.deepEqual(errors, []);
  const clipped = samples.flatMap((s) =>
    s.labels
      .filter(
        (b) =>
          b.x < -1 ||
          b.y < -1 ||
          b.x + b.width > viewport.width + 1 ||
          b.y + b.height > viewport.height + 1,
      )
      .map((b) => ({ kind: s.kind, ms: s.nominalMs, ...b })),
  );
  assert.deepEqual(clipped, [], "Reward label outside viewport");
  await fs.writeFile(
    `${dir}/samples.json`,
    JSON.stringify(
      {
        note: "Synthetic states; live UI input. Native ad availability mocked; no actual ad. Screenshot overhead means timestamps are nominal waits, not exact animation timestamps.",
        viewport,
        clipped,
        errors,
        samples,
      },
      null,
      2,
    ),
  );
} finally {
  await context.close();
  await browser.close();
  await server.close();
}
console.log("Visual fixtures complete");
