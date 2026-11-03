import { test, expect } from "@playwright/test";
for (const [before, multiplier, step] of [
  [3, 3, 2],
  [9, 8, 5],
  [19, 15, 8],
]) {
  test(`progression ${before + 1}: durable score, theme, labels and prepared move`, async ({
    page,
  }) => {
    await page.route("**/src/game/audio.ts", async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        body: (await response.text()).replace(
          "export class GameAudio {",
          "export class GameAudio { constructor(){window.testAudio=this;}",
        ),
      });
    });
    await page.route("**/src/game/atmosphere.ts", async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        body: (await response.text()).replace(
          "constructor() {",
          "constructor() { window.testAtmosphere = this;",
        ),
      });
    });
    await page.goto("/");
    await expect(page.locator("#app")).not.toHaveAttribute("aria-busy", "true");
    await page.evaluate(async (before) => {
      const { IndexedSave } = await import("/src/platform/save.ts");
      const { newGame } = await import("/src/core/rules.ts");
      const save = new IndexedSave(),
        p = (await save.load()).profile;
      p.revision++;
      p.tutorialStep = 4;
      p.settings.musicVolume = 0.35;
      p.best = p.festivalBest = p.progressionBest = 100000;
      p.game = {
        ...newGame(20, "progression"),
        streak: before,
        scoringVersion: "festival-v4",
      };
      p.game.tray = [0, 1, 2].map(() => ({
        shapeId: "S1-0",
        color: 2,
        used: false,
      }));
      for (let x = 1; x < 8; x++) p.game.board[x] = 1;
      p.game.board[27] = 2;
      await save.write(p);
    }, before);
    await page.reload();
    await expect(page.locator("#app")).not.toHaveAttribute("aria-busy", "true");
    await page.locator('[data-slot="0"]').click();
    await page.locator("#board").click({ position: { x: 3, y: 3 } });
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const { IndexedSave } = await import("/src/platform/save.ts");
          return (await new IndexedSave().load()).profile.game.score;
        }),
      )
      .toBe(multiplier * 100 + 1);
    await expect(
      page.locator(`.reward-event[data-step="${step}"]`).first(),
    ).toBeAttached();
    await expect
      .poll(() => page.evaluate(() => !!window.testAudio.music?.source), {
        timeout: 20000,
      })
      .toBe(true);
    const sources = await page.evaluate(
      () => window.testAudio.music.layers.filter((l) => !!l.source).length,
    );
    expect(sources).toBe(3);
    await page.locator('[data-slot="1"]').click();
    await page.locator("#board").click({ position: { x: 3, y: 3 } });
    expect(await page.evaluate(() => window.testAudio.music.streak)).toBe(
      before + 1,
    );
    expect(await page.evaluate(() => window.testAtmosphere.index)).toBe(0);
    const background = await page
      .locator(".world-background")
      .first()
      .boundingBox();
    const viewport = page.viewportSize();
    expect(background?.width).toBe(viewport?.width);
    expect(background?.height).toBe(viewport?.height);
    expect(
      await page.evaluate(
        () => getComputedStyle(document.body).transitionDuration,
      ),
    ).toBe("0s");
    await page.locator("#pause").click();
    expect(await page.evaluate(() => window.testAtmosphere.index)).toBe(0);
    expect(
      await page.evaluate(
        () => window.testAudio.music.layers.filter((l) => l.source).length,
      ),
    ).toBe(0);
    await page.locator("#resume").click();
    expect(await page.evaluate(() => window.testAtmosphere.index)).toBe(0);
  });
}
