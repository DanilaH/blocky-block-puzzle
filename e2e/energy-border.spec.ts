import { test, expect } from "@playwright/test";
import sharp from "sharp";
import fs from "node:fs/promises";

// Alpha precomposition rounds to RGBA8. Bound every changed channel, including
// antialiased corners, at actual logical and high-density backing resolutions.
for (const renderer of ["webgl", "canvas"])
  for (const resolution of renderer === "webgl" ? [512, 1024] : [512])
    for (const energy of [0.007, 0.12, 0.257, 0.493, 0.789, 1])
      test(`energy border ${renderer} ${resolution}px energy ${energy}`, async ({
        page,
      }, testInfo) => {
        await page.setViewportSize({
          width: resolution + 8,
          height: resolution * 2 + 16,
        });
        await page.goto("/e2e/fixtures/energy-border.html");
        await page.waitForFunction(() => (window as any).drawBorder);
        const render = async (cached: boolean) => {
          const id = await page.evaluate(
            ({ cached, renderer, energy, resolution }) =>
              (window as any).drawBorder(cached, renderer, energy, resolution),
            { cached, renderer, energy, resolution },
          );
          return page.locator(`#${id} canvas`).screenshot();
        };
        const before = await render(false),
          after = await render(true);
        const a = await sharp(before).ensureAlpha().raw().toBuffer();
        const b = await sharp(after).ensureAlpha().raw().toBuffer();
        expect(a.length).toBe(b.length);
        let changed = 0,
          total = 0,
          max = 0;
        for (let i = 0; i < a.length; i++) {
          const delta = Math.abs(a[i]! - b[i]!);
          total += delta;
          max = Math.max(max, delta);
          if (delta) changed++;
        }
        const metrics = {
          renderer,
          resolution,
          energy,
          maxChannelDelta: max,
          meanChannelDelta: total / a.length,
          changedChannelFraction: changed / a.length,
        };
        console.log(JSON.stringify(metrics));
        await testInfo.attach("metrics", {
          body: JSON.stringify(metrics),
          contentType: "application/json",
        });
        if (max > 3 || total / a.length >= 0.05) {
          await fs.mkdir(testInfo.outputDir, { recursive: true });
          await fs.writeFile(testInfo.outputPath("original.png"), before);
          await fs.writeFile(testInfo.outputPath("cached.png"), after);
        }
        expect(max).toBeLessThanOrEqual(3);
        expect(total / a.length).toBeLessThan(0.05);
      });
