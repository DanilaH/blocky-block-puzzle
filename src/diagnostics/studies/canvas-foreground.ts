import { ThemeInkStudy } from "./theme-ink";
import { SpriteGpu } from "./sprite-gpu";
import { PhaserForeground } from "./phaser-foreground";
import type Phaser from "phaser";
import type { BoardScene } from "../../game/BoardScene";
// Experimental renderer, loaded only by scripts/study-foreground.mjs.
// Gameplay, score arrival and effect lifetimes remain owned by main.ts.
type Host = {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  studyWake(): void;
  studyPaint?: (ctx: CanvasRenderingContext2D, now: number) => boolean;
  studyStop?: () => void;
};
type Track = { animation: Animation; frames: ComputedKeyframe[] };
type Sprite = {
  image: ImageBitmap;
  width: number;
  height: number;
  pad: number;
  source?: { x: number; y: number; width: number; height: number };
};
type Part = {
  element: HTMLElement;
  x: number;
  y: number;
  width: number;
  height: number;
  children: Part[];
  sprite?: Sprite;
  baseTransform: string;
  origin: number[];
  filter: string;
  buffer?: HTMLCanvasElement;
};
type Item = {
  element: HTMLElement;
  root: Part;
  x: number;
  y: number;
  ready: boolean;
  pseudo?: Part;
};
const escape = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const css = (s: CSSStyleDeclaration) =>
  Array.from(s)
    .filter(
      (k) =>
        !k.startsWith("animation") &&
        !k.startsWith("transition") &&
        ![
          "transform",
          "opacity",
          "visibility",
          "position",
          "left",
          "top",
          "right",
          "bottom",
          "margin",
          "filter",
        ].includes(k),
    )
    .map((k) => `${k}:${s.getPropertyValue(k)};`)
    .join("");
