import { test, expect, type Page } from "@playwright/test";
async function mock(page: Page, outcome = "rewarded") {
  await page.route("**/src/platform/ads.ts", async (route) => {
    const response = await route.fetch(),
      body = await response.text();
    const replacement = `export function nativeAds() {
   const listeners={};const calls=[];window.adCalls=calls;
   let pending=JSON.parse(localStorage.getItem('test-native-receipts')||'[]');
   return {
    initialize:async()=>({enabled:true}),status:async()=>({rewarded:true,interstitial:true}),
    pending:async()=>({rewards:pending}),preload:async()=>{},
    acknowledge:async({id})=>{pending=pending.filter(r=>r.id!==id);localStorage.setItem('test-native-receipts',JSON.stringify(pending));},
    addListener:async(n,fn)=>{listeners[n]=fn;return{remove:async()=>{}};},
    show:async(p)=>{calls.push(p);window.showStarted=true;
      if(window.adHold) await new Promise(r=>window.releaseAd=r);
      await new Promise(r=>setTimeout(r,150));
      if(p.kind==='rewarded' && ${JSON.stringify(outcome)}==='rewarded'){
       const receipt={id:'receipt-'+p.intentId,intentId:p.intentId};pending.push(receipt);localStorage.setItem('test-native-receipts',JSON.stringify(pending));
       listeners.reward?.(receipt);listeners.reward?.(receipt);
       return {status:'closed',shown:true,rewards:[receipt]};
      }
      return {status:${JSON.stringify(outcome)},shown:${outcome !== "unavailable"}};
    },
    geometry:async()=>({epoch:0,geometry:{webView:{x:0,y:0,width:innerWidth,height:innerHeight},root:{width:innerWidth,height:innerHeight},adHeight:52}}),
    banner:async p=>{window.lastBanner=p;}
   };
  }`;
    const patched = body.replace(
      /export function nativeAds\(\) \{[\s\S]*?\n\}/,
      replacement,
    );
    expect(patched).not.toBe(body);
    await route.fulfill({ response, body: patched });
  });
}
async function fixture(page: Page, end = false) {
  await page.goto("/");
  await page.locator("#board canvas").waitFor();
  await page.evaluate(async (end) => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    const a = new IndexedSave(),
      p = (await a.load()).profile;
    p.revision++;
    p.tutorialStep = 4;
    p.freeHints = 0;
    if (end) {
      p.game.board = Array.from(
        { length: 64 },
        (_, i) => ((i % 8) + Math.floor(i / 8)) % 2,
      );
      p.game.tray = [0, 1, 2].map(() => ({
        shapeId: "O3-0",
        color: 1,
        used: false,
      }));
      p.game.status = "over";
      p.game.score = 123;
      p.best = 123;
    }
    await a.write(p);
  }, end);
  await page.reload();
  await page.locator("#board canvas").waitFor();
}
async function saved(page: Page) {
  return page.evaluate(async () => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    return (await new IndexedSave().load()).profile;
  });
}
test("rewarded hints commit once despite duplicate event and result; banner hides in dialog", async ({
  page,
}) => {
  await mock(page);
  await fixture(page);
  await expect
    .poll(() => page.evaluate(() => window.lastBanner?.visible))
    .toBe(true);
  await page.locator("#hint").click();
  await expect(page.locator("#watch-reward")).toBeEnabled();
  await expect
    .poll(() => page.evaluate(() => window.lastBanner?.visible))
    .toBe(false);
  await page.locator("#watch-reward").click();
  await expect(page.locator("dialog")).not.toBeVisible();
  expect((await saved(page)).earnedHints).toBe(3);
  expect((await saved(page)).ads.receipts).toHaveLength(1);
  await page.reload();
  expect((await saved(page)).earnedHints).toBe(3);
});
for (const outcome of ["closed", "unavailable"])
  test(`rewarded ${outcome} leaves credits and game intact`, async ({
    page,
  }) => {
    await mock(page, outcome);
    await fixture(page);
    const before = await saved(page);
    await page.locator("#hint").click();
    await page.locator("#watch-reward").click();
    await expect.poll(() => page.evaluate(() => window.showStarted)).toBe(true);
    await expect
      .poll(async () => !!(await saved(page)).ads?.intents.length)
      .toBe(true);
    await page.waitForTimeout(250);
    expect((await saved(page)).earnedHints).toBe(0);
    expect((await saved(page)).game).toEqual(before.game);
    await page.locator("#reward-back").click();
    await expect(page.locator("dialog")).not.toBeVisible();
  });
