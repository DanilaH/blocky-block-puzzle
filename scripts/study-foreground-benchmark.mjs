import { foregroundServer } from "./study-foreground-server.mjs";
import { createHash } from "node:crypto";
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
const output =
  process.env.STUDY_OUTPUT ||
  "/workspace/scratch/03c53152a52e/foreground-study/benchmark";
await fs.mkdir(output, { recursive: true });
const inputs = [
  "src/main.ts",
  "src/game/BoardScene.ts",
  "package-lock.json",
  "src/game/festival.ts",
  "src/style.css",
  "src/arcade.css",
  "src/classic.css",
  "src/game/tile-study-config.ts",
  "src/diagnostics/studies/board-bed.ts",
  "src/diagnostics/studies/canvas-foreground.ts",
  "src/diagnostics/studies/theme-ink.ts",
  "src/diagnostics/studies/sprite-gpu.ts",
  "src/diagnostics/studies/phaser-foreground.ts",
  "src/diagnostics/studies/native-mesh-canvas.ts",
  "scripts/study-foreground-server.mjs",
  "scripts/study-foreground-benchmark.mjs",
];
const sourceHashes = Object.fromEntries(
  await Promise.all(
    inputs.map(async (path) => [
      path,
      createHash("sha256")
        .update(await fs.readFile(path))
        .digest("hex"),
    ]),
  ),
);
const server = await foregroundServer(5201),
  browser = await chromium.launch();
const metadata = {
  createdAt: new Date().toISOString(),
  browser: browser.version(),
  viewport: [392, 872],
  deviceScaleFactor: 2.75,
  sourceHashes,
  scoreGlow: "legacy",
  themeInk: "direct",
  rewardShadow: "baked",
  rewardAtlas: true,
  warmupsPerCase: 2,
  untracedPerCase: 2,
  windowMs: 8000,
};
const variants = (
  process.env.STUDY_VARIANTS || "original,baseline,rewards,theme,both"
).split(",");
const order = process.env.STUDY_QUICK
  ? variants
  : [...variants, ...variants.slice().reverse()];
