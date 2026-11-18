import { test, expect } from "@playwright/test";

test("forgiving saves survive real worker refills, placement and reload without migrating old games", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto("/");
  await page.evaluate(async () => {
    const { IndexedSave } = await import("/src/platform/save.ts"),
      { newGame } = await import("/src/core/rules.ts");
    const save = new IndexedSave(),
      p = (await save.load()).profile!;
    p.revision++;
    p.tutorialStep = 4;
    p.game = {
      ...newGame(1141001, "forgiving-ui", "director-v4"),
      scoringVersion: "festival-v4",
      seriesBonusVersion: 1,
    };
    await save.write(p);
  });
  await page.reload();
  const phases = new Set<string>();
  for (let i = 0; i < 24; i++) {
    await expect(page.locator("#board")).not.toHaveAttribute(
      "aria-busy",
      "true",
    );
    const plan = await page.evaluate(async () => {
      const { IndexedSave } = await import("/src/platform/save.ts"),
        { applyMove } = await import("/src/core/rules.ts"),
        { choose } = await import("/scripts/difficulty/players.ts");
      const g = (await new IndexedSave().load()).profile!.game,
        move = choose(g.board, g.tray, "three")!;
      return { move, result: applyMove(g, move, g.revision)! };
    });
    await page.locator(`[data-slot="${plan.move.slot}"]`).click();
    const box = await page.locator("#board").boundingBox();
    await page
      .locator("#board")
      .click({
        position: {
          x: ((plan.move.x + 0.5) * box!.width) / 8,
          y: ((plan.move.y + 0.5) * box!.height) / 8,
        },
      });
    const read = () =>
      page.evaluate(async () => {
        const { IndexedSave } = await import("/src/platform/save.ts");
        return (await new IndexedSave().load()).profile!.game;
      });
    await expect.poll(async () => (await read()).moves).toBe(i + 1);
    expect(await read()).toEqual(plan.result.state);
    phases.add(plan.result.state.forgivingDirector!.last);
  }
  expect(phases.has("load")).toBe(true);
  const read = () =>
    page.evaluate(async () => {
      const { IndexedSave } = await import("/src/platform/save.ts");
      return (await new IndexedSave().load()).profile!.game;
    });
  const before = await read();
  await page.reload();
  await expect.poll(read).toEqual(before);
  await page.locator("#pause").click();
  await page.locator("#restart").click();
  await page.locator("#keep-game").click();
  expect(await read()).toEqual(before);
});
