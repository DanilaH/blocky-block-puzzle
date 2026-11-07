import { test, expect } from "@playwright/test";

for (const failure of ["timeout", "crash"] as const) {
  test(`third-piece ${failure} preserves the save and a different retry commits once`, async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("#app")).not.toHaveAttribute("aria-busy", "true");
    await page.evaluate(async () => {
      const { IndexedSave } = await import("/src/platform/save.ts");
      const { newGame } = await import("/src/core/rules.ts");
      const save = new IndexedSave(),
        p = (await save.load()).profile!;
      p.revision++;
      p.tutorialStep = 4;
      p.game = newGame(77, "worker-retry", "flow-v4");
      p.game.tray = [0, 1, 2].map((i) => ({
        shapeId: "S1-0",
        color: i + 1,
        used: i < 2,
      }));
      await save.write(p);
    });
    await page.addInitScript((failure) => {
      const NativeWorker = window.Worker;
      let failed = false;
      window.Worker = class extends NativeWorker {
        private failThis: boolean;
        constructor(url: string | URL, options?: WorkerOptions) {
          super(url, options);
          this.failThis = !failed && String(url).includes("move.worker");
          if (this.failThis) failed = true;
        }
        postMessage(message: unknown) {
          if (!this.failThis) return super.postMessage(message);
          if (failure === "crash")
            setTimeout(() => this.dispatchEvent(new Event("error")), 20);
          // Timeout deliberately receives no response. A real worker serves the retry.
        }
      };
    }, failure);
    await page.reload();
    const saved = () =>
      page.evaluate(async () => {
        const { IndexedSave } = await import("/src/platform/save.ts");
        return (await new IndexedSave().load()).profile!;
      });
    const before = await saved();
    await page.locator('[data-slot="2"]').click();
    await page.locator("#board").click({ position: { x: 4, y: 4 } });
    await expect(page.locator("#toast")).toContainText("Попробуйте ещё раз", {
      timeout: 10000,
    });
    await expect(page.locator("#board")).not.toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(await saved()).toEqual(before);
    const rect = await page.locator("#board").boundingBox();
    await page.locator('[data-slot="2"]').click();
    await page
      .locator("#board")
      .click({ position: { x: rect!.width / 8 + 4, y: 4 } });
    await expect
      .poll(async () => (await saved()).game.moves)
      .toBe(before.game.moves + 1);
    const after = await saved();
    expect(after.game.board[0]).toBe(0);
    expect(after.game.board[1]).toBe(3);
    expect(after.game.revision).toBe(before.game.revision + 1);
    expect(after.game.tray.every((s) => !s.used)).toBe(true);
    await page.reload();
    expect((await saved()).game).toEqual(after.game);
  });
}
