// Diagnostic only: actual scoped cache compared to original0.52 effect modules.
// Baseline is injected only into its own Vite server; globals are untouched.
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
const original = Object.fromEntries(
  ["atmosphere", "festival"].map((name) => [
    name,
    execFileSync("git", ["show", "78754efbd70932caf6462dc17d1241b84381c4cf:src/game/" + name + ".ts"], {
      encoding: "utf8",
    }),
  ]),
);
const servers = [];
for (const candidate of [false, true]) {
  const server = await createServer({
    server: { host: "127.0.0.1", port: candidate ? 5199 : 5198 },
    plugins: candidate
      ? []
      : [
          {
            name: "original-052-effect-viewport",
            enforce: "pre",
            transform(source, id) {
              const name = id
                .split("?")[0]
                .match(/\/src\/game\/(atmosphere|festival)\.ts$/)?.[1];
              return name ? original[name] : undefined;
            },
          },
        ],
  });
  await server.listen();
  servers.push(server);
}
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
    await page.goto(`http://127.0.0.1:${cached ? 5199 : 5198}/?clearTrace=1`);
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
      candidate: cached,
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
  await fs.mkdir("docs/qa/viewport-053", { recursive: true });
  await fs.writeFile(
    "docs/qa/viewport-053/integrated-comparison.json",
    JSON.stringify(
      {
        environment:
          "Linux Chromium, mobile viewport emulation, software graphics; not POCO",
        cdpTracingActiveAcrossAllEpisodes: true,
        scope:
          "Actual scoped Atmosphere/Festival cache versus original0.52 modules; no global overrides; not a physical speed claim",
        results,
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  await browser.close();
  await Promise.all(servers.map((s) => s.close()));
}
