import { createServer } from "vite";
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
const out = "docs/qa/uiux-audit-0.26";
const server = await createServer({
  server: { host: "127.0.0.1", port: 5194, strictPort: true },
});
await server.listen();
const browser = await chromium.launch();
const results = [];
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
async function ready() {
  await page.waitForFunction(
    () =>
      document.querySelector("#app") && !document.querySelector("#app").inert,
  );
  await page.waitForTimeout(350);
}
async function snap(name) {
  await page.screenshot({ path: `${out}/${name}.png` });
  results.push(
    await page.evaluate(
      (name) => ({
        name,
        text: document.body.innerText,
        controls: [...document.querySelectorAll("button,input,select")]
          .filter((e) => e.getClientRects().length)
          .map((e) => {
            const r = e.getBoundingClientRect();
            return {
              id: e.id,
              text: e.textContent,
              aria: e.getAttribute("aria-label"),
              disabled: e.disabled,
              x: r.x,
              y: r.y,
              w: r.width,
              h: r.height,
            };
          }),
        board: document
          .querySelector("#board")
          .getBoundingClientRect()
          .toJSON(),
        labels: [...document.querySelectorAll(".reward-event")].map((e) => ({
          text: e.textContent,
          rect: e.getBoundingClientRect().toJSON(),
        })),
      }),
      name,
    ),
  );
}
async function fixture(kind, streak = 0) {
  await page.evaluate(
    async ({ kind, streak }) => {
      const { IndexedSave } = await import("/src/platform/save.ts");
      const { newGame } = await import("/src/core/rules.ts");
      const a = new IndexedSave(),
        p = (await a.load()).profile;
      p.revision++;
      p.tutorialStep = 4;
      p.settings.calm = false;
      p.best = p.festivalBest = kind === "clear" ? 500 : 10000;
      p.game = {
        ...newGame(1234, "audit-" + kind),
        moves: 12,
        score: 420,
        streak,
        scoringVersion: "festival-v3",
      };
      p.game.board.fill(0);
      p.game.tray = [0, 1, 2].map((i) => ({
        shapeId: "S1-0",
        color: i + 1,
        used: false,
      }));
      if (kind === "regular") {
        for (let y = 4; y < 8; y++)
          for (let x = 0; x < 8; x++)
            if ((x + y) % 3 !== 0) p.game.board[y * 8 + x] = ((x + y) % 6) + 1;
        p.game.tray = [
          { shapeId: "O3-0", color: 1, used: false },
          { shapeId: "S1-0", color: 4, used: false },
          { shapeId: "I3-0", color: 2, used: false },
        ];
      }
      if (kind === "clear") {
        for (let i = 1; i < 8; i++) {
          p.game.board[i] = 1;
          p.game.board[i * 8] = 2;
        }
      }
      if (kind === "loss") {
        p.game.board = Array.from({ length: 64 }, (_, i) =>
          ((i % 8) + Math.floor(i / 8)) % 2 ? (i % 6) + 1 : 0,
        );
        p.game.tray[1].shapeId = p.game.tray[2].shapeId = "O3-0";
      }
      if (kind === "no-hints") {
        p.freeHints = 0;
        p.hintCredits = 0;
      }
      await a.write(p);
    },
    { kind, streak },
  );
  await page.reload();
  await ready();
}
try {
  await page.goto("http://127.0.0.1:5194");
  await ready();
  await fixture("regular");
  for (const series of [20, 50, 100]) {
    await page.goto(`http://127.0.0.1:5194/?themeSeries=${series}`);
    await ready();
    await page.waitForTimeout(1400);
    await snap("19-theme-" + series);
  }
  await fs.writeFile(
    out + "/themes.json",
    JSON.stringify(
      {
        method: "DEV-only cosmetic theme inspection; saved series unchanged",
        errors,
        results,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ screens: results.length, errors }));
} finally {
  await browser.close();
  await server.close();
}
