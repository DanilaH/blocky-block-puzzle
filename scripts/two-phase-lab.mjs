import { createServer } from "vite";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";

export const measurementMs = 8000;
export async function createLab() {
  const server = await createServer({
    cacheDir: "/tmp/blocky-two-phase-vite",
    server: { host: "127.0.0.1", port: 5197, strictPort: true },
  });
  await server.listen();
  const browser = await chromium.launch({ headless: true });
  return {
    server,
    browser,
    async close() {
      await browser.close();
      await server.close();
    },
  };
}
export function contextOptions(viewport) {
  return { viewport, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true };
}
export async function openCase(browser, mode, viewport, variant, extra = {}) {
  const context = await browser.newContext({
    ...contextOptions(viewport),
    ...extra,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(
    `http://127.0.0.1:5197/?clearTrace=1&clearLab&clearPresentation=${mode}&variant=${variant}`,
  );
  await page.waitForFunction(() => !!window.__blockyClearLab);
  await page.evaluate(() => document.fonts.ready);
  return { context, page, errors };
}
export async function prepare(page) {
  await page.evaluate(() => window.__blockyClearLab.prepare());
  await page.waitForTimeout(1800);
}
export async function runEpisode(page, marker) {
  return page.evaluate(
    async ({ marker, measurementMs }) => {
      const lab = window.__blockyClearLab;
      lab.begin();
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
      performance.mark(`${marker}:start`);
      await lab.commit();
      performance.mark(`${marker}:committed`);
      await new Promise((resolve) => setTimeout(resolve, measurementMs));
      const sample = lab.stop(),
        state = lab.state();
      performance.mark(`${marker}:end`);
      return { sample, state, marker };
    },
    { marker, measurementMs },
  );
}
export function validateEpisode(episode, mode) {
  const { state, sample } = episode,
    p = state.proof;
  assert.equal(state.game.score, 1574);
  assert.equal(p.shownScore, 1574);
  assert.equal(state.wardrobe.selected, 5);
  assert.equal(p.pendingPoints, 0);
  assert(p.boardEmpty);
  assert.equal(p.renderedTheme, 5);
  assert.equal(p.festival.spawned, 148);
  assert.equal(p.festival.bursts, 2);
  assert.equal(p.festival.activeParticles, 0);
  assert.equal(p.festival.activeReveals, 0);
  assert.equal(p.festival.idleWaiters, 0);
  assert.deepEqual(p.rewardEffects, {
    captionAnimations: 2,
    visibleEmblems: 0,
    pointFlights: 2,
    hudFlashes: 2,
    themeNotices: 1,
    themeImpulses: 1,
  });
  assert.deepEqual(state.resources, {
    rewards: 0,
    notices: 0,
    animations: 0,
    timers: 0,
    scoreFrame: false,
    nativeAnimations: 0,
  });
  assert.equal(sample.placements.length, 1);
  assert(
    sample.frameTimes.at(-1) - sample.placements[0].at >= measurementMs - 100,
  );
  if (mode === "staged") {
    const cp = state.clearPresentation;
    assert.equal(cp.phase, "idle");
    assert.equal(cp.pending, 0);
    assert.deepEqual(cp.errors, []);
    const start = cp.events.find((e) => e.name === "start").at,
      theme = cp.events.find((e) => e.name === "theme-start").at;
    assert(theme - start >= 2700);
    assert(cp.events.some((e) => e.name === "complete"));
  }
}
export function frameMetrics(sample, low, high) {
  const at = sample.placements[0].at;
  const fs = sample.frames.filter(
    (ms, i) =>
      sample.frameTimes[i] > at + low && sample.frameTimes[i] - ms < at + high,
  );
  const sorted = [...fs].sort((a, b) => a - b);
  return {
    intervals: fs.length,
    over33: fs.filter((x) => x > 33.4).length,
    over50: fs.filter((x) => x > 50).length,
    maxMs: Math.max(0, ...fs),
    p95Ms: sorted[Math.floor(sorted.length * 0.95)],
    excessOver16_7Ms: fs.reduce((n, x) => n + Math.max(0, x - 16.7), 0),
  };
}
