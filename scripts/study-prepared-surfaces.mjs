import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import assert from "node:assert/strict";

const out = process.env.STUDY_OUTPUT || "/tmp/blocky-prepared-surfaces";
await fs.mkdir(out, { recursive: true });
const inputs = [
  "src/main.ts",
  "src/classic.css",
  "src/game/BoardScene.ts",
  "src/game/atmosphere.ts",
  "src/diagnostics/prepared-surfaces.ts",
  "src/game/tile-study.ts",
  "src/game/tile-material.ts",
  "src/arcade.css",
  "src/style.css",
  "public/backgrounds/porcelain-v1.webp",
  "public/backgrounds/polar-night-v1.webp",
  "src/game/tile-study-config.ts",
  "src/game/score-glow.ts",
  "src/diagnostics/clear-layers.ts",
  "package-lock.json",
  "scripts/study-prepared-surfaces.mjs",
];
const sourceHashes = Object.fromEntries(
  await Promise.all(
    inputs.map(async (p) => [
      p,
      createHash("sha256")
        .update(await fs.readFile(p))
        .digest("hex"),
    ]),
  ),
);
const server = await createServer({
  server: { host: "127.0.0.1", port: 5197, strictPort: true },
});
await server.listen();
const browser = await chromium.launch();
const results = [];
try {
  for (const profile of [
    "original",
    "flat",
    "generated",
    "generated",
    "flat",
    "original",
  ]) {
    const context = await browser.newContext({
      viewport: { width: 392, height: 872 },
      deviceScaleFactor: 2.75,
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(
      `http://127.0.0.1:5197/?clearTrace=full&effectsStudy=legacy&themeSurfaces=${profile === "original" ? "" : profile}`,
    );
    await page.waitForFunction(() => !!window.__blockyFullDiagnostic);
    await page.evaluate(async () => {
      const { setDiagnosticScoreGlow } = await import(
        "/src/game/score-glow.ts"
      );
      setDiagnosticScoreGlow("legacy");
    });
    const episode = async () => {
      const row = await page.evaluate(async () => {
        await window.__blockyFullDiagnostic.prepare("baseline");
        return window.__blockyFullDiagnostic.measure(8000);
      });
      assert(row.valid, JSON.stringify(row.validation));
      const p = row.state.proof;
      assert.equal(p.effectProfile, "legacy");
      assert.equal(p.score, 1574);
      assert.equal(p.shownScore, 1574);
      assert.equal(p.pendingPoints, 0);
      assert.equal(p.festival.spawned, 148);
      assert.equal(p.rewardDomCreated, 3);
      assert.equal(p.scene.compactEffects, false);
      assert.equal(p.festival.activeParticles, 0);
      assert.equal(p.festival.activeReveals, 0);
      const end = await page.evaluate(() => ({
        surfaces: window.__themeSurfaces?.snapshot() ?? null,
        gameCanvasCount: document.querySelectorAll("#board canvas").length,
        remaining: document.querySelectorAll(".reward-event,.hud-notice")
          .length,
        boardBacking: [...document.querySelectorAll("#board canvas")].map(
          (c) => [c.width, c.height],
        ),
      }));
      assert.equal(end.remaining, 0);
      assert.equal(end.gameCanvasCount, 1);
      if (profile !== "original") {
        assert.equal(end.surfaces.mode, profile);
        for (const x of [end.surfaces.page, end.surfaces.bed]) {
          assert.equal(x.active, false);
          assert.equal(x.visibleLayers, 1);
          assert.equal(x.target, "5");
          assert(x.transitions > 0);
        }
        assert.equal(end.surfaces.decodedArt, profile === "generated" ? 2 : 0);
      }
      // Recompute all seven protocol metrics independently from saved intervals.
      const at = row.sample.placements[0].at;
      assert.equal(row.sample.placements.length, 1);
      const frames = row.sample.frames.filter(
        (v, i) =>
          row.sample.frameTimes[i] > at &&
          row.sample.frameTimes[i] - v < at + 8000,
      );
      const sorted = frames.slice().sort((a, b) => a - b);
      const metrics = {
        intervals: frames.length,
        over33Raw: frames.filter((v) => v > 33.4).length,
        over33: frames.filter((v) => Math.round(v * 10) / 10 > 33.4).length,
        over34: frames.filter((v) => v > 34).length,
        over50: frames.filter((v) => v > 50).length,
        maxMs: Math.max(...frames),
        p95Ms: sorted[Math.floor(sorted.length * 0.95)],
      };
      assert.deepEqual(row.metrics, metrics);
      return {
        ...row,
        end,
        meanMs: frames.reduce((a, b) => a + b, 0) / frames.length,
      };
    };
    const warmups = [];
    for (let i = 0; i < 2; i++) warmups.push(await episode());
    const untraced = [];
    for (let i = 0; i < 2; i++) untraced.push(await episode());
    assert.deepEqual(errors, []);
    results.push({ profile, warmups, untraced, errors });
    console.log(
      JSON.stringify({
        profile,
        intervals: untraced.map((r) => r.metrics),
        meanMs: untraced.map((r) => r.meanMs),
      }),
    );
    await context.close();
  }
  const metadata = {
    browser: browser.version(),
    viewport: [392, 872],
    dpr: 2.75,
    windowMs: 8000,
    scoreGlowControl: "legacy",
    sourceHashes,
    createdAt: new Date().toISOString(),
  };
  await fs.writeFile(`${out}/raw.json`, JSON.stringify({ metadata, results }));
  const summary = {
    scope:
      "Linux Chromium software graphics, not physical POCO or GPU execution measurement; two warmups + two untraced full8sec episodes per independent case, reverse order; all7 metrics recomputed for every episode.",
    metadata,
    results: results.map((c) => ({
      profile: c.profile,
      warmups: c.warmups.map((r) => r.metrics),
      untraced: c.untraced.map((r) => ({
        metrics: r.metrics,
        meanMs: r.meanMs,
        proof: r.state.proof,
        end: r.end,
      })),
      errors: c.errors,
    })),
  };
  await fs.writeFile(
    `${out}/summary.json`,
    JSON.stringify(summary, null, 2) + "\n",
  );
  for (const profile of ["original", "flat", "generated"]) {
    const rows = results
      .filter((c) => c.profile === profile)
      .flatMap((c) => c.untraced);
    console.log(
      JSON.stringify({
        profile,
        over33: rows.map((r) => r.metrics.over33),
        meanMs: rows.reduce((n, r) => n + r.meanMs, 0) / rows.length,
        max: Math.max(...rows.map((r) => r.metrics.maxMs)),
      }),
    );
  }
} finally {
  await browser.close();
  await server.close();
}
