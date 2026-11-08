// Diagnostic CSS ablation on ordinary0.53; no app source or global API changes.
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
// CSS is changed only in this diagnostic page; the installed app is untouched.
const server = await createServer({
  cacheDir: "/tmp/blocky-theme-053-probe",
  server: { host: "127.0.0.1", port: 5197 },
});
await server.listen();
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const condition of [
    "baseline",
    "without-root-ink-fade",
    "without-root-ink-fade",
    "baseline",
  ]) {
    const context = await browser.newContext({
      viewport: { width: 392, height: 872 },
      deviceScaleFactor: 2.75,
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => console.error("pageerror", e.message));
    await page.goto("http://127.0.0.1:5197/?clearTrace=1");
    await page.waitForFunction(
      () => document.querySelector("#phone-clear-start")?.disabled === false,
    );
    if (condition === "without-root-ink-fade")
      await page.addStyleTag({
        content: "#app { transition: none !important; }",
      });
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
      theme: e.state.wardrobe.selected,
      over25: e.sample.frames.filter((f) => f > 25).length,
      maxFrameMs: Math.max(...e.sample.frames),
    }));
    results.push(record);
    console.log(JSON.stringify(record));
    await context.close();
  }
  await fs.mkdir("docs/qa/viewport-053", { recursive: true });
  await fs.writeFile(
    process.env.PROBE_OUTPUT || "docs/qa/viewport-053/root-ink-probe.json",
    JSON.stringify(
      {
        environment:
          "Linux Chromium, mobile viewport emulation, software graphics; not POCO",
        cdpTracingActiveAcrossAllEpisodes: true,
        scope:
          "Diagnostic removal of inherited root ink transition only. Child color fades remain. Partial color timing is changed; not an accepted fix or a phone performance claim.",
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
