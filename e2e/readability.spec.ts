import { test, expect } from "@playwright/test";
for (const [width, height] of [
  [320, 480],
  [320, 568],
  [390, 844],
  [568, 320],
]) {
  test(`mixed tray remains readable at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.locator("#board canvas").waitFor();
    for (const longShape of ["I5-0", "I5-1"]) {
      await page.evaluate(async (longShape) => {
        const { IndexedSave } = await import("/src/platform/save.ts");
        const a = new IndexedSave(),
          p = (await a.load()).profile;
        p.revision++;
        p.tutorialStep = 4;
        p.game.tray = ["S1-0", longShape, "O3-0"].map((shapeId, i) => ({
          shapeId,
          color: i + 1,
          used: false,
        }));
        await a.write(p);
      }, longShape);
      await page.reload();
      await page.locator(".mini-cell").first().waitFor();
      const geometry = await page.locator(".piece").evaluateAll((els) =>
        els.map((e) => {
          const b = e.getBoundingClientRect(),
            s = e.querySelector(".mini-shape")!.getBoundingClientRect(),
            c = e.querySelector(".mini-cell")!.getBoundingClientRect();
          return {
            cell: c.width,
            bw: b.width,
            bh: b.height,
            inside:
              s.left >= b.left &&
              s.right <= b.right &&
              s.top >= b.top &&
              s.bottom <= b.bottom,
          };
        }),
      );
      for (const g of geometry) {
        expect(g.cell).toBeGreaterThanOrEqual(width === 568 ? 12 : 16);
        expect(g.bw).toBeGreaterThanOrEqual(48);
        expect(g.bh).toBeGreaterThanOrEqual(48);
        expect(g.inside).toBe(true);
      }
      const hint = await page.locator("#hint").boundingBox(),
        board = await page.locator("#board").boundingBox();
      expect(hint.y + hint.height).toBeLessThanOrEqual(height - 52);
      expect(board.width).toBeGreaterThanOrEqual(width === 320 ? 200 : 170);
    }
  });
}