const results = [];
try {
  for (const [index, variant] of order.entries()) {
    const context = await browser.newContext({
        viewport: { width: 392, height: 872 },
        deviceScaleFactor: 2.75,
        isMobile: true,
        hasTouch: true,
      }),
      page = await context.newPage(),
      errors = [];
    await page.addInitScript(() => {
      const seen = new WeakSet();
      const references = [];
      window.__studyContexts = {
        get created() {
          return references.length;
        },
        get webgl() {
          return references.filter((r) => r.deref()?.isConnected).length;
        },
      };
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) {
        const result = original.call(this, type, ...args);
        if (result && ["webgl", "webgl2"].includes(type) && !seen.has(this)) {
          seen.add(this);
          references.push(new WeakRef(this));
        }
        return result;
      };
    });
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(
      `http://127.0.0.1:5201/?clearTrace=full&foregroundStudy=${["gpu", "phaser", "phaser-native"].includes(variant) ? "rewards" : ["viewport", "viewport-native"].includes(variant) ? "baseline" : variant}&studyRenderer=${variant === "gpu" ? "webgl" : ["viewport", "phaser", "viewport-native", "phaser-native"].includes(variant) ? "phaser" : ["gpu-bed", "opaque-board", "gpu-bed-under"].includes(variant) ? variant : "canvas"}&studyBatch=${variant.endsWith("-native") ? "native" : "extern"}&studyPixels=${["original", "gpu-bed", "opaque-board", "gpu-bed-under"].includes(variant) ? "original" : "native"}`,
    );
    await page.waitForFunction(() => !!window.__blockyFullDiagnostic);
    const measure = () =>
      page.evaluate(async () => {
        await window.__blockyFullDiagnostic.prepare("baseline");
        const row = await window.__blockyFullDiagnostic.measure(8000);
        return {
          row,
          study: window.__foregroundStudy.snapshot(),
          shownScore: document.querySelector("#score").textContent,
          contexts: window.__studyContexts,
        };
      });
    const validate = (x) => {
      assert(x.row.valid, JSON.stringify(x.row.validation));
      assert.equal(x.row.state.proof.score, 1574);
      assert.equal(x.row.state.proof.shownScore, 1574);
      assert.equal(x.row.state.proof.pendingPoints, 0);
      assert.equal(x.row.state.proof.festival.spawned, 148);
      assert.equal(x.row.state.proof.festival.activeParticles, 0);
      assert.equal(x.row.state.proof.festival.activeReveals, 0);
      assert.equal(x.shownScore, "1\u00a0574");
      assert.deepEqual(x.study.errors, []);
      assert.deepEqual(x.study.ink.errors, []);
      assert.equal(x.contexts.webgl, variant === "gpu" ? 2 : 1);
      if (x.study.shared) {
        assert(x.study.shared.ready);
        assert.equal(x.study.boardShakes, 1);
        assert(x.study.shared.canvasIsGameCanvas);
        assert.deepEqual(x.study.shared.errors, []);
      }
      if (
        ["original", "gpu-bed", "opaque-board", "gpu-bed-under"].includes(
          variant,
        )
      ) {
        assert.equal(x.study.composite.alpha, variant !== "opaque-board");
        assert.equal(
          x.study.composite.boardBacking[0],
          x.study.composite.boardBacking[1],
        );
      }
      if (variant === "gpu-bed-under") {
        const b = x.study.composite.bed;
        assert(b?.enabled);
        assert(b.activations > 0);
        assert(b.frames > 0);
        assert(b.completions > 0);
        assert.equal(b.visible, false);
        assert.equal(b.maskVisible, false);
        assert.equal(x.study.composite.glError, 0);
      }
      assert.equal(x.study.active, 0);
      assert.equal(x.study.ink.active, 0);
      if (["phaser", "phaser-native"].includes(variant)) {
        assert(x.study.gpu);
        assert(x.study.draws > 0);
        assert.equal(x.study.prepared, 3);
      }
      if (x.study.gpu) {
        assert.equal(x.study.gpu.contextLost, false);
        assert.equal(x.study.gpu.glError, 0);
        assert(x.study.gpu.uploads > 0);
        if (x.study.gpu.nativeBatch) assert(x.study.gpu.submittedQuads > 0);
        else assert(x.study.gpu.drawCalls > 0);
      }
    };
    const warmups = [];
    for (let n = 0; n < 2; n++) {
      const x = await measure();
      validate(x);
      warmups.push({ metrics: x.row.metrics, study: x.study });
    }
    const untraced = [];
    for (let n = 0; n < 2; n++) {
      const x = await measure();
      validate(x);
      untraced.push({
        metrics: x.row.metrics,
        study: x.study,
        contexts: x.contexts,
        proof: x.row.state.proof,
        sample: {
          frames: x.row.sample.frames,
          frameTimes: x.row.sample.frameTimes,
          placements: x.row.sample.placements,
        },
      });
    }
    await page.evaluate(() =>
      window.__blockyFullDiagnostic.prepare("baseline"),
    );
    const cdp = await context.newCDPSession(page),
      layers = [];
    await cdp.send("DOM.enable");
    await cdp.send("LayerTree.enable");
    cdp.on("LayerTree.layerTreeDidChange", (p) => layers.push(p));
    const dom = await cdp.send("DOM.getDocument", { depth: -1, pierce: true });
    await cdp.send("Tracing.start", {
      categories:
        "toplevel,blink.user_timing,devtools.timeline,disabled-by-default-devtools.timeline,blink,cc,gpu",
      transferMode: "ReturnAsStream",
      streamCompression: "gzip",
    });
    const traceRow = await page.evaluate(async () => {
      performance.mark("foreground-study:start");
      const row = await window.__blockyFullDiagnostic.measure(8000);
      performance.mark("foreground-study:end");
      return {
        row,
        study: window.__foregroundStudy.snapshot(),
        shownScore: document.querySelector("#score").textContent,
        contexts: window.__studyContexts,
      };
    });
    validate(traceRow);
    const complete = new Promise((r) => cdp.once("Tracing.tracingComplete", r));
    await cdp.send("Tracing.end");
    const done = await complete;
    assert.equal(done.dataLossOccurred, false);
    const chunks = [];
    for (;;) {
      const x = await cdp.send("IO.read", {
        handle: done.stream,
        size: 262144,
      });
      chunks.push(Buffer.from(x.data, x.base64Encoded ? "base64" : "utf8"));
      if (x.eof) break;
    }
    await cdp.send("IO.close", { handle: done.stream });
    const binary = Buffer.concat(chunks);
    await fs.writeFile(`${output}/${index}-${variant}.json.gz`, binary);
    const events = JSON.parse(
      (done.streamCompression === "gzip"
        ? gunzipSync(binary)
        : binary
      ).toString(),
    ).traceEvents;
    const start = events.find((e) => e.name === "foreground-study:start").ts,
      end = events.find((e) => e.name === "foreground-study:end").ts;
    const nodes = new Map();
    function visit(n, parent = "") {
      const attrs = Object.fromEntries(
          (n.attributes || []).reduce(
            (xs, v, i, a) => (i % 2 ? xs : [...xs, [v, a[i + 1]]]),
            [],
          ),
        ),
        label =
          parent +
          ">" +
          n.nodeName +
          (attrs.id ? "#" + attrs.id : "") +
          (attrs.class ? "." + attrs.class : "");
      if (n.backendNodeId) nodes.set(n.backendNodeId, label);
      for (const c of [...(n.children || []), ...(n.pseudoElements || [])])
        visit(c, label);
    }
    visit(dom.root);
    const ids = new Map(
        layers.flatMap((x) =>
          (x.layers || []).map((l) => [l.layerId, l.backendNodeId]),
        ),
      ),
      paint = {},
      raster = {},
      totals = {};
    for (const e of events) {
      if (e.ts < start || e.ts > end) continue;
      const t = (totals[e.name] ??= { count: 0, wallMs: 0, maxMs: 0 });
      t.count++;
      t.wallMs += (e.dur || 0) / 1000;
      t.maxMs = Math.max(t.maxMs, (e.dur || 0) / 1000);
      let target, map;
      if (e.name === "Paint") {
        target =
          nodes.get(e.args?.data?.nodeId) ||
          e.args?.data?.nodeName ||
          String(e.args?.data?.nodeId);
        map = paint;
      } else if (e.name === "RasterTask") {
        target =
          nodes.get(ids.get(String(e.args?.tileData?.layerId))) ||
          String(e.args?.tileData?.layerId);
        map = raster;
      } else continue;
      const b = (map[target] ??= { count: 0, wallMs: 0, maxMs: 0 });
      b.count++;
      b.wallMs += (e.dur || 0) / 1000;
      b.maxMs = Math.max(b.maxMs, (e.dur || 0) / 1000);
    }
    const record = {
      index,
      variant,
      warmups,
      untraced,
      trace: {
        proof: traceRow.row.state.proof,
        study: traceRow.study,
        windowMs: (end - start) / 1000,
        layerCount: ids.size,
        paint,
        raster,
        totals: Object.fromEntries(
          Object.entries(totals).filter(([n]) =>
            [
              "Paint",
              "RasterTask",
              "UpdateLayoutTree",
              "Layout",
              "PrePaint",
              "Commit",
              "DrawFrame",
              "RunTask",
              "GpuChannel::ExecuteDeferredRequest",
              "SharedImageStub::OnCreateSharedImage",
            ].includes(n),
          ),
        ),
      },
      errors,
    };
    assert.deepEqual(errors, []);
    results.push(record);
    await fs.writeFile(
      `${output}/result.json`,
      JSON.stringify(
        {
          scope:
            "Linux Chromium software graphics; resource attribution in traced captures is separate from untraced RAF. Not physical POCO acceptance.",
          metadata,
          results,
        },
        null,
        2,
      ),
    );
    console.log(
      JSON.stringify({
        index,
        variant,
        warmups: warmups.map((x) => x.metrics.over33),
        untraced: untraced.map((x) => x.metrics),
        layers: ids.size,
        totals: record.trace.totals,
        study: traceRow.study,
      }),
    );
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
