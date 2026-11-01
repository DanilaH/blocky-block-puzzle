// Synthetic lifecycle stress in ONE loaded game. No production hooks.
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
const cycles = Number(process.env.BLOCKY_CYCLES || 60);
const server = await createServer({
  server: {
    host: "127.0.0.1",
    port: 5193,
    strictPort: true,
    hmr: false,
    watch: null,
  },
});
await server.listen();
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const cdp = await page.context().newCDPSession(page);
try {
  await page.goto("http://127.0.0.1:5193");
  await page.waitForFunction(() => !document.querySelector("#app").inert);
  await page.evaluate(async () => {
    const { ProfileStore } = await import("/src/platform/save.ts");
    const update = ProfileStore.prototype.update;
    ProfileStore.prototype.update = function (...args) {
      window.soakStore = this;
      return update.apply(this, args);
    };
    const { BoardScene } = await import("/src/game/BoardScene.ts");
    const draw = BoardScene.prototype.draw;
    BoardScene.prototype.draw = function (...args) {
      window.soakScene = this;
      return draw.apply(this, args);
    };
    const { Festival } = await import("/src/game/festival.ts");
    const burst = Festival.prototype.burst;
    Festival.prototype.burst = function (...args) {
      window.soakFestival = this;
      return burst.apply(this, args);
    };
    const { GameAudio } = await import("/src/game/audio.ts");
    const play = GameAudio.prototype.play;
    GameAudio.prototype.play = function (...args) {
      window.soakAudio = this;
      return play.apply(this, args);
    };
  });
  await page.locator("#pause").click();
  // A real settings write captures the live store, not a separate adapter.
  await page.locator("#sound").uncheck();
  await page.locator("#sound").check();
  const sample = async (label) => {
    await cdp.send("HeapProfiler.collectGarbage");
    const dom = await cdp.send("Memory.getDOMCounters");
    const heap = await cdp.send("Runtime.getHeapUsage");
    const state = await page.evaluate(async () => {
      const { visualClock } = await import("/src/game/visual-clock.ts");
      return {
        elements: document.querySelectorAll("*").length,
        canvases: document.querySelectorAll("canvas").length,
        animations: document.getAnimations().length,
        clockJobs: visualClock.jobs.size,
        sparks: window.soakFestival?.sparks.length ?? 0,
        voices: window.soakAudio?.voices.size ?? 0,
        sceneChildren: window.soakScene?.children.length ?? 0,
        tiles: window.soakScene?.study.pools.flat().length ?? 0,
      };
    });
    return { label, ...dom, heap: heap.usedSize, ...state };
  };
  const samples = [];
  for (let i = 0; i < cycles; i++) {
    await page.evaluate(async (i) => {
      const { newGame } = await import("/src/core/rules.ts");
      await window.soakStore.waitIdle();
      await window.soakStore.update((p) => {
        const game = {
          ...newGame(1234, "soak-" + i),
          moves: 10,
          streak: [0, 5, 19, 99][i % 4],
          scoringVersion: "festival-v3",
        };
        game.tray = [
          { shapeId: "O3-0", color: 2, used: false },
          { shapeId: "S1-0", color: 3, used: false },
          { shapeId: "S1-0", color: 4, used: false },
        ];
        for (let y = 0; y < 8; y++)
          for (let x = 0; x < 8; x++)
            if ((y < 3 && x >= 3) || (x < 3 && y >= 3))
              game.board[y * 8 + x] = ((x + y) % 6) + 1;
        if (i % 2) game.board[63] = 3;
        return {
          ...p,
          revision: p.revision + 1,
          tutorialStep: 4,
          best: 10000000,
          festivalBest: 10000000,
          game,
        };
      });
    }, i);
    await page.locator("#resume").click();
    await page.locator('[data-slot="0"]').click();
    const board = await page.locator("#board").boundingBox();
    await page.mouse.click(
      board.x + board.width / 16,
      board.y + board.height / 16,
    );
    await page.waitForFunction(() => window.soakStore.state.game.moves === 11);
    const b = await page.locator('[data-slot="1"]').boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(150, 300, { steps: 4 });
    await page.waitForTimeout(350);
    await page.mouse.move(1, 1);
    await page.mouse.up();
    await page.locator("#pause").click();
    await page.waitForTimeout(50);
    // Also exercise real restart, with no page reload.
    if (i % 10 === 9) {
      await page.locator("#restart").click();
      await page.locator("#new-game").click();
      await page.locator("#pause").click();
    }
    if (i % 10 === 9 || i === 0) {
      const s = await sample(i + 1);
      samples.push(s);
      console.log(JSON.stringify(s));
    }
  }
  await page.waitForTimeout(2200);
  samples.push(await sample("settled"));
  const result = {
    environment:
      "Chromium software renderer, synthetic repeated clear/drag/pause and restart; not a 30-minute physical playtest",
    cycles,
    errors,
    samples,
  };
  await fs.writeFile("/tmp/blocky-soak.json", JSON.stringify(result, null, 2));
  if (
    errors.length ||
    samples.some(
      (s) =>
        s.clockJobs !== 0 ||
        s.sparks !== 0 ||
        s.voices !== 0 ||
        s.tiles !== 768,
    )
  )
    throw Error("Lifecycle bounds failed");
} finally {
  await browser.close();
  await server.close();
}
