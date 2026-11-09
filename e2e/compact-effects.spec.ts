import { test, expect, type Page } from "@playwright/test";

async function fixture(page: Page, calm = false) {
  await page.goto("/");
  await expect(page.locator("#app")).not.toHaveAttribute("aria-busy", "true");
  await page.evaluate(async (calm) => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    const { fixtureProfile } = await import("/src/diagnostics/phone-clear.ts");
    const adapter = new IndexedSave();
    const p = fixtureProfile((await adapter.load()).profile.revision + 1);
    p.best = p.festivalBest = p.progressionBest = 500;
    p.settings.calm = calm;
    await adapter.write(p);
  }, calm);
  await page.reload();
  await expect(page.locator("#app")).not.toHaveAttribute("aria-busy", "true");
  await page.locator(".piece").first().click();
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 50));
  const b = (await page.locator("#board").boundingBox())!;
  await page.locator("#board").click({
    force: true,
    position: { x: (b.width * 6.5) / 8, y: (b.height * 0.5) / 8 },
  });
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { IndexedSave } = await import("/src/platform/save.ts");
        return (await new IndexedSave().load()).profile.game.score;
      }),
    )
    .toBe(1574);
}

for (const calm of [false, true]) {
  test(`default compact clear settles once and survives reload; calm=${calm}`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await fixture(page, calm);
    await expect(page.locator("html")).toHaveAttribute(
      "data-effects",
      "compact",
    );
    await expect(page.locator(".reward-event")).toHaveCount(1);
    await expect(page.locator(".compact-reward")).toContainText("+1 453");
    await expect(page.locator(".compact-reward")).toContainText("Чистое поле!");
    await expect(page.locator(".compact-reward")).toContainText("Рекорд!");
    expect(
      (await page.locator("#score").textContent())?.replace(/\D/g, ""),
    ).toBe("1574");
    await expect(
      page.locator(".reward-praise i, .reward-emblem, .hud-notice"),
    ).toHaveCount(0);
    expect(
      await page
        .locator(".festival-canvas")
        .evaluate((e) => getComputedStyle(e).display),
    ).toBe("none");
    expect(
      await page
        .locator("#board canvas")
        .evaluate((e) => e.getAnimations().length),
    ).toBe(0);
    await page.clock.runFor(1200);
    await expect(page.locator(".reward-event")).toHaveCount(0);
    await page.clock.runFor(4000);
    await expect(page.locator(".reward-event, .hud-notice")).toHaveCount(0);
    await page.clock.resume();
    await page.reload();
    await expect(page.locator("#app")).not.toHaveAttribute("aria-busy", "true");
    expect(
      (await page.locator("#score").textContent())?.replace(/\D/g, ""),
    ).toBe("1574");
    expect(errors).toEqual([]);
  });
}

test("pause cancels the compact reward without late resurrection or point loss", async ({
  page,
}) => {
  await fixture(page);
  await page.locator("#pause").click({ force: true });
  await page.clock.runFor(5000);
  await expect(page.locator(".reward-event, .hud-notice")).toHaveCount(0);
  expect((await page.locator("#score").textContent())?.replace(/\D/g, "")).toBe(
    "1574",
  );
});

test("a prepared next move immediately replaces the old reward and remains saved", async ({
  page,
}) => {
  await fixture(page);
  await page.locator(".piece").nth(2).click({ force: true });
  const b = (await page.locator("#board").boundingBox())!;
  await page.locator("#board").click({
    force: true,
    position: { x: (b.width * 0.5) / 8, y: (b.height * 0.5) / 8 },
  });
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { IndexedSave } = await import("/src/platform/save.ts");
        return (await new IndexedSave().load()).profile.game.moves;
      }),
    )
    .toBe(6);
  await expect(page.locator(".reward-event")).toHaveCount(0);
  await page.clock.runFor(5000);
  await expect(page.locator(".reward-event, .hud-notice")).toHaveCount(0);
  expect((await page.locator("#score").textContent())?.replace(/\D/g, "")).toBe(
    "1577",
  );
});
