import { test, expect } from "@playwright/test";

test("overlapping score glows restore the owned shadow only after the latest effect ends", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { presentScoreGlow } = await import("/src/game/score-glow.ts");
    const target = document.createElement("div");
    target.textContent = "1574";
    target.style.setProperty(
      "text-shadow",
      "rgb(0, 0, 0) 0px 2px 2px",
      "important",
    );
    document.body.append(target);
    const original = target.style.getPropertyValue("text-shadow");
    const animate = (e: Element, frames: Keyframe[], duration: number) =>
      e.animate(frames, { duration });
    const first = presentScoreGlow(target, animate)!;
    const second = presentScoreGlow(target, animate)!;
    first.cancel();
    await new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(r)),
    );
    const during = target.style.textShadow;
    second.cancel();
    await new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(r)),
    );
    const restored = target.style.getPropertyValue("text-shadow");
    const priority = target.style.getPropertyPriority("text-shadow");
    target.remove();
    return { during, restored, original, priority };
  });
  expect(result.during).toBe("none");
  expect(result.restored).toBe(result.original);
  expect(result.priority).toBe("important");
});

test("calm and failed animation paths leave no shadow override", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { presentScoreGlow, setDiagnosticScoreGlow } = await import(
      "/src/game/score-glow.ts"
    );
    const target = document.createElement("div");
    document.body.append(target);
    presentScoreGlow(target, () => undefined);
    const calm = target.style.textShadow;
    try {
      presentScoreGlow(target, () => {
        throw Error("animation failed");
      });
    } catch {}
    const failed = target.style.textShadow;
    setDiagnosticScoreGlow("legacy");
    let property = "";
    presentScoreGlow(target, (_e, frames) => {
      property = Object.keys(frames[0]!).find(
        (k) => k === "filter" || k === "textShadow",
      )!;
      return undefined;
    });
    setDiagnosticScoreGlow(null);
    target.remove();
    return { calm, failed, property };
  });
  expect(result).toEqual({ calm: "", failed: "", property: "textShadow" });
});
