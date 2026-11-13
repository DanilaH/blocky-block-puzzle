import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";

test.use({ viewport: { width: 392, height: 872 }, deviceScaleFactor: 2.75 });

async function saved(page: import("@playwright/test").Page) {
  return page.evaluate(async () => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    return (await new IndexedSave().load()).profile;
  });
}
async function downloadReport(page: import("@playwright/test").Page) {
  const download = page.waitForEvent("download");
  await page.locator("#phone-clear-export").click();
  return JSON.parse(
    await fs.readFile((await (await download).path())!, "utf8"),
  );
}
test("phone diagnostic runs real commits and rewards in a separate database", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.locator(".piece").first().waitFor();
  const before = await saved(page);
  await page.goto("/?clearTrace=1&test=fast");
  await expect(page.locator("#phone-clear-start")).toBeEnabled();
  await page.locator("#phone-clear-start").click();
  await expect(page.locator("#phone-clear-export")).toBeEnabled({
    timeout: 20000,
  });
  const report = await downloadReport(page);
  expect(report.schema).toBe("blocky-phone-clear-v1");
  expect(report.completed).toBe(true);
  expect(report.interrupted).toBe(false);
  expect(report.trace.error).toBe("native-unavailable");
  expect(report.episodes.map((e: any) => e.kind)).toEqual([
    "warmup",
    "untraced",
    "traced",
  ]);
  for (const e of report.episodes) {
    expect(e.state.game.score).toBe(1574);
    expect(e.state.game.revision).toBe(5);
    expect(e.state.game.board.every((n: number) => n === 0)).toBe(true);
    expect(e.state.wardrobe.selected).toBe(5);
    expect(e.state.wardrobe.discoveries).toBe(35);
    expect(e.sample.placements[0].fixture.beforeTheme).toBe(1);
    expect(e.sample.placements[0].fixture.revealVariant).toBe(2);
    expect(e.sample.placements[0].lines).toBe(2);
    expect(e.sample.sampleCount).toBeGreaterThan(0);
  }
  expect(await saved(page)).toEqual(before);
  await page.locator("#phone-clear-return").click();
  await page.locator(".piece").first().waitFor();
  expect(await saved(page)).toEqual(before);
  expect(errors).toEqual([]);
});
test("interrupted phone test exports its failure and can restart", async ({
  page,
}) => {
  await page.goto("/?clearTrace=1&test=fast");
  await expect(page.locator("#phone-clear-start")).toBeEnabled();
  await page.locator("#phone-clear-start").click();
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator("#phone-clear-status")).toContainText("прервана");
  const report = await downloadReport(page);
  expect(report.completed).toBe(false);
  expect(report.interrupted).toBe(true);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.locator("#phone-clear-start").click();
  await expect(page.locator("#phone-clear-export")).toBeEnabled({
    timeout: 20000,
  });
  expect((await downloadReport(page)).completed).toBe(true);
});
test("full-length phone scenario includes the delayed theme and reward", async ({
  page,
}) => {
  await page.goto("/?clearTrace=1");
  await expect(page.locator("#phone-clear-start")).toBeEnabled();
  await page.locator("#phone-clear-start").click();
  await expect(page.locator("#phone-clear-export")).toBeEnabled({
    timeout: 30000,
  });
  const report = await downloadReport(page);
  expect(report.completed).toBe(true);
  for (const e of report.episodes) {
    expect(e.sample.phases.some((p: any) => p.name === "placementRender")).toBe(
      true,
    );
    expect(e.sample.context.canvas[0]).toBeGreaterThanOrEqual(512);
    expect(e.sample.placements).toHaveLength(1);
  }
  await expect(page.locator("html")).toHaveAttribute("data-material", "chrome");
});

test("quick test link protects an unexported ordinary capture", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".piece").first().waitFor();
  await page.evaluate(async () => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    const a = new IndexedSave(),
      p = (await a.load()).profile!;
    p.revision++;
    p.tutorialStep = 4;
    await a.write(p);
  });
  await page.reload();
  async function open() {
    await page.locator("#pause").click();
    await page.locator(".advanced-settings > summary").click();
    await page.getByText("Диагностика", { exact: true }).click();
  }
  await open();
  await page.locator("#perf-start").click();
  await open();
  await page.locator("#clear-trace").click();
  await expect(page).not.toHaveURL(/clearTrace/);
  await expect(page.locator(".dialog-status")).toContainText("выгрузите");
  const download = page.waitForEvent("download");
  await page.locator("#perf-export").click();
  await download;
  await page.locator("#clear-trace").click();
  await expect(page.locator("#phone-clear-start")).toBeEnabled();
});
