// Controlled positions, actual UI and live mixed Web Audio. Not a natural playthrough.
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
  await page.evaluate(async () => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    const p = structuredClone(window.demo.store.state);
    p.revision++;
    p.tutorialStep = 4;
    p.best = p.progressionBest = 1000000;
    p.settings.musicVolume = 0.35;
    p.settings.effectsVolume = 1;
    p.settings.sound = true;
    p.settings.calm = false;
    await new IndexedSave().write(p);
  });
  await page.reload();
  await page.waitForFunction(
    () => window.demo && !document.querySelector("#app").inert,
  );
  await page.locator('[data-slot="0"]').click();
  await page.waitForFunction(() => window.demo.audio.music?.source);
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
  await page.waitForTimeout(2400);
  const events = [];
  for (const streak of [1, 2, 4, 6, 10, 16, 20]) {
    await page.evaluate(async (streak) => {
      const { IndexedSave } = await import("/src/platform/save.ts");
      const p = structuredClone(window.demo.store.state),
        g = p.game;
      p.revision++;
      g.revision++;
      g.streak = streak - 1;
      g.streakMisses = 0;
      g.status = "playing";
      g.scoringVersion = "festival-v4";
      g.board = Array(64).fill(0);
      for (let x = 0; x < 7; x++) g.board[24 + x] = (x % 6) + 1;
      if (streak !== 20) g.board[56] = 3;
      g.tray = [0, 1, 2].map((i) => ({
        shapeId: "S1-0",
        color: i + 2,
        used: false,
      }));
      await new IndexedSave().write(p);
      window.demo.store.state = p;
      window.demo.render();
    }, streak);
    await page.waitForTimeout(600);
    await page.locator('[data-slot="0"]').click();
    const box = await page.locator("#board").boundingBox();
    await page
      .locator("#board")
      .click({
        position: { x: (box.width * 7.5) / 8, y: (box.height * 3.5) / 8 },
      });
    events.push({
      streak,
      t: (await page.evaluate(() => Date.now() / 1000)) - start,
    });
    await page.waitForTimeout(700);
    await page.screenshot({ path: dir + `/series-${streak}.png` });
    if (streak === 6) {
      await page.locator('[data-slot="1"]').click();
      await page
        .locator("#board")
        .click({
          position: { x: (box.width * 0.5) / 8, y: (box.height * 0.5) / 8 },
        });
    }
    await page.waitForTimeout(3000);
  }
  // Actual three preparation placements demonstrate graceful music-layer removal.
  for (let move = 0; move < 3; move++) {
    const placement = await page.evaluate(async () => {
      const { fits, shapeById } = await import("/src/core/rules.ts");
      const g = window.demo.store.state.game;
      const slot = g.tray.findIndex((s) => !s.used),
        shape = shapeById(g.tray[slot].shapeId);
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 8; x++)
          if (fits(g.board, shape, x, y)) return { slot, x, y };
    });
    await page.locator(`[data-slot="${placement.slot}"]`).click();
    const box = await page.locator("#board").boundingBox();
    await page
      .locator("#board")
      .click({
        position: {
          x: (box.width * (placement.x + 0.5)) / 8,
          y: (box.height * (placement.y + 0.5)) / 8,
        },
      });
    await page.waitForTimeout(900);
  }
  await page.waitForTimeout(3000);
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
