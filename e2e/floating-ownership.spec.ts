import { test, expect, type Page } from "@playwright/test";
test.use({ viewport: { width: 390, height: 844 } });

async function fixture(page: Page, clear = false, calm = false) {
  await page.goto("/");
  await expect(page.locator("#app")).not.toHaveAttribute("aria-busy", "true");
  const expected = await page.evaluate(
    async ({ clear, calm }) => {
      const { IndexedSave } = await import("/src/platform/save.ts");
      const { newGame, applyMove } = await import("/src/core/rules.ts");
      const save = new IndexedSave(),
        p = (await save.load()).profile;
      p.revision++;
      p.tutorialStep = 4;
      p.hint = null;
      p.settings = { ...p.settings, calm, sound: false };
      p.game = {
        ...newGame(1234, "floating-owner", "director-v2"),
        moves: 10,
        score: 12000,
        streak: clear ? 19 : 0,
        scoringVersion: "festival-v4",
        seriesBonusVersion: 1,
      };
      p.game.tray = ["O3-0", "S1-0", "S1-0"].map((shapeId, i) => ({
        shapeId,
        color: i + 1,
        used: false,
      }));
      p.best = p.progressionBest = 1000000;
      p.wardrobe = { selected: 0, unlocked: [0], discoveries: 0 };
      if (clear)
        for (let y = 0; y < 8; y++)
          for (let x = 0; x < 8; x++)
            if ((y < 3 && x >= 3) || (x < 3 && y >= 3))
              p.game.board[y * 8 + x] = 2;
      await save.write(p);
      return clear
        ? applyMove(p.game, { slot: 0, x: 0, y: 0 }, p.game.revision)!.state
        : p.game;
    },
    { clear, calm },
  );
  await page.reload();
  await expect(page.locator("#app")).not.toHaveAttribute("aria-busy", "true");
  await page.evaluate(async () => {
    const w = window as any,
      { TileMaterialDOM } = await import("/src/game/tile-material.ts");
    const sync = TileMaterialDOM.prototype.sync;
    TileMaterialDOM.prototype.sync = function (root) {
      w.materialOwner = this;
      return sync.call(this, root);
    };
    w.hiddenMaterialStarts = 0;
    w.outsideMaterialStarts = 0;
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      const a = animate.apply(this, args);
      if (this.matches(".tile-enamel,.tile-chrome")) {
        if (this.closest<HTMLElement>("#floating")?.hidden)
          w.hiddenMaterialStarts++;
        else w.outsideMaterialStarts++;
      }
      if (
        this.id === "floating" &&
        (args[1] as KeyframeAnimationOptions)?.duration === 150
      ) {
        a.pause();
        w.returnAnimation = a;
      }
      if (
        this.id === "floating" &&
        (args[1] as KeyframeAnimationOptions)?.duration === 90
      ) {
        const alpha = (root: Element) =>
          ["enamel", "chrome"].map((m) =>
            Number(getComputedStyle(root.querySelector(".tile-" + m)!).opacity),
          );
        const tray = document.querySelector(".piece.selected")!;
        w.firstVisibleMaterial = { floating: alpha(this), tray: alpha(tray) };
      }
      return a;
    };
  });
  return expected;
}
async function down(page: Page, slot = 0) {
  const b = (await page.locator(`[data-slot="${slot}"]`).boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
}
async function saved(page: Page) {
  return page.evaluate(async () => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    return (await new IndexedSave().load()).profile.game;
  });
}

