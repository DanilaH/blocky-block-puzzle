import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs/promises";
async function savedGame(page: Page) {
  return page.evaluate(async () => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    return (await new IndexedSave().load()).profile.game;
  });
}
async function seed(page: Page) {
  await page.goto("/");
  await page.locator(".piece").first().waitFor();
  await page.evaluate(async () => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    const adapter = new IndexedSave(),
      p = (await adapter.load()).profile;
    p.revision++;
    p.tutorialStep = 4;
    await adapter.write(p);
  });
  await page.reload();
  await page.locator(".piece").first().waitFor();
}
async function diagnostics(page: Page) {
  await page.locator("#pause").click();
  await page.locator(".advanced-settings > summary").click();
  await page.getByText("Диагностика", { exact: true }).click();
}
test("automatic clear comparison exports every profile and preserves the real game", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await seed(page);
  const before = await savedGame(page);
  await diagnostics(page);
  await page.locator("#clear-benchmark").click();
  await expect(page).toHaveURL(/diagnostics\/clear.html$/);
  await page.goto("/diagnostics/clear.html?test=fast");
  await expect(page.locator("#bench-start")).toBeEnabled();
  await page.locator("#bench-start").click();
  await expect(page.locator("#bench-export")).toBeEnabled({ timeout: 20000 });
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#bench-export").click();
  const download = await downloadPromise;
  const report = JSON.parse(
    await fs.readFile((await download.path())!, "utf8"),
  );
  expect(report.schema).toBe("blocky-clear-benchmark-v1");
  expect(report.completed).toBe(true);
  expect(report.interrupted).toBe(false);
  expect(report.episodes).toHaveLength(14);
  expect(report.warmup.sample.sampleCount).toBeGreaterThan(0);
  for (const profile of report.profiles)
    expect(
      report.episodes.filter((r: any) => r.profile.id === profile.id),
    ).toHaveLength(2);
  expect(
    report.episodes.every(
      (r: any) =>
        r.sample.placements[0].allClear && r.sample.placements[0].lines === 3,
    ),
  ).toBe(true);
  expect(JSON.stringify(report).length).toBeLessThan(1000000);
  await page.locator("#bench-return").click();
  await page.locator(".piece").first().waitFor();
  expect(await savedGame(page)).toEqual(before);
  expect(errors).toEqual([]);
});
test("background interrupts the comparison instead of recording an inactive gap", async ({
  page,
}) => {
  await page.goto("/diagnostics/clear.html?test=fast");
  await expect(page.locator("#bench-start")).toBeEnabled();
  await page.locator("#bench-start").click();
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator("#bench-status")).toContainText("прерван");
  await expect(page.locator("#bench-start")).toBeEnabled();
  await expect(page.locator("#bench-export")).toBeDisabled();
});
test("opening the standalone comparison cannot discard an unexported play record", async ({
  page,
}) => {
  await seed(page);
  await diagnostics(page);
  await page.getByText("Запись партии для разбора", { exact: true }).click();
  await page.locator("#play-capture-toggle").click();
  await page.locator("#clear-benchmark").click();
  await expect(page).not.toHaveURL(/diagnostics\/clear/);
  await expect(page.locator(".dialog-status")).toContainText("выгрузите");
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#play-capture-export").click();
  await downloadPromise;
  await page.locator("#clear-benchmark").click();
  await expect(page).toHaveURL(/diagnostics\/clear.html$/);
});

test("failed performance export stays protected until a successful retry", async ({
  page,
}) => {
  await seed(page);
  await diagnostics(page);
  await page.locator("#perf-start").click();
  await page.waitForTimeout(100);
  await diagnostics(page);
  await page.evaluate(() => {
    (window as any).__realObjectURL = URL.createObjectURL;
    URL.createObjectURL = () => {
      throw Error("test export failure");
    };
  });
  await page.locator("#perf-export").click();
  await page.locator("#clear-benchmark").click();
  await expect(page).not.toHaveURL(/diagnostics\/clear/);
  await expect(page.locator(".dialog-status")).toContainText("замер плавности");
  await page.evaluate(() => {
    URL.createObjectURL = (window as any).__realObjectURL;
  });
  const download = page.waitForEvent("download");
  await page.locator("#perf-export").click();
  await download;
  await page.locator("#clear-benchmark").click();
  await expect(page).toHaveURL(/diagnostics\/clear.html$/);
});
