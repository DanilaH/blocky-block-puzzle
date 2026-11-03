import { test, expect } from "@playwright/test";
for (const [streak, material] of [
  [5, "enamel"],
  [19, "chrome"],
] as const) {
  test(`series ${streak + 1} changes board, tray and drag without loading or allocating tiles`, async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("#app")).not.toHaveAttribute("aria-busy", "true");
    await page.evaluate(async (streak) => {
      const { IndexedSave } = await import("/src/platform/save.ts");
      const { newGame } = await import("/src/core/rules.ts");
      const a = new IndexedSave(),
        p = (await a.load()).profile;
      p.revision++;
      p.tutorialStep = 4;
      p.settings.calm = false;
      p.best = p.festivalBest = 100000;
      p.game = {
        ...newGame(1234, "material"),
        streak,
        moves: 10,
        scoringVersion: "festival-v3",
      };
      for (let i = 1; i < 8; i++) p.game.board[i] = (i % 6) + 1;
      p.game.board[63] = 3;
      p.game.tray = [1, 2, 3].map((color) => ({
        shapeId: "S1-0",
        color,
        used: false,
      }));
      await a.write(p);
    }, streak);
    await page.reload();
    await expect(page.locator("#app")).not.toHaveAttribute("aria-busy", "true");
    await page.waitForTimeout(1200);
    await page.evaluate(async () => {
      const { BoardScene } = await import("/src/game/BoardScene.ts");
      const original = BoardScene.prototype.draw;
      BoardScene.prototype.draw = function (...args) {
        (window as any).materialScene = this;
        return original.apply(this, args);
      };
    });
    await page.locator('[data-slot="1"]').click();
    await page.waitForFunction(() => !!(window as any).materialScene);
    await page.evaluate(() => {
      const w = window as any,
        scene = w.materialScene;
      w.materialAllocations = 0;
      w.survivingTile = document.querySelector('[data-slot="1"] img');
      const original = scene.add.image.bind(scene.add);
      scene.add.image = (...args) => {
        if (String(args[2]).startsWith("study-")) w.materialAllocations++;
        return original(...args);
      };
    });
    const requests: string[] = [];
    page.on("request", (r) => {
      if (/assets\/(?:tile-study|classic-tiles)\//.test(r.url()))
        requests.push(r.url());
    });
    await page.locator('[data-slot="0"]').click();
    await page.locator("#board").click({ position: { x: 5, y: 5 } });
    await expect(page.locator("html")).toHaveAttribute(
      "data-tile-material",
      material,
    );
    const p = await page.locator('[data-slot="1"]').boundingBox();
    await page.mouse.move(p!.x + p!.width / 2, p!.y + p!.height / 2);
    await page.mouse.down();
    await expect(page.locator("#floating")).toBeVisible();
    const consistency = await page.evaluate((material) => {
      const alpha = (root: string) =>
        Number(
          getComputedStyle(document.querySelector(`${root} .tile-${material}`)!)
            .opacity,
        );
      return Math.abs(alpha("#floating") - alpha('[data-slot="1"]'));
    }, material);
    expect(consistency).toBeLessThan(0.15);
    await page.waitForTimeout(1200);
    const state = await page.evaluate(() => {
      const w = window as any,
        study = w.materialScene.study;
      return {
        allocations: w.materialAllocations,
        retained:
          w.survivingTile === document.querySelector('[data-slot="1"] img'),
        textures: [
          ...new Set(
            study.pools
              .flat()
              .filter((s) => s.visible)
              .map((s) => s.texture.key),
          ),
        ],
        total: study.pools.flat().length,
      };
    });
    expect(state.allocations).toBe(0);
    expect(state.retained).toBe(true);
    expect(state.total).toBe(768);
    expect(state.textures.length).toBeGreaterThan(0);
    expect(
      state.textures.every((key) =>
        String(key).startsWith(`study-${material}-`),
      ),
    ).toBe(true);
    expect(requests).toEqual([]);
    await page.mouse.move(1, 1);
    await page.mouse.up();
  });
}

test("material pool is bounded and requests its final frame even if the theme timer finishes first", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { TileStudySprites } = await import("/src/game/tile-study.ts");
    const sprites: any[] = [];
    const scene = {
      add: {
        image: (_x, _y, key) => {
          const s: any = { visible: false, texture: { key } };
          for (const name of [
            "setDepth",
            "setPosition",
            "setDisplaySize",
            "setAlpha",
          ])
            s[name] = () => s;
          s.setTexture = (key) => {
            s.texture.key = key;
            return s;
          };
          s.setVisible = (visible) => {
            s.visible = visible;
            return s;
          };
          s.destroy = () => {};
          sprites.push(s);
          return s;
        },
      },
    };
    const tiles = new TileStudySprites(scene as any);
    const original = performance.now.bind(performance);
    let now = 100;
    performance.now = () => now;
    try {
      tiles.setMaterial("chrome", now, 1000);
      now = 900;
      tiles.begin();
      for (let i = 0; i < 1000; i++) tiles.tile(0, 0, 0xffb719, 1, 1);
      tiles.end();
      const intermediate = {
        active: tiles.transitioning,
        count: sprites.filter((s) => s.visible).length,
      };
      now = 1200;
      tiles.begin();
      tiles.tile(0, 0, 0xffb719, 1, 1);
      tiles.end();
      const final = {
        active: tiles.transitioning,
        keys: sprites.filter((s) => s.visible).map((s) => s.texture.key),
      };
      tiles.begin();
      tiles.end();
      return {
        intermediate,
        final,
        count: sprites.length,
        cleared: sprites.every((s) => !s.visible),
      };
    } finally {
      performance.now = original;
      tiles.destroy();
    }
  });
  expect(result).toEqual({
    intermediate: { active: true, count: 768 },
    final: { active: false, keys: ["study-chrome-1"] },
    count: 768,
    cleared: true,
  });
});
