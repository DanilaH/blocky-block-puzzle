import { chromium } from "playwright";
import fs from "node:fs/promises";
const root = new URL("../docs/qa/feel-0.12/", import.meta.url).pathname;
await fs.mkdir(root, { recursive: true });
const b = await chromium.launch(),
  p = await b.newPage({ viewport: { width: 390, height: 844 } });
await p.goto("http://127.0.0.1:5185");
await p.locator("#board canvas").waitFor();
await p.evaluate(async () => {
  const { IndexedSave } = await import("/src/platform/save.ts"),
    { createProfile } = await import("/src/core/profile.ts"),
    R = await import("/src/core/rules.ts");
  const a = new IndexedSave(),
    old = await a.load();
  let g = R.newGame(1234, "gloss-review"),
    r = 111;
  for (let i = 0; i < 8 && g.status === "playing"; i++) {
    let opts = [];
    g.tray.forEach((s, slot) => {
      if (!s.used)
        opts.push(
          ...R.placements(g.board, R.shapeById(s.shapeId)).map((x) => ({
            slot,
            ...x,
          })),
        );
    });
    r = (Math.imul(r, 1664525) + 1013904223) >>> 0;
    g = R.applyMove(g, opts[r % opts.length], g.revision).state;
  }
  const q = createProfile(g);
  q.revision = old.profile.revision + 1;
  q.best = Math.max(1000, g.score);
  q.tutorialStep = 4;
  await a.write(q);
});
await p.reload();
await p.locator("#board canvas").waitFor();
for (const [w, h] of [
  [390, 844],
  [320, 480],
  [320, 568],
  [568, 320],
  [768, 1024],
]) {
  await p.setViewportSize({ width: w, height: h });
  await p.waitForTimeout(100);
  await p.screenshot({ path: root + `gloss-${w}x${h}.png` });
}
await p.setViewportSize({ width: 390, height: 844 });
await p.locator("#pause").click();
await p.screenshot({ path: root + "pause.png" });
await p.locator("#resume").click();
await p.evaluate(async () => {
  const { IndexedSave } = await import("/src/platform/save.ts");
  const a = new IndexedSave(),
    q = (await a.load()).profile;
  q.revision++;
  q.game.board = Array.from({ length: 64 }, (_, i) =>
    (i + Math.floor(i / 8)) % 2 ? 2 : 0,
  );
  q.game.tray = [0, 1, 2].map((i) => ({
    shapeId: "O2-0",
    color: i + 1,
    used: false,
  }));
  q.game.status = "over";
  q.game.score = 1248;
  q.game.moves = 72;
  q.best = 1248;
  await a.write(q);
});
await p.reload();
await p.locator("#again").waitFor();
await p.screenshot({ path: root + "result.png" });
await b.close();
