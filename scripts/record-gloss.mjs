// Actual Chromium frames + live Web Audio. Requires old/new Vite on 5184/5185.
import { chromium } from "playwright";
import fs from "node:fs/promises";
const root = new URL("../docs/qa/feel-0.11/", import.meta.url).pathname;
const b = await chromium.launch();
for (const [version, port] of [
  ["before", 5184],
  ["after", 5185],
])
  for (const kind of ["placement", "right-line", "cross", "allClear"]) {
    const dir = root + `${version}-${kind}/`;
    await fs.mkdir(dir, { recursive: true });
    const c = await b.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
      }),
      p = await c.newPage();
    await p.addInitScript(() => {
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
    await p.goto(`http://127.0.0.1:${port}`);
    await p.locator("#board canvas").waitFor();
    await p.evaluate(async (kind) => {
      const { IndexedSave } = await import("/src/platform/save.ts"),
        { newGame } = await import("/src/core/rules.ts"),
        { createProfile } = await import("/src/core/profile.ts");
      const a = new IndexedSave(),
        old = await a.load(),
        q = createProfile(newGame(1234, "contact-showcase"));
      q.revision = old.profile.revision + 1;
      q.tutorialStep = 4;
      q.best = 1000;
      q.game.tray = [0, 1, 2].map((i) => ({
        shapeId: "S1-0",
        color: i + 1,
        used: false,
      }));
      if (kind !== "placement") {
        for (let x = 0; x < 7; x++) q.game.board[24 + x] = (x % 6) + 1;
        if (kind === "cross")
          for (let y = 0; y < 8; y++)
            if (y !== 3) q.game.board[y * 8 + 7] = (y % 6) + 1;
        if (kind !== "allClear") q.game.board[56] = 3;
      }
      await a.write(q);
    }, kind);
    await p.reload();
    await p.locator("#board canvas").waitFor();
    await p.locator(".piece").first().click();
    await p.waitForTimeout(200);
    const client = await c.newCDPSession(p),
      frames = [],
      writes = [];
    client.on("Page.screencastFrame", (e) => {
      const file = `frame-${String(frames.length).padStart(5, "0")}.jpg`;
      frames.push({ file, t: e.metadata.timestamp });
      writes.push(fs.writeFile(dir + file, Buffer.from(e.data, "base64")));
      void client.send("Page.screencastFrameAck", { sessionId: e.sessionId });
    });
    await client.send("Page.startScreencast", {
      format: "jpeg",
      quality: 92,
      maxWidth: 390,
      maxHeight: 844,
      everyNthFrame: 1,
    });
    const start = await p.evaluate(
      () =>
        new Promise((resolve) => {
          window.soundChunks = [];
          window.soundRecorder = new MediaRecorder(window.soundTap.stream, {
            mimeType: "audio/webm;codecs=opus",
          });
          window.soundRecorder.ondataavailable = (e) =>
            window.soundChunks.push(e.data);
          window.soundRecorder.onstart = () => resolve(Date.now() / 1000);
          window.soundRecorder.start();
        }),
    );
    await p.waitForTimeout(300);
    await p.locator(".piece").first().click();
    const board = await p.locator("#board").boundingBox();
    await p.locator("#board").click({
      position:
        kind === "placement"
          ? { x: board.width * 0.45, y: board.height * 0.45 }
          : { x: (board.width * 7.5) / 8, y: (board.height * 3.5) / 8 },
    });
    await p.waitForTimeout(180);
    await p.screenshot({ path: root + `${version}-${kind}.png` });
    if (kind === "placement") {
      await p.locator(".piece").nth(1).click();
      await p
        .locator("#board")
        .click({ position: { x: board.width * 0.65, y: board.height * 0.65 } });
    }
    await p.waitForTimeout(1000);
    const audio = await p.evaluate(
      () =>
        new Promise((resolve) => {
          window.soundRecorder.onstop = async () => {
            const bytes = new Uint8Array(
              await new Blob(window.soundChunks).arrayBuffer(),
            );
            let s = "";
            for (const v of bytes) s += String.fromCharCode(v);
            resolve(btoa(s));
          };
          window.soundRecorder.stop();
        }),
    );
    const end = await p.evaluate(() => Date.now() / 1000);
    await client.send("Page.stopScreencast");
    await Promise.all(writes);
    await fs.writeFile(dir + "audio.webm", Buffer.from(audio, "base64"));
    await fs.writeFile(
      dir + "timing.json",
      JSON.stringify({ start, end, frames }, null, 2),
    );
    console.log(
      version,
      kind,
      frames.length,
      "frames",
      Math.round((end - start) * 1000),
      "ms",
    );
    await c.close();
  }
await b.close();
