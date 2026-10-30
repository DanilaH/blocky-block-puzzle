import { test, expect } from "@playwright/test";

test("session textures finish before input unlock; no asset requests on clear", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await page.route("**/assets/{vfx,tile-study}/*.webp", async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto("/");
  await expect(page.locator("#app")).toHaveAttribute("aria-busy", "true");
  expect(
    await page.locator("#app").evaluate((e) => (e as HTMLElement).inert),
  ).toBe(true);
  release();
  await expect(page.locator("#app")).not.toHaveAttribute("aria-busy", "true");
  await page.evaluate(async () => {
    const { IndexedSave } = await import("/src/platform/save.ts");
    const a = new IndexedSave(),
      p = (await a.load()).profile;
    p.revision++;
    p.tutorialStep = 4;
    p.game.board.fill(0);
    for (let i = 1; i < 8; i++) p.game.board[i] = (i % 6) + 1;
    p.game.board[63] = 2;
    p.game.tray = [0, 1, 2].map((i) => ({
      shapeId: "S1-0",
      color: i + 1,
      used: false,
    }));
    await a.write(p);
  });
  await page.reload();
  await expect(page.locator("#app")).not.toHaveAttribute("aria-busy", "true");
  const requests: string[] = [];
  page.on("request", (r) => {
    if (/\/assets\/(vfx|tile-study)\//.test(r.url())) requests.push(r.url());
  });
  await page.locator('[data-slot="0"]').click();
  await page.locator("#board").click({ position: { x: 4, y: 4 } });
  await expect(page.locator("#burst")).toContainText("ЛИНИЯ");
  await page.waitForTimeout(200);
  await page.locator("#pause").click();
  const pixels = await page.locator(".festival-canvas").evaluate((c) => {
    const canvas = c as HTMLCanvasElement;
    return Array.from(
      canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height)
        .data,
    ).some(Boolean);
  });
  expect(pixels).toBe(false);
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});

test("trimmed sprite anchors and pool stay bounded under excessive effects", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { VfxSprites } = await import("/src/game/vfx.ts");
    const sprites: any[] = [];
    const scene = {
      textures: { exists: () => true },
      add: {
        image: () => {
          const s: any = { visible: false };
          for (const name of [
            "setDepth",
            "setTexture",
            "setDisplaySize",
            "setRotation",
            "setAlpha",
            "setTint",
            "setBlendMode",
          ])
            s[name] = () => s;
          s.setVisible = (v: boolean) => {
            s.visible = v;
            return s;
          };
          s.setPosition = (x: number, y: number) => {
            s.x = x;
            s.y = y;
            return s;
          };
          s.destroy = () => {};
          sprites.push(s);
          return s;
        },
      },
    };
    const fx = new VfxSprites(scene as any);
    fx.begin();
    fx.stamp("streak", 100, 200, 512, 512);
    const anchor = { x: sprites[0].x, y: sprites[0].y };
    for (let i = 0; i < 1000; i++) fx.stamp("chip", 50, 50, 32, 32);
    fx.end();
    const pool = sprites.length;
    fx.clear();
    return { anchor, pool, active: sprites.filter((s) => s.visible).length };
  });
  expect(result.anchor.x).toBe(100);
  expect(result.anchor.y).toBe(200.5);
  expect(result.pool).toBe(220);
  expect(result.active).toBe(0);
});
