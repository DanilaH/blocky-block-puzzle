import { chromium, expect } from "@playwright/test";
import { mkdir, copyFile } from "node:fs/promises";
const out = "docs/qa/arcade-0.4";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  recordVideo: {
    dir: "/tmp/blocky-arcade-video",
    size: { width: 390, height: 844 },
  },
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://127.0.0.1:5173");
await page.locator("#tray button").first().waitFor();
await page.evaluate(async () => {
  const r = indexedDB.open("blocky-classic", 1);
  await new Promise((resolve) => (r.onsuccess = resolve));
  const db = r.result,
    tx = db.transaction("save", "readwrite"),
    s = tx.objectStore("save"),
    read = s.get("current");
  read.onsuccess = () => {
    const p = read.result;
    p.game.board = [
      5, 5, 0, 0, 0, 3, 6, 6, 5, 5, 2, 0, 0, 3, 3, 6, 0, 2, 2, 0, 0, 0, 0, 6, 0,
      0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 4, 4, 4, 6, 6, 6, 0, 0, 3, 3, 3, 0, 0,
      0, 0, 0, 0, 0, 0, 2, 2, 0, 0, 0, 4, 4, 0,
    ];
    p.game.tray = [
      { shapeId: "O2-0", color: 1, used: false },
      { shapeId: "S1-0", color: 2, used: false },
      { shapeId: "I3-0", color: 6, used: false },
    ];
    p.game.score = 480;
    p.game.moves = 12;
    p.game.streak = 1;
    p.game.status = "playing";
    p.best = 3602;
    p.hint = null;
    p.settings.calm = false;
    p.revision++;
    s.put(p, "current");
  };
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
});
await page.reload();
await page.locator("#board canvas").waitFor();
await page.waitForTimeout(600);
await page.screenshot({ path: out + "/game.png" });
const board = await page.locator("#board").boundingBox();
const second = await page.locator("#tray button").nth(1).boundingBox();
await page.mouse.move(
  second.x + second.width / 2,
  second.y + second.height / 2,
);
await page.mouse.down();
await page.mouse.move(
  board.x + (board.width * 3.5) / 8,
  board.y + (board.height * 0.5) / 8,
  { steps: 24 },
);
await page.waitForTimeout(400);
await page.mouse.up();
await page.waitForTimeout(650);
await expect(page.locator("#score")).toHaveText("481");
const first = await page.locator("#tray button").first().boundingBox();
await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
await page.mouse.down();
await page.mouse.move(
  board.x + (board.width * 4) / 8,
  board.y + (board.height * 5) / 8,
  { steps: 30 },
);
await page.waitForTimeout(600);
await page.screenshot({ path: out + "/drag.png" });
await page.mouse.up();
await page.waitForTimeout(90);
await page.screenshot({ path: out + "/clear.png" });
await page.waitForTimeout(1200);
await expect(page.locator("#score")).toHaveText("525");
await page.locator("#pause").click();
await page.screenshot({ path: out + "/pause.png" });
await page.waitForTimeout(600);
await page.locator("#resume").click();
await page.setViewportSize({ width: 844, height: 390 });
await page.waitForTimeout(250);
await page.screenshot({ path: out + "/landscape.png" });
const video = page.video();
await context.close();
await copyFile(await video.path(), out + "/play.webm");
await browser.close();
if (errors.length) throw Error(errors.join("\n"));
console.log("Saved screenshots/video to " + out);
