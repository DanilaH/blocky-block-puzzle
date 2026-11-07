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
  if (end) await expect(page.locator("#watch-reward")).toBeVisible();
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
  await page.locator("#pause").click();
  await page.locator("#menu-hint").click();
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
    await page.locator("#pause").click();
    await page.locator("#menu-hint").click();
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
test("revive has one action; keeps tray and score; no interstitial on accepting reward", async ({
  page,
}) => {
  await mock(page);
  await fixture(page, true);
  const before = await saved(page);
  await expect(page.locator("#dialog button")).toHaveCount(1);
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
test("interstitial on final defeat once; replay does not show another ad", async ({
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
  await expect(page.locator("#watch-reward")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#again")).toBeVisible();
  expect(await page.evaluate(() => window.adCalls.map((c) => c.kind))).toEqual([
    "interstitial",
  ]);
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
  await page.locator("#pause").click();
  await page.locator("#menu-hint").click();
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
    await expect(page.locator("#dialog button")).toHaveCount(1);
    await page.locator("#watch-reward").scrollIntoViewIfNeeded();
    const b = (await page.locator("#watch-reward").boundingBox())!;
    expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.y + b.height).toBeLessThanOrEqual(height);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: `docs/qa/ads-0.17/revive-${width}x${height}.png`,
    });
    await page.keyboard.press("Escape");
    await page.locator("#again").click();
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
  await page.locator("#pause").click();
  await page.locator("#menu-hint").click();
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

import revivePlaytest from "./fixtures/revive-playtest.json" with { type: "json" };

test("revive ring progresses between coarse deadline ticks and keeps its deadline", async ({
  page,
}) => {
  await mock(page);
  await fixture(page, true);
  const deadline = (await saved(page)).game.reviveOffer.deadline;
  const values = await page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const samples: number[] = [];
        const circle = document.querySelector(".clock-progress")!;
        const step = () => {
          samples.push(parseFloat(getComputedStyle(circle).strokeDashoffset));
          if (samples.length === 12) resolve(samples);
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
  );
  expect(new Set(values.map((n) => n.toFixed(2))).size).toBeGreaterThan(7);
  expect(values.at(-1)!).toBeLessThan(values[0]);
  expect((await saved(page)).game.reviveOffer.deadline).toBe(deadline);
  await page.locator("#watch-reward").click();
  await expect(page.locator("dialog")).not.toBeVisible();
  expect((await saved(page)).game.reviveUsed).toBe(true);
});

test("second defeat after a real revive repeats the defeat cue before the final result", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as any).__defeatShakeCount = 0;
    (window as any).__finalFieldImpacts = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (frames, options) {
      if (
        this.classList.contains("piece") &&
        Array.isArray(frames) &&
        frames.some((f) => String(f.transform).includes("rotate(-6deg)"))
      )
        (window as any).__defeatShakeCount++;
      if (
        this.id === "board" &&
        Array.isArray(frames) &&
        frames.some((f) => String(f.transform).includes("translateY(7px)"))
      )
        (window as any).__finalFieldImpacts.push({ frames, options });
      return animate.call(this, frames, options);
    };
  });
  await mock(page);
  await fixture(page);
  await page.evaluate(async (before) => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    const adapter = new IndexedSave();
    const p = (await adapter.load()).profile;
    p.revision++;
    p.game = before;
    p.best = p.festivalBest = p.progressionBest = 100000;
    p.hint = null;
    delete p.metrics;
    p.settings.calm = false;
    await adapter.write(p);
  }, revivePlaytest.before);
  await page.reload();
  await page.locator("#board canvas").waitFor();
  const placeMove = async (move: { slot: number; x: number; y: number }) => {
    const before = (await saved(page)).game.moves;
    await page.locator(`[data-slot="${move.slot}"]`).click();
    const box = (await page.locator("#board").boundingBox())!;
    await page.mouse.click(
      box.x + ((move.x + 0.5) * box.width) / 8,
      box.y + ((move.y + 0.5) * box.height) / 8,
    );
    await expect
      .poll(async () => (await saved(page)).game.moves)
      .toBe(before + 1);
  };
  await placeMove(revivePlaytest.firstMove);
  await expect(page.locator("#watch-reward")).toBeVisible();
  expect(await page.evaluate(() => (window as any).__defeatShakeCount)).toBe(3);
  expect(
    await page.evaluate(() => (window as any).__finalFieldImpacts),
  ).toEqual([]);
  await page.locator("#watch-reward").click();
  await expect(page.locator("dialog")).not.toBeVisible();
  await page.waitForTimeout(400);
  for (const move of revivePlaytest.afterReviveMoves) await placeMove(move);
  await expect.poll(async () => (await saved(page)).game.status).toBe("over");
  await expect
    .poll(() => page.evaluate(() => (window as any).__defeatShakeCount))
    .toBe(6);
  await expect(page.locator("#again")).toBeVisible();
  const impacts = await page.evaluate(
    () => (window as any).__finalFieldImpacts,
  );
  expect(impacts).toHaveLength(1);
  expect(impacts[0].options.duration).toBe(620);
  expect(impacts[0].frames[1].transform).toBe("translateY(7px) scale(.985)");
  expect(
    await page.locator("#board").evaluate((e) => getComputedStyle(e).transform),
  ).toBe("none");
  const final = (await saved(page)).game;
  expect(final.score).toBe(revivePlaytest.finalScore);
  expect(final.reviveUsed).toBe(true);
  expect(
    await page.evaluate(
      () =>
        (window as any).adCalls.filter((c: any) => c.kind === "rewarded")
          .length,
    ),
  ).toBe(1);
});
