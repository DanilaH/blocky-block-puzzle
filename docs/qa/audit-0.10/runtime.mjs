import { chromium } from "playwright";
import fs from "node:fs/promises";
const out = new URL("./", import.meta.url).pathname,
  b = await chromium.launch(),
  p = await b.newPage({ viewport: { width: 390, height: 844 } });
await p.goto("http://127.0.0.1:5176");
await p.locator("#lesson-skip").click();
await p.evaluate(async () => {
  const { BoardScene } = await import("/src/game/BoardScene.ts"),
    { GameAudio } = await import("/src/game/audio.ts");
  window.meter = {
    draws: 0,
    drawMs: 0,
    frames: 0,
    maxVoices: 0,
    maxImpacts: 0,
  };
  const draw = BoardScene.prototype.draw,
    play = GameAudio.prototype.play;
  BoardScene.prototype.draw = function (...a) {
    if (!window.scene) {
      window.scene = this;
      this.game.events.on("postrender", () => window.meter.frames++);
    }
    const t = performance.now();
    const r = draw.apply(this, a);
    window.meter.draws++;
    window.meter.drawMs += performance.now() - t;
    window.meter.maxImpacts = Math.max(
      window.meter.maxImpacts,
      this.impacts.length,
    );
    return r;
  };
  GameAudio.prototype.play = function (...a) {
    window.audio = this;
    const r = play.apply(this, a);
    window.meter.maxVoices = Math.max(window.meter.maxVoices, this.voices.size);
    return r;
  };
});
await p.setViewportSize({ width: 391, height: 844 });
await p.waitForTimeout(100);
async function sample(ms = 1200) {
  await p.evaluate(() =>
    Object.assign(window.meter, { draws: 0, drawMs: 0, frames: 0 }),
  );
  await p.waitForTimeout(ms);
  return await p.evaluate(() => ({ ...window.meter }));
}
const idle = await sample();
await p.locator("#hint").click();
await p.waitForFunction(
  () => !document.querySelector("#hint").hasAttribute("aria-busy"),
);
await p.waitForTimeout(100);
const hint = await sample();
await p.locator("#pause").click();
const paused = await sample();
await p.locator("#resume").click();
// 100 valid placements through real UI, restarting only finished games.
let moves = 0,
  restarts = 0;
for (let i = 0; i < 100; i++) {
  const next = await p.evaluate(async () => {
    const { IndexedSave } = await import("/src/platform/save.ts"),
      R = await import("/src/core/rules.ts");
    const g = (await new IndexedSave().load()).profile.game;
    if (g.status === "over") return null;
    for (let slot = 0; slot < 3; slot++)
      if (!g.tray[slot].used) {
        const a = R.placements(g.board, R.shapeById(g.tray[slot].shapeId));
        if (a.length) return { slot, ...a[0], moves: g.moves };
      }
  });
  if (!next) {
    await p.locator("#again").waitFor();
    await p.locator("#again").click();
    restarts++;
    i--;
    continue;
  }
  await p.locator(".piece").nth(next.slot).click();
  const box = await p.locator("#board").boundingBox();
  await p
    .locator("#board")
    .click({
      position: {
        x: ((next.x + 0.5) * box.width) / 8,
        y: ((next.y + 0.5) * box.height) / 8,
      },
    });
  await p.waitForFunction(async (n) => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    return (await new IndexedSave().load()).profile.game.moves === n + 1;
  }, next.moves);
  moves++;
}
await p.waitForTimeout(1300);
const settled = await p.evaluate(() => ({
  impacts: window.scene.impacts.length,
  voices: window.audio?.voices.size,
  animations: document.getAnimations().length,
  ...window.meter,
}));
// Hint computation finished but its save is still pending.
await p.reload();
if (await p.locator("#again").isVisible()) await p.locator("#again").click();
await p.locator("#pause").click();
await p.locator("#restart").click();
await p.locator("#new-game").click();
await p.evaluate(async () => {
  const { IndexedSave } = await import("/src/platform/save.ts");
  const w = IndexedSave.prototype.write;
  IndexedSave.prototype.write = async function (s) {
    await new Promise((r) => (window.finishHintWrite = r));
    return w.call(this, s);
  };
});
await p.locator("#hint").click();
await p.waitForFunction(() => typeof window.finishHintWrite === "function");
const hintSaving = await p.evaluate(() => ({
  busy: document.querySelector("#hint").getAttribute("aria-busy"),
  label: document.querySelector("#hint-label").innerText,
  count: document.querySelector("#hint-count").innerText,
  labelWidth: document.querySelector("#hint-label").getBoundingClientRect()
    .width,
}));
await p.screenshot({ path: out + "hint-saving.png" });
await p.evaluate(() => window.finishHintWrite());
await p.waitForTimeout(100);
await fs.writeFile(
  out + "runtime.json",
  JSON.stringify(
    {
      sampleMs: 1200,
      idle,
      hint,
      paused,
      moves,
      restarts,
      settled,
      hintSaving,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify(
    { idle, hint, paused, moves, restarts, settled, hintSaving },
    null,
    2,
  ),
);
await b.close();
