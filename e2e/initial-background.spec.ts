import { expect, test } from "@playwright/test";

test("Classic can boot while hidden, return, and accept exactly one move", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    (window as any).initiallyHidden = true;
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => (window as any).initiallyHidden,
    });
  });
  await page.goto("/");
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.querySelector("#retry")
          ? "failed"
          : document.querySelector("#board canvas")
            ? "started"
            : "waiting",
      ),
    )
    .toBe("started");
  await page.evaluate(() => {
    (window as any).initiallyHidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator("#app")).not.toHaveAttribute("aria-busy", "true");
  await expect(page.locator("#retry")).toHaveCount(0);
  await page.locator("#lesson-skip").click();
  await expect(page.locator("#lesson")).toBeHidden();
  const before = await page.evaluate(async () => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    return (await new IndexedSave().load()).profile!.game;
  });
  await page.locator("#tray button").first().click();
  await page.locator("#board").click({ position: { x: 4, y: 4 } });
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { IndexedSave } = await import("/src/platform/save.ts");
        return (await new IndexedSave().load()).profile!.game.moves;
      }),
    )
    .toBe(before.moves + 1);
  expect(errors).toEqual([]);
});
