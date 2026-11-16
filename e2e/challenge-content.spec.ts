import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs/promises";
async function saved(page: Page) {
  return page.evaluate(async () => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    return (await new IndexedSave().load()).profile!;
  });
}
async function choose(page: Page) {
  await page.locator("#pause").click();
  await page.locator("#restart").click();
  await page.getByText("Экспериментальная выдача", { exact: true }).click();
  await page.locator("#dealer-choice").selectOption("director-challenge-v1");
}

for (const width of [320, 390])
  test(`original starting decisions persist and avoid repetition under constant seed at ${width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(() => {
      const original = crypto.getRandomValues.bind(crypto);
      crypto.getRandomValues = ((array: any) => {
        if (array instanceof Uint32Array && array.length === 1) {
          array[0] = 0x9e3779b9;
          return array;
        }
        return original(array);
      }) as typeof crypto.getRandomValues;
    });
    await page.goto("/");
    await page.locator("#lesson-skip").click();
    expect((await saved(page)).game.dealerVersion).toBe("director-v2");
    const history: string[] = [];
    for (let round = 0; round < 4; round++) {
      await choose(page);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (!round)
        await page.screenshot({
          path: info.outputPath("challenge-choice.png"),
        });
      await page.locator("#new-game").click();
      await expect(page.locator("dialog")).not.toBeVisible();
      const p = await saved(page),
        g = p.game,
        key = g.challengeState!.openingKey!;
      expect(g.dealerVersion).toBe("director-challenge-v1");
      expect(g.score).toBe(0);
      expect(g.board.some(Boolean)).toBe(true);
      expect(history.slice(-3)).not.toContain(key);
      if (history.length)
        expect(key.split(":")[0]).not.toBe(history.at(-1)!.split(":")[0]);
      history.push(key);
      expect(p.experiment!.challengeOpeningHistory).toEqual(history.slice(-3));
      expect(p.experiment!.assignment).toBeUndefined();
      expect(p.experiment!.manualDealer).toBe("director-challenge-v1");
      await page.reload();
      await expect(page.locator("#app")).not.toHaveAttribute(
        "aria-busy",
        "true",
      );
      expect((await saved(page)).game).toEqual(g);
    }
    await page.screenshot({ path: info.outputPath("challenge-board.png") });
  });

test("failed new-game write preserves the old game and opening history, retry commits once", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#lesson-skip").click();
  const before = await saved(page);
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    (window as any).rejectChallenge = true;
    IDBObjectStore.prototype.put = function (value, key) {
      if (
        key === "current" &&
        (window as any).rejectChallenge &&
        value.game.dealerVersion === "director-challenge-v1"
      )
        throw new DOMException("Injected quota", "QuotaExceededError");
      return put.call(this, value, key);
    };
  });
  await choose(page);
  await page.locator("#new-game").click();
  await expect(page.locator(".dialog-status")).toContainText(
    "Не удалось сохранить",
  );
  const failed = await saved(page);
  expect(failed.game).toEqual(before.game);
  expect(failed.experiment!.challengeOpeningHistory).toBeUndefined();
  await page.evaluate(() => ((window as any).rejectChallenge = false));
  await page.locator("#new-game").click();
  await expect(page.locator("dialog")).not.toBeVisible();
  const after = await saved(page);
  expect(after.experiment!.challengeOpeningHistory).toHaveLength(1);
  await page.reload();
  expect((await saved(page)).game).toEqual(after.game);
});

test("real worker records observed time before delayed calculation/save and exports a replayable decision", async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    const Native = Worker;
    (window as any).challengeRequests = [];
    window.Worker = class extends Native {
      moveWorker = false;
      constructor(url: string | URL, opts?: WorkerOptions) {
        super(url, opts);
        this.moveWorker = String(url).includes("move.worker");
      }
      postMessage(message: any, options?: any) {
        if (!this.moveWorker) return super.postMessage(message, options);
        (window as any).challengeRequests.push(message);
        setTimeout(() => super.postMessage(message, options), 1300);
      }
    };
  });
  await page.goto("/");
  await expect(page.locator("#app")).not.toHaveAttribute("aria-busy", "true");
  const move = await page.evaluate(async () => {
    const { newGame, applyMove } = await import("/src/core/rules.ts"),
      { IndexedSave } = await import("/src/platform/save.ts");
    let trace: any;
    let g = newGame(
      8101001,
      "challenge-worker",
      "director-challenge-v1",
      (t) => (trace = t),
      "tasks",
    );
    const route = trace.validation.witness;
    for (const m of route.slice(0, 2))
      g = applyMove(g, m, g.revision, false, { activeMs: 0 })!.state;
    const a = new IndexedSave(),
      p = (await a.load()).profile!;
    await a.write({
      ...p,
      revision: p.revision + 1,
      tutorialStep: 4,
      hint: null,
      best: 10000000,
      progressionBest: 10000000,
      game: g,
      settings: { ...p.settings, calm: true, sound: false },
    });
    return route[2];
  });
  await page.reload();
  await expect(page.locator("#app")).not.toHaveAttribute("aria-busy", "true");
  await page.locator("#pause").click();
  await page.locator(".advanced-settings > summary").click();
  await page.getByText("Запись партии для разбора", { exact: true }).click();
  await page.locator("#play-capture-toggle").click();
  await page.locator("#resume").click();
  await page.evaluate(async () => {
    const { IndexedSave } = await import("/src/platform/save.ts"),
      write = IndexedSave.prototype.write;
    IndexedSave.prototype.write = async function (p) {
      await new Promise((r) => setTimeout(r, 700));
      return write.call(this, p);
    };
  });
  await page.locator(`[data-slot="${move.slot}"]`).click();
  const board = (await page.locator("#board").boundingBox())!;
  const start = Date.now();
  await page
    .locator("#board")
    .click({
      position: {
        x: ((move.x + 0.25) * board.width) / 8,
        y: ((move.y + 0.25) * board.height) / 8,
      },
    });
  await expect.poll(async () => (await saved(page)).game.moves).toBe(3);
  expect(Date.now() - start).toBeGreaterThanOrEqual(1900);
  const after = (await saved(page)).game,
    requests = await page.evaluate(() => (window as any).challengeRequests);
  expect(requests).toHaveLength(1);
  expect(requests[0].captureDecision).toBe(true);
  expect(requests[0].observation.activeMs).toBe(after.challengeState!.activeMs);
  await page.locator("#pause").click();
  await page.locator(".advanced-settings > summary").click();
  await page.getByText("Запись партии для разбора", { exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.locator("#play-capture-export").click();
  const download = await pending,
    path = info.outputPath("challenge-record.json");
  await download.saveAs(path);
  const record = JSON.parse(await fs.readFile(path, "utf8")),
    event = record.events.find((e: any) => e.kind === "move");
  expect(event.observation).toEqual(requests[0].observation);
  expect(event.decision.challenge.variant).toBe("tasks");
  const replay = await page.evaluate(async (r) => {
    const { replayRecord } = await import("/scripts/calibration/replay.ts");
    return replayRecord(r).final;
  }, record);
  expect(replay).toEqual(after);
  await page.reload();
  expect((await saved(page)).game).toEqual(after);
});
