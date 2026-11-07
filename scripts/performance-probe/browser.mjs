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
  for (const proto of [
    window.WebGLRenderingContext?.prototype,
    window.WebGL2RenderingContext?.prototype,
  ]) {
    if (!proto) continue;
    for (const name of names) {
      if (!Object.hasOwn(proto, name)) continue;
      const original = proto[name];
      proto[name] = function (...args) {
        const target = probe.current;
        const counts = target ? target.gl : probe.bootGL;
        counts[name] = (counts[name] || 0) + 1;
        if (target && probe.frame)
          probe.frame.calls[name] = (probe.frame.calls[name] || 0) + 1;
        return original.apply(this, args);
      };
    }
  }
  const create = BoardScene.prototype.create;
  BoardScene.prototype.create = function (...args) {
    const result = create.apply(this, args);
    probe.scene = this;
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
      const result = original.apply(this, args);
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
