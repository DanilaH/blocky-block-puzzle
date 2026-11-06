import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs/promises";
async function panel(page: Page) {
  await page.locator("#pause").click();
  await page.locator(".advanced-settings > summary").click();
  await page.getByText("Запись партии для разбора", { exact: true }).click();
}
test("opt-in recording exports real committed UI moves and replays exactly", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator("#lesson-skip").click();
  await panel(page);
  await expect(page.locator("#play-capture-export")).toBeDisabled();
  await page.locator("#play-capture-toggle").click();
  await page.locator("#resume").click();
  await page.locator("#tray button").first().click();
  await page.locator("#board").click({ position: { x: 3, y: 3 } });
  await panel(page);
  await expect(page.locator("#play-capture-status")).toContainText("ходов: 1");
  const download = page.waitForEvent("download");
  await page.locator("#play-capture-export").click();
  const file = await download;
  await file.saveAs("test-results/play-capture.json");
  const data = JSON.parse(
    await fs.readFile("test-results/play-capture.json", "utf8"),
  );
  const result = await page.evaluate(async (data) => {
    const { replayRecord } = await import("/scripts/calibration/replay.ts");
    const r = replayRecord(data);
    return { moves: r.moves.length, final: r.final!.moves };
  }, data);
  expect(result).toEqual({ moves: 1, final: 1 });
  expect(data.schema).toBe("blocky-play-v1");
  await page.locator("#play-capture-clear").click();
  await expect(page.locator("#play-capture-export")).toBeDisabled();
});
test("failed atomic placement is absent from the recording", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#lesson-skip").click();
  await panel(page);
  await page.locator("#play-capture-toggle").click();
  await page.locator("#resume").click();
  await page.evaluate(() => {
    const old = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      if (key === "current") {
        IDBObjectStore.prototype.put = old;
        throw new DOMException("injected", "QuotaExceededError");
      }
      return old.call(this, value, key);
    };
  });
  await page.locator("#tray button").first().click();
  await page.locator("#board").click({ position: { x: 3, y: 3 } });
  await expect(page.locator("#toast")).toBeVisible();
  await panel(page);
  await expect(page.locator("#play-capture-status")).toContainText("ходов: 0");
});
