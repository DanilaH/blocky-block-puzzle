import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs/promises";
test.use({ viewport: { width: 392, height: 872 }, deviceScaleFactor: 2.75 });
async function open(page: Page) {
  await page.goto("/?clearTrace=1&test=fast");
  await expect(page.locator("#phone-clear-start")).toBeEnabled();
}
test("prepared glyphs keep semantic text, move without DOM letters and release all memory", async ({
  page,
}) => {
  await open(page);
  const initial = await page.evaluate(async () => {
    const { RewardLabels } = await import("/src/game/reward-label.ts");
    const host = document.createElement("span");
    host.className = "reward-event";
    host.dataset.tier = "all-clear";
    host.style.cssText = "left:50%;top:45%";
    const label = document.createElement("span");
    label.className = "reward-praise";
    label.style.fontSize = "34px";
    for (const [i, c] of Array.from("Чистое поле!").entries()) {
      const n = document.createElement("i");
      n.textContent = c;
      n.style.setProperty("--letter", String(i));
      label.append(n);
    }
    host.append(label);
    document.body.append(host);
    const before = label.getBoundingClientRect();
    const renderer = new RewardLabels();
    const dispose = renderer.prepare(label, true);
    (window as any).__rasters = { renderer, dispose, host, label };
    const after = label.getBoundingClientRect();
    const canvas = label.querySelector("canvas")!;
    const pixels = canvas
      .getContext("2d")!
      .getImageData(0, 0, canvas.width, canvas.height).data;
    return {
      stats: renderer.snapshot(),
      before: [before.width, before.height],
      after: [after.width, after.height],
      ink: pixels.filter((v, i) => i % 4 === 3 && v > 10).length,
    };
  });
  expect(initial.stats.fallbacks).toBe(0);
  expect(initial.stats.prepared).toBe(1);
  expect(initial.stats.bytes).toBeLessThan(9 * 1024 * 1024);
  expect(initial.ink).toBeGreaterThan(1000);
  expect(initial.after).toEqual(initial.before);
  await expect(page.locator("body>.reward-event .reward-praise")).toHaveText(
    "Чистое поле!",
  );
  await expect(page.locator("body>.reward-event .reward-praise i")).toHaveCount(
    0,
  );
  const nativeMotion = await page.evaluate(() => {
    const label = (window as any).__rasters.label;
    const animations = label.getAnimations({ subtree: true });
    animations.forEach((a: Animation) => {
      a.pause();
      a.currentTime = 325;
    });
    return {
      count: animations.length,
      transform: getComputedStyle(label.querySelector("canvas")).transform,
    };
  });
  expect(nativeMotion.count).toBeGreaterThan(3);
  expect(nativeMotion.transform).not.toBe("none");
  const final = await page.evaluate(() => {
    const x = (window as any).__rasters;
    x.dispose();
    x.dispose();
    x.host.remove();
    const live = x.renderer.snapshot();
    x.renderer.clearCache();
    return { ...x.renderer.snapshot(), releasedActiveBytes: live.activeBytes };
  });
  expect(final.bytes).toBe(0);
  expect(final.releasedActiveBytes).toBe(0);
  expect(final.active).toBe(0);
  expect(final.clockActive).toBe(false);
});
test("unavailable Canvas2D preserves the original reward and its lifecycle", async ({
  page,
}) => {
  await open(page);
  const r = await page.evaluate(async () => {
    const { RewardLabels } = await import("/src/game/reward-label.ts");
    const label = document.createElement("span");
    label.className = "reward-praise";
    label.textContent = "Линия!";
    document.body.append(label);
    const before = label.outerHTML,
      renderer = new RewardLabels();
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() => null) as typeof original;
    try {
      renderer.prepare(label, false)();
    } finally {
      HTMLCanvasElement.prototype.getContext = original;
    }
    return { before, after: label.outerHTML, stats: renderer.snapshot() };
  });
  expect(r.after).toBe(r.before);
  expect(r.stats.fallbacks).toBe(1);
  expect(r.stats.active).toBe(0);
  expect(r.stats.bytes).toBe(0);
});
test("full real clear prepares both reward texts, stays bounded and releases active surfaces", async ({
  page,
}) => {
  await page.goto("/?clearTrace=1");
  await expect(page.locator("#phone-clear-start")).toBeEnabled();
  await page.locator("#phone-clear-start").click();
  await expect(page.locator("#phone-clear-export")).toBeEnabled({
    timeout: 30000,
  });
  const dl = page.waitForEvent("download");
  await page.locator("#phone-clear-export").click();
  const r = JSON.parse(await fs.readFile((await (await dl).path())!, "utf8"));
  expect(r.completed).toBe(true);
  for (const e of r.episodes) {
    expect(e.state.game.score).toBe(1574);
    expect(e.state.rewardRasters.prepared).toBeGreaterThanOrEqual(4);
    expect(e.state.rewardRasters.fallbacks).toBe(0);
    expect(e.state.rewardRasters.clockActive).toBe(false);
    expect(e.state.rewardRasters.initialCachedBytes).toBeGreaterThan(0);
    expect(e.state.rewardRasters.peakBytes).toBeLessThan(28 * 1024 * 1024);
  }
  await expect(page.locator(".reward-raster")).toHaveCount(0);
});

test("font changes evict unused glyphs within the memory budget", async ({
  page,
}) => {
  await open(page);
  const stats = await page.evaluate(async () => {
    const { RewardLabels } = await import("/src/game/reward-label.ts");
    const r = new RewardLabels();
    let peak = 0;
    for (let size = 20; size < 56; size++) {
      const host = document.createElement("span");
      host.className = "reward-event";
      host.dataset.tier = "all-clear";
      const label = document.createElement("span");
      label.className = "reward-praise";
      label.style.fontSize = `${size}px`;
      for (const letter of "Чистое поле!") {
        const i = document.createElement("i");
        i.textContent = letter;
        label.append(i);
      }
      host.append(label);
      document.body.append(host);
      const dispose = r.prepare(label, false);
      peak = Math.max(peak, r.snapshot().bytes);
      dispose();
      host.remove();
      if (r.snapshot().cachedBytes > 12 * 1024 * 1024)
        throw Error("Unbounded glyph cache");
    }
    const after = r.snapshot();
    r.clearCache();
    return { after, peak, cleared: r.snapshot() };
  });
  expect(stats.after.prepared).toBe(36);
  expect(stats.after.fallbacks).toBe(0);
  expect(stats.peak).toBeLessThan(28 * 1024 * 1024);
  expect(stats.after.activeBytes).toBe(0);
  expect(stats.cleared.bytes).toBe(0);
  expect(stats.cleared.clockActive).toBe(false);
});