test("revive previews exact area; keeps tray and score; no interstitial on accepting reward", async ({
  page,
}) => {
  await mock(page);
  await fixture(page, true);
  const before = await saved(page);
  await page.locator("#revive-offer").click();
  await expect(page.locator(".revive-zone")).toHaveCount(9);
  await page.locator("#watch-reward").click();
  await expect(page.locator("dialog")).not.toBeVisible();
  const after = await saved(page);
  expect(after.game.status).toBe("playing");
  expect(after.game.reviveUsed).toBe(true);
  expect(after.game.tray).toEqual(before.game.tray);
  expect(after.game.score).toBe(123);
  expect(await page.evaluate(() => window.adCalls.map((c) => c.kind))).toEqual([
    "rewarded",
  ]);
});
test("interstitial only on eligible final replay, once, then new game", async ({
  page,
}) => {
  await mock(page);
  await fixture(page, true);
  await page.evaluate(async () => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    const { emptyAds } = await import("/src/core/monetization.ts");
    const a = new IndexedSave(),
      p = (await a.load()).profile;
    p.revision++;
    p.ads = { ...emptyAds(), activeMs: 180001, completed: ["previous"] };
    await a.write(p);
  });
  await page.reload();
  await expect(page.locator("#again")).toBeVisible();
  expect(await page.evaluate(() => window.adCalls)).toEqual([]);
  await page.locator("#again").click();
  await expect(page.locator("dialog")).not.toBeVisible();
  expect(await page.evaluate(() => window.adCalls.map((c) => c.kind))).toEqual([
    "interstitial",
  ]);
  expect((await saved(page)).game.status).toBe("playing");
  await page.locator("#pause").click();
  await page.locator("#resume").click();
  expect(await page.evaluate(() => window.adCalls)).toHaveLength(1);
});
test("web without native SDK offers an honest unavailable state and exit", async ({
  page,
}) => {
  await fixture(page);
  await page.locator("#hint").click();
  await expect(page.locator("#watch-reward")).toBeDisabled();
  await expect(page.locator("#reward-status")).toContainText("недоступна");
  await page.locator("#reward-back").click();
  await expect(page.locator("dialog")).not.toBeVisible();
});
for (const [width, height] of [
  [320, 480],
  [568, 320],
  [390, 844],
])
  test(`revive layout and reservation ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await mock(page);
    await fixture(page, true);
    await page.locator("#revive-offer").click();
    await expect(page.locator(".revive-zone")).toHaveCount(9);
    await page.locator("#finish-game").scrollIntoViewIfNeeded();
    const b = (await page.locator("#finish-game").boundingBox())!;
    expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.y + b.height).toBeLessThanOrEqual(height);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: `docs/qa/ads-0.17/revive-${width}x${height}.png`,
    });
    await page.locator("#finish-game").click();
    await page.locator("#look-board").click();
    const board = (await page.locator("#board").boundingBox())!,
      slot = (await page.locator("#ad-slot").boundingBox())!;
    expect(board.y + board.height).toBeLessThanOrEqual(slot.y);
    expect(slot.height).toBeGreaterThanOrEqual(52);
  });
test("fullscreen blocks dialog and game navigation until bridge closes", async ({
  page,
}) => {
  await mock(page);
  await fixture(page);
  await page.evaluate(() => (window.adHold = true));
  await page.locator("#hint").click();
  await page.locator("#watch-reward").click();
  await expect.poll(() => page.evaluate(() => window.showStarted)).toBe(true);
  await expect(page.locator("#app")).toHaveJSProperty("inert", true);
  await expect(page.locator("dialog")).toHaveJSProperty("inert", true);
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog")).toBeVisible();
  await page.evaluate(() => window.releaseAd());
  await expect(page.locator("dialog")).not.toBeVisible();
  await expect(page.locator("#app")).toHaveJSProperty("inert", false);
  expect((await saved(page)).earnedHints).toBe(3);
});
