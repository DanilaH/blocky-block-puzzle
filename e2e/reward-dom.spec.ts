import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";

test("ordinary clears use DOM letters without raster allocation and preserve score feedback", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const audit = {
      scoreAnimations: 0,
      letteredCaptions: 0,
      rasterSeen: false,
    };
    (window as any).__rewardAudit = audit;
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      if (this.id === "score") audit.scoreAnimations++;
      return animate.apply(this, args);
    };
    document.addEventListener("DOMContentLoaded", () => {
      new MutationObserver((records) => {
        for (const record of records)
          for (const node of record.addedNodes) {
            if (
              !(node instanceof HTMLElement) ||
              !node.matches(".reward-event")
            )
              continue;
            if (node.querySelector(".reward-praise i"))
              audit.letteredCaptions++;
            if (node.querySelector("canvas")) audit.rasterSeen = true;
          }
      }).observe(document.body, { childList: true, subtree: true });
    });
  });
  // Diagnostic switches only apply to the controlled layer study.
  await page.goto(
    "/?clearTrace=1&skipHudFlashes=1&freezeDomPalette=1&rewardRaster=1",
  );
  await expect(page.locator("#phone-clear-start")).toBeEnabled();
  await page.locator("#phone-clear-start").click();
  await expect(page.locator("#phone-clear-export")).toBeEnabled({
    timeout: 30000,
  });
  const download = page.waitForEvent("download");
  await page.locator("#phone-clear-export").click();
  const report = JSON.parse(
    await fs.readFile((await (await download).path())!, "utf8"),
  );
  expect(report.completed).toBe(true);
  for (const episode of report.episodes) {
    expect(episode.state.game.score).toBe(1574);
    expect(episode.state.wardrobe.selected).toBe(5);
    expect(episode.state.rewardRenderer).toBe("dom");
    expect(episode.state.rewardRasters).toBeUndefined();
  }
  const audit = await page.evaluate(() => (window as any).__rewardAudit);
  expect(audit.rasterSeen).toBe(false);
  expect(audit.letteredCaptions).toBeGreaterThanOrEqual(3);
  expect(audit.scoreAnimations).toBeGreaterThanOrEqual(12);
  await expect(page.locator(".reward-event")).toHaveCount(0);
});
