import { test, expect } from "@playwright/test";
test.use({ viewport: { width: 390, height: 844 } });
async function setup(page) {
  await page.goto("/");
  await page.locator("#board canvas").waitFor();
  await page.evaluate(async () => {
    const { IndexedSave } = await import("/src/platform/save.ts"),
      { newGame } = await import("/src/core/rules.ts"),
      { createProfile } = await import("/src/core/profile.ts");
    const a = new IndexedSave(),
      old = await a.load(),
      p = createProfile(newGame(1234, "contact"));
    p.revision = old.profile.revision + 1;
    p.tutorialStep = 4;
    p.best = 1000;
    p.game.tray = [0, 1, 2].map((i) => ({
      shapeId: "S1-0",
      color: i + 1,
      used: false,
    }));
    await a.write(p);
  });
  await page.reload();
  await page.locator("#board canvas").waitFor();
  await page.evaluate(async () => {
    const { IndexedSave } = await import("/src/platform/save.ts"),
      { BoardScene } = await import("/src/game/BoardScene.ts"),
      { GameAudio } = await import("/src/game/audio.ts");
    const w = IndexedSave.prototype.write,
      pending = BoardScene.prototype.pendingPlacement,
      impact = BoardScene.prototype.impact,
      audio = GameAudio.prototype.play;
    window.contact = { pending: [], impacts: 0, sounds: [] };
    BoardScene.prototype.pendingPlacement = function (cells) {
      window.contact.pending = cells;
      window.contact.scene = this;
      return pending.call(this, cells);
    };
    BoardScene.prototype.impact = function (...args) {
      window.contact.impacts++;
      return impact.apply(this, args);
    };
    GameAudio.prototype.play = function (kind, ...rest) {
      window.contact.sounds.push(kind);
      return audio.call(this, kind, ...rest);
    };
    IndexedSave.prototype.write = async function (p) {
      await new Promise((resolve, reject) => {
        window.finishWrite = () => resolve();
        window.failWrite = () => reject(new Error("injected write failure"));
      });
      return w.call(this, p);
    };
  });
}
for (const outcome of ["success", "failure", "background"])
  test(`pending contact: ${outcome}`, async ({ page }) => {
    await setup(page);
    await page.locator(".piece").first().click();
    await page.locator("#board").click({ position: { x: 20, y: 20 } });
    await expect(page.locator("#board")).toHaveAttribute("aria-busy", "true");
    expect(await page.evaluate(() => window.contact.pending)).toEqual([0]);
    await expect(page.locator("#score")).toHaveText("0");
    expect(await page.evaluate(() => window.contact.impacts)).toBe(0);
    expect(await page.evaluate(() => window.contact.sounds)).toEqual(["pick"]);
    await page.screenshot({ path: `docs/qa/feel-0.10/pending-${outcome}.png` });
    // Repeated input cannot enqueue another move while the durable commit is pending.
    await page.locator("#board").click({ position: { x: 60, y: 60 } });
    if (outcome === "background") {
      await page.evaluate(() => window.dispatchEvent(new Event("blur")));
      expect(await page.evaluate(() => window.contact.scene.pending)).toEqual(
        [],
      );
    }
    await page.evaluate(
      (outcome) =>
        outcome === "failure" ? window.failWrite() : window.finishWrite(),
      outcome,
    );
    await expect(page.locator("#board")).not.toHaveAttribute(
      "aria-busy",
      "true",
    );
    await expect(page.locator("#score")).toHaveText(
      outcome === "failure" ? "0" : "1",
    );
    expect(await page.evaluate(() => window.contact.pending)).toEqual([]);
    expect(await page.evaluate(() => window.contact.impacts)).toBe(
      outcome === "success" ? 1 : 0,
    );
    if (outcome !== "success")
      expect(await page.evaluate(() => window.contact.sounds)).toEqual([
        "pick",
      ]);
    if (outcome === "failure")
      await expect(page.locator("#toast")).toContainText(
        "Не удалось сохранить",
      );
    await page.reload();
    await expect(page.locator("#score")).toHaveText(
      outcome === "failure" ? "0" : "1",
    );
  });
