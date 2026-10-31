import { test, expect } from "@playwright/test";

test("placement reuses surviving tray images and rebuilds the board only in its frame", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#app")).not.toHaveAttribute("aria-busy", "true");
  await page.locator("#lesson-skip").click();
  await page.evaluate(async () => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    const a = new IndexedSave(),
      p = (await a.load()).profile;
    p.revision++;
    p.game.board.fill(0);
    p.game.board[63] = 2;
    p.game.tray = [0, 1, 2].map((i) => ({
      shapeId: "S1-0",
      color: i + 1,
      used: false,
    }));
    await a.write(p);
  });
  await page.reload();
  await expect(page.locator("#app")).not.toHaveAttribute("aria-busy", "true");
  await page.locator('[data-slot="0"]').click();
  await page.evaluate(async () => {
    const { BoardScene } = await import("/src/game/BoardScene.ts");
    const w = window as any;
    w.unchangedImage = document.querySelector('[data-slot="1"] img');
    w.drawsPerFrame = {};
    const draw = BoardScene.prototype.draw;
    BoardScene.prototype.draw = function (...args) {
      const frame = this.game.loop.frame;
      w.drawsPerFrame[frame] = (w.drawsPerFrame[frame] ?? 0) + 1;
      return draw.apply(this, args);
    };
  });
  await page.locator("#board").click({ position: { x: 5, y: 5 } });
  await expect(page.locator('[data-slot="0"]')).toHaveClass(/used/);
  await expect
    .poll(() =>
      page.evaluate(() => Object.keys((window as any).drawsPerFrame).length),
    )
    .toBeGreaterThan(0);
  const result = await page.evaluate(() => ({
    maxDraws: Math.max(
      ...(Object.values((window as any).drawsPerFrame) as number[]),
    ),
    retained:
      (window as any).unchangedImage ===
      document.querySelector('[data-slot="1"] img'),
  }));
  expect(result).toEqual({ maxDraws: 1, retained: true });
});

test("drag coalesces events without layout reads and commits the final pointer position", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#app")).not.toHaveAttribute("aria-busy", "true");
  await page.locator("#lesson-skip").click();
  await page.evaluate(async () => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    const a = new IndexedSave(),
      p = (await a.load()).profile;
    p.revision++;
    p.game.board.fill(0);
    p.game.board[63] = 2;
    p.game.tray = [0, 1, 2].map((i) => ({
      shapeId: "S1-0",
      color: i + 1,
      used: false,
    }));
    await a.write(p);
  });
  await page.reload();
  await expect(page.locator("#app")).not.toHaveAttribute("aria-busy", "true");
  const piece = await page.locator('[data-slot="0"]').boundingBox();
  const board = await page.locator("#board").boundingBox();
  await page.mouse.move(
    piece!.x + piece!.width / 2,
    piece!.y + piece!.height / 2,
  );
  await page.mouse.down();
  const result = await page.evaluate(async (b) => {
    const original = Element.prototype.getBoundingClientRect;
    let reads = 0;
    Element.prototype.getBoundingClientRect = function () {
      if (this.id === "board") reads++;
      return original.call(this);
    };
    for (let i = 0; i < 100; i++)
      window.dispatchEvent(
        new PointerEvent("pointermove", {
          pointerId: 1,
          clientX: b.x + b.width * 0.6,
          clientY: b.y + b.height * 0.6,
          cancelable: true,
        }),
      );
    await new Promise(requestAnimationFrame);
    const duringDrag = reads;
    // A different final position in the same task must win over the queued sample.
    window.dispatchEvent(
      new PointerEvent("pointermove", {
        pointerId: 1,
        clientX: b.x + b.width * 0.6,
        clientY: b.y + b.height * 0.6,
        cancelable: true,
      }),
    );
    window.dispatchEvent(
      new PointerEvent("pointerup", {
        pointerId: 1,
        clientX: b.x + b.width / 16,
        clientY: b.y + b.height / 16,
      }),
    );
    Element.prototype.getBoundingClientRect = original;
    return duringDrag;
  }, board!);
  expect(result).toBe(0);
  await expect(page.locator('[data-slot="0"]')).toHaveClass(/used/);
  const placed = await page.evaluate(async () => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    return (await new IndexedSave().load()).profile.game.board;
  });
  expect(placed[0]).toBe(1);
  expect(placed[36]).toBe(0);
});

test("diagnostics exports bounded data and excludes paused intervals", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#app")).not.toHaveAttribute("aria-busy", "true");
  await page.locator("#pause").click();
  await page.locator("#perf-start").click();
  await page.waitForTimeout(150);
  await page.locator("#pause").click();
  const snapshot = () =>
    page.evaluate(async () => {
      const { performanceCapture } = await import(
        "/src/platform/performance.ts"
      );
      return performanceCapture.snapshot();
    });
  const before = await snapshot();
  await page.waitForTimeout(150);
  expect((await snapshot()).sampleCount).toBe(before.sampleCount);
  const download = page.waitForEvent("download");
  await page.locator("#perf-export").click();
  expect((await download).suggestedFilename()).toBe(
    "blocky-performance-0.26.json",
  );
  expect(before.sampleCount).toBeGreaterThan(0);
});

test("unchanged banner geometry is deduplicated but native invalidation refreshes it", async ({page})=>{
  await page.goto('/');await expect(page.locator('#app')).not.toHaveAttribute('aria-busy','true');
  const counts=await page.evaluate(async()=>{
    const {watchBanner}=await import('/src/platform/ads.ts');
    const slot=document.createElement('div');slot.style.cssText='position:fixed;left:0;top:100px;width:300px;height:52px';document.body.append(slot);
    let reads=0,shows=0;const bridge={geometry:async()=>{reads++;return {epoch:1,geometry:{webView:{x:0,y:0,width:innerWidth,height:innerHeight},root:{width:innerWidth,height:innerHeight},adHeight:52}};},banner:async p=>{if(p.visible)shows++;}};
    const watcher=watchBanner(bridge as any,slot,()=>true);const wait=()=>new Promise(r=>setTimeout(r,150));
    await wait();const initial={reads,shows};watcher.update();watcher.update();await wait();const same={reads,shows};
    watcher.invalidate();await wait();const forced={reads,shows};watcher.dispose();slot.remove();return {initial,same,forced};
  });
  expect(counts.initial).toEqual({reads:1,shows:1});expect(counts.same).toEqual(counts.initial);expect(counts.forced).toEqual({reads:2,shows:2});
});
