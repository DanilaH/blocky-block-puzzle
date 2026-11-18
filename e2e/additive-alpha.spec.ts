import { test, expect } from "@playwright/test";
test("legacy ADD alters translucent destination; ONE/ONE preserves it", async ({
  page,
}, info) => {
  await page.goto("/e2e/fixtures/additive-alpha.html");
  await page.waitForFunction(() => !!(window as any).probeAdditiveAlpha);
  const samples = await page.evaluate(async () => {
    const probe = (window as any).probeAdditiveAlpha;
    return {
      base: await probe("none"),
      legacy: await probe("legacy"),
      premultipliedAdd: await probe("proper"),
    };
  });
  await info.attach("pixels", {
    body: JSON.stringify(samples),
    contentType: "application/json",
  });
  expect(samples.base[0]).toBeGreaterThanOrEqual(127);
  expect(samples.base[0]).toBeLessThanOrEqual(128);
  expect(samples.base[3]).toEqual(samples.base[0]);
  expect(samples.premultipliedAdd).toEqual(samples.base);
  expect(samples.legacy[0]).toBeLessThan(samples.base[0] * 0.6);
  expect(samples.legacy[3]).toBeLessThan(samples.base[3] * 0.6);
});
