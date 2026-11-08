// Compare actual clears with the former reward path restored only by this probe.
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const server = await createServer({
  cacheDir: "/tmp/blocky-reward-056-probe",
  plugins: [
    {
      name: "former-reward-path",
      enforce: "pre",
      transform(code, id) {
        if (!id.split("?")[0].endsWith("/src/game/reward-label.ts")) return;
        const anchor = "prepare(element: HTMLElement, dancing: boolean) {";
        assert(code.includes(anchor));
        return code.replace(
          anchor,
          anchor +
            '\n if (["baseline","surface-only"].includes(new URLSearchParams(location.search).get("probe") || "")) return () => {};',
        );
      },
    },
  ],
  server: { host: "127.0.0.1", port: 5199, strictPort: true },
});
await server.listen();
const browser = await chromium.launch({ headless: true });
const defaultOrder = [
  "baseline",
  "surface-only",
  "rasters-only",
  "combined",
  "combined",
  "rasters-only",
  "surface-only",
  "baseline",
];
const order = process.env.PROBE_CONDITIONS?.split(",") || defaultOrder;
const output =
  process.env.PROBE_OUTPUT || "docs/qa/rewards-056/browser-comparison.json";
function taskUnion(events, mark, startMs, endMs) {
  const start = mark.ts + startMs * 1000,
    end = mark.ts + endMs * 1000;
  const xs = events
    .filter(
      (x) =>
        x.ph === "X" &&
        x.tid === mark.tid &&
        x.name === "ThreadControllerImpl::RunTask" &&
        x.ts >= start &&
        x.ts < end,
    )
    .sort((a, b) => a.ts - b.ts || b.dur - a.dur);
  const outer = [];
  let edge = -Infinity;
  for (const x of xs) {
    if (x.ts + x.dur <= edge) continue;
    outer.push(x);
    edge = x.ts + x.dur;
  }
  return {
    rawCount: xs.length,
    outerCount: outer.length,
    wallMs: outer.reduce((n, x) => n + x.dur / 1000, 0),
    threadCpuMs: outer.some((x) => x.tdur !== undefined)
      ? outer.reduce((n, x) => n + (x.tdur || 0) / 1000, 0)
      : null,
  };
}
const results = [];
try {
  for (const [index, condition] of order.entries()) {
    const context = await browser.newContext({
      viewport: { width: 392, height: 872 },
      deviceScaleFactor: 2.75,
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:5199/?clearTrace=1&probe=${condition}`);
    await page.waitForFunction(
      () => document.querySelector("#phone-clear-start")?.disabled === false,
    );
    if (condition === "baseline" || condition === "rasters-only")
      await page.addStyleTag({
        content:
          ':root[data-presentation="classic"] :is(.best,.icon,.hint,.secondary){transition:--enamel-local var(--world-duration),color var(--world-duration)}',
      });
    const cdp = await context.newCDPSession(page);
    await cdp.send("Tracing.start", {
      categories: "blink,blink.user_timing,v8,toplevel,devtools.timeline",
      transferMode: "ReturnAsStream",
    });
    await page.locator("#phone-clear-start").click();
    await page.waitForFunction(
      () => document.querySelector("#phone-clear-export")?.disabled === false,
      null,
      { timeout: 35000 },
    );
    const done = new Promise((r) => cdp.once("Tracing.tracingComplete", r));
    await cdp.send("Tracing.end");
    const { stream } = await done;
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
    const dl = page.waitForEvent("download");
    await page.locator("#phone-clear-export").click();
    const report = JSON.parse(
      await fs.readFile(await (await dl).path(), "utf8"),
    );
    assert(report.completed && errors.length === 0);
    const episodes = report.episodes.map((e) => {
      assert.equal(e.state.game.score, 1574);
      assert.equal(e.state.wardrobe.selected, 5);
      const m = es.find((x) => x.name === `blocky-clear:${e.kind}:committed`);
      assert(m);
      const startMark = es.find(
        (x) => x.name === `blocky-clear:${e.kind}:start`,
      );
      const endMark = es.find((x) => x.name === `blocky-clear:${e.kind}:end`);
      assert(startMark && endMark);
      const metrics = Object.fromEntries(
        [
          "Blink.Style.UpdateTime",
          "Blink.ForcedStyleAndLayout.UpdateTime",
          "Blink.Layout.UpdateTime",
          "LocalFrameView::RunPaintLifecyclePhase",
          "FrameRequestCallbackCollection::ExecuteFrameCallbacks",
          "ThreadControllerImpl::RunTask",
        ].map((name) => {
          const xs = es.filter(
            (x) =>
              x.ph === "X" &&
              x.tid === m.tid &&
              x.name === name &&
              x.ts >= m.ts + 320000 &&
              x.ts < m.ts + 1400000,
          );
          return [
            name,
            {
              count: xs.length,
              wallMs: xs.reduce((a, x) => a + x.dur / 1000, 0),
              threadCpuMs: xs.some((x) => x.tdur !== undefined)
                ? xs.reduce((a, x) => a + (x.tdur || 0) / 1000, 0)
                : null,
              maxMs: Math.max(0, ...xs.map((x) => x.dur / 1000)),
            },
          ];
        }),
      );
      if (condition === "combined" || condition === "rasters-only")
        assert.equal(e.state.rewardRasters.fallbacks, 0);
      return {
        kind: e.kind,
        score: e.state.game.score,
        theme: e.state.wardrobe.selected,
        metrics,
        fullRendererTasks: (() => {
          const xs = es.filter(
            (x) =>
              x.ph === "X" &&
              x.tid === m.tid &&
              x.name === "ThreadControllerImpl::RunTask" &&
              x.ts >= m.ts &&
              x.ts < m.ts + 2400000,
          );
          return {
            count: xs.length,
            wallMs: xs.reduce((a, x) => a + x.dur / 1000, 0),
            threadCpuMs: xs.some((x) => x.tdur !== undefined)
              ? xs.reduce((a, x) => a + (x.tdur || 0) / 1000, 0)
              : null,
          };
        })(),
        wholeEpisodeTasks: {
          ...taskUnion(es, startMark, 0, (endMark.ts - startMark.ts) / 1000),
          durationMs: (endMark.ts - startMark.ts) / 1000,
        },
        unionRendererTasks: taskUnion(es, m, 0, 2400),
        unionEffectTasks: taskUnion(es, m, 320, 1400),
        rasters: e.state.rewardRasters,
      };
    });
    results.push({ index, condition, episodes, errors });
    await fs.writeFile(
      output,
      JSON.stringify(
        {
          environment: "Linux Chromium/SwiftShader; not a POCO FPS claim",
          windowMs: [320, 1400],
          allEpisodesCdpTraced: true,
          results,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(
      JSON.stringify({
        index,
        condition,
        main: episodes.map((e) => e.unionRendererTasks),
        style: episodes.map(
          (e) => +e.metrics["Blink.Style.UpdateTime"].wallMs.toFixed(2),
        ),
        paint: episodes.map(
          (e) =>
            +e.metrics["LocalFrameView::RunPaintLifecyclePhase"].wallMs.toFixed(
              2,
            ),
        ),
        raf: episodes.map(
          (e) =>
            +e.metrics[
              "FrameRequestCallbackCollection::ExecuteFrameCallbacks"
            ].wallMs.toFixed(2),
        ),
        rasters: episodes[1].rasters,
      }),
    );
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
