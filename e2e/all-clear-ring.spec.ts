import { test, expect, type Page } from "@playwright/test";

async function setup(page: Page, allClear = true, ready?: () => void) {
  await page.goto("/");
  await expect(page.locator("#app")).not.toHaveAttribute("aria-busy", "true");
  const expected = await page.evaluate(async (allClear) => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    const { newGame, applyMove } = await import("/src/core/rules.ts");
    const { stateHash } = await import("/src/platform/play-capture.ts");
    const a = new IndexedSave(),
      p = (await a.load()).profile;
    p.revision++;
    p.tutorialStep = 4;
    p.hint = null;
    p.best = p.progressionBest = 1000000;
    p.settings = { ...p.settings, sound: false, calm: false };
    p.game = {
      ...newGame(1234, "ring-regression", "director-v2"),
      moves: 10,
      score: 12000,
      streak: 19,
      scoringVersion: "festival-v4",
      seriesBonusVersion: 1,
    };
    p.game.board = Array.from({ length: 64 }, (_, i) =>
      i % 8 < 3 !== i >> 3 < 3 ? 2 : 0,
    );
    if (!allClear) p.game.board[63] = 2;
    p.game.tray = ["O3-0", "S1-0", "S1-0"].map((shapeId, i) => ({
      shapeId,
      color: i + 1,
      used: false,
    }));
    p.wardrobe = { selected: 0, unlocked: [0], discoveries: 0 };
    await a.write(p);
    const r = applyMove(p.game, { slot: 0, x: 0, y: 0 }, p.game.revision);
    return { hash: stateHash(r.state), score: r.state.score, lines: r.lines };
  }, allClear);
  await page.reload();
  await expect(page.locator("#app")).not.toHaveAttribute("aria-busy", "true");
  await page.evaluate(async () => {
    const { BoardScene } = await import("/src/game/BoardScene.ts");
    const { VfxSprites } = await import("/src/game/vfx.ts");
    const { Festival } = await import("/src/game/festival.ts");
    const w = window as any,
      draw = (BoardScene.prototype as any).draw;
    (BoardScene.prototype as any).draw = function (...args: any[]) {
      w.ringScene = this;
      return draw.apply(this, args);
    };
    const stamp = VfxSprites.prototype.stamp;
    VfxSprites.prototype.stamp = function (...args: Parameters<typeof stamp>) {
      if (args[0] === "ring") w.ringCalls++;
      return stamp.apply(this, args);
    };
    const burst = Festival.prototype.burst;
    Festival.prototype.burst = function (...args: Parameters<typeof burst>) {
      w.ringFestival = this;
      this.setDiagnosticSeed(12345);
      this.beginDiagnosticSample();
      return burst.apply(this, args);
    };
    w.ringCalls = 0;
  });
  // Reduced motion has no idle draw; selection deliberately dirties the board.
  await page.locator('[data-slot="0"]').click();
  await page.waitForFunction(() => !!(window as any).ringScene);
  await page.waitForTimeout(1200);
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 100));
  await page.evaluate(() => {
    const w = window as any;
    w.ringOriginalObjects = w.ringScene.children.length;
  });
  ready?.();
  await page.locator("#board").click({ force: true, position: { x: 5, y: 5 } });
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { IndexedSave } = await import("/src/platform/save.ts");
        return (await new IndexedSave().load()).profile.game.moves;
      }),
    )
    .toBe(11);
  await page.clock.runFor(600);
  return expected;
}

async function snapshot(page: Page) {
  return page.evaluate(async () => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    const { stateHash } = await import("/src/platform/play-capture.ts");
    const w = window as any,
      scene = w.ringScene;
    const g = (await new IndexedSave().load()).profile.game;
    return {
      hash: stateHash(g),
      score: g.score,
      moves: g.moves,
      ringCalls: w.ringCalls,
      sameObjects: scene.children.length === w.ringOriginalObjects,
      festival: w.ringFestival?.diagnosticSnapshot(),
    };
  });
}

test("full clear keeps reward/state/confetti and bounded objects, requests no assets", async ({
  page,
}) => {
  const errors: string[] = [],
    assets: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const expected = await setup(page, true, () => {
    page.on("request", (r) => {
      if (/\/assets\//.test(r.url())) assets.push(r.url());
    });
  });
  const result = await snapshot(page);
  expect(result.hash).toBe(expected.hash);
  expect(result.score).toBe(expected.score);
  expect(expected.lines).toBe(6);
  expect(result.ringCalls).toBe(0);
  expect(result.festival.spawned).toBeGreaterThan(0);
  expect(result.sameObjects).toBe(true);
  await page.clock.runFor(2500);
  expect((await snapshot(page)).festival.spawned).toBe(110);
  expect((await snapshot(page)).ringCalls).toBe(0);
  expect((await snapshot(page)).sameObjects).toBe(true);
  expect(errors).toEqual([]);
  expect(assets).toEqual([]);
});

for (const ending of ["pause", "new-piece", "reload"])
  test(`full-clear actor stays off after ${ending}`, async ({ page }) => {
    const expected = await setup(page);
    expect((await snapshot(page)).ringCalls).toBe(0);
    if (ending === "pause") {
      await page.locator("#pause").click({ force: true });
      expect((await snapshot(page)).ringCalls).toBe(0);
      expect((await snapshot(page)).hash).toBe(expected.hash);
    } else if (ending === "new-piece") {
      await page.locator('[data-slot="1"]').click({ force: true });
      await page
        .locator("#board")
        .click({ force: true, position: { x: 5, y: 5 } });
      await expect.poll(async () => (await snapshot(page)).moves).toBe(12);
      await page.clock.runFor(16);
      const result = await snapshot(page);
      expect(result.ringCalls).toBe(0);
      expect(result.sameObjects).toBe(true);
    } else {
      await page.clock.resume();
      await page.reload();
      await expect(page.locator("#app")).not.toHaveAttribute(
        "aria-busy",
        "true",
      );
      const actual = await page.evaluate(async () => {
        const { IndexedSave } = await import("/src/platform/save.ts");
        const { stateHash } = await import("/src/platform/play-capture.ts");
        return stateHash((await new IndexedSave().load()).profile.game);
      });
      expect(actual).toBe(expected.hash);
      await expect(page.locator(".reward-event")).toHaveCount(0);
    }
  });

test("nonempty cross retains bitmap ring", async ({ page }) => {
  const expected = await setup(page, false),
    result = await snapshot(page);
  expect(result.hash).toBe(expected.hash);
  expect(result.ringCalls).toBeGreaterThan(0);
});

test("system reduced motion keeps the exact reward without bitmap ring", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const expected = await setup(page),
    result = await snapshot(page);
  expect(result.hash).toBe(expected.hash);
  expect(result.ringCalls).toBe(0);
});
