// Intermediate visible text/SVG color and geometry comparison, not a performance run.
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
const server = await createServer({
  cacheDir: "/tmp/blocky-ink-056-qa",
  server: { host: "127.0.0.1", port: 5195 },
});
await server.listen();
const browser = await chromium.launch({ headless: true });
const results = [];
await fs.mkdir("/tmp/blocky-ink-056-visual", { recursive: true });
try {
  for (const view of ["game", "pause", "tutorial", "result"]) {
    for (const viewport of [
      { width: 392, height: 872 },
      { width: 872, height: 392 },
    ]) {
      const pair = [];
      for (const legacy of [true, false]) {
        const context = await browser.newContext({
          viewport,
          deviceScaleFactor: 2.75,
          isMobile: true,
          hasTouch: true,
        });
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        if (view === "game" || view === "pause") {
          await page.goto("http://127.0.0.1:5195/?clearTrace=1");
          await page.waitForFunction(
            () =>
              document.querySelector("#phone-clear-start")?.disabled === false,
          );
          await page
            .locator("#phone-clear-panel")
            .evaluate((e) => (e.style.display = "none"));
          if (view === "pause") await page.locator("#pause").click();
        } else {
          await page.goto("http://127.0.0.1:5195/");
          await page.locator(".piece").first().waitFor();
          if (view === "result") {
            await page.evaluate(async () => {
              const { IndexedSave } = await import("/src/platform/save.ts"),
                { newGame } = await import("/src/core/rules.ts");
              const s = new IndexedSave(),
                p = (await s.load()).profile;
              p.revision++;
              p.tutorialStep = 4;
              delete p.metrics;
              p.hint = null;
              p.game = newGame(11, "ink-visual-result", "flow-v4");
              p.game.board = Array.from({ length: 64 }, (_, i) =>
                ((i % 8) + Math.floor(i / 8)) % 2 ? 3 : 0,
              );
              p.game.tray.forEach((slot) => (slot.shapeId = "O3-0"));
              p.game.status = "over";
              p.game.score = 14650;
              p.game.reviveOffer = {
                accepted: false,
                deadline: 5001,
                expired: true,
              };
              p.best = p.festivalBest = 14650;
              await s.write(p);
            });
            await page.reload();
            await page.locator("#again").waitFor();
            await page.locator(".result-total").click();
          } else {
            await page.waitForFunction(
              () => !document.querySelector("#app")?.hasAttribute("aria-busy"),
            );
            await page.evaluate(() => document.querySelector("#pause").click()); // pause freezes tutorial gameplay
            await page.evaluate(() =>
              document.querySelector("#resume").click(),
            );
          }
        }
        if (legacy)
          await page.addStyleTag({
            content:
              ':root[data-presentation="classic"] :is(.best,.icon,.hint,.secondary){transition:--enamel-local var(--world-duration),color var(--world-duration)}',
          });
        const frames = await page.evaluate(async () => {
          const root = document.documentElement;
          const collect = () =>
            [...document.querySelectorAll("#app *")]
              .filter((e) => {
                const b = e.getBoundingClientRect(),
                  s = getComputedStyle(e);
                const text = [...e.childNodes].some(
                  (n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim(),
                );
                return (
                  (text ||
                    e.matches(".best,.icon,.hint,.secondary") ||
                    e instanceof SVGPathElement ||
                    e instanceof SVGCircleElement) &&
                  b.width > 3 &&
                  b.height > 3 &&
                  s.visibility !== "hidden" &&
                  s.display !== "none"
                );
              })
              .map((e) => {
                const b = e.getBoundingClientRect(),
                  s = getComputedStyle(e);
                return {
                  key: e.id || e.tagName + "." + e.getAttribute("class"),
                  text: [...e.childNodes]
                    .filter((n) => n.nodeType === Node.TEXT_NODE)
                    .map((n) => n.textContent.trim())
                    .join(""),
                  color: s.color,
                  backgroundColor: s.backgroundColor,
                  backgroundImage: s.backgroundImage,
                  boxShadow: s.boxShadow,
                  borderColor: s.borderColor,
                  outlineColor: s.outlineColor,
                  fill: s.fill,
                  stroke: s.stroke,
                  rect: [b.x, b.y, b.width, b.height].map(
                    (x) => Math.round(x * 10) / 10,
                  ),
                };
              });
          document.getAnimations().forEach((a) => a.cancel());
          root.style.setProperty("--world-duration", "1000ms");
          root.style.setProperty("--world-ink", "#325376");
          root.style.setProperty("--world-bg", "#e2e6ed");
          // Establish a stable start style without creating an unfinished first transition.
          const stopper = document.createElement("style");
          stopper.textContent = "*{transition:none!important}";
          document.head.append(stopper);
          collect();
          stopper.remove();
          collect();
          await new Promise((r) => requestAnimationFrame(r));
          root.style.setProperty("--world-ink", "#f2f4f7");
          root.style.setProperty("--world-bg", "#123462");
          collect();
          const transitions = document
            .getAnimations()
            .filter(
              (a) =>
                a instanceof CSSTransition &&
                ["color", "--enamel-local"].includes(a.transitionProperty),
            );
          const out = [];
          for (const phase of [0, 250, 500, 750, 1000]) {
            transitions.forEach((a) => {
              a.pause();
              a.currentTime = phase;
            });
            out.push({ phase, leaves: collect() });
          }
          return out;
        });
        if (!legacy)
          await page.screenshot({
            path: `/tmp/blocky-ink-056-visual/${view}-${viewport.width}.png`,
          });
        if (errors.length) throw Error(JSON.stringify(errors));
        pair.push(frames);
        await context.close();
      }
      for (let i = 0; i < pair[0].length; i++) {
        const same = JSON.stringify(pair[0][i]) === JSON.stringify(pair[1][i]);
        results.push({
          view,
          viewport,
          phase: pair[0][i].phase,
          visibleTextOrSvgNodes: pair[0][i].leaves.length,
          exactColorAndGeometry: same,
        });
        if (!same) {
          await fs.writeFile(
            "/tmp/blocky-ink-056-visual/mismatch.json",
            JSON.stringify(
              { view, legacy: pair[0][i], scoped: pair[1][i] },
              null,
              2,
            ),
          );
          throw Error(
            "Visible color/geometry mismatch: " + view + " " + pair[0][i].phase,
          );
        }
      }
    }
  }
  await fs.mkdir("docs/qa/rewards-056", { recursive: true });
  await fs.writeFile(
    "docs/qa/rewards-056/visible-color-parity.json",
    JSON.stringify(
      {
        scope:
          "Visible text/SVG paint properties and geometry at five color phases, both orientations, with former unused enamel transitions restored. Reward glyph pixels tested separately.",
        results,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
  await server.close();
}
