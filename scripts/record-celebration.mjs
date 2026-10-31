// Actual Chromium frames + live Web Audio. Requires old/new Vite on 5186/5185.
import { chromium } from "playwright";
import fs from "node:fs/promises";
const root = new URL("../../celebration-capture/", import.meta.url).pathname;
const b = await chromium.launch();
for (const [version, port] of [["after", 5185]])
  for (const kind of ["sequence", "gameplay"]) {
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
      if (kind !== "gameplay")
        q.game.tray = [0, 1, 2].map((i) => ({
          shapeId: "S1-0",
          color: i + 1,
          used: false,
        }));
      if (kind === "sequence") {
        for (const y of [3, 5])
          for (let x = 0; x < 7; x++) q.game.board[y * 8 + x] = (x % 6) + 1;
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
    if (kind === "gameplay") {
      // Same seed, real dealt pieces, real accepted UI moves; no hand-filled board.
      for (let step = 0; step < 22; step++) {
        const move = await p.evaluate(async (step) => {
          const { IndexedSave } = await import("/src/platform/save.ts"),
            R = await import("/src/core/rules.ts");
          const g = (await new IndexedSave().load()).profile.game;
          const opts = g.tray.flatMap((s, slot) =>
            s.used
              ? []
              : R.placements(g.board, R.shapeById(s.shapeId)).map((m) => ({
                  ...m,
                  slot,
                })),
          );
          if (!opts.length) return null;
          let m = opts[0],
            rank = -Infinity;
          for (const opt of opts) {
            const r = R.place(
              g.board,
              R.shapeById(g.tray[opt.slot].shapeId),
              opt.x,
              opt.y,
            );
            const value = r.lines * 100 + r.board.filter((x) => !x).length;
            if (value > rank) {
              rank = value;
              m = opt;
            }
          }
          return { ...m, moves: g.moves };
        }, step);
        if (!move) break;
        await p.locator(".piece").nth(move.slot).click();
        const box = await p.locator("#board").boundingBox();
        await p.waitForTimeout(180);
        await p.locator("#board").click({
          position: {
            x: ((move.x + 0.5) * box.width) / 8,
            y: ((move.y + 0.5) * box.height) / 8,
          },
        });
        await p.waitForFunction(async (n) => {
          const { IndexedSave } = await import("/src/platform/save.ts");
          return (await new IndexedSave().load()).profile.game.moves === n + 1;
        }, move.moves);
        await p.waitForTimeout(320);
      }
      await p.screenshot({ path: root + `${version}-gameplay.png` });
    } else {
      const board = await p.locator("#board").boundingBox();
      // Deterministic setup: clear -> preparation -> clear, with real pointer aim.
      for (const [slot, x, y, wait] of [
        [0, 7, 3, 400],
        [1, 0, 0, 300],
        [2, 7, 5, 2500],
      ]) {
        const piece = await p.locator(".piece").nth(slot).boundingBox();
        await p.mouse.move(
          piece.x + piece.width / 2,
          piece.y + piece.height / 2,
        );
        await p.mouse.down();
        await p.mouse.move(
          board.x + ((x + 0.5) * board.width) / 8,
          board.y + ((y + 0.5) * board.height) / 8,
          { steps: 12 },
        );
        if (slot === 0) {
          await p.waitForTimeout(600);
          await p.screenshot({ path: root + "preview.png" });
          await p.mouse.move(
            board.x + board.width * 0.5,
            board.y + board.height * 0.5,
            { steps: 8 },
          );
          await p.waitForTimeout(250);
          await p.mouse.move(
            board.x + ((x + 0.5) * board.width) / 8,
            board.y + ((y + 0.5) * board.height) / 8,
            { steps: 8 },
          );
          await p.waitForTimeout(350);
        } else await p.waitForTimeout(160);
        await p.mouse.up();
        await p.waitForTimeout(220);
        if (slot === 2) await p.screenshot({ path: root + "combo.png" });
        await p.waitForTimeout(wait);
      }
    }
    await p.waitForTimeout(2200);
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
