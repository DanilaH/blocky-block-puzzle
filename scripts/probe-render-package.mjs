// Whole effect surface: original Canvas2D versus the WebGL batch implementation.
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
// CSS is changed only in this diagnostic page; the installed app is untouched.
const server = await createServer({
  cacheDir: "/tmp/blocky-render-package-probe",
  server: { host: "127.0.0.1", port: 5201 },
});
await server.listen();
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const condition of (
    process.env.PROBE_CONDITIONS || "legacy,composited,composited,legacy"
  ).split(",")) {
    const context = await browser.newContext({
      viewport: { width: 392, height: 872 },
      deviceScaleFactor: 2.75,
      isMobile: true,
      userAgent:
        "Mozilla/5.0 (Linux; Android 15; 2312FPCA6G Build/AP3A.240905.015.A2; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/156.0.8078.47 Mobile Safari/537.36",
      hasTouch: true,
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => console.error("pageerror", e.message));
    await page.addInitScript(() => {
      let seed = 918273;
      Math.random = () =>
        (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    });
    if (condition === "legacy")
      await page.route("**/src/game/effect-surface.ts", async (route) => {
        const response = await route.fetch(),
          source = await response.text();
        const code = source.replace(
          'gl = canvas.getContext("webgl"',
          'gl = null; false && canvas.getContext("webgl"',
        );
        if (code === source) throw Error("Missing Canvas2D control");
        await route.fulfill({ response, body: code });
      });
    if (condition === "legacy")
      await page.route("**/src/game/board-backdrop.ts", async (route) => {
        const response = await route.fetch();
        await route.fulfill({
          response,
          body: `
        export class BoardBackdrop {
          constructor(board,color) { this.board=board;board.dataset.staticBoard='true';board.style.backgroundColor='#'+color.toString(16).padStart(6,'0'); }
          set(from,to,duration) { this.board.style.transition='background-color '+duration+'ms linear';this.board.style.backgroundColor='#'+to.toString(16).padStart(6,'0'); }
          finish(){}
          destroy(){delete this.board.dataset.staticBoard;this.board.style.removeProperty('transition');this.board.style.removeProperty('background-color');}
        }
      `,
        });
      });
    await page.goto("http://127.0.0.1:5201/?clearTrace=1");
    await page.waitForFunction(
      () => document.querySelector("#phone-clear-start")?.disabled === false,
    );
    const cdp = await context.newCDPSession(page);
    await cdp.send("Tracing.start", {
      categories: "blink,blink.user_timing,v8,toplevel,devtools.timeline",
      transferMode: "ReturnAsStream",
    });
    await page.locator("#phone-clear-start").click();
    await page.waitForFunction(
      () => document.querySelector("#phone-clear-export")?.disabled === false,
      { timeout: 30000 },
    );
    const completed = new Promise((r) =>
      cdp.once("Tracing.tracingComplete", r),
    );
    await cdp.send("Tracing.end");
    const { stream } = await completed;
    let raw = "";
    for (;;) {
      const r = await cdp.send("IO.read", { handle: stream });
      raw += r.base64Encoded
        ? Buffer.from(r.data, "base64").toString()
        : r.data;
      if (r.eof) break;
    }
    await cdp.send("IO.close", { handle: stream });
    const es = JSON.parse(raw).traceEvents;
    const marks = es.filter((e) => e.name === "blocky-clear:traced:committed");
    if (marks.length !== 1) throw Error("Missing mark");
    const at = marks[0].ts,
      within = (e) => e.ts >= at + 320000 && e.ts < at + 1400000;
    const layouts = es.filter(
      (e) =>
        e.name === "Blink.ForcedStyleAndLayout.UpdateTime" &&
        e.ph === "X" &&
        within(e),
    );
    const record = {
      condition,
      surfaces: await page
        .locator(".ambient-canvas,.festival-canvas")
        .evaluateAll((nodes) =>
          nodes.map((n) => ({
            kind: n.className,
            backend: n.dataset.effectRenderer,
          })),
        ),
      windowMs: [320, 1400],
      forcedStyleLayoutCount: layouts.length,
      forcedStyleLayoutTotalMs: layouts.reduce((a, e) => a + e.dur / 1000, 0),
      forcedStyleLayoutMaxMs: Math.max(0, ...layouts.map((e) => e.dur / 1000)),
    };
    record.rendererMainMetrics = Object.fromEntries(
      [
        "Blink.Style.UpdateTime",
        "Document::recalcStyle",
        "Blink.Layout.UpdateTime",
        "FrameRequestCallbackCollection::ExecuteFrameCallbacks",
        "Canvas2DBitmapProvider::Snapshot",
        "Paint",
        "Blink.Paint.UpdateTime",
        "LocalFrameView::RunPaintLifecyclePhase",
      ].map((name) => {
        const spans = es.filter(
          (e) =>
            e.ph === "X" &&
            e.tid === marks[0].tid &&
            e.name === name &&
            within(e),
        );
        return [
          name,
          {
            count: spans.length,
            wallMs: spans.reduce((n, e) => n + e.dur / 1000, 0),
            threadCpuMs: spans.reduce((n, e) => n + (e.tdur || 0) / 1000, 0),
          },
        ];
      }),
    );
    const d = page.waitForEvent("download");
    await page.locator("#phone-clear-export").click();
    const report = JSON.parse(
      await fs.readFile(await (await d).path(), "utf8"),
    );
    record.episodes = report.episodes.map((e) => ({
      kind: e.kind,
      canvas: e.sample.context.canvas,
      score: e.state.game.score,
      phaserTextureUnits: e.sample.context.phaserTextureUnits,
      over33: e.sample.frames.filter((f) => f > 33.4).length,
      theme: e.state.wardrobe.selected,
      over25: e.sample.frames.filter((f) => f > 25).length,
      maxFrameMs: Math.max(...e.sample.frames),
    }));
    results.push(record);
    console.log(JSON.stringify(record));
    await context.close();
  }
  await fs.mkdir("docs/qa/render-package", { recursive: true });
  await fs.writeFile(
    process.env.PROBE_OUTPUT || "docs/qa/render-package/comparison.json",
    JSON.stringify(
      {
        environment:
          "Linux Chromium, mobile viewport emulation, software graphics; not POCO",
        cdpTracingActiveAcrossAllEpisodes: true,
        scope:
          "Full integrated candidate: cached board beds + batched Festival WebGL, original ambient. Control: original color tween and both original Canvas2D effects. Same simulation, fixture and backing dimensions. All episodes traced on Linux software graphics, not POCO.",
        results,
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  await browser.close();
  await server.close();
}
