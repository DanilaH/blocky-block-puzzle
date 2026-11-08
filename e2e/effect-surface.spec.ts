import { test, expect } from "@playwright/test";
test.use({
  viewport: { width: 392, height: 872 },
  deviceScaleFactor: 2.75,
  isMobile: true,
});

test("effect batch preserves premultiplied normal/screen composition and uploads images only at preparation", async ({
  page,
}) => {
  await page.goto("/e2e/fixtures/effect-viewport.html");
  const result = await page.evaluate(async () => {
    const { createEffectSurface, effectSurfaceInfo } = await import(
      "/src/game/effect-surface.ts"
    );
    const { canvas, painter: g } = createEffectSurface("festival");
    canvas.width = 120;
    canvas.height = 120;
    const source = document.createElement("canvas");
    source.width = source.height = 16;
    const s = source.getContext("2d")!;
    s.fillStyle = "#f48a30";
    s.globalAlpha = 0.45;
    s.fillRect(0, 0, 16, 16);
    g.prepareImages([source]);
    const before = effectSurfaceInfo(canvas);
    const reference = document.createElement("canvas");
    reference.width = reference.height = 120;
    const r = reference.getContext("2d")!;
    for (const p of [g, r]) {
      p.setTransform(1, 0, 0, 1, 0, 0);
      p.clearRect(0, 0, 120, 120);
      p.fillStyle = "#324e70";
      p.globalAlpha = 0.7;
      p.fillRect(0, 0, 120, 120);
      p.globalAlpha = 0.6;
      p.drawImage(source, 10, 10, 70, 70);
      p.globalCompositeOperation = "screen";
      p.drawImage(source, 30, 30, 70, 70);
      p.globalCompositeOperation = "source-over";
      p.globalAlpha = 0.5;
      p.fillStyle = "#71a8ec";
      p.save();
      p.translate(85, 90);
      p.rotate(0.2);
      p.fillRect(-8, -8, 16, 16);
      p.restore();
    }
    g.present();
    const copy = document.createElement("canvas");
    copy.width = copy.height = 120;
    const c = copy.getContext("2d")!;
    c.drawImage(canvas, 0, 0);
    const points = [
      [5, 5],
      [20, 20],
      [40, 40],
      [90, 40],
      [85, 90],
    ];
    const pixels = points.map(([x, y]) => ({
      gpu: [...c.getImageData(x!, y!, 1, 1).data],
      reference: [...r.getImageData(x!, y!, 1, 1).data],
    }));
    for (let i = 0; i < 20; i++) {
      g.clearRect(0, 0, 120, 120);
      g.drawImage(source, 10, 10, 70, 70);
      g.present();
    }
    return { before, after: effectSurfaceInfo(canvas), pixels };
  });
  expect(result.before.renderer).toBe("webgl");
  expect(result.after.uploads).toBe(result.before.uploads);
  expect(result.after.draws).toBe(1);
  for (const pixel of result.pixels)
    for (let i = 0; i < 4; i++)
      expect(Math.abs(pixel.gpu[i]! - pixel.reference[i]!)).toBeLessThanOrEqual(
        3,
      );
});

test("effect WebGL context restores its atlas and current draw state", async ({
  page,
}) => {
  await page.goto("/e2e/fixtures/effect-viewport.html");
  await page.evaluate(async () => {
    const { createEffectSurface } = await import("/src/game/effect-surface.ts");
    const surface = createEffectSurface("festival");
    const canvas = surface.canvas;
    canvas.width = canvas.height = 64;
    document.body.append(canvas);
    const image = document.createElement("canvas");
    image.width = image.height = 4;
    image.getContext("2d")!.fillRect(0, 0, 4, 4);
    surface.painter.prepareImages([image]);
    (window as any).restoring = {
      ...surface,
      image,
      extension: canvas
        .getContext("webgl")!
        .getExtension("WEBGL_lose_context")!,
    };
    canvas
      .getContext("webgl")!
      .getExtension("WEBGL_lose_context")!
      .loseContext();
  });
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).restoring.canvas.dataset.effectRenderer,
      ),
    )
    .toBe("webgl-lost");
  await page.evaluate(() =>
    (window as any).restoring.extension.restoreContext(),
  );
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).restoring.canvas.dataset.effectRenderer,
      ),
    )
    .toBe("webgl");
  const pixels = await page.evaluate(() => {
    const { canvas, painter: g, image } = (window as any).restoring;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, 64, 64);
    g.globalAlpha = 1;
    g.drawImage(image, 0, 0, 32, 32);
    g.present();
    const copy = document.createElement("canvas");
    copy.width = copy.height = 64;
    const c = copy.getContext("2d")!;
    c.drawImage(canvas, 0, 0);
    return [...c.getImageData(10, 10, 1, 1).data];
  });
  expect(pixels).toEqual([0, 0, 0, 255]);
});

test("unavailable WebGL retains the original Canvas2D effects", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      type: any,
      ...args: any[]
    ): any {
      if (type === "webgl" || type === "webgl2") return null;
      return (get as any).call(this, type, ...args);
    };
  });
  await page.goto("/e2e/fixtures/effect-viewport.html");
  const result = await page.evaluate(() => {
    const { atmosphere: a, festival: f, board } = (window as any).effects;
    a.set(20, true, false);
    f.setPalette(5);
    f.burst(board, [6, 7], 2, true, false, undefined, 110, 2);
    a.draw(performance.now() + 17);
    f.draw(performance.now() + 17);
    return {
      backends: [
        a.canvas.dataset.effectRenderer,
        f.canvas.dataset.effectRenderer,
      ],
      sparks: f.sparks.length,
    };
  });
  expect(result).toEqual({ backends: ["canvas2d", "canvas2d"], sparks: 110 });
});
