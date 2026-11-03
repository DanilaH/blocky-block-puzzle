import { createServer } from "vite";
import { chromium } from "playwright";
import fs from "node:fs/promises";
const out = process.env.CAPTURE_DIR;
if (!out) throw Error("CAPTURE_DIR required");
await fs.mkdir(out, { recursive: true });
const server = await createServer({
  server: { host: "127.0.0.1", port: 5194 },
});
await server.listen();
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5194");
  await page.waitForFunction(() => !document.querySelector("#app").inert);
  const board = [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 5, 0, 0, 0, 0, 0, 0, 5, 5, 0, 4, 4, 4, 2,
    2, 0, 0, 0, 0, 4, 0, 2, 2, 0, 3, 3, 0, 0, 0, 0, 0, 0, 3, 3, 0, 6, 6, 1, 1,
    1, 0, 0, 0, 6, 6, 1, 1, 1, 0, 0, 0, 0, 0,
  ];
  for (const [name, streak, cells] of [
    ["empty", 0, Array(64).fill(0)],
    ["half", 0, board],
    ["heated", 6, board],
    ["festival", 20, board],
    ["full", 0, board.map((v, i) => (i % 9 && ![1, 8].includes(i) ? v || (i % 6) + 1 : 0))],
  ]) {
    await page.evaluate(
      async ({ streak, cells }) => {
        const { IndexedSave } = await import("/src/platform/save.ts");
        const { newGame } = await import("/src/core/rules.ts");
        const save = new IndexedSave(),
          p = (await save.load()).profile;
        p.revision++;
        p.tutorialStep = 4;
        p.best = p.progressionBest = 5800;
        p.settings.calm = false;
        p.game = {
          ...newGame(1234, "classic36"),
          moves: 10,
          score: 3460,
          streak,
          scoringVersion: "festival-v4",
        };
        p.game.board = cells;
        p.game.tray = [
          { shapeId: "L3-0", color: 2, used: false },
          { shapeId: "R6-0", color: 4, used: false },
          { shapeId: "I3-1", color: 1, used: false },
        ];
        await save.write(p);
      },
      { streak, cells },
    );
    await page.reload();
    await page.waitForFunction(() => !document.querySelector("#app").inert);
    await page.waitForTimeout(2100);
    await page.screenshot({ path: `${out}/${name}.png` });
    if (name === "half")
      for (const [width, height] of [
        [360, 640],
        [568, 320],
        [768, 1024],
      ]) {
        await page.setViewportSize({ width, height });
        await page.waitForTimeout(300);
        await page.screenshot({ path: `${out}/half-${width}.png` });
      }
    await page.setViewportSize({ width: 390, height: 844 });
  }
  if (errors.length) throw Error(errors.join("\n"));
} finally {
  await browser.close();
  await server.close();
}
