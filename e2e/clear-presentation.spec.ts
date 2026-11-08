import { test, expect, type Page } from "@playwright/test";
test.use({
  viewport: { width: 392, height: 872 },
  deviceScaleFactor: 2.75,
  isMobile: true,
  hasTouch: true,
});
async function open(page: Page, variant = 2) {
  await page.goto(
    `/?clearTrace=1&clearLab&clearPresentation=staged&variant=${variant}`,
  );
  await page.waitForFunction(() => !!(window as any).__blockyClearLab);
}
async function begin(page: Page, record = false) {
  return page.evaluate(async (record) => {
    const lab = (window as any).__blockyClearLab;
    await lab.prepare({ record });
    lab.begin();
    (window as any).__clearStartedAt = performance.now();
    await lab.commit();
    return lab.state();
  }, record);
}
async function end(page: Page) {
  await page.waitForFunction(
    () => {
      const x = (window as any).__blockyClearLab.state().clearPresentation;
      return (
        x.phase === "idle" && x.events.some((e: any) => e.name === "complete")
      );
    },
    null,
    { timeout: 10000 },
  );
  return page.evaluate(() => (window as any).__blockyClearLab.state());
}
function checked(state: any) {
  expect(state.clearPresentation).toMatchObject({
    phase: "idle",
    pending: 0,
    heldTheme: null,
    errors: [],
  });
  expect(state.proof.pendingPoints).toBe(0);
  expect(state.proof.shownScore).toBe(state.game.score);
  expect(state.proof.renderedTheme).toBe(state.wardrobe.selected);
  expect(state.proof.festival).toMatchObject({
    activeParticles: 0,
    activeReveals: 0,
    idleWaiters: 0,
  });
}

test("all three celebrations in both orientations finish before the theme, preserve outputs and release resources", async ({
  page,
}, testInfo) => {
  test.setTimeout(150000);
  const evidence = [];
  for (const viewport of [
    { width: 392, height: 872 },
    { width: 872, height: 392 },
  ]) {
    await page.setViewportSize(viewport);
    for (const variant of [0, 1, 2]) {
      await open(page, variant);
      await page.evaluate(() => {
        const samples: any[] = [];
        (window as any).__phaseSamples = samples;
        new MutationObserver(() => {
          if (
            document.querySelector<HTMLElement>("#app")!.dataset.clearPhase !==
            "theme"
          )
            return;
          const s = (window as any).__blockyClearLab.state();
          samples.push({
            captions: document.querySelectorAll(".reward-event").length,
            pending: s.proof.pendingPoints,
            particles: s.proof.festival.activeParticles,
            reveals: s.proof.festival.activeReveals,
          });
        }).observe(document.querySelector("#app")!, {
          attributes: true,
          attributeFilter: ["data-clear-phase"],
        });
      });
      const immediate = await begin(page);
      expect(immediate.game.score).toBe(1574);
      expect(immediate.wardrobe.selected).toBe(5);
      expect(immediate.proof.renderedTheme).toBe(1);
      const state = await end(page);
      const elapsed = await page.evaluate(
        () => performance.now() - (window as any).__clearStartedAt,
      );
      if (elapsed < 8000) await page.waitForTimeout(8000 - elapsed);
      checked(state);
      expect(state.proof.rewardEffects).toMatchObject({
        captionAnimations: 2,
        pointFlights: 2,
        hudFlashes: 2,
        themeNotices: 1,
        themeImpulses: 1,
      });
      expect(state.proof.festival).toMatchObject({ spawned: 148, bursts: 2 });
      const events = state.clearPresentation.events;
      const start = events.find((e: any) => e.name === "start").at;
      const theme = events.find((e: any) => e.name === "theme-start").at;
      expect(theme - start).toBeGreaterThan(2700);
      expect(
        await page.evaluate(() => (window as any).__phaseSamples),
      ).toContainEqual({ captions: 0, pending: 0, particles: 0, reveals: 0 });
      evidence.push({
        viewport,
        variant,
        phaseMs: theme - start,
        proof: state.proof,
        context: state.context,
      });
      await expect(page.locator(".reward-event,.hud-notice")).toHaveCount(0);
    }
  }
  await testInfo.attach("two-phase-completion", {
    body: JSON.stringify(evidence),
    contentType: "application/json",
  });
});

