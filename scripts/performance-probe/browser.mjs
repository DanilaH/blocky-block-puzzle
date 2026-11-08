import Phaser from "phaser";
import { PreparedReveal } from "./prepared-reveal.mjs";
import { SpriteInk, prepareEnergyBorder } from "../../src/game/sprite-ink";
// Diagnostic-only import, injected by the audit's Vite plugin. Never in the app build.
export function installProbe({ BoardScene }) {
  const probe = (window.__perfProbe = {
    current: null,
    bootGL: {},
    scene: null,
    runtime: null,
    mark(name, detail = {}) {
      if (!this.current) return;
      const at = performance.now();
      this.current.marks.push({ name, at, ...detail });
      performance.mark(`probe:${name}`);
    },
  });
  if (window.__probeOptions.preparedRevealStudy)
    window.__preparedReveal = new PreparedReveal();
  const names = [
    "drawElements",
    "drawArrays",
    "texImage2D",
    "texSubImage2D",
    "bufferData",
    "bufferSubData",
    "compileShader",
    "linkProgram",
    "readPixels",
    "finish",
  ];
  const setBlendMode = Phaser.GameObjects.Image.prototype.setBlendMode;
  Phaser.GameObjects.Image.prototype.setBlendMode = function (mode) {
    if (
      mode === Phaser.BlendModes.ADD &&
      this.scene.__properAdd !== undefined &&
      (this.texture.key.startsWith("vfx-") ||
        this.texture.key.startsWith("prepared-reveal-"))
    )
      return setBlendMode.call(this, this.scene.__properAdd);
    return setBlendMode.call(this, mode);
  };
  for (const proto of [
    window.WebGLRenderingContext?.prototype,
    window.WebGL2RenderingContext?.prototype,
  ]) {
    if (!proto) continue;
    for (const name of names) {
      if (!Object.hasOwn(proto, name)) continue;
      const original = proto[name];
      proto[name] = function (...args) {
        if (
          name === "compileShader" &&
          this.getShaderSource(args[0])?.includes(
            "if (fragColor.a <= 0.0) discard;",
          )
        )
          probe.discardShaderCompiled = true;
        const target = probe.current;
        const counts = target ? target.gl : probe.bootGL;
        counts[name] = (counts[name] || 0) + 1;
        if (target && probe.frame)
          probe.frame.calls[name] = (probe.frame.calls[name] || 0) + 1;
        return original.apply(this, args);
      };
    }
  }
  // Candidate: one startup atlas, retaining stamp/display order and blend modes.
  // Diagnostic only until performance and pixel comparisons pass.
  const setTexture = Phaser.GameObjects.Image.prototype.setTexture;
  Phaser.GameObjects.Image.prototype.setTexture = function (
    key,
    frame,
    ...args
  ) {
    if (
      this.scene?.__vfxAtlas &&
      typeof key === "string" &&
      key.startsWith("vfx-") &&
      key !== "vfx-probe-atlas"
    )
      return setTexture.call(this, "vfx-probe-atlas", key.slice(4), ...args);
    return setTexture.call(this, key, frame, ...args);
  };
  const imageInk = SpriteInk.prototype.image;
  SpriteInk.prototype.image = function (
    frame,
    x,
    y,
    w,
    h,
    color,
    alpha,
    rotation = 0,
    key = "board-primitives",
  ) {
    if (!this.scene.textures.get(key).has(frame))
      throw new Error("Probe missing texture frame: " + key + "/" + frame);
    const trim =
      key === "board-primitives" ? this.scene.__tightInkFrames?.[frame] : null;
    if (trim?.empty) return this;
    if (trim) {
      const dx = w * trim.left,
        dy = h * trim.top;
      const cos = rotation ? Math.cos(rotation) : 1;
      const sin = rotation ? Math.sin(rotation) : 0;
      return imageInk.call(
        this,
        trim.frame,
        x + dx * cos - dy * sin,
        y + dx * sin + dy * cos,
        w * trim.width,
        h * trim.height,
        color,
        alpha,
        rotation,
        key,
      );
    }
    return imageInk.call(this, frame, x, y, w, h, color, alpha, rotation, key);
  };
  // Candidate: retain the full-board wash as a solid Flat-family rectangle,
  // with the same color/alpha/geometry and display-list position as its Image.
  const fillRect = SpriteInk.prototype.fillRect;
  SpriteInk.prototype.fillRect = function (x, y, w, h) {
    if (
      window.__probeOptions.noWash &&
      x === 0 &&
      y === 0 &&
      w === 512 &&
      h === 512
    )
      return this;
    const previous = this.imageCursor;
    const result = fillRect.call(this, x, y, w, h);
    if (this.useFlatWash) return result;
    if (
      (window.__probeOptions.flatAll ||
        (window.__probeOptions.flatWash &&
          x === 0 &&
          y === 0 &&
          w === 512 &&
          h === 512)) &&
      this.imageCursor > previous
    ) {
      const sprite = this.images[this.imageCursor - 1];
      const wash = window.__probeOptions.flatAll
        ? this.scene.__flatRects[this.imageCursor - 1]
        : this.scene.__flatWash;
      if (wash) {
        sprite.setVisible(false);
        wash
          .setPosition(x, y)
          .setSize(w, h)
          .setFillStyle(this.fillColor, this.fillAlpha)
          .setVisible(true);
        if (wash.__source !== sprite) {
          this.scene.children.moveTo(
            wash,
            this.scene.children.getIndex(sprite),
          );
          wash.__source = sprite;
        }
      }
    }
    return result;
  };
  const strokeRoundedRect = SpriteInk.prototype.strokeRoundedRect;
  SpriteInk.prototype.strokeRoundedRect = function (x, y, w, h, r) {
    if (window.__probeOptions.noPerimeters && w > 400 && h > 400) return this;
    return strokeRoundedRect.call(this, x, y, w, h, r);
  };
  const clearInk = SpriteInk.prototype.clear;
  SpriteInk.prototype.clear = function () {
    this.scene.__flatWash?.setVisible(false);
    this.scene.__flatRects?.forEach((r) => r.setVisible(false));
    return clearInk.call(this);
  };
  const create = BoardScene.prototype.create;
  BoardScene.prototype.create = function (...args) {
    const result = create.apply(this, args);
    probe.scene = this;
    if (window.__probeOptions.properAdd) {
      const gl = this.game.renderer.gl;
      this.__properAdd = this.game.renderer.addBlendMode(
        [gl.ONE, gl.ONE, gl.ONE, gl.ONE],
        gl.FUNC_ADD,
      );
    }
    if (window.__probeOptions.opaqueField) {
      // Diagnostic only: put an opaque grid below WebGL effects, retaining an
      // RGBA context. This changes destination alpha and is NOT a visual match.
      const texture = this.textures.createCanvas(
        "probe-opaque-field",
        512,
        512,
      );
      const ctx = texture.context;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, 512, 512);
      ctx.fillStyle = "#eeeeee";
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 8; x++) {
          ctx.beginPath();
          ctx.roundRect(x * 64 + 1, y * 64 + 1, 62, 62, 3);
          ctx.fill();
        }
      texture.refresh();
      this.__opaqueField = this.add
        .image(0, 0, "probe-opaque-field")
        .setOrigin(0)
        .setDepth(-1);
    }
    if (!window.__probeOptions.oldEnergyBorder) prepareEnergyBorder(this);
    if (window.__probeOptions.tightInk) {
      const texture = this.textures.get("board-primitives");
      const canvas = texture.getSourceImage();
      const pixels = canvas
        .getContext("2d")
        .getImageData(0, 0, canvas.width, canvas.height).data;
      this.__tightInkFrames = {};
      for (const [name, f] of Object.entries({ ...texture.frames })) {
        if (name === "__BASE" || name === "pixel") continue;
        let left = f.cutWidth,
          top = f.cutHeight,
          right = -1,
          bottom = -1;
        for (let y = 0; y < f.cutHeight; y++)
          for (let x = 0; x < f.cutWidth; x++)
            if (
              pixels[((f.cutY + y) * canvas.width + f.cutX + x) * 4 + 3] > 0
            ) {
              left = Math.min(left, x);
              top = Math.min(top, y);
              right = Math.max(right, x);
              bottom = Math.max(bottom, y);
            }
        if (right < 0) {
          this.__tightInkFrames[name] = { empty: true };
          continue;
        }
        left = Math.max(0, left - 2);
        top = Math.max(0, top - 2);
        right = Math.min(f.cutWidth - 1, right + 2);
        bottom = Math.min(f.cutHeight - 1, bottom + 2);
        if (
          left === 0 &&
          top === 0 &&
          right === f.cutWidth - 1 &&
          bottom === f.cutHeight - 1
        )
          continue;
        const frame = "tight-" + name;
        texture.add(
          frame,
          0,
          f.cutX + left,
          f.cutY + top,
          right - left + 1,
          bottom - top + 1,
        );
        this.__tightInkFrames[name] = {
          frame,
          left: left / f.cutWidth,
          top: top / f.cutHeight,
          width: (right - left + 1) / f.cutWidth,
          height: (bottom - top + 1) / f.cutHeight,
        };
      }
    }
    if (window.__probeOptions.discardZero) {
      this.game.renderer.renderNodes
        .getNode("BatchHandlerQuad")
        .programManager.addAddition({
          name: "ProbeDiscardZero",
          additions: { fragmentProcess: "if (fragColor.a <= 0.0) discard;" },
        });
    }
    if (window.__probeOptions.vfxAtlas) {
      const atlas = this.textures.createCanvas("vfx-probe-atlas", 512, 752);
      for (const [kind, x, y] of [
        ["ring", 2, 2],
        ["streak", 2, 508],
        ["flash", 2, 571],
        ["chip", 188, 571],
      ]) {
        const image = this.textures.get("vfx-" + kind).getSourceImage();
        atlas.context.drawImage(image, x, y);
        atlas.add(kind, 0, x, y, image.width, image.height);
      }
      atlas.refresh();
      this.__vfxAtlas = true;
    }
    if (window.__probeOptions.flatWash && !this.ink.useFlatWash)
      this.__flatWash = this.add
        .rectangle(0, 0, 512, 512, 0xffffff)
        .setOrigin(0)
        .setDepth(1)
        .setVisible(false);
    if (window.__probeOptions.flatAll)
      this.__flatRects = Array.from({ length: 512 }, () =>
        this.add
          .rectangle(0, 0, 1, 1, 0xffffff)
          .setOrigin(0)
          .setDepth(1)
          .setVisible(false),
      );
    const game = this.game;
    if (window.__probeOptions.noRender)
      game.scene.render = function () {
        this.isProcessing = false;
      }; // Diagnostic blank output; updates still run.
    game.events.on("prestep", () => {
      if (probe.current) probe.stepAt = performance.now();
    });
    game.events.on("poststep", () => {
      if (probe.current)
        probe.current.steps.push({
          at: performance.now(),
          ms: performance.now() - probe.stepAt,
        });
    });
    game.events.on("prerender", () => {
      if (probe.current) probe.frame = { at: performance.now(), calls: {} };
    });
    game.events.on("postrender", () => {
      if (probe.current && probe.frame) {
        probe.frame.ms = performance.now() - probe.frame.at;
        probe.current.renders.push(probe.frame);
      }
      probe.frame = null;
    });
    return result;
  };
  for (const name of ["draw", "setTheme", "impact", "setState"]) {
    const original = BoardScene.prototype[name];
    BoardScene.prototype[name] = function (...args) {
      const at = performance.now();
      if (name === "setTheme" && args[0] !== this.theme)
        probe.mark("theme-start", { theme: args[0] });
      if (name === "impact") probe.mark("impact-start");
      if (
        name === "setState" &&
        this.state?.gameId === args[0]?.gameId &&
        this.state?.moves !== args[0]?.moves
      )
        probe.mark("published-state", { moves: args[0].moves });
      if (name === "draw") window.__preparedReveal?.hide();
      const result = original.apply(this, args);
      if (name === "draw" && this.__opaqueField)
        this.__opaqueField.setTint(this.bedColor);
      if (name === "draw" && window.__probeOptions.noInk)
        this.ink.setVisible(false);
      if (name === "draw" && window.__probeOptions.noVfx) this.vfx?.clear();
      if (name === "draw" && probe.current)
        probe.current.draws.push({ at, ms: performance.now() - at });
      return result;
    };
  }
  for (const type of ["longtask", "long-animation-frame"]) {
    if (!PerformanceObserver.supportedEntryTypes.includes(type)) continue;
    new PerformanceObserver((list) => {
      if (!probe.current) return;
      for (const entry of list.getEntries()) {
        if (entry.startTime >= probe.current.start)
          probe.current.long.push({
            type,
            at: entry.startTime,
            ms: entry.duration,
            renderStart: entry.renderStart,
            styleAndLayoutStart: entry.styleAndLayoutStart,
          });
      }
    }).observe({ type, buffered: false });
  }
  probe.manifest = () => {
    const scene = probe.scene,
      game = scene.game,
      renderer = game.renderer,
      gl = renderer.gl;
    const extension = gl?.getExtension("WEBGL_debug_renderer_info");
    return {
      userAgent: navigator.userAgent,
      viewport: [innerWidth, innerHeight],
      dpr: devicePixelRatio,
      phaserVersion: "4.2.1",
      desktop: game.device.os.desktop,
      android: game.device.os.android,
      autoMobileTextures: game.config.autoMobileTextures,
      maxTextures: renderer.maxTextures,
      maxParallelTextureUnits: renderer.renderNodes?.maxParallelTextureUnits,
      canvas: [game.canvas.width, game.canvas.height],
      camera: {
        width: scene.cameras.main.width,
        height: scene.cameras.main.height,
        zoom: scene.cameras.main.zoom,
      },
      flatWashIntegrated: !!scene.ink.useFlatWash,
      vfxBlendFunction:
        renderer.blendModes[scene.__properAdd ?? Phaser.BlendModes.ADD],
      glAttributes: gl?.getContextAttributes(),
      glRenderer: gl?.getParameter(
        extension ? extension.UNMASKED_RENDERER_WEBGL : gl.RENDERER,
      ),
      timerQueryAvailable: !!(
        gl?.getExtension("EXT_disjoint_timer_query") ||
        gl?.getExtension("EXT_disjoint_timer_query_webgl2")
      ),
      fpsLimit: game.loop.fpsLimit,
      bootGL: { ...probe.bootGL },
      inkFrameAreas: Object.values(
        scene.textures.get("board-primitives").frames,
      )
        .filter((f) => f.name !== "__BASE")
        .reduce(
          (sum, f) => ({
            cut: sum.cut + f.cutWidth * f.cutHeight,
            logical: sum.logical + f.realWidth * f.realHeight,
          }),
          { cut: 0, logical: 0 },
        ),
      discardAdditionEnabled: !!renderer.renderNodes
        .getNode("BatchHandlerQuad")
        .programManager.getAddition("ProbeDiscardZero"),
      discardShaderCompiled: !!probe.discardShaderCompiled,
    };
  };
  probe.run = async function (kind, duration = 2200) {
    const manifest = this.manifest(); // Hardware getters are outside measurement.
    const current = (this.current = {
      start: performance.now(),
      kind,
      marks: [],
      gl: {},
      draws: [],
      renders: [],
      steps: [],
      raf: [],
      long: [],
    });
    performance.mark("probe:start");
    let last = null,
      job;
    const tick = (at) => {
      if (last !== null) current.raf.push({ at, ms: at - last });
      last = at;
      job = requestAnimationFrame(tick);
      if (window.__probeOptions.drag) {
        this.scene.preview({ slot: 1, x: Math.floor((at / 120) % 7), y: 3 });
        // Synthetic scene preview isolates the renderer; no claim of real touch latency.
      }
    };
    job = requestAnimationFrame(tick);
    const timer = new Promise((resolve) => setTimeout(resolve, duration));
    this.mark("trigger");
    const triggered = this.runtime
      .trigger(kind)
      .then(() => this.mark("trigger-resolved"));
    await Promise.all([triggered, timer]);
    cancelAnimationFrame(job);
    current.end = performance.now();
    performance.mark("probe:end");
    this.current = null;
    this.frame = null;
    current.manifest = manifest;
    current.final = this.runtime.state();
    return current;
  };
}
export function attachRuntime(runtime) {
  const probe = window.__perfProbe;
  probe.runtime = runtime;
  if (window.__probeOptions.noDomMaterial) runtime.tileMaterials.set = () => {};
  if (window.__probeOptions.noFieldTheme) runtime.scene.setTheme = () => {};
  if (window.__probeOptions.noCssTransitions) {
    const style = document.createElement("style");
    style.textContent = "*,*::before,*::after{transition:none!important}";
    document.head.append(style);
  }
  if (window.__probeOptions.noFestival) runtime.festival.burst = () => {};
  if (window.__probeOptions.noAmbient)
    runtime.atmosphere.draw = function () {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    };
  const update = runtime.store.update.bind(runtime.store);
  runtime.store.update = async function (...args) {
    const result = await update(...args);
    if (result) probe.mark("durable-save", { reason: args[1] ?? null });
    return result;
  };
}
