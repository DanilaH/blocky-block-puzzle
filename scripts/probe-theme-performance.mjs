// Controlled theme-only stress test; no clears, rewards or gameplay claim.
import { createServer } from "vite";
import { chromium } from "playwright";
import fs from "node:fs/promises";
const root = process.cwd();
const s = await createServer({
  root,
  server: { host: "127.0.0.1", port: 5194 },
});
await s.listen();
const b = await chromium.launch();
try {
  const p = await b.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  await p.route("**/src/main.ts", async (r) => {
    const a = await r.fetch();
    await r.fulfill({
      response: a,
      body: (await a.text()).replace(
        "const analytics =",
        "window.demo={store,render:()=>render()}; const analytics =",
      ),
    });
  });
  await p.goto("http://127.0.0.1:5194");
  await p.locator("#lesson-skip").click();
  await p.waitForFunction(() => !document.querySelector("#app").inert);
  const result = await p.evaluate(async () => {
    const state = window.demo.store.state;
    state.game.board = Array.from({ length: 64 }, (_, i) =>
      i % 3 ? (i % 6) + 1 : 0,
    );
    state.game.scoringVersion = "festival-v4";
    state.game.streak = 0;
    window.demo.render();
    await new Promise((r) => setTimeout(r, 1500));
    const long = [];
    const ob = new PerformanceObserver((l) =>
      long.push(...l.getEntries().map((e) => e.duration)),
    );
    ob.observe({ type: "longtask" });
    const results = [];
    for (const series of [0, 0, 0, 0, 4, 10, 4, 10, 4, 10, 4, 10]) {
      state.game.streak = series;
      const start = performance.now();
      window.demo.render();
      const renderMs = performance.now() - start;
      const samples = [];
      let last = performance.now();
      await new Promise((resolve) => {
        function tick(t) {
          samples.push(t - last);
          last = t;
          if (t - start < 1100) requestAnimationFrame(tick);
          else resolve();
        }
        requestAnimationFrame(tick);
      });
      samples.shift();
      samples.sort((a, b) => a - b);
      results.push({
        series,
        renderMs,
        p95: samples[Math.floor(samples.length * 0.95)],
        frames: samples.length,
      });
    }
    ob.disconnect();
    return {
      environment:
        "Chromium software renderer; controlled theme-only transitions, no clears; not Android FPS",
      results,
      long,
    };
  });
  await fs.writeFile(
    process.env.BLOCKY_OUTPUT || "/tmp/blocky-theme-only.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} finally {
  await b.close();
  await s.close();
}
