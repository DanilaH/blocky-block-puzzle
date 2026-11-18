import { test, expect } from "@playwright/test";

test("native focus loss silences tails; gain needs a fresh gesture; pause cannot unmute", async ({
  page,
}) => {
  await page.route("**/src/platform/audio-focus.ts", async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(
      /export function nativeAudioFocus\(\) \{[\s\S]*?\n\}/,
      `export function nativeAudioFocus() {
      let revision=0, active=false, allowed=true, listener=()=>{};
      window.focusCalls=[];
      window.emitFocus=value=>{allowed=value;listener({allowed:value,revision:++revision});};
      return {
        addListener:async(_,fn)=>{listener=fn;},
        setActive:async(p)=>{active=p.active;window.focusCalls.push(active);return {allowed:false,revision:++revision};},
        request:async()=>({allowed:active&&allowed,revision:++revision})
      };
    }`,
    );
    await route.fulfill({ response, body });
  });
  await page.route("**/src/game/audio.ts", async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(
      "export class GameAudio {",
      "export class GameAudio { constructor(){ window.testAudio=this; }",
    );
    await route.fulfill({ response, body });
  });
  await page.goto("/");
  await page.locator("#lesson-skip").click();
  // Skip commits asynchronously; a gesture during that write is intentionally ignored.
  await expect(page.locator("#lesson")).toBeHidden();
  await page.locator('[data-slot="0"]').click();
  await expect(page.locator('[data-slot="0"]')).toHaveClass(/selected/);
  await expect
    .poll(() => page.evaluate(() => window.testAudio.context?.state))
    .toBe("running");
  await page.evaluate(() => window.emitFocus(false));
  await expect
    .poll(() => page.evaluate(() => window.testAudio.context?.state))
    .toBe("suspended");
  expect(await page.evaluate(() => window.testAudio.voices.size)).toBe(0);
  await page.locator('[data-slot="1"]').click();
  await expect(page.locator('[data-slot="1"]')).toHaveClass(/selected/);
  expect(await page.evaluate(() => window.testAudio.context?.state)).toBe(
    "suspended",
  );
  await page.evaluate(() => window.emitFocus(true));
  expect(await page.evaluate(() => window.testAudio.voices.size)).toBe(0);
  await page.locator('[data-slot="2"]').click();
  await expect
    .poll(() => page.evaluate(() => window.testAudio.context?.state))
    .toBe("running");
  await page.locator("#pause").click();
  await expect
    .poll(() => page.evaluate(() => window.focusCalls.at(-1)))
    .toBe(false);
  await page.evaluate(() => window.emitFocus(true));
  expect(await page.evaluate(() => window.testAudio.context?.state)).toBe(
    "suspended",
  );
  expect(await page.evaluate(() => window.testAudio.voices.size)).toBe(0);
});
