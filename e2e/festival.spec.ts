import { test, expect } from "@playwright/test";
for (const interrupt of [false, true])
  test(`festival rewards are durable and bounded; pause=${interrupt}`, async ({
    page,
  }) => {
    await page.route("**/src/platform/haptics.ts", async (route) => {
      const response = await route.fetch();
      const body = (await response.text()).replace(
        /export function nativeHaptics\(\) \{[\s\S]*?\n\}/,
        `export function nativeHaptics(){ window.hapticCalls=[];return {setActive:async p=>window.hapticCalls.push(p),pulse:async p=>window.hapticCalls.push(p)}; }`,
      );
      await route.fulfill({ response, body });
    });
    await page.goto("/");
    await page.locator("#board canvas").waitFor();
    await page.evaluate(async () => {
      const { IndexedSave } = await import("/src/platform/save.ts");
      const { newGame } = await import("/src/core/rules.ts");
      const a = new IndexedSave(),
        p = (await a.load()).profile;
      p.revision++;
      p.tutorialStep = 4;
      p.best = 500;
      p.festivalBest = 500;
      p.game = {
        ...newGame(12, "festival"),
        scoringVersion: "festival-v3",
        streak: 3,
      };
      p.game.tray = [0, 1, 2].map((i) => ({
        shapeId: "S1-0",
        color: i + 1,
        used: false,
      }));
      for (let i = 1; i < 8; i++) {
        p.game.board[i] = 1;
        p.game.board[i * 8] = 2;
      }
      await a.write(p);
    });
    await page.reload();
    await page.locator("#board canvas").waitFor();
    for (const [width, height] of [
      [390, 844],
      [320, 480],
      [568, 320],
    ]) {
      await page.setViewportSize({ width, height });
      await expect
        .poll(async () => {
          const hud = await page.locator("#combo-hud").boundingBox();
          const board = await page.locator("#board").boundingBox();
          return (
            !!hud &&
            !!board &&
            hud.y >= 0 &&
            hud.y + hud.height <= board.y &&
            hud.x >= 0 &&
            hud.x + hud.width <= width
          );
        })
        .toBe(true);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.clock.install();
    await page.clock.pauseAt(new Date(Date.now() + 100));
    await page.locator(".piece").first().click({ force: true });
    await page
      .locator("#board")
      .click({ force: true, position: { x: 4, y: 4 } });
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const { IndexedSave } = await import("/src/platform/save.ts");
          return (await new IndexedSave().load()).profile.game.score;
        }),
      )
      .toBe(1901);
    await expect(page.locator("#combo-title")).toHaveText("СЕРИЯ 4 · ×3");
    await expect(page.locator("#combo-stock")).toContainText("2 хода");
    if (interrupt) {
      await page.locator("#pause").click({ force: true });
      await page.clock.runFor(3000);
      expect(await page.locator(".reward-event").count()).toBe(0);
    } else {
      await page.clock.runFor(700);
      await expect(
        page.locator('[data-tier="all-clear"].reward-event'),
      ).toContainText("+1000");
      await page.clock.runFor(3200);
      expect(await page.locator(".reward-event").count()).toBe(0);
      expect(
        await page.evaluate(() =>
          window.hapticCalls.some((p) => p.kind === "empty"),
        ),
      ).toBe(true);
    }
    expect(
      (await page.locator("#score").textContent())?.replace(/\D/g, ""),
    ).toBe("1901");
    await page.reload();
    await page.locator("#board canvas").waitFor();
    expect(
      (await page.locator("#best").textContent())?.replace(/\D/g, ""),
    ).toBe("1901");
  });
