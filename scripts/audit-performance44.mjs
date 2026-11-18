// Diagnostic ablations only. Never imported by the game.
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
const server = await createServer({
  root: process.env.BLOCKY_ROOT || process.cwd(),
  server: { host: "127.0.0.1", port: 5192, strictPort: true },
});
await server.listen();
const browser = await chromium.launch();
const results = [];
const tracing = process.env.BLOCKY_TRACE === "1";
const modes = (process.env.BLOCKY_MODES || "full,all-clear,refill,idle-drag").split(",");
const allowed = new Set([
  "full",
  "all-clear",
  "all-clear-no-festival",
  "all-clear-no-overlays",
  "all-clear-no-filters",
  "all-clear-promote",
  "refill",
  "idle-drag",
  "no-festival",
  "no-ambient",
  "no-filters",
  "no-theme-transition",
  "no-graphics",
  "no-ink",
  "no-bed",
  "no-material-blend",
  "no-dom-blend",
  "no-board-blend",
  "no-overlay-canvases",
]);
if (modes.some((mode) => !allowed.has(mode))) {
  await browser.close();
  await server.close();
  throw new Error("Unsupported BLOCKY_MODES");
}
try {
  for (let repeat = 0; repeat < Number(process.env.BLOCKY_REPEATS || 3); repeat++)
    for (const mode of modes) {
      const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
      });
      await page.addInitScript(policy => { window.__auditDealer = policy; }, process.env.BLOCKY_DEALER || "flow-v1");
      await page.goto("http://127.0.0.1:5192");
      await page.waitForFunction(() => !document.querySelector("#app").inert);
      await page.evaluate(async (mode) => {
        const { IndexedSave } = await import("/src/platform/save.ts");
        const { newGame } = await import("/src/core/rules.ts");
        const a = new IndexedSave(),
          p = (await a.load()).profile;
        p.revision++;
        p.tutorialStep = 4;
        p.best = p.festivalBest = 100000;
        p.game = {
          ...newGame(1234, "perf-audit", "flow-v4"),
          moves: 10,
          streak: 5,
          scoringVersion: "festival-v4", seriesBonusVersion: 1,
        };
        p.wardrobe = { selected: 0, unlocked: [0], discoveries: 1 };
        p.game.tray = [
          { shapeId: "O3-0", color: 2, used: false },
          { shapeId: "S1-0", color: 3, used: false },
          { shapeId: "S1-0", color: 4, used: false },
        ];
        for (let y = 0; y < 8; y++)
          for (let x = 0; x < 8; x++)
            if ((y < 3 && x >= 3) || (x < 3 && y >= 3))
              p.game.board[y * 8 + x] = ((x + y) % 6) + 1;
        p.game.board[63] = 3;
        if (mode.startsWith('all-clear')) p.game.board[63] = 0;
        if (mode === 'refill') {
          p.game.board.fill(0); p.game.dealerVersion = window.__auditDealer;
          p.game.tray[1].used = p.game.tray[2].used = true;
        }
        await a.write(p);
      }, mode);
      await page.reload();
      await page.waitForFunction(() => !document.querySelector("#app").inert);
      await page.waitForTimeout(1200);
      await page.screenshot({
        path:
          "/tmp/blocky-" +
          (process.env.BLOCKY_TAG || "current") +
          "-" +
          mode +
          ".png",
      });
      await page.evaluate(async (mode) => {
        const { performanceCapture } = await import('/src/platform/performance.ts');
        performanceCapture.start(); performanceCapture.setActive(true);
        window.audit = {
          rectReads: 0,
          previewCalls: 0,
          draws: 0,
          drawCPU: 0,
          festivalPeak: 0,
          vfxPeak: 0,
          long: [],
        };
        const rect = Element.prototype.getBoundingClientRect;
        Element.prototype.getBoundingClientRect = function (...a) {
          if (this.id === "board") window.audit.rectReads++;
          return rect.apply(this, a);
        };
        const { BoardScene } = await import("/src/game/BoardScene.ts");
        const draw = BoardScene.prototype.draw,
          preview = BoardScene.prototype.preview;
        BoardScene.prototype.preview = function (...a) {
          window.audit.previewCalls++;
          return preview.apply(this, a);
        };
        BoardScene.prototype.draw = function (...a) {
          const t = performance.now();
          const r = draw.apply(this, a);
          window.audit.draws++;
          window.audit.drawCPU += performance.now() - t;
          window.audit.vfxPeak = Math.max(
            window.audit.vfxPeak,
            this.vfx?.cursor ?? 0,
          );
          if (mode === "no-graphics" || mode === "no-ink")
            this.ink.setVisible(false);
          if (mode === "no-graphics" || mode === "no-bed")
            this.bed?.setVisible(false);
          return r;
        };
        const { Festival } = await import("/src/game/festival.ts");
        const fd = Festival.prototype.draw;
        Festival.prototype.draw = function (...a) {
          window.audit.festivalPeak = Math.max(
            window.audit.festivalPeak,
            this.sparks.length,
          );
          if (mode === "no-festival" || mode.endsWith("no-festival") || mode.endsWith("no-overlays") || mode === "no-overlay-canvases") {
            this.stop();
            return;
          }
          return fd.apply(this, a);
        };
        if (mode === "no-ambient" || mode.endsWith("no-overlays") || mode === "no-overlay-canvases") {
          const { Atmosphere } = await import("/src/game/atmosphere.ts");
          Atmosphere.prototype.draw = function () {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
          };
        }
        if (mode === "no-material-blend" || mode === "no-dom-blend") {
          const { TileMaterialDOM } = await import(
            "/src/game/tile-material.ts"
          );
          const set = TileMaterialDOM.prototype.set;
          TileMaterialDOM.prototype.set = function (material) {
            return set.call(this, material, 0);
          };
        }
        if (mode === "no-material-blend" || mode === "no-board-blend") {
          const { TileStudySprites } = await import("/src/game/tile-study.ts");
          const set = TileStudySprites.prototype.setMaterial;
          TileStudySprites.prototype.setMaterial = function (material, now) {
            return set.call(this, material, now, 0);
          };
        }
        if (mode.endsWith("no-filters") || mode === "no-theme-transition") {
          const s = document.createElement("style");
          s.textContent =
            mode.endsWith("no-filters")
              ? "*,*::before,*::after {filter:none!important;backdrop-filter:none!important}"
              : ":root,.board-wrap,.mini-cell {transition:none!important}";
          document.head.append(s);
        }
        if (mode === 'all-clear-promote') {
          const s=document.createElement('style');s.textContent='#board canvas,.festival-canvas,.ambient-canvas {will-change:transform;transform:translateZ(0)}';document.head.append(s);
        }
        new PerformanceObserver((list) =>
          window.audit.long.push(...list.getEntries().map((e) => e.duration)),
        ).observe({ type: "longtask" });
      }, mode);
      const traceCDP = tracing
        ? await page.context().newCDPSession(page)
        : null;
      if (traceCDP)
        await traceCDP.send("Tracing.start", {
          categories:
            "devtools.timeline,disabled-by-default-devtools.timeline,v8,blink.user_timing",
          transferMode: "ReturnAsStream",
        });
      const placementStart = Date.now();
      if (mode !== "idle-drag") {
        await page.locator('[data-slot="0"]').click();
        const b = await page.locator("#board").boundingBox();
        await page.mouse.click(b.x + b.width / 16, b.y + b.height / 16);
        await page.waitForFunction(async () => {
          const {IndexedSave} = await import('/src/platform/save.ts');
          return (await new IndexedSave().load()).profile.game.moves === 11;
        });
      }
      const placementWallMs = Date.now() - placementStart;
      const piece = await page.locator('[data-slot="1"]').boundingBox();
      await page.mouse.move(
        piece.x + piece.width / 2,
        piece.y + piece.height / 2,
      );
      await page.mouse.down();
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Performance.enable");
      const before = (await cdp.send("Performance.getMetrics")).metrics;
      const frames = await page.evaluate(
        () =>
          new Promise((resolve) => {
            const samples = [];
            const start = performance.now();
            let last = start;
            let n = 0;
            function step(t) {
              samples.push(t - last);
              last = t;
              n++;
              window.dispatchEvent(
                new PointerEvent("pointermove", {
                  pointerId: 1,
                  pointerType: "mouse",
                  buttons: 1,
                  clientX: 70 + (n % 15) * 15,
                  clientY: 360 + Math.sin(n * 0.25) * 70,
                  bubbles: true,
                  cancelable: true,
                }),
              );
              if (t - start < 1600) requestAnimationFrame(step);
              else resolve(samples);
            }
            requestAnimationFrame(step);
          }),
      );
      const after = (await cdp.send("Performance.getMetrics")).metrics;
      const metrics = {};
      for (const name of [
        "LayoutCount",
        "LayoutDuration",
        "RecalcStyleCount",
        "RecalcStyleDuration",
        "ScriptDuration",
        "TaskDuration",
      ])
        metrics[name] =
          (after.find((m) => m.name === name)?.value ?? 0) -
          (before.find((m) => m.name === name)?.value ?? 0);
      const audit = await page.evaluate(async () => ({...window.audit,
        phases: (await import('/src/platform/performance.ts')).performanceCapture.snapshot().phaseSummary}));
      const sorted = frames.slice(1).sort((a, b) => a - b);
      results.push({
        repeat,
        mode, placementWallMs,
        frames: sorted.length,
        median: sorted[Math.floor(sorted.length * 0.5)],
        p95: sorted[Math.floor(sorted.length * 0.95)],
        over33: sorted.filter((t) => t > 33.4).length,
        metrics,
        audit,
      });
      if (traceCDP) {
        const finished = new Promise((resolve) =>
          traceCDP.once("Tracing.tracingComplete", resolve),
        );
        await traceCDP.send("Tracing.end");
        const { stream } = await finished;
        let trace = "";
        for (;;) {
          const chunk = await traceCDP.send("IO.read", { handle: stream });
          trace += chunk.data;
          if (chunk.eof) break;
        }
        await traceCDP.send("IO.close", { handle: stream });
        await fs.writeFile("/tmp/blocky-trace-" + (process.env.BLOCKY_TAG || "current") + "-" + repeat + "-" + mode + ".json", trace);
      }
      await page.evaluate(() =>
        window.dispatchEvent(
          new PointerEvent("pointercancel", {
            pointerId: 1,
            pointerType: "mouse",
            bubbles: true,
          }),
        ),
      );
      await page.mouse.up();
      await page.close();
      console.log(JSON.stringify(results.at(-1)));
    }
} finally {
  await browser.close();
  await server.close();
}
await fs.writeFile(
  "/tmp/blocky-compare-" + (process.env.BLOCKY_TAG || "current") + ".json",
  JSON.stringify(
    {
      environment:
        "Chromium software renderer, 390x844 DPR2; repetitions/scenarios in results; not Android FPS. placementWallMs includes Playwright action scheduling, not input latency.",
      results,
    },
    null,
    2,
  ),
);