test("released tap owns no hidden material transitions, including interrupted changes", async ({
  page,
}) => {
  const before = await fixture(page);
  await down(page);
  await page.mouse.up();
  const result = await page.evaluate(() => {
    const w = window as any,
      f = document.querySelector<HTMLElement>("#floating")!;
    w.materialOwner.set("chrome", 1000);
    w.materialOwner.set("enamel", 1000);
    w.materialOwner.set("plastic", 0);
    return {
      children: f.childElementCount,
      hidden: f.hidden,
      hiddenMaterialStarts: w.hiddenMaterialStarts,
      outsideMaterialStarts: w.outsideMaterialStarts,
      active: f.getAnimations({ subtree: true }).length,
    };
  });
  console.log("FLOATING_RELEASE_CENSUS", JSON.stringify(result));
  expect(result).toEqual({
    children: 0,
    hidden: true,
    hiddenMaterialStarts: 0,
    outsideMaterialStarts: 44,
    active: 0,
  });
  expect(await saved(page)).toEqual(before);
});
test("invalid return stays visible until completion then releases every owned animation", async ({
  page,
}) => {
  const before = await fixture(page);
  await down(page);
  await page.mouse.move(1, 1);
  await page.mouse.up();
  await expect(page.locator("#floating")).toBeVisible();
  expect(await page.locator("#floating img").count()).toBe(27);
  await page.evaluate(() => {
    (window as any).returnAnimation.finish();
  });
  await expect(page.locator("#floating")).toBeHidden();
  await expect(page.locator("#floating img")).toHaveCount(0);
  expect(await saved(page)).toEqual(before);
});
test("late return callback cannot hide the next drag and its material is ready before the pick frame", async ({
  page,
}) => {
  await fixture(page);
  await down(page);
  await page.mouse.move(1, 1);
  await page.mouse.up();
  await page.evaluate(() => {
    const w = window as any;
    w.staleReturnDone = w.returnAnimation.onfinish;
    w.materialOwner.set("chrome", 1000);
  });
  await down(page, 1);
  await page.evaluate(() => {
    (window as any).staleReturnDone();
  });
  await expect(page.locator("#floating")).toBeVisible();
  await expect(page.locator("#floating img")).toHaveCount(3);
  const alpha = await page.evaluate(() => (window as any).firstVisibleMaterial);
  for (let i = 0; i < 2; i++)
    expect(Math.abs(alpha.floating[i] - alpha.tray[i])).toBeLessThan(0.02);
  await page.mouse.up();
  await expect(page.locator("#floating img")).toHaveCount(0);
});
for (const kind of ["tap", "drag", "calm"] as const)
  test(`accepted ${kind} preserves the complete all-clear game and releases the overlay`, async ({
    page,
  }) => {
    const expected = await fixture(page, true, kind === "calm");
    if (kind === "drag") {
      await down(page);
      const b = (await page.locator("#board").boundingBox())!;
      await page.mouse.move(
        b.x + (b.width * 1.5) / 8,
        b.y + (b.height * 1.5) / 8,
      );
      await page.mouse.up();
    } else {
      await page.locator('[data-slot="0"]').click();
      await page.locator("#board").click({ position: { x: 5, y: 5 } });
    }
    await expect.poll(async () => (await saved(page)).moves).toBe(11);
    expect(await saved(page)).toEqual(expected);
    await expect(page.locator("#floating")).toBeHidden();
    await expect(page.locator("#floating img")).toHaveCount(0);
  });
for (const kind of ["pointercancel", "blur", "pause"] as const)
  test(`${kind} releases a current drag without accepting a move`, async ({
    page,
  }) => {
    const before = await fixture(page);
    await down(page);
    if (kind === "pause") await page.locator("#pause").dispatchEvent("click");
    else
      await page.evaluate(
        (kind) =>
          window.dispatchEvent(
            kind === "blur"
              ? new Event("blur")
              : new PointerEvent("pointercancel"),
          ),
        kind,
      );
    await expect(page.locator("#floating")).toBeHidden();
    await expect(page.locator("#floating img")).toHaveCount(0);
    await page.mouse.up();
    expect(await saved(page)).toEqual(before);
  });
test("system reduced motion releases an invalid drop immediately and the next tap still works", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const before = await fixture(page);
  await down(page);
  await page.mouse.move(1, 1);
  await page.mouse.up();
  await expect(page.locator("#floating")).toBeHidden();
  await expect(page.locator("#floating img")).toHaveCount(0);
  expect(await saved(page)).toEqual(before);
  await page.locator('[data-slot="1"]').click();
  await page.locator("#board").click({ position: { x: 5, y: 5 } });
  await expect.poll(async () => (await saved(page)).moves).toBe(11);
});
