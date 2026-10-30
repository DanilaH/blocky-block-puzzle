import { test, expect } from "@playwright/test";
test("theme follows durable series, preparation preserves it and reload restores it", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.locator("#board canvas").waitFor();
  await page.evaluate(async () => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    const { newGame } = await import("/src/core/rules.ts");
    const a = new IndexedSave(),
      p = (await a.load()).profile;
    p.revision++;
    p.tutorialStep = 4;
    p.best = 100000;
    p.festivalBest = 100000;
    p.game = {
      ...newGame(12, "theme-boundary"),
      scoringVersion: "festival-v3",
      streak: 5,
    };
    p.game.tray = [0, 1, 2].map((i) => ({
      shapeId: "S1-0",
      color: i + 1,
      used: false,
    }));
    for (let i = 1; i < 8; i++) p.game.board[i] = 1;
    p.game.board[63] = 2;
    await a.write(p);
  });
  await page.reload();
  await page.locator("#board canvas").waitFor();
  await expect(page.locator("html")).toHaveAttribute("data-material", "amber");
  await page.locator('[data-slot="0"]').click();
  await page.locator("#board").click({ position: { x: 4, y: 4 } });
  await expect(page.locator("html")).toHaveAttribute("data-material", "enamel");
  await expect(page.locator("#combo-title")).toHaveText("СЕРИЯ 6 · ×5");
  await expect(page.locator('.reward-event[data-tier="theme"]')).toContainText(
    "ВИШНЁВАЯ ЭМАЛЬ",
  );
  await page.locator('[data-slot="1"]').click();
  await page.locator("#board").click({ position: { x: 4, y: 4 } });
  await expect(page.locator("#combo-stock")).toContainText("1 ход");
  await expect(page.locator("html")).toHaveAttribute("data-material", "enamel");
  await page.reload();
  await page.locator("#board canvas").waitFor();
  await expect(page.locator("html")).toHaveAttribute("data-material", "enamel");
  expect(errors).toEqual([]);
  await page.locator("#pause").click();
  await expect(
    page.locator("label").filter({ has: page.locator("#calm") }),
  ).toContainText("без вибрации");
});
test("all late themes are inspectable in dev without touching saved series", async ({
  page,
}) => {
  for (const [series, material] of [
    [0, "plastic"],
    [3, "amber"],
    [6, "enamel"],
    [10, "gold"],
    [15, "ice"],
    [20, "chrome"],
    [30, "magma"],
    [40, "opal"],
    [50, "eclipse"],
    [75, "nova"],
    [100, "prism"],
    [125, "prism"],
  ]) {
    await page.goto(`/?themeSeries=${series}`);
    await page.locator("#board canvas").waitFor();
    await expect(page.locator("html")).toHaveAttribute(
      "data-material",
      material as string,
    );
    expect(
      await page.evaluate(async () => {
        const { IndexedSave } = await import("/src/platform/save.ts");
        return (await new IndexedSave().load()).profile.game.streak;
      }),
    ).toBe(0);
  }
});

test("background analysis praises an independently selected eligible move", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#board canvas").waitFor();
  const move = await page.evaluate(async () => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    const { newGame } = await import("/src/core/rules.ts");
    const { rankMoves, praiseFor } = await import("/src/core/praise.ts");
    const a = new IndexedSave(),
      p = (await a.load()).profile;
    let random = 321;
    const next = () => {
      random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
      return random / 4294967296;
    };
    for (let n = 0; n < 30; n++) {
      const g = {
        ...newGame(n + 1, "praise-proof"),
        scoringVersion: "festival-v3",
        moves: 10,
      };
      g.board = Array.from({ length: 64 }, () => (next() < 0.5 ? 1 : 0));
      for (let y = 0; y < 8; y++) g.board[y * 8 + y] = 0;
      g.tray = [0, 1, 2].map((i) => ({
        shapeId: "S1-0",
        color: i + 1,
        used: i > 0,
      }));
      const rank = rankMoves(g, 500),
        m = rank.choices[0]?.move;
      if (m && praiseFor(rank, g, m) === "excellent") {
        p.revision++;
        p.tutorialStep = 4;
        p.best = 100000;
        p.festivalBest = 100000;
        p.game = g;
        await a.write(p);
        return m;
      }
    }
    throw new Error("No eligible deterministic position");
  });
  await page.reload();
  await page.locator("#board canvas").waitFor();
  await page.waitForTimeout(700);
  await page.locator(`[data-slot="${move.slot}"]`).click();
  const box = (await page.locator("#board").boundingBox())!;
  await page.locator("#board").click({
    position: {
      x: ((move.x + 0.5) * box.width) / 8,
      y: ((move.y + 0.5) * box.height) / 8,
    },
  });
  await expect(page.locator("#burst")).toContainText(/Отличн/);
});

test("result text stays readable on a light dialog inside a dark theme", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#board canvas").waitFor();
  await page.evaluate(async () => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    const a = new IndexedSave(),
      p = (await a.load()).profile;
    p.revision++;
    p.tutorialStep = 4;
    p.best = 10000;
    p.festivalBest = 10000;
    p.game.board = Array.from({ length: 64 }, (_, i) =>
      ((i % 8) + Math.floor(i / 8)) % 2 ? 1 : 0,
    );
    p.game.tray = [0, 1, 2].map((i) => ({
      shapeId: "O2-0",
      color: i + 1,
      used: false,
    }));
    p.game.moves = 10;
    p.game.score = 121;
    p.game.status = "over";
    p.game.streak = 10;
    await a.write(p);
  });
  await page.goto("/?themeSeries=75");
  await page.locator("#again").waitFor();
  const contrast = await page.evaluate(() => {
    const lum = (s: string) => {
      const v = s
        .match(/[\d.]+/g)!
        .slice(0, 3)
        .map(Number)
        .map((c) => {
          c /= 255;
          return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
      return v[0] * 0.2126 + v[1] * 0.7152 + v[2] * 0.0722;
    };
    const bg = lum(
      getComputedStyle(document.querySelector("dialog")!).backgroundColor,
    );
    return [".result-heading", ".result-score", ".score-title"].map((s) => {
      const fg = lum(
        getComputedStyle(document.querySelector("dialog " + s)!).color,
      );
      return (Math.max(bg, fg) + 0.05) / (Math.min(bg, fg) + 0.05);
    });
  });
  contrast.forEach((c) => expect(c).toBeGreaterThanOrEqual(4.5));
  await page.screenshot({ path: "docs/qa/evolution-0.20/result.png" });
});
