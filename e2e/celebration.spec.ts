import { test, expect } from "@playwright/test";
for (const ending of ["finish", "pause", "reload"])
  test(`overlapping rewards preserve exact score and combo: ${ending}`, async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator("#board canvas").waitFor();
    await page.evaluate(async () => {
      const { IndexedSave } = await import("/src/platform/save.ts");
      const { newGame } = await import("/src/core/rules.ts");
      const a = new IndexedSave(),
        p = (await a.load()).profile;
      p.revision++;
      p.tutorialStep = 4;
      p.best = 1000;
      p.game = newGame(3, "overlap");
      p.game.tray = [0, 1, 2].map(() => ({
        shapeId: "S1-0",
        used: false,
        color: 2,
      }));
      for (const y of [0, 7])
        for (let x = 1; x < 8; x++) p.game.board[y * 8 + x] = 3;
      p.game.board[27] = 1;
      await a.write(p);
    });
    await page.reload();
    const b = (await page.locator("#board").boundingBox())!;
    for (const [slot, x, y] of [
      [0, 0, 0],
      [1, 2, 2],
      [2, 0, 7],
    ]) {
      await page.locator(".piece").nth(slot).click();
      await page
        .locator("#board")
        .click({
          position: {
            x: ((x + 0.3) * b.width) / 8,
            y: ((y + 0.3) * b.height) / 8,
          },
        });
    }
    await expect(page.locator("#streak")).toContainText("Серия 2");
    const saved = await page.evaluate(async () => {
      const { IndexedSave } = await import("/src/platform/save.ts");
      return (await new IndexedSave().load()).profile.game;
    });
    expect(saved.score).toBe(28);
    expect(saved.moves).toBe(3);
    expect(saved.streakMisses).toBe(0);
    if (ending === "finish") {
      expect(await page.locator(".reward-event").count()).toBeGreaterThan(1);
      const samples = await page.evaluate(async () => {
        const out: number[] = [];
        const start = performance.now();
        while (performance.now() - start < 2000) {
          out.push(Number(document.querySelector("#score")!.textContent));
          await new Promise(requestAnimationFrame);
        }
        return out;
      });
      expect(samples.every((v, i) => i === 0 || v >= samples[i - 1])).toBe(
        true,
      );
    } else if (ending === "pause") {
      await page.locator("#pause").click();
      await expect(page.locator(".reward-event")).toHaveCount(0);
      await page.locator("#resume").click();
    } else await page.reload();
    await expect(page.locator("#score")).toHaveText("28");
    await page.reload();
    await expect(page.locator("#score")).toHaveText("28");
    await expect(page.locator("#streak")).toContainText("Серия 2");
  });
