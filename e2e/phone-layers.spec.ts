import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs/promises";
test.use({
  viewport: { width: 392, height: 872 },
  deviceScaleFactor: 2.75,
  isMobile: true,
});
async function saved(page: Page) {
  return page.evaluate(async () => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    return (await new IndexedSave().load()).profile;
  });
}
async function report(page: Page) {
  const d = page.waitForEvent("download");
  await page.locator("#phone-clear-export").click();
  return JSON.parse(await fs.readFile((await (await d).path())!, "utf8"));
}
test("layer run brackets reversed real clears, proves every ablation and keeps the ordinary profile", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".piece").first().waitFor();
  const before = await saved(page);
  await page.goto("/?clearTrace=layers&test=fast");
  await expect(page.locator("#phone-clear-start")).toBeEnabled();
  await page.locator("#phone-clear-start").click();
  await expect(page.locator("#phone-clear-progress")).toBeVisible();
  await expect(page.locator("#phone-clear-export")).toBeEnabled({
    timeout: 40000,
  });
  const r = await report(page);
  expect(r.schema).toBe("blocky-phone-layers-v3");
  expect(r.completed).toBe(true);
  expect(r.interrupted).toBe(false);
  expect(r.episodes).toHaveLength(18);
  expect(r.episodes.filter((e: any) => e.phase === "comparison")).toHaveLength(
    16,
  );
  expect(r.protocol.functionalOnly).toBe(true);
  expect(r.summary.rows.every((e: any) => !e.investigate)).toBe(true);
  for (const e of r.episodes) {
    expect(e.state.game.score).toBe(1574);
    expect(e.state.game.board.every((n: number) => n === 0)).toBe(true);
    expect(e.state.wardrobe.selected).toBe(5);
    expect(e.validation.errors).toEqual([]);
    expect(e.state.proof.rewardRenderer).toBe("dom");
    expect(e.state.proof.rewardEffects.pointFlights).toBe(
      e.condition.skipRewardDom ? 0 : 2,
    );
    expect(e.state.proof.rewardEffects.captionAnimations).toBe(
      e.condition.skipRewardDom || e.condition.skipRewardDecoration ? 0 : 2,
    );
    expect(e.state.proof.rewardEffects.hudFlashes).toBe(
      e.condition.skipRewardDom || e.condition.skipHudFlashes ? 0 : 2,
    );
    expect(e.state.proof.atmosphere.domPaletteTheme).toBe(
      e.condition.freezeTheme || e.condition.freezeDomPalette ? 1 : 5,
    );
  }
  expect(
    r.episodes.find((e: any) => e.condition.id === "no-theme").state.proof
      .renderedTheme,
  ).toBe(1);
  expect(await saved(page)).toEqual(before);
  await page.locator("#phone-clear-return").click();
  await page.locator(".piece").first().waitFor();
  expect(await saved(page)).toEqual(before);
});
test("cancel exports an incomplete study with no winning rows, and retry resets state", async ({
  page,
}) => {
  await page.goto("/?clearTrace=layers&test=fast");
  await expect(page.locator("#phone-clear-start")).toBeEnabled();
  await page.locator("#phone-clear-start").click();
  await page.locator("#phone-clear-cancel").click();
  await expect(page.locator("#phone-clear-status")).toContainText("прервана");
  const r = await report(page);
  expect(r.completed).toBe(false);
  expect(r.interrupted).toBe(true);
  expect(r.summary.rows.every((e: any) => !e.investigate)).toBe(true);
  await page.locator("#phone-clear-start").click();
  await expect(page.locator("#phone-clear-export")).toBeEnabled({
    timeout: 40000,
  });
  expect((await report(page)).completed).toBe(true);
});
test("full length layer study includes delayed rain, theme, scores and one consistent backing size", async ({
  page,
}, testInfo) => {
  test.setTimeout(130000);
  await page.goto("/?clearTrace=layers");
  await expect(page.locator("#phone-clear-start")).toBeEnabled();
  await page.evaluate(() => {
    const snapshots: any[] = [];
    (window as any).__captionSnapshots = snapshots;
    new MutationObserver((records) => {
      for (const record of records)
        for (const added of record.addedNodes) {
          if (
            !(added instanceof HTMLElement) ||
            added.dataset.tier !== "all-clear"
          )
            continue;
          const label = added.querySelector<HTMLElement>(".reward-praise")!;
          const marks = performance
            .getEntriesByType("mark")
            .filter((m) => m.name.endsWith(":start"));
          snapshots.push({
            mark: marks.at(-1)!.name,
            geometry: {
              node: [added.offsetWidth, added.offsetHeight],
              label: [label.offsetWidth, label.offsetHeight],
              left: added.style.left,
              top: added.style.top,
            },
            visibility: getComputedStyle(label).visibility,
            motion: label.getAnimations({ subtree: true }).length,
            letters: label.querySelectorAll("i").length,
            canvases: added.querySelectorAll("canvas").length,
          });
        }
    }).observe(document.querySelector("#burst")!, { childList: true });
  });
  await page.locator("#phone-clear-start").click();
  await expect(page.locator("#phone-clear-export")).toBeEnabled({
    timeout: 110000,
  });
  const r = await report(page);
  expect(r.completed).toBe(true);
  expect(r.protocol.functionalOnly).toBe(false);
  expect(r.episodes).toHaveLength(18);
  const dimensions = JSON.stringify(r.episodes[0].sample.context.canvas);
  for (const e of r.episodes) {
    expect(e.validation.errors).toEqual([]);
    expect(e.state.proof.rewardRenderer).toBe("dom");
    expect(e.state.proof.rewardEffects.pointFlights).toBe(
      e.condition.skipRewardDom ? 0 : 2,
    );
    expect(e.state.proof.rewardEffects.captionAnimations).toBe(
      e.condition.skipRewardDom || e.condition.skipRewardDecoration ? 0 : 2,
    );
    expect(e.state.proof.rewardEffects.hudFlashes).toBe(
      e.condition.skipRewardDom || e.condition.skipHudFlashes ? 0 : 2,
    );
    expect(e.state.proof.atmosphere.domPaletteTheme).toBe(
      e.condition.freezeTheme || e.condition.freezeDomPalette ? 1 : 5,
    );
    expect(JSON.stringify(e.sample.context.canvas)).toBe(dimensions);
    expect(e.state.proof.pendingPoints).toBe(0);
    expect(e.state.proof.shownScore).toBe(1574);
    if (e.condition.skipFestival)
      expect(e.state.proof.festival.spawned).toBe(0);
    else expect(e.state.proof.festival.spawned).toBe(148);
  }
  const captions = await page.evaluate(
    () => (window as any).__captionSnapshots,
  );
  for (const round of [0, 1]) {
    const series = r.episodes.filter(
      (e: any) => e.phase === "comparison" && e.round === round,
    );
    const baseline = captions.find(
      (c: any) => c.mark === `blocky-clear:${series[0].kind}:start`,
    );
    const omitted = series.find((e: any) => e.condition.skipRewardDecoration);
    const hidden = captions.find(
      (c: any) => c.mark === `blocky-clear:${omitted.kind}:start`,
    );
    expect(hidden.geometry).toEqual(baseline.geometry);
    expect(hidden.visibility).toBe("hidden");
    expect(hidden.motion).toBe(0);
    expect(baseline.visibility).toBe("visible");
    expect(baseline.motion).toBeGreaterThan(1);
    expect(baseline.letters).toBeGreaterThan(1);
    expect(baseline.canvases).toBe(0);
  }
  for (const row of r.summary.rows)
    expect(row.rounds.every((r: any) => r.comparable)).toBe(true);
  expect(Buffer.byteLength(JSON.stringify(r), "utf8")).toBeLessThan(1000000);
  await testInfo.attach("layer-study-proof", {
    contentType: "application/json",
    body: JSON.stringify({
      completed: r.completed,
      elapsedMs: r.elapsedMs,
      protocol: r.protocol,
      episodes: r.episodes.map((e: any) => ({
        kind: e.kind,
        condition: e.condition.id,
        validation: e.validation,
        proof: e.state.proof,
        canvas: e.sample.context.canvas,
      })),
      scope: "Linux browser functional verification, not a POCO timing claim",
    }),
  });
});
for (const target of ["#clear-layers", "#clear-trace"])
  test(`diagnostic link ${target} protects an unexported capture`, async ({
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
    const open = async () => {
      await page.locator("#pause").click();
      await page.locator(".advanced-settings>summary").click();
      await page.getByText("Диагностика", { exact: true }).click();
    };
    await open();
    await page.locator("#perf-start").click();
    await open();
    await page.locator(target).click();
    await expect(page).not.toHaveURL(/clearTrace/);
    await expect(page.locator(".dialog-status")).toContainText("выгрузите");
  });

test("start and return controls remain reachable on compact portrait and landscape screens", async ({
  page,
}) => {
  for (const viewport of [
    { width: 320, height: 480 },
    { width: 568, height: 320 },
    { width: 872, height: 392 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/?clearTrace=layers&test=fast");
    await expect(page.locator("#phone-clear-start")).toBeEnabled();
    for (const selector of ["#phone-clear-start", "#phone-clear-return"]) {
      await page.locator(selector).scrollIntoViewIfNeeded();
      const box = await page.locator(selector).boundingBox();
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
    }
  }
});
