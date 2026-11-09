import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs/promises";
test.use({
  viewport: { width: 392, height: 872 },
  deviceScaleFactor: 2.75,
  isMobile: true,
});
async function mock(page: Page, fail = false) {
  await page.addInitScript(
    ({ fail }) => {
      const state: any = { calls: [], screen: false, serial: 0 };
      (window as any).__fullMock = state;
      (window as any).__blockyCdpTest = {
        async reset() {
          state.calls.push("reset");
          state.serial = 0;
          return { sessionId: "functional-test" };
        },
        async preflight() {
          state.calls.push("preflight");
          return {
            ready: !fail,
            error: fail ? "missing-identities" : undefined,
          };
        },
        async start({ condition }: any) {
          state.calls.push("start:" + condition);
          return { captureId: "test-" + ++state.serial, recording: true };
        },
        async stop({ captureId }: any) {
          state.calls.push("stop:" + captureId);
          return { captureId, ready: true, directory: "test-" + state.serial };
        },
        async abort() {
          state.calls.push("abort");
        },
        async device() {
          return { thermalStatus: 0 };
        },
        async setScreenOn({ enabled }: any) {
          state.screen = enabled;
        },
        async share({ json }: any) {
          state.shared = JSON.parse(json);
        },
      };
    },
    { fail },
  );
}
async function read(page: Page) {
  return page.evaluate(() => (window as any).__blockyFullDiagnostic.report);
}
async function saved(page: Page) {
  return page.evaluate(async () => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    return (await new IndexedSave().load()).profile;
  });
}
test("complete matrix preserves independent outputs, tracing order, failure-free export and the ordinary save", async ({
  page,
}) => {
  test.setTimeout(240000);
  await mock(page);
  await page.goto("/");
  await page.locator(".piece").first().waitFor();
  const before = await saved(page);
  await page.goto("/?clearTrace=full&test=fast");
  await expect(page.locator("#full-start")).toBeEnabled();
  await page.locator("#full-start").click();
  await expect(page.locator("#full-export")).toBeEnabled({ timeout: 220000 });
  const r = await read(page);
  expect(
    r.completed,
    JSON.stringify(
      r.episodes
        .filter((e: any) => !e.valid)
        .map((e: any) => ({
          condition: e.condition.id,
          phase: e.phase,
          errors: e.validation.errors,
        })),
    ),
  ).toBe(true);
  expect(r.episodes).toHaveLength(57);
  expect(r.episodes.filter((e: any) => e.phase === "comparison")).toHaveLength(
    40,
  );
  expect(
    r.episodes.slice(42).every((e: any) => e.phase === "attribution"),
  ).toBe(true);
  expect(r.functionalOnly).toBe(true);
  expect(r.summary.some((x: any) => x.investigate)).toBe(false);
  for (const e of r.episodes) {
    const c = e.condition,
      p = e.state.proof;
    expect(p.shownScore).toBe(1574);
    expect(p.pendingPoints).toBe(0);
    expect(p.rewardEffects.pointFlights).toBe(
      c.skipRewardDom || c.skipPointFlights ? 0 : 2,
    );
    expect(p.rewardEffects.themeImpulses).toBe(
      c.freezeTheme || c.skipThemeImpulse ? 0 : 1,
    );
    expect(p.festival.spawned).toBe(c.skipFestival ? 0 : 148);
    expect(e.validation.errors).toEqual([]);
  }
  const state = await page.evaluate(() => (window as any).__fullMock);
  expect(
    state.calls.filter((x: string) => x.startsWith("start:")),
  ).toHaveLength(15);
  expect(state.screen).toBe(false);
  expect(await saved(page)).toEqual(before);
  await page.locator("#full-export").click();
  expect(
    await page.evaluate(() => (window as any).__fullMock.shared.completed),
  ).toBe(true);
  await test
    .info()
    .attach("full-diagnostic-report", {
      body: JSON.stringify(r),
      contentType: "application/json",
    });
  await page.locator("#full-return").click();
  await page.locator(".piece").first().waitFor();
  expect(await saved(page)).toEqual(before);
});
test("missing identities stop before any comparison and export the preflight failure", async ({
  page,
}) => {
  await mock(page, true);
  await page.goto("/?clearTrace=full&test=fast");
  await expect(page.locator("#full-start")).toBeEnabled();
  await page.locator("#full-start").click();
  await expect(page.locator("#full-export")).toBeEnabled();
  const r = await read(page);
  expect(r.completed).toBe(false);
  expect(r.episodes).toHaveLength(0);
  expect(r.failure).toContain("preflight");
  expect(r.summary.some((x: any) => x.investigate)).toBe(false);
  expect(await page.evaluate(() => (window as any).__fullMock.screen)).toBe(
    false,
  );
  await page.locator("#full-export").click();
  expect(
    await page.evaluate(() => (window as any).__fullMock.shared.failure),
  ).toContain("missing-identities");
});
test("cancellation clears the active capture and retry gets a fresh report", async ({
  page,
}) => {
  await mock(page);
  await page.goto("/?clearTrace=full&test=fast");
  await expect(page.locator("#full-start")).toBeEnabled();
  await page.locator("#full-start").click();
  await expect(page.locator("#full-progress")).toBeVisible();
  await page.locator("#full-cancel").click();
  await expect(page.locator("#full-export")).toBeEnabled();
  const r = await read(page);
  expect(r.completed).toBe(false);
  expect(r.interrupted).toBe(true);
  expect(r.failure).toBe("cancelled");
  expect(await page.evaluate(() => (window as any).__fullMock.screen)).toBe(
    false,
  );
  expect(r.summary.some((x: any) => x.investigate)).toBe(false);
});
