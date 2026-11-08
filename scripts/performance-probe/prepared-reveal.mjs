// Experimental only. The production app never imports this module.
import Phaser from "phaser";
const START = 400,
  END = 1000,
  COUNT = 36,
  STEP = 1000 / 60,
  PAD = 2;
export class PreparedReveal {
  constructor() {
    this.ready = false;
    this.enabled = false;
    this.baking = false;
    this.capture = null;
    this.images = [];
    this.sourcePixels = new Map();
    this.scratch = document.createElement("canvas");
    this.scratch.width = this.scratch.height = 512;
  }
  hide() {
    this.normalActive = false;
    for (const image of this.images) image.setVisible(false);
  }
  begin(scene, e, age) {
    if (!this.baking && this.ready && this.enabled && this.mode === "normal") {
      this.normalActive = true;
      const image = this.images[0],
        anchor = scene.ink.images[scene.ink.imageCursor];
      image
        .setFrame(
          String(
            Math.max(0, Math.min(COUNT - 1, Math.round((age - START) / STEP))),
          ),
        )
        .setVisible(true);
      if (anchor && image.__anchor !== anchor) {
        scene.children.moveTo(image, scene.children.getIndex(anchor));
        image.__anchor = anchor;
      }
      return false;
    }
    if (this.baking) {
      this.capture = {
        ink: scene.ink.imageCursor,
        wash: scene.ink.washCursor,
        fx: scene.vfx.cursor,
      };
      this.age = age;
      return false;
    }
    if (!this.ready || !this.enabled) return false;
    const index = Math.max(
      0,
      Math.min(COUNT - 1, Math.round((age - START) / STEP)),
    );
    const anchors = [
      scene.ink.images[scene.ink.imageCursor],
      scene.vfx.pool[scene.vfx.cursor],
    ];
    this.images.forEach((image, i) => {
      image.setFrame(String(index)).setVisible(true);
      if (anchors[i] && image.__anchor !== anchors[i]) {
        scene.children.moveTo(image, scene.children.getIndex(anchors[i]));
        image.__anchor = anchors[i];
      }
    });
    return true;
  }
  end(scene) {
    if (!this.baking || !this.capture) return;
    const c = this.capture;
    this.groups = [
      scene.ink.images
        .slice(c.ink, scene.ink.imageCursor)
        .concat(scene.ink.washes.slice(c.wash, scene.ink.washCursor))
        .filter((s) => s.visible),
      scene.vfx.pool.slice(c.fx, scene.vfx.cursor).filter((s) => s.visible),
    ];
  }
  paint(ctx, s) {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.rotation || 0);
    if (s.type === "Rectangle") {
      ctx.globalAlpha = s.alpha * s.fillAlpha;
      ctx.fillStyle = "#" + s.fillColor.toString(16).padStart(6, "0");
      ctx.fillRect(-s.displayOriginX, -s.displayOriginY, s.width, s.height);
    } else {
      const f = s.frame,
        source = f.source.image,
        w = f.cutWidth,
        h = f.cutHeight,
        color = s.tintTopLeft & 0xffffff;
      let image = source,
        sx = f.cutX,
        sy = f.cutY;
      if (color !== 0xffffff) {
        const key = s.texture.key + ":" + f.name;
        let pixels = this.sourcePixels.get(key);
        if (!pixels) {
          const c = this.scratch.getContext("2d");
          c.clearRect(0, 0, 512, 512);
          c.drawImage(source, sx, sy, w, h, 0, 0, w, h);
          pixels = c.getImageData(0, 0, w, h);
          this.sourcePixels.set(key, pixels);
        }
        const tinted = new ImageData(new Uint8ClampedArray(pixels.data), w, h),
          rgb = [color >> 16, (color >> 8) & 255, color & 255];
        for (let i = 0; i < tinted.data.length; i += 4)
          for (let c = 0; c < 3; c++)
            tinted.data[i + c] = Math.round(
              (tinted.data[i + c] * rgb[c]) / 255,
            );
        const c = this.scratch.getContext("2d");
        c.clearRect(0, 0, 512, 512);
        c.putImageData(tinted, 0, 0);
        image = this.scratch;
        sx = sy = 0;
      }
      ctx.globalAlpha = s.alpha;
      ctx.drawImage(
        image,
        sx,
        sy,
        w,
        h,
        -s.originX * s.displayWidth,
        -s.originY * s.displayHeight,
        s.displayWidth,
        s.displayHeight,
      );
    }
    ctx.restore();
  }
  async setup(runtime, resolution = 256, mode = "both") {
    this.mode = mode;
    const layers = mode === "normal" ? [0] : [0, 1];
    const scene = runtime.scene,
      realNow = performance.now.bind(performance),
      started = realNow(),
      tile = resolution + PAD * 2,
      side = tile * 6;
    const gpuBytes = side * side * 4 * layers.length,
      estimatedCombinedBytes = gpuBytes * 2 + 4 * 1024 * 1024;
    if (estimatedCombinedBytes > 64 * 1024 * 1024)
      throw Error("Prepared atlas memory budget exceeded");
    await runtime.reset("allclear");
    await new Promise((r) => setTimeout(r, 2100));
    if (window.__probeOptions.canvas) {
      scene.game.scale.resize(
        window.__probeOptions.canvas,
        window.__probeOptions.canvas,
      );
      scene.syncResolution();
    }
    await runtime.trigger("allclear");
    await new Promise((r) => setTimeout(r, 350));
    scene.game.loop.sleep();
    const own = Object.getOwnPropertyDescriptor(performance, "now");
    const e = scene.impacts.find((e) => e.allClear);
    if (!e) throw Error("No preparation impact");
    const canvases = layers.map(() => {
      const c = document.createElement("canvas");
      c.width = c.height = side;
      return c;
    });
    const base = e.started;
    this.baking = true;
    try {
      Object.defineProperty(performance, "now", {
        configurable: true,
        value: () => this.clock,
      });
      scene.themeAt = base + 320;
      for (let index = 0; index < COUNT; index++) {
        this.clock = base + START + index * STEP;
        this.groups = null;
        scene.draw();
        if (!this.groups) throw Error("Reveal capture hook did not run");
        for (let layer = 0; layer < layers.length; layer++) {
          const ctx = canvases[layer].getContext("2d");
          ctx.save();
          ctx.translate(
            (index % 6) * tile + PAD,
            Math.floor(index / 6) * tile + PAD,
          );
          ctx.scale(resolution / 512, resolution / 512);
          ctx.beginPath();
          ctx.rect(0, 0, 512, 512);
          ctx.clip();
          ctx.globalCompositeOperation =
            layer === 1 ? "lighter" : "source-over";
          for (const sprite of this.groups[layer]) this.paint(ctx, sprite);
          ctx.restore();
        }
      }
    } finally {
      this.baking = false;
      if (own) Object.defineProperty(performance, "now", own);
      else delete performance.now;
      scene.game.loop.wake();
    }
    canvases.forEach((canvas, layer) => {
      const key = "prepared-reveal-" + layer;
      scene.textures.addCanvas(key, canvas);
      const texture = scene.textures.get(key);
      for (let i = 0; i < COUNT; i++)
        texture.add(
          String(i),
          0,
          (i % 6) * tile + PAD,
          Math.floor(i / 6) * tile + PAD,
          resolution,
          resolution,
        );
      const image = scene.add
        .image(0, 0, key, "0")
        .setOrigin(0)
        .setDisplaySize(512, 512)
        .setDepth(layer === 0 ? 1 : 3)
        .setVisible(false);
      if (layer === 1) image.setBlendMode(Phaser.BlendModes.ADD);
      this.images.push(image);
    });
    this.ready = true;
    this.sourcePixels.clear();
    this.stats = {
      resolution,
      mode,
      blendMode: scene.game.renderer.blendModes[Phaser.BlendModes.ADD],
      frames: COUNT,
      fps: 60,
      normalCpuPreparationSkipped: true,
      windowMs: [START, END],
      gpuBytes,
      estimatedCombinedBytes,
      preparationMs: realNow() - started - 2450,
      additionalEncodedAssetBytes: 0,
    };
    await runtime.reset("allclear");
    return this.stats;
  }
  async assess(runtime) {
    const scene = runtime.scene;
    await runtime.reset("allclear");
    await new Promise((r) => setTimeout(r, 2100));
    if (window.__probeOptions.canvas) {
      scene.game.scale.resize(
        window.__probeOptions.canvas,
        window.__probeOptions.canvas,
      );
      scene.syncResolution();
    }
    await runtime.trigger("allclear");
    await new Promise((r) => setTimeout(r, 350));
    scene.game.loop.sleep();
    const own = Object.getOwnPropertyDescriptor(performance, "now"),
      base = scene.impacts.find((e) => e.allClear).started;
    const gl = scene.game.renderer.gl,
      w = scene.game.canvas.width,
      h = scene.game.canvas.height;
    const rows = [];
    try {
      Object.defineProperty(performance, "now", {
        configurable: true,
        value: () => this.clock,
      });
      scene.themeAt = base + 320;
      for (const age of [
        400, 408.333, 450, 458.333, 650, 658.333, 800, 808.333, 950, 958.333,
        990,
      ]) {
        this.clock = base + age;
        const frames = [];
        for (const enabled of [false, true]) {
          this.enabled = enabled;
          scene.draw();
          scene.game.step(this.clock, 1000 / 60);
          const bytes = new Uint8Array(w * h * 4);
          gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
          frames.push(bytes);
          if (window.__probeOptions.saveQualityFrames && age === 650) {
            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d"),
              image = ctx.createImageData(w, h);
            for (let y = 0; y < h; y++)
              for (let x = 0; x < w; x++) {
                const src = ((h - 1 - y) * w + x) * 4,
                  dst = (y * w + x) * 4,
                  alpha = bytes[src + 3] / 255;
                for (let c = 0; c < 3; c++)
                  image.data[dst + c] = Math.min(
                    255,
                    Math.round(
                      bytes[src + c] + [70, 100, 122][c] * (1 - alpha),
                    ),
                  );
                image.data[dst + 3] = 255;
              }
            ctx.putImageData(image, 0, 0);
            this.snapshots ??= {};
            this.snapshots[enabled ? "prepared" : "control"] =
              canvas.toDataURL("image/png");
          }
        }
        const histogram = new Uint32Array(256);
        let total = 0,
          max = 0,
          over24 = 0;
        for (let p = 0; p < frames[0].length; p += 4)
          for (let c = 0; c < 3; c++) {
            // Composite both premultiplied WebGL buffers over the same field color.
            const bg = [70, 100, 122][c],
              a = frames[0][p + c] + bg * (1 - frames[0][p + 3] / 255),
              b = frames[1][p + c] + bg * (1 - frames[1][p + 3] / 255),
              delta = Math.min(255, Math.round(Math.abs(a - b)));
            total += delta;
            max = Math.max(max, delta);
            histogram[delta]++;
            if (delta > 24) over24++;
          }
        const count = w * h * 3;
        let n = 0,
          p99 = 0;
        for (let i = 0; i < 256; i++) {
          n += histogram[i];
          if (n >= count * 0.99) {
            p99 = i;
            break;
          }
        }
        rows.push({
          age,
          max,
          mae: total / count,
          p99,
          over24: over24 / count,
        });
      }
    } finally {
      this.enabled = false;
      this.hide();
      if (own) Object.defineProperty(performance, "now", own);
      else delete performance.now;
      scene.game.loop.wake();
      await runtime.reset("allclear");
    }
    this.quality = rows;
    return rows;
  }
}
