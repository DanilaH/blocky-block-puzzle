// Prepared lost position; mock reward bridge. This is UX evidence, not a real ad.
import { createServer } from "vite";
import { chromium } from "playwright";
import fs from "node:fs/promises";
const out = process.env.CAPTURE_DIR;
if (!out) throw Error("CAPTURE_DIR required");
await fs.mkdir(out, { recursive: true });
const server = await createServer({
  server: { port: 5194, host: "127.0.0.1" },
});
await server.listen();
const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    recordVideo: { dir: out, size: { width: 390, height: 844 } },
  });
  const page = await ctx.newPage();
  await page.route("**/src/platform/ads.ts", async (route) => {
    const response = await route.fetch(),
      body = await response.text();
    const patched = body.replace(
      /export function nativeAds\(\) \{[\s\S]*?\n\}/,
      `export function nativeAds(){return {
      initialize:async()=>({enabled:true}),status:async()=>({rewarded:true,interstitial:false}),pending:async()=>({rewards:[]}),preload:async()=>{},acknowledge:async()=>{},addListener:async()=>({remove:async()=>{}}),
      geometry:async()=>({epoch:0,geometry:{webView:{x:0,y:0,width:innerWidth,height:innerHeight},root:{width:innerWidth,height:innerHeight},adHeight:52}}),banner:async()=>{},
      show:async p=>{const label=document.createElement('div');label.textContent='Тестовое подтверждение награды';label.style.cssText='position:fixed;inset:0;display:grid;place-items:center;background:#102534;color:white;z-index:9999';document.body.append(label);await new Promise(r=>setTimeout(r,1000));label.remove();return {status:'closed',shown:true,rewards:[{id:'demo-'+p.intentId,intentId:p.intentId}]};}
    };}`,
    );
    if (patched === body) throw Error("bridge replacement failed");
    await route.fulfill({ response, body: patched });
  });
  await page.goto("http://127.0.0.1:5194");
  await page.locator("#lesson-skip").click();
  const lose = async () => {
    await page.evaluate(async () => {
      const { IndexedSave } = await import("/src/platform/save.ts");
      const { newGame } = await import("/src/core/rules.ts");
      const s = new IndexedSave(),
        p = (await s.load()).profile;
      p.revision++;
      p.tutorialStep = 4;
      delete p.metrics;
      p.hint = null;
      p.game = newGame(11, "revive-capture", "flow-v4");
      p.game.status = "over";
      p.game.score = 14650;
      p.best = 14650;
      p.game.board = Array.from({ length: 64 }, (_, i) =>
        ((i % 8) + Math.floor(i / 8)) % 2 ? 3 : 0,
      );
      p.game.tray.forEach((s) => (s.shapeId = "O3-0"));
      await s.write(p);
    });
    await page.reload();
    await page.locator("#revive-clock").waitFor();
  };
  await page.waitForTimeout(900);
  await page.locator("#pause").click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: out + "/pause.png" });
  await page.locator("#themes").click();
  await page.waitForTimeout(350);
  await page.screenshot({ path: out + "/themes.png" });
  await page.locator("#back-themes").click();
  await page.locator("#resume").click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: out + "/game.png" });
  await lose();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: out + "/offer.png" });
  await page.locator("#again").waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({ path: out + "/final-result.png" });
  await page.waitForTimeout(1300);
  await lose();
  await page.waitForTimeout(1400);
  await page.locator("#watch-reward").click();
  await page.waitForFunction(() => !document.querySelector("dialog").open);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: out + "/resumed.png" });
  const video = page.video();
  await ctx.close();
  await video.saveAs(out + "/revive-flow.webm");
} finally {
  await browser.close();
  await server.close();
}
