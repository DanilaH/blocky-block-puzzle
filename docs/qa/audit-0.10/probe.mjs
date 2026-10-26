import { chromium } from "playwright";
import fs from "node:fs/promises";
const out = new URL("./", import.meta.url).pathname;
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
});
const page = await context.newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://127.0.0.1:5176");
await page.locator("#board canvas").waitFor();
const logic = await page.evaluate(async () => {
  const R = await import("/src/core/rules.ts"),
    H = await import("/src/core/hints.ts");
  const legal = (b, s, x, y) =>
    s.cells.every(
      ([dx, dy]) =>
        x + dx >= 0 &&
        x + dx < 8 &&
        y + dy >= 0 &&
        y + dy < 8 &&
        b[(y + dy) * 8 + x + dx] === 0,
    );
  const moves = (g) =>
    g.tray.flatMap((s, slot) =>
      s.used
        ? []
        : Array.from({ length: 64 }, (_, i) => ({
            slot,
            x: i % 8,
            y: Math.floor(i / 8),
          })).filter((m) =>
            legal(g.board, R.shapeById(g.tray[m.slot].shapeId), m.x, m.y),
          ),
    );
  let total = 0,
    ends = 0,
    rng = 911,
    failures = [],
    hintSamples = [];
  const next = () => (rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0);
  for (let seed = 1001; seed <= 1200; seed++) {
    let g = R.newGame(seed, "audit-" + seed);
    for (let n = 0; n < 150; n++) {
      const options = moves(g);
      if (options.length > 0 !== (g.status === "playing"))
        failures.push({ seed, n, kind: "end" });
      if (!options.length) {
        ends++;
        break;
      }
      if (seed <= 1010 && n % 5 === 0) {
        const h = H.findHint(g);
        hintSamples.push({
          ...h.diagnostics,
          legal:
            h.move !== null &&
            options.some((m) => JSON.stringify(m) === JSON.stringify(h.move)),
        });
      }
      const m = options[next() % options.length],
        s = R.shapeById(g.tray[m.slot].shapeId),
        b = [...g.board];
      for (const [dx, dy] of s.cells)
        b[(m.y + dy) * 8 + m.x + dx] = g.tray[m.slot].color;
      const fullRows = [],
        fullCols = [];
      for (let k = 0; k < 8; k++) {
        if (b.slice(k * 8, k * 8 + 8).every((v) => v > 0)) fullRows.push(k);
        if (b.filter((_, i) => i % 8 === k).every((v) => v > 0))
          fullCols.push(k);
      }
      const indices = [];
      for (let i = 0; i < 64; i++)
        if (fullRows.includes(Math.floor(i / 8)) || fullCols.includes(i % 8)) {
          b[i] = 0;
          indices.push(i);
        }
      const l = fullRows.length + fullCols.length,
        streak = l ? g.streak + 1 : 0,
        points =
          s.cells.length +
          (l ? 10 * l * l + 5 * (streak - 1) * l : 0) +
          (b.every((v) => !v) ? 100 : 0);
      const before = JSON.stringify(g),
        r = R.applyMove(g, m, g.revision);
      if (
        !r ||
        JSON.stringify(g) !== before ||
        JSON.stringify(b) !== JSON.stringify(r.state.board) ||
        r.points !== points ||
        r.state.streak !== streak ||
        JSON.stringify(indices) !== JSON.stringify(r.cells)
      )
        failures.push({ seed, n, kind: "move" });
      g = r.state;
      total++;
    }
  }
  return {
    seeds: [1001, 1200],
    games: 200,
    moveComparisons: total,
    ended: ends,
    failures,
    hintSamples,
  };
});
console.log("logic", logic.moveComparisons, logic.failures.length);
async function fixture(score = 0) {
  await page.evaluate(async (score) => {
    const { IndexedSave } = await import("/src/platform/save.ts"),
      { createProfile } = await import("/src/core/profile.ts"),
      { newGame } = await import("/src/core/rules.ts");
    const a = new IndexedSave(),
      old = await a.load(),
      p = createProfile(newGame(55, "audit-ui"));
    p.revision = old.profile.revision + 1;
    p.tutorialStep = 4;
    p.best = Math.max(1000, score);
    p.game.score = score;
    p.game.tray = [0, 1, 2].map((i) => ({
      shapeId: "S1-0",
      color: i + 1,
      used: false,
    }));
    await a.write(p);
  }, score);
  await page.reload();
  await page.locator("#board canvas").waitFor();
}
await fixture();
const layouts = [];
for (const [width, height] of [
  [320, 480],
  [320, 568],
  [360, 640],
  [390, 844],
  [568, 320],
  [640, 360],
  [844, 390],
  [768, 1024],
]) {
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(60);
  const geo = await page.evaluate(() => {
    const keys = [
      "#board",
      "#tray",
      "#hint",
      "#pause",
      "#ad-slot",
      "#score",
      ".best",
    ];
    return Object.fromEntries(
      keys.map((k) => {
        const r = document.querySelector(k).getBoundingClientRect();
        return [
          k,
          {
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height,
            right: r.right,
            bottom: r.bottom,
          },
        ];
      }),
    );
  });
  layouts.push({ width, height, geo });
  await page.screenshot({ path: out + `screen-${width}x${height}.png` });
}
await page.setViewportSize({ width: 320, height: 568 });
await fixture(1000000);
await page.screenshot({ path: out + "million-score.png" });
// Pause/new-game while a move is awaiting a durable write.
await page.setViewportSize({ width: 390, height: 844 });
await fixture();
await page.evaluate(async () => {
  const { IndexedSave } = await import("/src/platform/save.ts");
  const write = IndexedSave.prototype.write;
  IndexedSave.prototype.write = async function (p) {
    await new Promise((r, j) => {
      window.resolveWrite = r;
      window.rejectWrite = () => j(new Error("audit write failed"));
    });
    return write.call(this, p);
  };
});
await page.locator(".piece").first().click();
await page.locator("#board").click({ position: { x: 20, y: 20 } });
await page.locator("#pause").click();
const pausePending = await page.locator("#dialog").innerText();
await page.screenshot({ path: out + "pause-pending.png" });
await page.locator("#restart").click();
await page.locator("#new-game").click();
const restartPending = {
  dialog: await page.locator("#dialog").innerText(),
  status: await page.locator(".dialog-status").innerText(),
};
await page.evaluate(() => window.rejectWrite());
await page.waitForTimeout(80);
const failedStatus = await page.locator(".dialog-status").innerText();
// Two contexts in one origin, stale writes must not overwrite the accepted move.
await page.reload();
const other = await context.newPage();
await other.goto("http://127.0.0.1:5176");
await other.locator("#board canvas").waitFor();
await page.locator(".piece").first().click();
await page.locator("#board").click({ position: { x: 20, y: 20 } });
await page.waitForTimeout(80);
await other.locator(".piece").first().click();
await other.locator("#board").click({ position: { x: 65, y: 20 } });
await other.waitForTimeout(80);
const conflict = {
  staleScore: await other.locator("#score").innerText(),
  message: await other.locator("#toast").innerText(),
};
await other.reload();
conflict.reloadedScore = await other.locator("#score").innerText();
await other.close();
// Storage corruption fallback, and both copies corrupted.
const storage = await page.evaluate(async () => {
  const { IndexedSave } = await import("/src/platform/save.ts");
  const a = new IndexedSave();
  const db = await new Promise((r, j) => {
    const q = indexedDB.open("blocky-classic", 1);
    q.onsuccess = () => r(q.result);
    q.onerror = j;
  });
  const put = (key, v) =>
    new Promise((r, j) => {
      const t = db.transaction("save", "readwrite");
      t.objectStore("save").put(v, key);
      t.oncomplete = r;
      t.onerror = j;
    });
  await put("current", { damaged: true });
  const backup = await a.load();
  await put("backup", { damaged: true });
  let error = null;
  try {
    await a.load();
  } catch (e) {
    error = e.message;
  }
  db.close();
  return {
    backupRecovered: backup.recovered,
    backupScore: backup.profile.game.score,
    bothBadError: error,
  };
});
await page.reload();
await page.screenshot({ path: out + "both-copies-corrupt.png" });
storage.bootText = await page.locator("#app").innerText();
await fs.writeFile(
  out + "results.json",
  JSON.stringify(
    {
      logic,
      layouts,
      pausePending,
      restartPending,
      failedStatus,
      conflict,
      storage,
      errors,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify(
    { pausePending, restartPending, failedStatus, conflict, storage, errors },
    null,
    2,
  ),
);
await browser.close();
