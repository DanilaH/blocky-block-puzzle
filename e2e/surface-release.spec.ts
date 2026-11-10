import { test, expect, type Page } from "@playwright/test";
async function fixture(page: Page, calm = false) {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute(
    "data-theme-surfaces",
    /generated|original/,
  );
  await page.evaluate(async (calm) => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    const { fixtureProfile } = await import("/src/diagnostics/phone-clear.ts");
    const a = new IndexedSave();
    const p = fixtureProfile((await a.load()).profile.revision + 1);
    p.settings.calm = calm;
    await a.write(p);
  }, calm);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute(
    "data-theme-surfaces",
    /generated|original/,
  );
}
async function clear(page: Page) {
  await page.locator(".piece").first().click();
  const b = (await page.locator("#board").boundingBox())!;
  await page
    .locator("#board")
    .click({ position: { x: (b.width * 6.5) / 8, y: (b.height * 0.5) / 8 } });
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { IndexedSave } = await import("/src/platform/save.ts");
        return (await new IndexedSave().load()).profile.game.score;
      }),
    )
    .toBe(1574);
}
test("ordinary game enables prepared art and retains the full celebration", async ({
  page,
}) => {
  const errors: string[] = [],
    art: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (r.url().includes("/backgrounds/")) art.push(r.url());
  });
  await fixture(page);
  art.length = 0;
  await expect(page.locator("html")).toHaveAttribute("data-effects", "legacy");
  await clear(page);
  await expect(page.locator(".reward-event")).not.toHaveCount(0);
  expect(await page.locator(".compact-reward").count()).toBe(0);
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).__themeSurfaces.snapshot().bed.target,
      ),
    )
    .toBe("5");
  await page.waitForTimeout(6500);
  const s = await page.evaluate(() =>
    (window as any).__themeSurfaces.snapshot(),
  );
  expect(s.mode).toBe("generated");
  expect(s.artReady).toBe(true);
  expect(s.decodedArt).toBe(2);
  expect(s.page.active).toBe(false);
  expect(s.bed.active).toBe(false);
  expect(s.page.visibleLayers).toBe(1);
  expect(s.bed.visibleLayers).toBe(1);
  expect(art).toEqual([]);
  expect(errors).toEqual([]);
});
for (const reduced of [false, true])
  test(`calm or reduced motion settles prepared backgrounds; reduced=${reduced}`, async ({
    page,
  }) => {
    if (reduced) await page.emulateMedia({ reducedMotion: "reduce" });
    await fixture(page, !reduced);
    await clear(page);
    const s = await page.evaluate(() =>
      (window as any).__themeSurfaces.snapshot(),
    );
    expect(s.page.active).toBe(false);
    expect(s.bed.active).toBe(false);
    expect(s.bed.target).toBe("5");
  });
test("pause and page background settle transitions without late resurrection", async ({
  page,
}) => {
  await fixture(page);
  await clear(page);
  await page.locator("#pause").click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).__themeSurfaces.snapshot().page.active,
      ),
    )
    .toBe(false);
  await page.locator("#resume").click();
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await page.waitForTimeout(1500);
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent("pageshow")),
  );
  await expect(page.locator(".reward-event,.hud-notice")).toHaveCount(0);
  const s = await page.evaluate(() =>
    (window as any).__themeSurfaces.snapshot(),
  );
  expect(s.page.active).toBe(false);
  expect(s.bed.active).toBe(false);
  expect(s.bed.target).toBe("5");
  expect(await page.locator("#board canvas").count()).toBe(1);
  await expect(page.locator("#score")).toContainText("574");
});
for (const failure of ["network", "timeout"])
  test(`background ${failure} uses the original renderer and leaves the game playable`, async ({
    page,
  }) => {
    await page.route("**/backgrounds/polar-night-v1.webp", async (route) => {
      if (failure === "timeout") await new Promise((r) => setTimeout(r, 2800));
      await route.abort().catch(() => {});
    });
    await fixture(page);
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme-surfaces",
      "original",
    );
    await clear(page);
    await page.waitForTimeout(1000);
    expect(await page.locator(".prepared-surface>img").count()).toBe(0);
    expect(await page.locator("#board canvas").count()).toBe(1);
    const s = await page.evaluate(() =>
      (window as any).__themeSurfaces.snapshot(),
    );
    expect(s.fallbackReason).toBe("art-unavailable");
    expect(s.hooksActive).toBe(false);
  });
