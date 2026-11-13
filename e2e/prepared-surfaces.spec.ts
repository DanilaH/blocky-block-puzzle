import { test, expect, type Page } from "@playwright/test";
async function open(page: Page, mode: string) {
  await page.goto(
    `/?clearTrace=full&effectsStudy=legacy&themeSurfaces=${mode}`,
  );
  await page.waitForFunction(
    () =>
      !!(window as any).__blockyFullDiagnostic &&
      (window as any).__themeSurfaces?.ready,
  );
  await page.evaluate(() =>
    (window as any).__blockyFullDiagnostic.prepare("baseline"),
  );
}
for (const mode of ["flat", "generated"]) {
  test(`prepared ${mode} preserves the complete celebration and settles`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await open(page, mode);
    const before = await page.locator("#board").boundingBox();
    const row = await page.evaluate(() =>
      (window as any).__blockyFullDiagnostic.measure(8000),
    );
    expect(row.valid).toBe(true);
    expect(row.state.proof.score).toBe(1574);
    expect(row.state.proof.shownScore).toBe(1574);
    expect(row.state.proof.pendingPoints).toBe(0);
    expect(row.state.proof.festival.spawned).toBe(148);
    expect(row.state.proof.rewardDomCreated).toBe(3);
    const state = await page.evaluate(() =>
      (window as any).__themeSurfaces.snapshot(),
    );
    for (const s of [state.page, state.bed]) {
      expect(s.active).toBe(false);
      expect(s.visibleLayers).toBe(1);
      expect(s.transitions).toBeGreaterThan(0);
    }
    expect(state.decodedArt).toBe(mode === "generated" ? 2 : 0);
    expect(await page.locator("#board canvas").count()).toBe(1);
    expect(await page.locator("#board").boundingBox()).toEqual(before);
    expect(errors).toEqual([]);
  });
  test(`prepared ${mode} pause settles both backgrounds and prevents resurrection`, async ({
    page,
  }) => {
    await open(page, mode);
    const run = page.evaluate(() =>
      (window as any).__blockyFullDiagnostic.measure(2200),
    );
    await page.waitForFunction(
      () => (window as any).__themeSurfaces.snapshot().page.active,
    );
    await page.locator("#pause").evaluate((e: HTMLButtonElement) => e.click());
    const paused = await page.evaluate(() =>
      (window as any).__themeSurfaces.snapshot(),
    );
    await run;
    await page.waitForTimeout(150);
    const later = await page.evaluate(() =>
      (window as any).__themeSurfaces.snapshot(),
    );
    for (const state of [paused, later])
      for (const s of [state.page, state.bed]) {
        expect(s.active).toBe(false);
        expect(s.visibleLayers).toBe(1);
        expect(s.target).toBe("5");
      }
    expect(
      (await page.locator("#score").textContent())?.replace(/\D/g, ""),
    ).toBe("1574");
  });
}
test("interrupted alpha transitions preserve the blend and retain two snapshot buffers", async ({
  page,
}) => {
  await open(page, "flat");
  await page.evaluate(async () => {
    const { PreparedSurface } = await import(
      "/src/diagnostics/prepared-surfaces.ts"
    );
    const host = document.createElement("div");
    host.style.cssText =
      "position:fixed;left:0;top:0;width:40px;height:40px;z-index:9999";
    const a = document.createElement("div"),
      b = document.createElement("div");
    for (const n of [a, b]) n.style.cssText = "position:absolute;inset:0";
    host.append(a, b);
    document.body.append(host);
    const p = new PreparedSurface(a, b);
    (window as any).__alphaUnit = p;
    p.set({ key: "black", color: "#000" }, 0);
    p.set({ key: "white", color: "#fff" }, 1000);
    b.getAnimations()[0]!.currentTime = 300;
  });
  const first = await page.evaluate(() => {
    const p = (window as any).__alphaUnit;
    const expected = 255 * (1 - Number(getComputedStyle(p.overlay).opacity));
    p.set({ key: "red", color: "#f00" }, 1000);
    const c = p.overlay.querySelector("canvas"),
      g = c.getContext("2d");
    return {
      expected,
      pixel: [...g.getImageData(c.width / 2, c.height / 2, 1, 1).data],
      state: p.snapshot(),
    };
  });
  for (const channel of first.pixel.slice(0, 3))
    expect(Math.abs(channel - first.expected)).toBeLessThanOrEqual(3);
  for (let i = 0; i < 10; i++) {
    await page.evaluate((i) => {
      const p = (window as any).__alphaUnit;
      p.overlay.getAnimations()[0].currentTime = 40;
      p.set({ key: String(i), color: i % 2 ? "#00f" : "#f00" }, 1000);
    }, i);
  }
  const during = await page.evaluate(() =>
    (window as any).__alphaUnit.snapshot(),
  );
  expect(during.flattenings).toBe(11);
  expect(during.snapshotBuffers).toBeLessThanOrEqual(2);
  expect(during.visibleLayers).toBe(2);
  await page.evaluate(
    () => (window as any).__alphaUnit.overlay.getAnimations()[0].finished,
  );
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).__alphaUnit.snapshot().active),
    )
    .toBe(false);
  const end = await page.evaluate(() => (window as any).__alphaUnit.snapshot());
  expect(end.active).toBe(false);
  expect(end.visibleLayers).toBe(1);
  expect(end.target).toBe("9");
});

test("rapid board transitions and resize preserve the real game canvas selector", async ({
  page,
}) => {
  await open(page, "flat");
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 50));
  await page.evaluate(() => {
    (window as any).__gameCanvas = document.querySelector("#board canvas");
    (window as any).__themeSurfaces.bed.set(
      { key: "forced5", color: "#46647a", grid: true },
      1000,
    );
  });
  await page.clock.runFor(300);
  await page.evaluate(() =>
    (window as any).__themeSurfaces.bed.set(
      { key: "forced1", color: "#c9dbe7", grid: true },
      1000,
    ),
  );
  expect(await page.locator(".prepared-board-surface canvas").count()).toBe(1);
  expect(await page.locator("#board canvas").count()).toBe(1);
  expect(
    await page.evaluate(
      () =>
        document.querySelector("#board canvas") ===
        (window as any).__gameCanvas,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 568, height: 320 });
  await page.clock.runFor(100);
  const state = await page.evaluate(() =>
    (window as any).__themeSurfaces.snapshot(),
  );
  expect(state.bed.active).toBe(false);
  expect(state.bed.visibleLayers).toBe(1);
  const bounds = await page.locator("#board").boundingBox(),
    surface = await page
      .locator(".prepared-board-surface")
      .first()
      .boundingBox();
  expect(surface).toEqual(bounds);
});
