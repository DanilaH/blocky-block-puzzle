// Prepared positions to compare effects. Not natural gameplay or proof of dealer balance.
import { createServer } from "vite";
import { chromium } from "playwright";
import fs from "node:fs/promises";
const dir = process.env.CAPTURE_DIR;
if (!dir) throw Error("CAPTURE_DIR required");
await fs.mkdir(dir, { recursive: true });
const server = await createServer({
  server: { port: 5193, host: "127.0.0.1" },
});
await server.listen();
const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => {
    throw e;
  });
  await page.route("**/src/main.ts", async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(
      "const analytics =",
      "window.demo = {store, audio, render:()=>render()}; const analytics =",
    );
    await route.fulfill({ response, body });
  });
  if (process.env.CAPTURE_REVIVE)
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
      if (patched === body) throw Error("mock bridge not installed");
      await route.fulfill({ response, body: patched });
    });
  await page.addInitScript(() => {
    const Base = window.AudioContext;
    window.AudioContext = class extends Base {
      constructor(...args) {
        super(...args);
        window.soundTap = this.createMediaStreamDestination();
      }
      createDynamicsCompressor() {
        const n = super.createDynamicsCompressor();
        n.connect(window.soundTap);
        return n;
      }
    };
  });
  await page.goto("http://127.0.0.1:5193");
  await page.waitForFunction(
    () => window.demo && !document.querySelector("#app").inert,
  );
  await page.evaluate(
    async (seed) => {
      const { IndexedSave } = await import("/src/platform/save.ts");
      const p = structuredClone(window.demo.store.state);
      p.revision++;
      p.tutorialStep = 4;
      const { newGame } = await import("/src/core/rules.ts");
      p.game = {
        ...newGame(seed, "natural-capture", "flow-v4"),
        scoringVersion: "festival-v4",
        seriesBonusVersion: 1,
      };
      p.wardrobe = { selected: 0, unlocked: [0], discoveries: 0 };
      p.settings.musicVolume = 0;
      p.settings.effectsVolume = 1;
      p.settings.sound = true;
      p.settings.calm = false;
      await new IndexedSave().write(p);
    },
    Number(process.env.CAPTURE_SEED || 1777),
  );
  await page.reload();
  await page.waitForFunction(
    () => window.demo && !document.querySelector("#app").inert,
  );
  await page.locator('[data-slot="0"]').click();
  await page.waitForFunction(() => !!window.demo.audio.context);
  await page.waitForTimeout(1000);
  const cdp = await context.newCDPSession(page),
    frames = [],
    writes = [];
  cdp.on("Page.screencastFrame", (e) => {
    const file = `frame-${String(frames.length).padStart(5, "0")}.jpg`;
    frames.push({ file, t: e.metadata.timestamp });
    writes.push(fs.writeFile(dir + "/" + file, Buffer.from(e.data, "base64")));
    void cdp.send("Page.screencastFrameAck", { sessionId: e.sessionId });
  });
  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 90,
    maxWidth: 390,
    maxHeight: 844,
    everyNthFrame: 1,
  });
  const start = await page.evaluate(
    () =>
      new Promise((resolve) => {
        window.soundChunks = [];
        window.soundRecorder = new MediaRecorder(window.soundTap.stream, {
          mimeType: "audio/webm;codecs=opus",
          audioBitsPerSecond: 192000,
        });
        window.soundRecorder.ondataavailable = (e) =>
          window.soundChunks.push(e.data);
        window.soundRecorder.onstart = () => resolve(Date.now() / 1000);
        window.soundRecorder.start();
      }),
  );
  const events = [];
  for (const kind of [
    "place",
    "single",
    "double",
    "triple",
    "quad",
    "cross",
    "series",
    "theme",
  ]) {
    await page.evaluate(async (kind) => {
      const R = await import("/src/core/rules.ts");
      await window.demo.store.update((p) => {
        const g = {
          ...R.newGame(32, "fixture-" + kind, "flow-v4"),
          scoringVersion: "festival-v4",
          seriesBonusVersion: 1,
        };
        let shape = R.SHAPES.find((s) => s.cells.length === 1);
        if (["single", "double", "triple", "quad"].includes(kind)) {
          const n = { single: 1, double: 2, triple: 3, quad: 4 }[kind];
          shape = R.SHAPES.find(
            (s) => s.width === 1 && s.height === n && s.cells.length === n,
          );
          for (let y = 0; y < n; y++)
            for (let x = 1; x < 8; x++) g.board[y * 8 + x] = 1 + ((x + y) % 6);
        } else if (kind === "cross") {
          for (let i = 1; i < 8; i++) {
            g.board[i] = (i % 6) + 1;
            g.board[i * 8] = (i % 6) + 1;
          }
        } else if (kind === "theme") {
          for (let i = 1; i < 8; i++) g.board[i] = (i % 6) + 1;
        } else if (kind === "series") {
          g.streak = 12;
          g.streakMisses = 2;
        }
        if (kind !== "theme") g.board[63] = 3;
        g.tray = [
          { shapeId: shape.id, color: 2, used: false },
          { shapeId: "S1-0", color: 3, used: false },
          { shapeId: "S1-0", color: 4, used: false },
        ];
        return {
          ...p,
          revision: p.revision + 1,
          game: g,
          metrics: undefined,
          hint: null,
          best: 100000,
          festivalBest: 100000,
          progressionBest: 100000,
          tutorialStep: 4,
        };
      });
      window.demo.render();
    }, kind);
    await page.waitForTimeout(1100);
    await page.locator('[data-slot="0"]').click();
    await page.locator("#board").click({ position: { x: 5, y: 5 } });
    events.push({
      kind,
      t: (await page.evaluate(() => Date.now() / 1000)) - start,
    });
    await page.waitForTimeout(450);
    await page.screenshot({ path: dir + "/" + kind + ".png" });
    await page.waitForTimeout(kind === "theme" ? 3500 : 2500);
  }
  await page.waitForTimeout(2200);
  const result = await page.evaluate(
    () =>
      new Promise((resolve) => {
        window.soundRecorder.onstop = async () => {
          const bytes = new Uint8Array(
            await new Blob(window.soundChunks).arrayBuffer(),
          );
          let s = "";
          for (let i = 0; i < bytes.length; i += 32768)
            s += String.fromCharCode(...bytes.subarray(i, i + 32768));
          resolve(btoa(s));
        };
        window.soundRecorder.stop();
      }),
  );
  const end = await page.evaluate(() => Date.now() / 1000);
  await cdp.send("Page.stopScreencast");
  await Promise.all(writes);
  await fs.writeFile(dir + "/audio.webm", Buffer.from(result, "base64"));
  await fs.writeFile(
    dir + "/timing.json",
    JSON.stringify({ start, end, frames, events }, null, 2),
  );
  console.log(
    JSON.stringify({ duration: end - start, frames: frames.length, events }),
  );
} finally {
  await browser.close();
  await server.close();
}