test("a real next gesture commits during the celebration without waiting for the theme", async ({
  page,
}) => {
  await open(page);
  await begin(page);
  const piece = (await page.locator(".piece").nth(2).boundingBox())!;
  const board = (await page.locator("#board").boundingBox())!;
  await page.mouse.click(piece.x + piece.width / 2, piece.y + piece.height / 2);
  await page.mouse.click(
    board.x + board.width * 0.04,
    board.y + board.height * 0.42,
  );
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).__blockyClearLab.state().game.revision,
      ),
    )
    .toBe(6);
  const state = await page.evaluate(() =>
    (window as any).__blockyClearLab.state(),
  );
  expect(state.game.score).toBeGreaterThan(1574);
  expect(state.clearPresentation.phase).toBe("celebration");
  checked(await end(page));
});

test("a second all-clear cancels stale output without losing or doubling pending points", async ({
  page,
}) => {
  await open(page);
  await begin(page);
  await page.evaluate(async () => (window as any).__blockyClearLab.nextClear());
  const after = await page.evaluate(() =>
    (window as any).__blockyClearLab.state(),
  );
  const final = await end(page);
  checked(final);
  expect(final.game.score).toBe(after.game.score);
  expect(final.game.board.every((x: number) => x === 0)).toBe(true);
  expect(
    final.clearPresentation.events.filter((e: any) => e.name === "cancel"),
  ).toHaveLength(1);
  expect(
    final.clearPresentation.events.filter((e: any) => e.name === "theme-start"),
  ).toHaveLength(1);
});

for (const action of ["pause", "background", "new-game"])
  test(`${action} discards the old presentation and leaves no delayed reward or theme request`, async ({
    page,
  }) => {
    await open(page);
    await begin(page);
    await page.waitForTimeout(950);
    if (action === "pause") await page.locator("#pause").click();
    else if (action === "new-game")
      await page.evaluate(async () =>
        (window as any).__blockyClearLab.newGame(),
      );
    else
      await page.evaluate(() => {
        Object.defineProperty(document, "hidden", {
          configurable: true,
          value: true,
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });
    await page.waitForTimeout(3500);
    const state = await page.evaluate(() =>
      (window as any).__blockyClearLab.state(),
    );
    checked(state);
    expect(state.game.score).toBe(action === "new-game" ? 0 : 1574);
    expect(
      state.clearPresentation.events.some((e: any) => e.name === "theme-start"),
    ).toBe(false);
    await expect(page.locator(".reward-event,.hud-notice")).toHaveCount(0);
    if (action === "pause") {
      expect(
        await page.evaluate(
          () =>
            document.querySelector("#app")!.getAnimations({ subtree: true })
              .length,
        ),
      ).toBe(0);
      await page.locator("#resume").click();
    } else if (action === "background")
      await page.evaluate(() => {
        Object.defineProperty(document, "hidden", {
          configurable: true,
          value: false,
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });
    await page.waitForTimeout(300);
    await expect(page.locator(".reward-event,.hud-notice")).toHaveCount(0);
  });

test("rotation retains the accepted move and finishes in the current viewport", async ({
  page,
}) => {
  await open(page);
  await begin(page);
  await page.waitForTimeout(850);
  await page.setViewportSize({ width: 872, height: 392 });
  checked(await end(page));
  await expect(page.locator("#score")).toHaveText("1 574");
});

test("a simultaneous record is completed before the delayed theme notice", async ({
  page,
}) => {
  await open(page);
  await begin(page, true);
  await expect(page.locator('.hud-notice[data-tier="record"]')).toBeVisible({
    timeout: 2500,
  });
  const state = await end(page);
  checked(state);
  const events = state.clearPresentation.events;
  expect(
    events.find((e: any) => e.name === "theme-start").at -
      events.find((e: any) => e.name === "start").at,
  ).toBeGreaterThan(3500);
  expect(state.proof.rewardDomCreated).toBe(4);
});
