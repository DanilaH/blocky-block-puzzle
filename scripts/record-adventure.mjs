// Actual UI, authored solutions and live game audio. Not human playtest footage.
import { createServer } from "vite";
import { chromium } from "playwright";
import fs from "node:fs/promises";
const dir = process.env.CAPTURE_DIR;
if (!dir) throw Error("CAPTURE_DIR required");
await fs.mkdir(dir, { recursive: true });
const server = await createServer({
  server: { host: "127.0.0.1", port: 5193 },
});
await server.listen();
const browser = await chromium.launch();
try {
  const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1,
    }),
    page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
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
  await page.goto("http://127.0.0.1:5193/?mode=adventure");
  await page.waitForFunction(() => window.__adventure);
  await page.locator('[data-level="cove-1"]').click();
  await page.waitForFunction(() => window.soundTap);
  await page.waitForTimeout(1000);
  const cdp = await context.newCDPSession(page),
    frames = [],
    writes = [];
  cdp.on("Page.screencastFrame", (e) => {
    const file = `frame-${String(frames.length).padStart(5, "0")}.jpg`;
    frames.push({ file, t: e.metadata.timestamp });
    writes.push(fs.writeFile(`${dir}/${file}`, Buffer.from(e.data, "base64")));
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
  for (let i = 0; i < 5; i++) {
    if (i) await page.locator("#adv-next").click();
    await page.waitForTimeout(1100);
    const solution = await page.evaluate(
      (i) => window.__adventure.levels[i].solution,
      i,
    );
    for (const m of solution) {
      await page.locator(`[data-slot="${m.slot}"]`).click();
      await page.waitForTimeout(180);
      await page.locator(`[data-cell="${m.y * 8 + m.x}"]`).click();
      await page.waitForTimeout(1400);
    }
    events.push({
      level: i + 1,
      status: await page.evaluate(
        () => window.__adventure.store.state.campaign.active.status,
      ),
    });
    await page.waitForTimeout(1000);
  }
  await page.locator("#adv-map").click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${dir}/complete.png` });
  const result = await page.evaluate(
    () =>
      new Promise((resolve) => {
        window.soundRecorder.onstop = async () => {
          const b = new Uint8Array(
            await new Blob(window.soundChunks).arrayBuffer(),
          );
          let s = "";
          for (let i = 0; i < b.length; i += 32768)
            s += String.fromCharCode(...b.subarray(i, i + 32768));
          resolve(btoa(s));
        };
        window.soundRecorder.stop();
      }),
  );
  const end = await page.evaluate(() => Date.now() / 1000);
  await cdp.send("Page.stopScreencast");
  await Promise.all(writes);
  await fs.writeFile(`${dir}/audio.webm`, Buffer.from(result, "base64"));
  await fs.writeFile(
    `${dir}/timing.json`,
    JSON.stringify({ start, end, frames, events, errors }, null, 2),
  );
  console.log(JSON.stringify({ duration: end - start, events, errors }));
  if (errors.length) throw Error(errors.join("\n"));
} finally {
  await browser.close();
  await server.close();
}
