import { test, expect } from "@playwright/test";

test("losing placement keeps earned series bonus but never praises the fatal move", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (String(url).includes("praise.worker"))
          this.addEventListener("message", () => {
            (window as any).praiseReady = true;
          });
      }
    };
  });
  await page.goto("/");
  await page.locator("#board canvas").waitFor();
  const expected = await page.evaluate(async () => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    const { newGame, applyMove } = await import("/src/core/rules.ts");
    const { rankMoves, praiseFor } = await import("/src/core/praise.ts");
    const save = new IndexedSave(),
      p = (await save.load()).profile;
    p.revision++;
    p.tutorialStep = 4;
    p.hint = null;
    p.game = {
      ...newGame(1234, "fatal-praise", "flow-v4"),
      moves: 30,
      streak: 19,
      score: 12000,
      scoringVersion: "festival-v4",
      seriesBonusVersion: 1,
    };
    p.game.board = Array.from({ length: 64 }, (_, i) =>
      ((i % 8) + (i >> 3)) % 2 ? 2 : 0,
    );
    p.game.tray = ["S1-0", "O3-0", "O3-0"].map((shapeId) => ({
      shapeId,
      color: 1,
      used: false,
    }));
    p.best = p.progressionBest = 1000000;
    const move = { slot: 0, x: 0, y: 0 },
      ranked = praiseFor(rankMoves(p.game, 1500), p.game, move);
    const result = applyMove(p.game, move, p.game.revision)!;
    await save.write(p);
    return {
      ranked,
      status: result.state.status,
      score: result.state.score,
      bonus: result.seriesBonus,
    };
  });
  expect(expected.ranked).toBe("excellent");
  expect(expected.status).toBe("over");
  expect(expected.bonus).toBeGreaterThan(0);
  await page.reload();
  await page.waitForFunction(() => (window as any).praiseReady);
  await page.evaluate(() => {
    (window as any).sawFatalPraise = false;
    new MutationObserver((records) => {
      for (const r of records)
        for (const node of r.addedNodes)
          if (node instanceof HTMLElement && node.dataset.tier === "praise")
            (window as any).sawFatalPraise = true;
    }).observe(document.querySelector("#burst")!, { childList: true });
  });
  await page.locator('[data-slot="0"]').click();
  await page.locator("#board").click({ position: { x: 5, y: 5 } });
  await expect(page.locator('.reward-event[data-tier="series"]')).toContainText(
    "СЕРИЯ 19 ЗАВЕРШЕНА",
  );
  const saved = await page.evaluate(async () => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    return (await new IndexedSave().load()).profile.game;
  });
  expect(saved.score).toBe(expected.score);
  expect(saved.status).toBe("over");
  expect(await page.evaluate(() => (window as any).sawFatalPraise)).toBe(false);
});
