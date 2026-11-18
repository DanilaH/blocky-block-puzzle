// Serve an extracted, previously delivered APK's web payload, then switch to
// current dist at the SAME origin/profile. This is not an Android installer test.
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
const oldRoot = process.env.BLOCKY_OLD_WEB_ROOT;
if (!oldRoot)
  throw Error("Set BLOCKY_OLD_WEB_ROOT to extracted APK assets/public");
let root = path.resolve(oldRoot);
const current = path.resolve(process.env.BLOCKY_NEW_WEB_ROOT || "dist");
const server = http.createServer(async (req, res) => {
  try {
    const rel = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    const filename = path.resolve(
      root,
      "." + (rel === "/" ? "/index.html" : rel),
    );
    if (!filename.startsWith(root + path.sep)) throw Error("path");
    const types = {
      ".js": "text/javascript",
      ".css": "text/css",
      ".html": "text/html",
      ".webp": "image/webp",
    };
    res.setHeader(
      "content-type",
      types[path.extname(filename)] || "application/octet-stream",
    );
    res.setHeader("cache-control", "no-store");
    res.end(await fs.readFile(filename));
  } catch {
    res.statusCode = 404;
    res.end();
  }
});
await new Promise((r) => server.listen(5196, "127.0.0.1", r));
const browser = await chromium.launch();
try {
  const context = await browser.newContext();
  let page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5196");
  await page.waitForFunction(() => !document.querySelector("#app").inert);
  const expected = await page.evaluate(async () => {
    const db = await new Promise((r, j) => {
      const q = indexedDB.open("blocky-classic", 1);
      q.onsuccess = () => r(q.result);
      q.onerror = () => j(q.error);
    });
    const p = await new Promise((r) => {
      const q = db.transaction("save").objectStore("save").get("current");
      q.onsuccess = () => r(q.result);
    });
    p.revision++;
    p.tutorialStep = 4;
    p.earnedHints = 7;
    p.freeHints = 2;
    p.best = p.festivalBest = 777;
    p.game.score = 123;
    p.game.moves = 10;
    p.settings = { sound: false, calm: false, haptics: false };
    p.ads = {
      activeMs: 10000,
      lastFullscreenMs: 0,
      interstitials: [],
      completed: ["older-game"],
      receipts: ["old-receipt"],
      intents: [
        {
          id: "applied-hints",
          kind: "hints",
          gameId: p.game.gameId,
          revision: p.game.revision,
          snapshot: structuredClone(p.game),
          status: "applied",
        },
        {
          id: "pending-hints",
          kind: "hints",
          gameId: p.game.gameId,
          revision: p.game.revision,
          snapshot: structuredClone(p.game),
          status: "pending",
        },
      ],
    };
    await new Promise((r, j) => {
      const tx = db.transaction("save", "readwrite");
      tx.objectStore("save").put(p, "current");
      tx.oncomplete = r;
      tx.onerror = () => j(tx.error);
    });
    db.close();
    return p;
  });
  await page.reload();
  await page.waitForFunction(() => !document.querySelector("#app").inert);
  assert.equal(await page.locator("#score").textContent(), "123");
  await page.close();
  root = current;
  page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5196");
  await page.waitForFunction(() => !document.querySelector("#app").inert);
  const actual = await page.evaluate(async () => {
    const db = await new Promise((r) => {
      const q = indexedDB.open("blocky-classic", 1);
      q.onsuccess = () => r(q.result);
    });
    return new Promise((r) => {
      const q = db.transaction("save").objectStore("save").get("current");
      q.onsuccess = () => {
        db.close();
        r(q.result);
      };
    });
  });
  assert.deepEqual(actual, expected);
  assert.deepEqual(errors, []);
  assert.equal(await page.locator("#score").textContent(), "123");
  await page.locator("#pause").click();
  if (await page.locator("#musicVolume").count()) {
    assert.equal(await page.locator("#musicVolume").inputValue(), "0");
    assert.equal(await page.locator("#effectsVolume").inputValue(), "100");
    assert.equal(await page.locator("#sound").isChecked(), false);
  }
  await page.locator("#resume").click();
  let ledgerMigration = null;
  if (process.env.BLOCKY_CHECK_LEDGER === "1") {
    await page.locator("#pause").click();
    await page.locator("#sound").check();
    await page.waitForFunction(
      () =>
        document.querySelector("#save-status")?.textContent ===
        "Партия сохранена",
    );
    await page.reload();
    await page.locator("#board canvas").waitFor();
    const migrated = await page.evaluate(async () => {
      const db = await new Promise((r) => {
        const q = indexedDB.open("blocky-classic", 1);
        q.onsuccess = () => r(q.result);
      });
      return await new Promise((r) => {
        const q = db.transaction("save").objectStore("save").get("current");
        q.onsuccess = () => {
          db.close();
          r(q.result);
        };
      });
    });
    assert.deepEqual(migrated.game, expected.game);
    assert.equal(migrated.earnedHints, expected.earnedHints);
    assert.equal(migrated.best, expected.best);
    assert.equal(migrated.ads.ledgerVersion, 2);
    assert.equal(migrated.ads.intents[0].compact, true);
    assert.equal(migrated.ads.intents[0].snapshot, undefined);
    assert.deepEqual(migrated.ads.intents[1], expected.ads.intents[1]);
    assert.deepEqual(migrated.ads.receipts, expected.ads.receipts);
    assert.deepEqual(errors, []);
    ledgerMigration = {
      committedOnSetting: true,
      reloaded: true,
      gamePreserved: true,
      pendingPreserved: true,
      receiptsPreserved: true,
      appliedSnapshotRemoved: true,
    };
  }
  const report = {
    source: "previous APK web payload",
    destination: process.env.BLOCKY_NEW_WEB_ROOT
      ? "supplied APK web payload"
      : "current production dist",
    sameOrigin: true,
    profilePreservedExactly: true,
    checked: [
      "game and RNG",
      "records",
      "settings",
      "hint credits",
      "pending and applied reward intents",
      "receipt deduplication markers",
    ],
    errors,
    nativeInstallTested: false,
    ...(ledgerMigration ? { ledgerMigration } : {}),
  };
  await fs.writeFile(
    "/tmp/blocky-upgrade.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
