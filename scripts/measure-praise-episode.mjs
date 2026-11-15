/** One frozen matched episode; the sole intervention is test-only ranking off. */
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import crypto from "node:crypto";
const cancelOnly = process.argv.includes("--cancel-only");
const output = process.argv[2];
if (!output)
  throw Error(
    "Usage: node scripts/measure-praise-episode.mjs OUTPUT_DIRECTORY",
  );
await fs.mkdir(output, { recursive: true });
const server = await createServer({
  server: {
    host: "127.0.0.1",
    port: 5198,
    strictPort: true,
    hmr: false,
    watch: null,
  },
});
await server.listen();
const browser = await chromium.launch();
const results = [];
try {
  for (const [index, mode] of (cancelOnly
    ? ["A"]
    : [
        ...["A", "B", "B", "A", "B", "A", "A", "B", "A", "B", "B", "A"],
        "A",
        "B",
      ]
  ).entries()) {
    const traced = !cancelOnly && index >= 12;
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/src/main.ts", async (route) => {
      const response = await route.fetch(),
        body = await response.text(),
        needle = "g.board.filter(Boolean).length < 12 || worker";
      assert(
        body.includes(needle),
        "Test-only intervention must match exactly once",
      );
      await route.fulfill({
        response,
        body: body.replace(
          needle,
          needle + " || !window.__rankProbeEnabled || g.revision === 0",
        ),
      });
    });
    await page.addInitScript(() => {
      window.__rankProbeEnabled = false;
      window.__workerEvents = [];
      const NativeWorker = window.Worker;
      window.Worker = class extends NativeWorker {
        constructor(url, options) {
          super(url, options);
          this.isPraise = String(url).includes("praise.worker");
          this.done = false;
          if (this.isPraise) {
            window.__workerEvents.push({
              kind: "start",
              at: performance.now(),
            });
            this.addEventListener("message", (e) => {
              if (!this.done) {
                this.done = true;
                window.__workerEvents.push({
                  kind: "result",
                  at: performance.now(),
                  depth: e.data.depth,
                });
              }
            });
            this.addEventListener("error", () => {
              if (!this.done) {
                this.done = true;
                window.__workerEvents.push({
                  kind: "error",
                  at: performance.now(),
                });
              }
            });
          }
        }
        terminate() {
          if (this.isPraise && !this.done) {
            this.done = true;
            window.__workerEvents.push({
              kind: "cancel",
              at: performance.now(),
            });
          }
          return super.terminate();
        }
      };
    });
    await page.goto("http://127.0.0.1:5198/");
    await page.locator('[data-slot="0"]').waitFor();
    const expected = await page.evaluate(async () => {
      const { IndexedSave } = await import("/src/platform/save.ts"),
        { newGame, applyMove } = await import("/src/core/rules.ts"),
        { stateHash } = await import("/src/platform/play-capture.ts");
      const save = new IndexedSave(),
        p = (await save.load()).profile;
      p.revision++;
      p.tutorialStep = 4;
      p.hint = null;
      p.best = p.progressionBest = 1000000;
      p.settings = { ...p.settings, sound: false, calm: false };
      p.game = {
        ...newGame(1234, "praise-episode", "director-v2"),
        moves: 10,
        score: 12000,
        streak: 19,
        scoringVersion: "festival-v4",
        seriesBonusVersion: 1,
      };
      p.game.board = Array.from({ length: 64 }, (_, i) =>
        i < 8 ? (i ? 2 : 0) : ((i % 8) + (i >> 3)) % 2 ? 2 : 0,
      );
      p.game.tray = [1, 2, 3].map((color) => ({
        shapeId: "S1-0",
        color,
        used: false,
      }));
      p.wardrobe = { selected: 0, unlocked: [0], discoveries: 0 };
      await save.write(p);
      const r = applyMove(p.game, { slot: 0, x: 0, y: 0 }, p.game.revision);
      return {
        hash: stateHash(r.state),
        lines: r.lines,
        score: r.state.score,
        occupied: r.state.board.filter(Boolean).length,
      };
    });
    assert.equal(expected.lines, 1);
    assert(expected.occupied >= 12);
    await page.reload();
    await page.locator('[data-slot="0"]').waitFor();
    await page.waitForTimeout(1200);
    const cdp = await context.newCDPSession(page),
      trace = [];
    if (traced) {
      cdp.on("Tracing.dataCollected", (e) => trace.push(...e.value));
      await cdp.send("Tracing.start", {
        categories:
          "toplevel,devtools.timeline,blink.user_timing,disabled-by-default-devtools.timeline",
        transferMode: "ReportEvents",
      });
    }
    await page.evaluate(async (mode) => {
      const { performanceCapture } = await import(
        "/src/platform/performance.ts"
      );
      performanceCapture.start({
        mode,
        source: "controlled praise episode",
        physical: false,
      });
      window.__rankProbeEnabled = mode === "A";
      window.__episodeStart = performance.now();
    }, mode);
    await page.locator('[data-slot="0"]').click();
    await page.locator("#board").click({ position: { x: 5, y: 5 } });
    await page.waitForFunction(async () => {
      const { IndexedSave } = await import("/src/platform/save.ts");
      return (await new IndexedSave().load()).profile.game.moves === 11;
    });
    if (cancelOnly) {
      const b = await page.locator('[data-slot="1"]').boundingBox();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.waitForFunction(() =>
        window.__workerEvents.some((e) => e.kind === "start"),
      );
      await page.mouse.down();
      await page.waitForTimeout(100);
    } else await page.waitForTimeout(2000);
    const observed = await page.evaluate(async () => {
      const { performanceCapture } = await import(
          "/src/platform/performance.ts"
        ),
        { IndexedSave } = await import("/src/platform/save.ts"),
        { stateHash } = await import("/src/platform/play-capture.ts");
      const snapshot = performanceCapture.snapshot(),
        g = (await new IndexedSave().load()).profile.game;
      return {
        hash: stateHash(g),
        score: g.score,
        occupied: g.board.filter(Boolean).length,
        workerEvents: window.__workerEvents.map((e) => ({
          ...e,
          at: e.at - window.__episodeStart,
        })),
        phases: snapshot.phaseSummary,
        raf: {
          samples: snapshot.sampleCount,
          p95: snapshot.p95,
          over33: snapshot.over33,
          over50: snapshot.over50,
        },
        material: document.documentElement.dataset.tileMaterial,
      };
    });
    assert.equal(observed.hash, expected.hash);
    assert.equal(observed.score, expected.score);
    assert.equal(observed.material, "plastic");
    assert.deepEqual(errors, []);
    const starts = observed.workerEvents.filter((e) => e.kind === "start");
    assert.equal(starts.length, mode === "A" ? 1 : 0);
    if (traced) {
      const finished = new Promise((resolve) =>
        cdp.once("Tracing.tracingComplete", resolve),
      );
      await cdp.send("Tracing.end");
      await finished;
      const bytes = JSON.stringify({ traceEvents: trace });
      await fs.writeFile(path.join(output, `trace-${mode}.json`), bytes);
      const names = trace
        .filter((e) => e.ph === "M" && e.name === "thread_name")
        .map((e) => ({ pid: e.pid, tid: e.tid, name: e.args.name }));
      const workerThreads = names.filter((e) => /worker/i.test(e.name));
      observed.trace = {
        sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
        events: trace.length,
        workerThreads,
        taskEvents: trace.filter(
          (e) => e.ph === "X" && /RunTask|EvaluateScript/.test(e.name),
        ).length,
      };
    }
    if (cancelOnly) {
      assert(observed.workerEvents.some((e) => e.kind === "cancel"));
      assert.equal(observed.phases.praiseWorkerCancelWallTime.count, 1);
    }
    const sample = {
      index,
      mode,
      traced,
      cancelProbe: cancelOnly,
      expected,
      ...observed,
    };
    results.push(sample);
    console.log(JSON.stringify(sample));
    await fs.writeFile(
      path.join(output, "results.json"),
      JSON.stringify(
        {
          environment: `${process.version}, Linux/headless Chromium, Vite dev, software renderer; no phone and no present timing`,
          browser: browser.version(),
          protocol: "docs/qa/floating-performance-2026-11-15/PROTOCOL.md",
          results,
        },
        null,
        2,
      ) + "\n",
    );
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