const ease = (name: string, t: number) => {
  if (name === "linear" || !name) return t;
  const values: Record<string, number[]> = {
    ease: [0.25, 0.1, 0.25, 1],
    "ease-in": [0.42, 0, 1, 1],
    "ease-out": [0, 0, 0.58, 1],
    "ease-in-out": [0.42, 0, 0.58, 1],
  };
  const b =
    values[name] ??
    name
      .match(/cubic-bezier\(([^)]+)\)/)?.[1]
      ?.split(",")
      .map(Number);
  if (!b) return t;
  const cubic = (u: number, a: number, c: number) =>
    3 * (1 - u) * (1 - u) * u * a + 3 * (1 - u) * u * u * c + u * u * u;
  let lo = 0,
    hi = 1;
  for (let i = 0; i < 18; i++) {
    const m = (lo + hi) / 2;
    if (cubic(m, b[0]!, b[2]!) < t) lo = m;
    else hi = m;
  }
  return cubic((lo + hi) / 2, b[1]!, b[3]!);
};
function transform(value: string, w: number, h: number) {
  const v = { x: 0, y: 0, r: 0, sx: 1, sy: 1 };
  for (const m of value.matchAll(
    /(translateX|translateY|translate|rotate|scaleX|scaleY|scale)\(([^)]+)\)/g,
  )) {
    const a = m[2]!.split(/[, ]+/).filter(Boolean),
      n = (i: number, size: number) =>
        parseFloat(a[i] ?? "0") * (a[i]?.includes("%") ? size / 100 : 1);
    switch (m[1]) {
      case "translate":
        v.x = n(0, w);
        v.y = n(1, h);
        break;
      case "translateX":
        v.x = n(0, w);
        break;
      case "translateY":
        v.y = n(0, h);
        break;
      case "rotate":
        v.r = n(0, 1);
        break;
      case "scale":
        v.sx = n(0, 1);
        v.sy = a[1] ? n(1, 1) : v.sx;
        break;
      case "scaleX":
        v.sx = n(0, 1);
        break;
      case "scaleY":
        v.sy = n(0, 1);
        break;
    }
  }
  return v;
}
export class CanvasForegroundStudy {
  readonly isShared =
    new URLSearchParams(location.search).get("studyRenderer") === "phaser";
  private shared?: PhaserForeground;
  private sharedGame?: Phaser.Game;
  private boardShakes = 0;
  private renderStart = 0;
  private renderTimes: number[] = [];
  private gpu?: SpriteGpu;
  private host: Host;
  private ink: ThemeInkStudy;
  private items = new Map<HTMLElement, Item>();
  private tracks = new Map<HTMLElement, Track[]>();
  private baselines = new Map<string, number>();
  private atlases = new Map<string, Promise<void>>();
  private identities = new WeakMap<Sprite, number>();
  private nextIdentity = 0;
  private cache = new Map<string, Promise<Sprite>>();
  private errors: string[] = [];
  private prepared = 0;
  private draws = 0;
  private preparations: number[] = [];
  constructor(
    host: unknown,
    readonly rewards: boolean,
    readonly nativePixels: boolean,
    theme = false,
  ) {
    this.host = host as Host;
    if (this.isShared && theme)
      throw Error("Shared ink study is outside this reward-only experiment");
    if (
      rewards &&
      new URLSearchParams(location.search).get("studyRenderer") === "webgl"
    ) {
      if (theme) throw Error("GPU ink is outside this reward-only experiment");
      this.gpu = new SpriteGpu(this.host.canvas);
    }
    this.ink = new ThemeInkStudy(
      theme,
      () => this.wake(),
      nativePixels ? devicePixelRatio : 1.5,
    );
    if ((rewards || theme) && !this.isShared) {
      this.host.studyPaint = (g) => {
        if (!this.gpu) return this.draw(g);
        this.gpu.begin();
        const active = this.draw(
          this.gpu as unknown as CanvasRenderingContext2D,
        );
        this.gpu.end();
        return active;
      };
      this.host.studyStop = () => this.stop();
    }
    if (this.isShared) this.host.studyStop = () => this.stop();
    (window as any).__foregroundStudy = this;
  }
  snapshot() {
    return {
      active: this.items.size,
      prepared: this.prepared,
      draws: this.draws,
      cacheEntries: this.cache.size,
      preparationMs: [...this.preparations],
      errors: [...this.errors],
      backing: [this.host.canvas.width, this.host.canvas.height],
      nativePixels: this.nativePixels,
      ink: this.ink.snapshot(),
      gpu: this.gpu?.snapshot() ?? this.shared?.gpu?.snapshot(),
      shared: this.shared?.snapshot(),
      boardShakes: this.boardShakes,
      phaserRenderTimes: [...this.renderTimes],
    };
  }
  attachGame(game: Phaser.Game, scene: BoardScene, board: HTMLElement) {
    game.events.on("postrender", () => {
      if (this.renderStart)
        this.renderTimes.push(performance.now() - this.renderStart);
    });
    if (!this.isShared) return;
    this.sharedGame = game;
    this.shared = new PhaserForeground(
      game,
      scene,
      board,
      () => this.items.size > 0,
      (g) => {
        this.draw(g);
      },
      () => this.boardOffset(),
    );
  }
  resizeShared() {
    this.shared?.resize();
  }
  redrawShared() {
    this.shared?.redraw();
  }
  private wake() {
    if (!this.isShared) this.host.studyWake();
  }
  private boardOffset() {
    let x = 0,
      y = 0;
    for (const track of this.tracks.get(this.sharedGame?.canvas!) ?? []) {
      const p = track.animation.effect?.getComputedTiming().progress;
      if (p === null || p === undefined) continue;
      const frames = track.frames.filter((f) => "transform" in f);
      let i = 0;
      while (i < frames.length - 2 && p > frames[i + 1]!.computedOffset) i++;
      const a = frames[i],
        b = frames[i + 1];
      if (!a || !b) continue;
      const t =
          (p - a.computedOffset) /
          Math.max(0.000001, b.computedOffset - a.computedOffset),
        from = transform(String(a.transform), 512, 512),
        to = transform(String(b.transform), 512, 512);
      x = from.x + (to.x - from.x) * t;
      y = from.y + (to.y - from.y) * t;
    }
    return { x, y };
  }
  beginSample() {
    this.renderTimes = [];
    this.renderStart = performance.now();
    this.boardShakes = 0;
    this.draws = 0;
    this.prepared = 0;
    this.preparations = [];
    this.errors = [];
    this.ink.draws = 0;
    this.ink.preparations = [];
    this.ink.errors = [];
  }
  setText(e: HTMLElement, value: string) {
    this.ink.setText(e, value);
  }
  beforeTheme(index: number, active: boolean) {
    this.ink.before(index, active);
  }
  afterTheme() {
    this.ink.after();
  }
  seek(time: number) {
    this.ink.seek(time);
    for (const tracks of this.tracks.values())
      for (const track of tracks) {
        track.animation.pause();
        track.animation.currentTime = time;
      }
    if (this.isShared) {
      this.shared?.redraw();
    } else if (this.gpu) {
      this.gpu.begin();
      this.draw(this.gpu as unknown as CanvasRenderingContext2D);
      this.gpu.end();
    } else {
      this.host.ctx.clearRect(0, 0, innerWidth, innerHeight);
      this.draw(this.host.ctx);
    }
  }
  animate(
    target: Element,
    frames: Keyframe[],
    duration: number,
    delay: number,
  ) {
    if (
      !(this.isShared && target === this.sharedGame?.canvas) &&
      (!this.rewards || !target.closest(".reward-event,.hud-notice"))
    )
      return;
    if (this.isShared && target === this.sharedGame?.canvas) this.boardShakes++;
    const effect = new KeyframeEffect(null, frames, {
      duration,
      delay,
      easing: "cubic-bezier(.2,.8,.25,1)",
    });
    const animation = new Animation(effect, document.timeline);
    animation.play();
    const list = this.tracks.get(target as HTMLElement) ?? [];
    list.push({ animation, frames: effect.getKeyframes() });
    this.tracks.set(target as HTMLElement, list);
    return animation;
  }
  remove(element: HTMLElement) {
    const item = this.items.get(element);
    if (!item) return;
    const clear = (p: Part) => {
      for (const t of this.tracks.get(p.element) ?? []) t.animation.cancel();
      this.tracks.delete(p.element);
      p.children.forEach(clear);
    };
    clear(item.root);
    if (item.pseudo) clear(item.pseudo);
    this.items.delete(element);
  }
  stop() {
    this.gpu?.clear();
    this.ink.stop();
    for (const e of [...this.items.keys()]) this.remove(e);
    for (const ts of this.tracks.values())
      for (const t of ts) t.animation.cancel();
    this.tracks.clear();
  }
  capture(element: HTMLElement) {
    if (!this.rewards) return;
    const began = performance.now();
    const moving = element
      .getAnimations({ subtree: true })
      .filter((a) => a instanceof CSSAnimation);
    const pseudoTracks: Track[] = [];
    for (const a of moving) {
      const effect = a.effect as KeyframeEffect,
        target = effect.target as HTMLElement;
      const frames = effect.getKeyframes(),
        clone = new Animation(
          new KeyframeEffect(null, frames, effect.getTiming()),
          document.timeline,
        );
      clone.play();
      clone.startTime = a.startTime ?? document.timeline.currentTime;
      const track = { animation: clone, frames };
      if ((a as CSSAnimation).animationName === "reward-motif-44")
        pseudoTracks.push(track);
      else {
        const list = this.tracks.get(target) ?? [];
        list.push(track);
        this.tracks.set(target, list);
      }
      a.cancel();
    }
    const elements = [
      element,
      ...Array.from(element.querySelectorAll<HTMLElement>("*")),
    ];
    const original = new Map(elements.map((e) => [e, e.style.cssText]));
    for (const e of elements) {
      e.style.setProperty("transform", "none", "important");
      e.style.setProperty("opacity", "1", "important");
      e.style.setProperty("animation", "none", "important");
      e.style.setProperty("transition", "none", "important");
    }
    const box = element.getBoundingClientRect();
    const promises: Promise<void>[] = [];
    const make = (e: HTMLElement, parent: DOMRect): Part => {
      const s = getComputedStyle(e),
        b = e.getBoundingClientRect();
      const part: Part = {
        element: e,
        x: b.left - parent.left,
        y: b.top - parent.top,
        width: b.width,
        height: b.height,
        children: [],
        baseTransform: "none",
        origin: s.transformOrigin.split(" ").map(parseFloat),
        filter:
          new URLSearchParams(location.search).get("studyFilter") === "live"
            ? s.filter
            : "none",
      };
      if (e.children.length) {
        part.children = Array.from(e.children)
          .filter(
            (x): x is HTMLElement =>
              x instanceof HTMLElement &&
              getComputedStyle(x).display !== "none",
          )
          .map((c) => make(c, b));
      } else if (e.textContent?.trim())
        promises.push(
          this.sprite(
            e.textContent,
            s,
            b.width,
            b.height,
            false,
            new URLSearchParams(location.search).get("studyFilter") === "live"
              ? "none"
              : getComputedStyle(e.closest(".reward-praise") ?? e).filter,
          ).then((sprite) => {
            part.sprite = sprite;
          }),
        );
      return part;
    };
    const root = make(element, box);
    // Reward events use a static translate(-50%,-50%); notices are anchored by CSS.
    const reward = element.classList.contains("reward-event");
    const item: Item = {
      element,
      root,
      x: box.left - (reward ? box.width / 2 : 0),
      y: box.top - (reward ? box.height / 2 : 0),
      ready: false,
    };
    if (pseudoTracks.length) {
      const s = getComputedStyle(element, "::before"),
        w = parseFloat(s.width),
        h = parseFloat(s.height);
      const pseudo = document.createElement("span");
      const part: Part = {
        element: pseudo,
        x: box.width * 0.5,
        y: box.height * 0.35,
        width: w,
        height: h,
        children: [],
        baseTransform: "none",
        origin: [w / 2, h / 2],
        filter: "none",
      };
      this.tracks.set(pseudo, pseudoTracks);
      item.pseudo = part;
      promises.push(
        this.sprite("", s, w, h, true).then((sprite) => {
          part.sprite = sprite;
        }),
      );
    }
    for (const e of elements) {
      e.style.cssText = original.get(e)!;
      e.style.setProperty("animation", "none", "important");
      e.style.setProperty("transition", "none", "important");
    }
    element.style.setProperty("visibility", "hidden", "important");
    this.items.set(element, item);
    this.prepared++;
    void Promise.all(promises)
      .then(() =>
        new URLSearchParams(location.search).get("studyAtlas") === "off"
          ? undefined
          : this.atlas(item),
      )
      .then(() => {
        if (this.items.get(element) !== item) return;
        item.ready = true;
        this.preparations.push(performance.now() - began);
        this.wake();
      })
      .catch((e) => this.errors.push(String(e)));
    this.wake();
  }
  private atlas(item: Item): Promise<void> {
    const sprites: Sprite[] = [];
    const visit = (p: Part) => {
      if (p.sprite) sprites.push(p.sprite);
      p.children.forEach(visit);
    };
    visit(item.root);
    if (item.pseudo) visit(item.pseudo);
    for (const sprite of sprites)
      if (!this.identities.has(sprite))
        this.identities.set(sprite, ++this.nextIdentity);
    const key = sprites.map((s) => this.identities.get(s)).join(",");
    const cached = this.atlases.get(key);
    if (cached) return cached;
    const task = (async () => {
      const unique = [...new Set(sprites)].filter((s) => !s.source);
      if (!unique.length) return;
      const width = Math.min(
        2048,
        Math.max(512, ...unique.map((s) => s.image.width + 2)),
      );
      let x = 1,
        y = 1,
        row = 0;
      const entries = [];
      for (const s of unique) {
        if (x + s.image.width + 1 > width) {
          x = 1;
          y += row + 2;
          row = 0;
        }
        entries.push({
          sprite: s,
          x,
          y,
          width: s.image.width,
          height: s.image.height,
        });
        x += s.image.width + 2;
        row = Math.max(row, s.image.height);
      }
      const c = new OffscreenCanvas(width, y + row + 1),
        g = c.getContext("2d")!;
      for (const e of entries) g.drawImage(e.sprite.image, e.x, e.y);
      const image = c.transferToImageBitmap();
      for (const e of entries) {
        e.sprite.image = image;
        e.sprite.source = { x: e.x, y: e.y, width: e.width, height: e.height };
      }
    })();
    this.atlases.set(key, task);
    return task;
  }
  private sprite(
    text: string,
    style: CSSStyleDeclaration,
    width: number,
    height: number,
    shape = false,
    bakeFilter = "none",
  ): Promise<Sprite> {
    if (style.textTransform === "uppercase")
      text = text.toLocaleUpperCase("ru");
    const shadowExtent = (value: string) => {
      let extent = 0;
      for (const m of value.matchAll(/rgba?\([^)]+\)([^,]*)/g)) {
        const ns = m[1]!.match(/-?[\d.]+px/g)?.map(parseFloat) ?? [];
        extent = Math.max(
          extent,
          Math.abs(ns[0] ?? 0),
          Math.abs(ns[1] ?? 0) + (ns[2] ?? 0) * 1.5,
        );
      }
      return extent;
    };
    const pad = shape
        ? 0
        : Math.ceil(shadowExtent(style.textShadow) + shadowExtent(bakeFilter)) +
          3,
      ratio = this.nativePixels ? devicePixelRatio : 1.5;
    const font = [
      "font-family",
      "font-size",
      "font-weight",
      "font-style",
      "font-stretch",
      "letter-spacing",
      "text-shadow",
    ]
      .map((k) => `${k}:${style.getPropertyValue(k)};`)
      .join("");
    const key = [
      text,
      font,
      style.color,
      style.backgroundColor,
      style.clipPath,
      style.backgroundImage,
      bakeFilter,
      width,
      height,
      ratio,
    ].join("|");
    const existing = this.cache.get(key);
    if (existing) return existing;
    let content = "";
    if (shape) {
      const colors = style.backgroundImage.match(/rgba?\([^)]+\)/g) ?? [];
      const points = style.clipPath
        .replace(/^polygon\(/, "")
        .replace(/\)$/, "")
        .split(",")
        .map((x) =>
          x
            .trim()
            .split(/\s+/)
            .map((n, i) => (parseFloat(n) * (i ? height : width)) / 100)
            .join(","),
        )
        .join(" ");
      const stops = colors
        .map(
          (c, i) =>
            `<stop offset="${i / (colors.length - 1)}" stop-color="${c}"/>`,
        )
        .join("");
      content = `<defs><linearGradient id="g" x1="0" y1="1" x2="1" y2="0">${stops}</linearGradient></defs><polygon points="${points}" fill="url(#g)"/>`;
    } else {
      const baselineKey = font + style.lineHeight + style.padding;
      let baseline = this.baselines.get(baselineKey);
      if (baseline === undefined) {
        const probe = document.createElement("span"),
          marker = document.createElement("span");
        probe.style.cssText = `position:fixed;left:-10000px;top:0;visibility:hidden;display:inline-block;white-space:pre;${font}line-height:${style.lineHeight};padding:${style.padding};`;
        marker.style.cssText =
          "display:inline-block;vertical-align:baseline;width:0;height:0;padding:0;margin:0";
        probe.append(document.createTextNode("Hg"), marker);
        document.body.append(probe);
        baseline =
          marker.getBoundingClientRect().top -
          probe.getBoundingClientRect().top;
        probe.remove();
        this.baselines.set(baselineKey, baseline);
      }
      const px = parseFloat(style.paddingLeft) || 0,
        py = parseFloat(style.paddingTop) || 0;
      const bg = style.backgroundColor;
      if (bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
        const radius = parseFloat(style.borderTopLeftRadius) || 0;
        const color = style.boxShadow.match(/rgba?\([^)]+\)/)?.[0];
        const nums =
          style.boxShadow
            .replace(/rgba?\([^)]+\)/g, "")
            .match(/-?[\d.]+px/g)
            ?.map(parseFloat) ?? [];
        if (color)
          content += `<rect x="${pad + (nums[0] ?? 0)}" y="${pad + (nums[1] ?? 0)}" width="${width}" height="${height}" rx="${radius}" fill="${color}"/>`;
        content += `<rect x="${pad}" y="${pad}" width="${width}" height="${height}" rx="${radius}" fill="${bg}"/>`;
      }
      content += `<text x="${pad + px}" y="${pad + baseline}" fill="${style.color}" style="${escape(font)}white-space:pre;filter:${escape(bakeFilter)}">${escape(text)}</text>`;
    }
    const promise = (async () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil((width + pad * 2) * ratio)}" height="${Math.ceil((height + pad * 2) * ratio)}" viewBox="0 0 ${width + pad * 2} ${height + pad * 2}">${content}</svg>`;
      const source = new Image();
      source.src =
        "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
      await source.decode();
      const buffer = new OffscreenCanvas(source.width, source.height);
      buffer.getContext("2d")!.drawImage(source, 0, 0);
      const image = buffer.transferToImageBitmap();
      return { image, width: width + pad * 2, height: height + pad * 2, pad };
    })();
    this.cache.set(key, promise);
    return promise;
  }
  private paintPart(g: CanvasRenderingContext2D, p: Part) {
    let alpha = Number(p.element.style.opacity || 1),
      matrix = transform(p.baseTransform, p.width, p.height);
    for (const track of this.tracks.get(p.element) ?? []) {
      const progress = track.animation.effect?.getComputedTiming().progress;
      if (progress === null || progress === undefined) continue;
      for (const property of ["opacity", "transform"]) {
        const frames = track.frames.filter((f) => property in f);
        if (frames.length < 2) continue;
        let i = 0;
        while (
          i < frames.length - 2 &&
          progress > frames[i + 1]!.computedOffset
        )
          i++;
        const a = frames[i]!,
          b = frames[i + 1]!;
        const f = ease(
          a.easing,
          Math.max(
            0,
            Math.min(
              1,
              (progress - a.computedOffset) /
                Math.max(0.000001, b.computedOffset - a.computedOffset),
            ),
          ),
        );
        if (property === "opacity")
          alpha = Number(a.opacity ?? 1) * (1 - f) + Number(b.opacity ?? 1) * f;
        else {
          const x = transform(String(a.transform ?? "none"), p.width, p.height),
            y = transform(String(b.transform ?? "none"), p.width, p.height);
          matrix = {
            x: x.x + (y.x - x.x) * f,
            y: x.y + (y.y - x.y) * f,
            r: x.r + (y.r - x.r) * f,
            sx: x.sx + (y.sx - x.sx) * f,
            sy: x.sy + (y.sy - x.sy) * f,
          };
        }
      }
    }
    g.save();
    g.translate(p.x, p.y);
    g.globalAlpha *= alpha;
    const ox = p.origin[0] ?? p.width / 2,
      oy = p.origin[1] ?? p.height / 2;
    g.translate(ox + matrix.x, oy + matrix.y);
    g.rotate((matrix.r * Math.PI) / 180);
    g.scale(matrix.sx, matrix.sy);
    g.translate(-ox, -oy);
    if (p.sprite) {
      const a = p.sprite.source;
      if (a)
        g.drawImage(
          p.sprite.image,
          a.x,
          a.y,
          a.width,
          a.height,
          -p.sprite.pad,
          -p.sprite.pad,
          p.sprite.width,
          p.sprite.height,
        );
      else
        g.drawImage(
          p.sprite.image,
          -p.sprite.pad,
          -p.sprite.pad,
          p.sprite.width,
          p.sprite.height,
        );
    }
    if (p.children.length && p.filter !== "none") {
      const pad = 40,
        ratio = this.nativePixels ? devicePixelRatio : 1.5;
      const buffer = p.buffer ?? (p.buffer = document.createElement("canvas"));
      if (
        !buffer.width ||
        buffer.width !== Math.ceil((p.width + pad * 2) * ratio)
      ) {
        buffer.width = Math.ceil((p.width + pad * 2) * ratio);
        buffer.height = Math.ceil((p.height + pad * 2) * ratio);
      }
      const b = buffer.getContext("2d")!;
      b.setTransform(ratio, 0, 0, ratio, pad * ratio, pad * ratio);
      b.clearRect(-pad, -pad, p.width + pad * 2, p.height + pad * 2);
      for (const child of p.children) this.paintPart(b, child);
      g.filter = p.filter;
      g.drawImage(buffer, -pad, -pad, p.width + pad * 2, p.height + pad * 2);
    } else for (const child of p.children) this.paintPart(g, child);
    g.restore();
  }
  private draw(g: CanvasRenderingContext2D) {
    const inkActive = this.ink.draw(g, performance.now());
    if (!this.items.size) return inkActive;
    this.draws++;
    g.save();
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
    for (const item of [...this.items.values()]) {
      if (!item.element.isConnected) {
        this.remove(item.element);
        continue;
      }
      if (!item.ready) continue;
      g.save();
      g.translate(item.x, item.y);
      if (item.pseudo && !item.element.classList.contains("yield-to-drag"))
        this.paintPart(g, item.pseudo);
      this.paintPart(g, item.root);
      g.restore();
    }
    g.restore();
    return this.items.size > 0 || inkActive;
  }
}
