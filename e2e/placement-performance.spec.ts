import { test, expect } from "@playwright/test";

test("placement reuses surviving tray images and rebuilds the board only in its frame", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#app")).not.toHaveAttribute("aria-busy", "true");
  await page.locator("#lesson-skip").click();
  await page.evaluate(async () => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    const a = new IndexedSave(), p = (await a.load()).profile;
    p.revision++;p.game.board.fill(0);p.game.board[63] = 2;
    p.game.tray = [0,1,2].map(i => ({shapeId:"S1-0",color:i+1,used:false}));
    await a.write(p);
  });
  await page.reload();
  await expect(page.locator("#app")).not.toHaveAttribute("aria-busy", "true");
  await page.locator('[data-slot="0"]').click();
  await page.evaluate(async () => {
    const { BoardScene } = await import("/src/game/BoardScene.ts");
    const w = window as any;
    w.unchangedImage = document.querySelector('[data-slot="1"] img');
    w.drawsPerFrame = {};
    const draw = BoardScene.prototype.draw;
    BoardScene.prototype.draw = function (...args) {
      const frame = this.game.loop.frame;
      w.drawsPerFrame[frame] = (w.drawsPerFrame[frame] ?? 0) + 1;
      return draw.apply(this,args);
    };
  });
  await page.locator("#board").click({position:{x:5,y:5}});
  await expect(page.locator('[data-slot="0"]')).toHaveClass(/used/);
  await expect.poll(() => page.evaluate(() => Object.keys((window as any).drawsPerFrame).length)).toBeGreaterThan(0);
  const result = await page.evaluate(() => ({
    maxDraws:Math.max(...Object.values((window as any).drawsPerFrame) as number[]),
    retained:(window as any).unchangedImage === document.querySelector('[data-slot="1"] img'),
  }));
  expect(result).toEqual({maxDraws:1,retained:true});
});
