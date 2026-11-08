// Diagnostic only: intercept viewport getters in a mobile-emulated browser.
// App sources and the ordinary renderer are not changed.
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
const server = await createServer({
  server: { host: "127.0.0.1", port: 5199 },
});
await server.listen();
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const cached of [false, true, true, false]) {
    const context = await browser.newContext({
      viewport: { width: 392, height: 872 },
      deviceScaleFactor: 2.75,
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    if (cached)
      await page.addInitScript(() => {
        const dw = Object.getOwnPropertyDescriptor(window, "innerWidth"),
          dh = Object.getOwnPropertyDescriptor(window, "innerHeight");
        if (!dw?.get || !dh?.get) throw Error("Viewport getters unavailable");
        let w = dw.get.call(window),
          h = dh.get.call(window);
        const refresh = () => {
          w = dw.get.call(window);
          h = dh.get.call(window);
        };
        Object.defineProperty(window, "innerWidth", {
          configurable: true,
          get: () => w,
        });
        Object.defineProperty(window, "innerHeight", {
          configurable: true,
          get: () => h,
        });
        window.addEventListener("resize", refresh);
        window.addEventListener("DOMContentLoaded", refresh);
      });
    await page.goto("http://127.0.0.1:5199/?clearTrace=1");
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
      cached,
      windowMs: [320, 1400],
      forcedStyleLayoutCount: layouts.length,
      forcedStyleLayoutTotalMs: layouts.reduce((a, e) => a + e.dur / 1000, 0),
      forcedStyleLayoutMaxMs: Math.max(0, ...layouts.map((e) => e.dur / 1000)),
    };
    const d = page.waitForEvent("download");
    await page.locator("#phone-clear-export").click();
    const report = JSON.parse(
      await fs.readFile(await (await d).path(), "utf8"),
    );
    record.episodes = report.episodes.map((e) => ({
      kind: e.kind,
      canvas: e.sample.context.canvas,
      score: e.state.game.score,
      theme: e.state.wardrobe.selected,
      over25: e.sample.frames.filter((f) => f > 25).length,
      maxFrameMs: Math.max(...e.sample.frames),
    }));
    results.push(record);
    console.log(JSON.stringify(record));
    await context.close();
  }
  await fs.mkdir("docs/qa/phone-trace-052", { recursive: true });
  await fs.writeFile(
    "docs/qa/phone-trace-052/viewport-getter-probe.json",
    JSON.stringify(
      {
        environment:
          "Linux Chromium, mobile viewport emulation, software graphics; not POCO",
        scope:
          "Global cached viewport getter diagnostic; no app change and no physical speed claim",
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
