import { chromium } from "playwright";
import fs from "node:fs/promises";
const out = new URL("./", import.meta.url).pathname,
  b = await chromium.launch(),
  p = await b.newPage({ viewport: { width: 320, height: 480 } });
await p.goto(process.env.AUDIT_URL || "http://127.0.0.1:5186");
await p.locator("#board canvas").waitFor();
await p.evaluate(async () => {
  const { IndexedSave } = await import("/src/platform/save.ts"),
    { createProfile } = await import("/src/core/profile.ts"),
    { newGame } = await import("/src/core/rules.ts");
  const a = new IndexedSave(),
    old = await a.load(),
    q = createProfile(newGame(42, "visual-critique"));
  q.revision = old.profile.revision + 1;
  q.tutorialStep = 4;
  q.best = 1000;
  q.game.tray = ["S1-0", "I5-1", "O3-0"].map((shapeId, i) => ({
    shapeId,
    color: i + 1,
    used: false,
  }));
  await a.write(q);
});
await p.reload();
await p.locator("#board canvas").waitFor();
const results = [];
for (const [w, h] of [
  [320, 480],
  [320, 568],
  [390, 844],
  [568, 320],
]) {
  await p.setViewportSize({ width: w, height: h });
  await p.waitForTimeout(80);
  results.push(
    await p.evaluate(() => ({
      viewport: [innerWidth, innerHeight],
      pieces: [...document.querySelectorAll(".piece")].map((el) => {
        const cell = el.querySelector(".mini-cell").getBoundingClientRect(),
          shape = el.querySelector(".mini-shape").getBoundingClientRect(),
          button = el.getBoundingClientRect();
        return {
          label: el.getAttribute("aria-label"),
          cell: cell.width,
          shape: [shape.width, shape.height],
          button: [button.width, button.height],
        };
      }),
    })),
  );
  await p.screenshot({
    path: out + `${process.env.AUDIT_PREFIX || ""}mixed-${w}x${h}.png`,
  });
}
await fs.writeFile(
  out + (process.env.AUDIT_PREFIX || "") + "results.json",
  JSON.stringify(results, null, 2),
);
console.log(JSON.stringify(results));
await b.close();
