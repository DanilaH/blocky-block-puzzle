import { test, expect } from "@playwright/test";
import sharp from "sharp";

// Preserve painter order through multiple washes and a hide/show cycle, including
// the real phone's backing size. Cached perimeter rounding remains bounded.
for (const resolution of [512, 896, 1024])
  for (const [energy, washAlpha] of [
    [0.12, 0],
    [0.493, 0.06],
    [1, 0.12],
  ])
    test(`clear wash ${resolution}px energy ${energy} alpha ${washAlpha}`, async ({
      page,
    }, info) => {
      await page.setViewportSize({
        width: resolution + 8,
        height: resolution * 2 + 16,
      });
      await page.goto("/e2e/fixtures/energy-border.html");
      await page.waitForFunction(() => (window as any).drawBorder);
      const render = async (cached: boolean) => {
        const id = await page.evaluate(
          ({ cached, resolution, energy, washAlpha }) =>
            (window as any).drawBorder(
              cached,
              "webgl",
              energy,
              resolution,
              washAlpha,
            ),
          { cached, resolution, energy, washAlpha },
        );
        return sharp(await page.locator(`#${id} canvas`).screenshot())
          .ensureAlpha()
          .raw()
          .toBuffer();
      };
      const original = await render(false),
        optimized = await render(true);
      expect(optimized.length).toBe(original.length);
      let max = 0,
        sum = 0;
      for (let i = 0; i < original.length; i++) {
        const delta = Math.abs(original[i]! - optimized[i]!);
        max = Math.max(max, delta);
        sum += delta;
      }
      await info.attach("pixels", {
        body: JSON.stringify({
          resolution,
          energy,
          washAlpha,
          maxChannelDelta: max,
          meanChannelDelta: sum / original.length,
        }),
        contentType: "application/json",
      });
      expect(max).toBeLessThanOrEqual(3);
      expect(sum / original.length).toBeLessThan(0.05);
    });