test("short comparison completes both orders, exports intervals and protects ordinary saves", async ({
  page,
}) => {
  test.setTimeout(150000);
  await fixture(page);
  const before = await page.evaluate(async () => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    return new IndexedSave().load();
  });
  await page.goto("/?clearTrace=surfaces");
  await expect(page.locator("#surface-start")).toBeEnabled();
  await page.locator("#surface-start").click();
  await expect
    .poll(
      () =>
        page.evaluate(
          () => (window as any).__blockySurfaceComparison.report?.completed,
        ),
      { timeout: 125000, intervals: [1000] },
    )
    .toBe(true);
  const r = await page.evaluate(
    () => (window as any).__blockySurfaceComparison.report,
  );
  expect(r.episodes).toHaveLength(10);
  expect(r.episodes.every((x: any) => x.valid)).toBe(true);
  expect(r.protocol.traces).toBe(false);
  expect(r.summary.improved).toBe(false);
  expect(r.physical).toBe(false);
  expect(
    r.episodes
      .filter((x: any) => x.phase === "comparison")
      .map((x: any) => x.mode),
  ).toEqual([
    "original",
    "generated",
    "generated",
    "original",
    "original",
    "generated",
    "generated",
    "original",
  ]);
  const after = await page.evaluate(async () => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    return new IndexedSave().load();
  });
  expect(after).toEqual(before);
  const download = page.waitForEvent("download");
  await page.locator("#surface-share").click();
  const d = await download;
  await d.saveAs("/tmp/blocky062-browser-surfaces.json");
  expect(d.suggestedFilename()).toContain("blocky-surfaces");
});
test("short comparison cancellation is explicit and cannot become a partial win", async ({
  page,
}) => {
  await page.goto("/?clearTrace=surfaces&test=fast");
  await expect(page.locator("#surface-start")).toBeEnabled();
  await page.locator("#surface-start").click();
  await expect(page.locator("#surface-cancel")).toBeVisible();
  await page.locator("#surface-cancel").click();
  await expect(page.locator("#surface-error")).toContainText("cancelled");
  await expect(page.locator("#surface-start")).toBeEnabled();
  const r = await page.evaluate(
    () => (window as any).__blockySurfaceComparison.report,
  );
  expect(r.completed).toBe(false);
  expect(r.summary.improved).toBe(false);
  await page.locator("#surface-return").click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-theme-surfaces",
    "generated",
  );
});
test("background before the delayed reveal resolves both surfaces to the saved theme", async ({
  page,
}) => {
  await fixture(page);
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 50));
  await clear(page);
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  const paused = await page.evaluate(() =>
    (window as any).__themeSurfaces.snapshot(),
  );
  expect(paused.page.target).toBe("5");
  expect(paused.bed.target).toBe("5");
  expect(paused.page.active).toBe(false);
  expect(paused.bed.active).toBe(false);
  await page.clock.runFor(2000);
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent("pageshow")),
  );
  const resumed = await page.evaluate(() =>
    (window as any).__themeSurfaces.snapshot(),
  );
  expect(resumed.bed.target).toBe("5");
  expect(resumed.bed.active).toBe(false);
  await expect(page.locator(".reward-event,.hud-notice")).toHaveCount(0);
});
test("real WebGL context loss and recovery retain the saved theme and accept another move", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await fixture(page);
  await clear(page);
  await page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>("#board canvas")!;
    const gl = (c.getContext("webgl2") ??
      c.getContext("webgl")) as WebGLRenderingContext;
    const ext = gl.getExtension("WEBGL_lose_context")!;
    (window as any).__contextLoss = ext;
    ext.loseContext();
  });
  await expect(page.locator("#app")).toHaveClass(/effects-paused/);
  await page.waitForTimeout(300);
  await page.evaluate(() => (window as any).__contextLoss.restoreContext());
  await expect(page.locator("#app")).not.toHaveClass(/effects-paused/);
  const s = await page.evaluate(() =>
    (window as any).__themeSurfaces.snapshot(),
  );
  expect(s.bed.target).toBe("5");
  expect(s.bed.active).toBe(false);
  expect(s.page.active).toBe(false);
  await page.locator(".piece").nth(2).click();
  const b = (await page.locator("#board").boundingBox())!;
  await page
    .locator("#board")
    .click({ position: { x: (b.width * 0.5) / 8, y: (b.height * 0.5) / 8 } });
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { IndexedSave } = await import("/src/platform/save.ts");
        return (await new IndexedSave().load()).profile.game.moves;
      }),
    )
    .toBe(6);
  expect(errors).toEqual([]);
});
