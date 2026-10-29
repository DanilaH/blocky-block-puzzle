import { test, expect, type Page } from "@playwright/test";

async function prepare(page: Page) {
  await page.route("**/src/platform/haptics.ts", async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(
      /export function nativeHaptics\(\) \{[\s\S]*?\n\}/,
      `export function nativeHaptics(){ window.hapticCalls=[]; return {setActive:async p=>window.hapticCalls.push(p),pulse:async p=>window.hapticCalls.push(p)}; }`,
    );
    await route.fulfill({ response, body });
  });
  await page.goto("/");
  await page.locator("#board canvas").waitFor();
  await page.evaluate(async () => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    const { newGame } = await import("/src/core/rules.ts");
    const save = new IndexedSave(),
      p = (await save.load()).profile;
    p.revision++;
    p.tutorialStep = 4;
    p.best = 500;
    p.festivalBest = 500;
    p.game = {
      ...newGame(12, "preflight"),
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
    await save.write(p);
  });
  await page.reload();
  await page.locator("#board canvas").waitFor();
}
async function place(page: Page, slot: number, x = 4, y = 4) {
  await page.locator(`[data-slot="${slot}"]`).click({ force: true });
  await page.locator("#board").click({ force: true, position: { x, y } });
}
async function saved(page: Page) {
  return page.evaluate(async () => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    return (await new IndexedSave().load()).profile;
  });
}
for (const mode of ["background", "next-move"] as const) {
  test(`0.19 pending empty-board reward: ${mode}`, async ({ page }) => {
    await prepare(page);
    await page.clock.install();
    await page.clock.pauseAt(new Date(Date.now() + 100));
    await place(page, 0);
    await expect.poll(async () => (await saved(page)).game.score).toBe(1901);
    if (mode === "background") {
      await page.evaluate(() => window.dispatchEvent(new Event("blur")));
      const calls = await page.evaluate(() => window.hapticCalls.length);
      await page.clock.runFor(4000);
      expect(await page.evaluate(() => window.hapticCalls.length)).toBe(calls);
      expect(await page.locator(".reward-event").count()).toBe(0);
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await page.clock.runFor(2000);
      expect(
        await page.evaluate(
          () => window.hapticCalls.filter((p) => p.kind === "empty").length,
        ),
      ).toBe(0);
    } else {
      await place(page, 1, 30, 30);
      await expect.poll(async () => (await saved(page)).game.score).toBe(1902);
      await page.clock.runFor(4000);
      expect((await saved(page)).game.board.filter(Boolean)).toHaveLength(1);
      expect(
        await page.evaluate(
          () => window.hapticCalls.filter((p) => p.kind === "empty").length,
        ),
      ).toBe(1);
    }
    expect(
      (await page.locator("#score").textContent())?.replace(/\D/g, ""),
    ).toBe(mode === "background" ? "1901" : "1902");
    expect(await page.locator(".reward-event").count()).toBe(0);
    await page.reload();
    await page.locator("#board canvas").waitFor();
    expect((await saved(page)).game.score).toBe(
      mode === "background" ? 1901 : 1902,
    );
  });
}
for (const setting of ["haptics", "calm"] as const) {
  test(`0.19 ${setting} setting persists and suppresses pulses`, async ({
    page,
  }) => {
    await prepare(page);
    await page.locator("#pause").click();
    await page.locator(`#${setting}`).setChecked(setting === "calm");
    await expect
      .poll(async () => (await saved(page)).settings[setting])
      .toBe(setting === "calm");
    await page.reload();
    await page.locator("#board canvas").waitFor();
    await place(page, 0);
    await expect.poll(async () => (await saved(page)).game.score).toBe(1901);
    await page.clock.install();
    await page.clock.runFor(4000);
    expect(
      await page.evaluate(
        () => window.hapticCalls.filter((p) => p.kind).length,
      ),
    ).toBe(0);
    expect(
      (await page.locator("#score").textContent())?.replace(/\D/g, ""),
    ).toBe("1901");
  });
}
