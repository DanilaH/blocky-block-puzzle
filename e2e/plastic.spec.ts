import { test, expect } from "@playwright/test";
for (const calm of [false, true])
  test(`score presentation converges without changing saved reward; calm=${calm}`, async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator("#board canvas").waitFor();
    await page.evaluate(async (calm) => {
      const { IndexedSave } = await import("/src/platform/save.ts");
      const { newGame } = await import("/src/core/rules.ts");
      const a = new IndexedSave(),
        q = (await a.load()).profile;
      q.revision++;
      q.tutorialStep = 4;
      q.settings.calm = calm;
      q.best = 1000;
      q.game = newGame(1234, "plastic-score");
      q.game.tray = [0, 1, 2].map((i) => ({
        shapeId: "S1-0",
        color: i + 1,
        used: false,
      }));
      for (let x = 0; x < 7; x++) q.game.board[24 + x] = 2;
      await a.write(q);
    }, calm);
    await page.reload();
    await page.locator(".piece").first().click();
    await page.evaluate(() => {
      (window as any).scoreSamples = [];
      const start = performance.now();
      const sample = () => {
        (window as any).scoreSamples.push(
          Number(
            document.querySelector("#score")!.textContent!.replace(/\s/g, ""),
          ),
        );
        if (performance.now() - start < 1000) requestAnimationFrame(sample);
      };
      sample();
    });
    const b = (await page.locator("#board").boundingBox())!;
    await page
      .locator("#board")
      .click({ position: { x: (b.width * 7.5) / 8, y: (b.height * 3.5) / 8 } });
    await expect(page.locator("#score")).toHaveText("111");
    const samples = await page.evaluate(
      () => (window as any).scoreSamples as number[],
    );
    expect(samples.every((v, i) => i === 0 || v >= samples[i - 1])).toBe(true);
    if (!calm) expect(samples.some((v) => v > 0 && v < 111)).toBe(true);
    else expect(samples.every((v) => v === 0 || v === 111)).toBe(true);
    await page.locator(".piece").nth(1).click();
    await page
      .locator("#board")
      .click({ position: { x: b.width * 0.2, y: b.height * 0.2 } });
    await page.locator("#pause").click();
    await expect(page.locator("#score")).toHaveText("112");
    await page.reload();
    await expect(page.locator("#score")).toHaveText("112");
  });
