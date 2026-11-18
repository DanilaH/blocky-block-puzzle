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
  const move=await page.evaluate(async g=>{
    const {placements,shapeById}=await import('/src/core/rules.ts');
    for(let slot=0;slot<g.tray.length;slot++){if(g.tray[slot].used)continue;const p=placements(g.board,shapeById(g.tray[slot].shapeId))[0];if(p)return {...p,slot};}
    throw Error('No legal move after hidden startup');
  },before);
  await page.locator(`#tray button[data-slot="${move.slot}"]`).click();const b=(await page.locator('#board').boundingBox())!;
  await page.locator('#board').click({position:{x:(move.x+.25)*b.width/8,y:(move.y+.25)*b.height/8}});
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
