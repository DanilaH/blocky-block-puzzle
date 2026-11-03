import { test, expect } from "@playwright/test";
async function fixture(page, discoveries = 0) {
  await page.goto("/");
  await expect(page.locator("#app")).not.toHaveAttribute("aria-busy", "true");
  await page.evaluate(async (discoveries) => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    const { newGame } = await import("/src/core/rules.ts");
    const save = new IndexedSave(),
      p = (await save.load()).profile;
    p.revision++;
    p.tutorialStep = 4;
    p.best = p.progressionBest = 100000;
    p.game = { ...newGame(77, "clear"), scoringVersion: "festival-v4" };
    p.game.tray = [0, 1, 2].map((i) => ({
      shapeId: "S1-0",
      color: i + 1,
      used: false,
    }));
    for (let i = 1; i < 8; i++) p.game.board[i] = 1;
    p.wardrobe = { selected: 0, unlocked: [0], discoveries };
    await save.write(p);
  }, discoveries);
  await page.reload();
  await expect(page.locator("#app")).not.toHaveAttribute("aria-busy", "true");
}
test("all-clear theme is atomic with the move, reload/new game preserve it and collection selects unlocked themes", async ({
  page,
}) => {
  await fixture(page);
  await page.locator('[data-slot="0"]').click();
  await page.locator("#board").click({ position: { x: 4, y: 4 } });
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { IndexedSave } = await import("/src/platform/save.ts");
        return (await new IndexedSave().load()).profile.wardrobe;
      }),
    )
    .toEqual({ selected: 1, unlocked: [0, 1], discoveries: 1 });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-material", "amber");
  await page.locator("#pause").click();
  await page.locator("#restart").click();
  await page.locator("#new-game").click();
  await expect(page.locator("html")).toHaveAttribute("data-material", "amber");
  await page.locator("#pause").click();
  await page.locator("#themes").click();
  await expect(page.locator("[data-theme]")).toHaveCount(2);
  await page.locator('[data-theme="0"]').click();
  await expect(page.locator('[data-theme="0"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute(
    "data-material",
    "plastic",
  );
});
test("failed all-clear save awards neither theme nor points", async ({
  page,
}) => {
  await fixture(page);
  await page.evaluate(async () => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    IndexedSave.prototype.write = async () => {
      throw Error("disk failure");
    };
  });
  await page.locator('[data-slot="0"]').click();
  await page.locator("#board").click({ position: { x: 4, y: 4 } });
  await expect(page.locator("#toast")).toContainText("сохранить");
  await expect(page.locator("html")).toHaveAttribute(
    "data-material",
    "plastic",
  );
  await page.reload();
  await expect(page.locator("#score")).toHaveText("0");
  expect(
    await page.evaluate(async () => {
      const { IndexedSave } = await import("/src/platform/save.ts");
      return (await new IndexedSave().load()).profile.wardrobe.discoveries;
    }),
  ).toBe(0);
});
test("touch pickup immediately clears the finger by 1.2 board cells; cancel does not consume the shape", async ({
  page,
}) => {
  await fixture(page);
  const box = await page.locator('[data-slot="0"]').boundingBox(),
    board = await page.locator("#board").boundingBox();
  const cdp = await page.context().newCDPSession(page);
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y, id: 1 }],
  });
  await page.waitForTimeout(120);
  const floating = await page.locator("#floating").boundingBox();
  expect(
    Math.abs(y - (floating.y + floating.height) - (1.2 * board.width) / 8),
  ).toBeLessThan(2);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchCancel",
    touchPoints: [],
  });
  await expect(page.locator("#score")).toHaveText("0");
  await expect(page.locator("#floating")).toBeHidden();
});
