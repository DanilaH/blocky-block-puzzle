import { test, expect } from "@playwright/test";
test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});
async function fixture(page) {
  await page.goto("/");
  await page.locator("#board canvas").waitFor();
  await page.evaluate(async () => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    const { createProfile } = await import("/src/core/profile.ts");
    const { newGame } = await import("/src/core/rules.ts");
    const a = new IndexedSave(),
      old = await a.load(),
      p = createProfile(newGame(1234, "touch09"));
    p.revision = old.profile.revision + 1;
    p.tutorialStep = 4;
    p.game.tray = [0, 1, 2].map((i) => ({
      shapeId: "S1-0",
      used: false,
      color: i + 1,
    }));
    await a.write(p);
  });
  await page.reload();
  await page.locator("#board canvas").waitFor();
}
test("safe-area keeps gameplay and lesson above the banner", async ({
  page,
  context,
}) => {
  await fixture(page);
  const cdp = await context.newCDPSession(page);
  for (const [width, height, top, bottom, left] of [
    [320, 568, 24, 24, 0],
    [390, 844, 24, 24, 0],
    [568, 320, 0, 24, 24],
    [640, 360, 0, 24, 24],
    [844, 390, 0, 24, 24],
    [768, 1024, 24, 24, 0],
  ]) {
    await page.setViewportSize({ width, height });
    await cdp.send("Emulation.setSafeAreaInsetsOverride", {
      insets: { top, bottom, left, right: 0 },
    });
    for (const learning of [false, true]) {
      if (learning) {
        await page.locator("#pause").click();
        await page.locator("#rules").click();
        await page.locator("#practice").click();
      }
      await expect
        .poll(async () => {
          const a = (await page.locator("#ad-slot").boundingBox())!;
          const selectors = [
            "#board",
            ".tray",
            learning ? "#lesson-skip" : "#hint",
          ];
          for (const selector of selectors) {
            const r = (await page.locator(selector).boundingBox())!;
            if (
              r.y < top - 0.5 ||
              r.x < left - 0.5 ||
              r.y + r.height > a.y - 3.5 ||
              r.x + r.width > width + 0.5
            )
              return JSON.stringify({
                selector,
                width,
                height,
                learning,
                r,
                a,
              });
          }
          return "ok";
        })
        .toBe("ok");
      await page.screenshot({
        path: `docs/qa/feel-0.9/insets-${width}x${height}-${learning ? "lesson" : "game"}.png`,
      });
      if (learning) await page.locator("#lesson-skip").click();
    }
  }
});
for (const firstLift of [1, 2])
  test(`second touch cancels drag, lift ${firstLift} first, next gesture works`, async ({
    page,
    context,
  }) => {
    await fixture(page);
    const cdp = await context.newCDPSession(page);
    const t = (await page.locator(".piece").first().boundingBox())!,
      b = (await page.locator("#board").boundingBox())!;
    const one = { id: 1, x: t.x + t.width / 2, y: t.y + t.height / 2 },
      two = { id: 2, x: b.x + 10, y: b.y + 10 };
    const send = (type, touchPoints) =>
      cdp.send("Input.dispatchTouchEvent", { type, touchPoints });
    await send("touchStart", [one]);
    one.x = b.x + b.width / 2;
    one.y = b.y + b.height / 2;
    await send("touchMove", [one]);
    await expect(page.locator("#floating")).toBeVisible();
    await send("touchStart", [one, two]);
    await expect(page.locator("#floating")).toBeHidden();
    await send("touchEnd", firstLift === 1 ? [two] : [one]);
    await send("touchEnd", []);
    const moves = () =>
      page.evaluate(async () => {
        const { IndexedSave } = await import("/src/platform/save.ts");
        return (await new IndexedSave().load()).profile.game.moves;
      });
    expect(await moves()).toBe(0);
    await page.locator(".piece").first().tap();
    await page.locator("#board").tap({ position: { x: 20, y: 20 } });
    await expect.poll(moves).toBe(1);
  });
