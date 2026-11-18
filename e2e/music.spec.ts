import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.route("**/src/game/audio.ts", async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(
      "export class GameAudio {",
      "export class GameAudio { constructor(){window.testAudio=this;}",
    );
    await route.fulfill({ response, body });
  });
  await page.goto("/");
  await page.locator("#lesson-skip").click();
  await expect(page.locator("#lesson")).toBeHidden();
});
test("music decodes once, loops, resumes from offset and stays stopped in pause", async ({
  page,
}) => {
  await page.locator("#pause").click();
  await page.locator(".advanced-settings > summary").click();
  await page.locator("#musicVolume").fill("35");
  await page.locator("#musicVolume").dispatchEvent("change");
  await expect(page.locator("#musicVolume")).toBeEnabled();
  await page.locator("#resume").click();
  await page.locator('[data-slot="0"]').click();
  await expect
    .poll(() => page.evaluate(() => !!window.testAudio.music?.source), {
      timeout: 20000,
    })
    .toBe(true);
  const info = await page.evaluate(() => {
    const m = window.testAudio.music,
      b = m.buffer,
      n = Math.round(m.source.loopEnd * b.sampleRate);
    let seam = 0;
    for (let ch = 0; ch < b.numberOfChannels; ch++) {
      const d = b.getChannelData(ch);
      seam = Math.max(seam, Math.abs(d[0] - d[n - 1]));
    }
    return {
      loop: m.source.loop,
      seconds: b.duration,
      rate: b.sampleRate,
      bytes: n * b.numberOfChannels * 4,
      seam,
    };
  });
  expect(info.loop).toBe(true);
  expect(info.seconds).toBeGreaterThan(130);
  expect(info.seconds).toBeLessThan(131);
  expect(info.bytes).toBeLessThan(26_000_000);
  expect(info.seam).toBeLessThan(0.03);
  await page.waitForTimeout(300);
  await page.locator("#pause").click();
  await page.locator(".advanced-settings > summary").click();
  await expect
    .poll(() => page.evaluate(() => window.testAudio.context.state))
    .toBe("suspended");
  const offset = await page.evaluate(() => window.testAudio.music.offset);
  expect(offset).toBeGreaterThan(0);
  expect(await page.evaluate(() => !!window.testAudio.music.source)).toBe(
    false,
  );
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.testAudio.music.offset)).toBe(offset);
  await page.locator("#resume").click();
  await expect
    .poll(() => page.evaluate(() => !!window.testAudio.music.source))
    .toBe(true);
  expect(await page.evaluate(() => window.testAudio.music.offset)).toBe(offset);
  await page.evaluate(() => {
    window.testAudio.setAllowed(false);
    window.testAudio.play("allClear", 8, 2000, 1);
  });
  expect(
    await page.evaluate(() => ({
      source: !!window.testAudio.music.source,
      voices: window.testAudio.voices.size,
    })),
  ).toEqual({ source: false, voices: 0 });
});
test("separate levels persist and music works with effects disabled", async ({
  page,
}) => {
  await page.locator('[data-slot="0"]').click();
  await page.locator("#pause").click();
  await page.locator(".advanced-settings > summary").click();
  await page.locator("#sound").uncheck();
  await expect(page.locator("#sound")).toBeEnabled();
  await page.locator("#musicVolume").fill("50");
  await page.locator("#musicVolume").dispatchEvent("change");
  await expect(page.locator("#musicVolume")).toBeEnabled();
  await page.locator("#effectsVolume").fill("25");
  await page.locator("#effectsVolume").dispatchEvent("change");
  await expect(page.locator("#effectsVolume")).toBeEnabled();
  await page.locator("#resume").click();
  await expect
    .poll(() => page.evaluate(() => !!window.testAudio.music?.source), {
      timeout: 20000,
    })
    .toBe(true);
  expect(await page.evaluate(() => window.testAudio.master.gain.value)).toBe(0);
  await page.reload();
  await page.locator("#pause").click();
  await page.locator(".advanced-settings > summary").click();
  await expect(page.locator("#sound")).not.toBeChecked();
  await expect(page.locator("#musicVolume")).toHaveValue("50");
  await expect(page.locator("#effectsVolume")).toHaveValue("25");
  await page.setViewportSize({ width: 320, height: 568 });
  await expect(page.locator("#resume")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBe(320);
});
