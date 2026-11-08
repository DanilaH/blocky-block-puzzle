import { visualClock } from "./visual-clock";

type Shadow = { color: string; x: number; y: number; blur: number };
type CachedGlyph = { image: HTMLCanvasElement; bytes: number; refs: number };
type Glyph = {
  image: HTMLCanvasElement;
  entry: CachedGlyph;
  x: number;
  width: number;
};
type Label = {
  element: HTMLElement;
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  glyphs: Glyph[];
  width: number;
  height: number;
  pad: number;
  dpr: number;
  started: number;
  dancing: boolean;
  bytes: number;
};

function shadows(value: string): Shadow[] {
  if (value === "none") return [];
  const result: Shadow[] = [];
  const pattern =
    /(rgba?\([^)]*\))\s+(-?[\d.]+)px\s+(-?[\d.]+)px(?:\s+([\d.]+)px)?/g;
  for (const match of value.matchAll(pattern))
    result.push({
      color: match[1]!,
      x: +match[2]!,
      y: +match[3]!,
      blur: +(match[4] ?? 0),
    });
  if (!result.length) throw Error("Unsupported reward shadow");
  return result;
}

// CSS ease-in-out (.42,0,.58,1), including the negative per-letter delay.
export function letterPose(age: number, index: number) {
  const cycle = Math.max(0, age + index * 45) / 650;
  const fraction = cycle % 1;
  const x = Math.floor(cycle) % 2 ? 1 - fraction : fraction;
  let low = 0,
    high = 1;
  for (let i = 0; i < 14; i++) {
    const t = (low + high) / 2;
    const bx =
      3 * (1 - t) ** 2 * t * 0.42 + 3 * (1 - t) * t ** 2 * 0.58 + t ** 3;
    if (bx < x) low = t;
    else high = t;
  }
  const t = (low + high) / 2,
    eased = 3 * (1 - t) * t ** 2 + t ** 3;
  return { y: 1 - 5 * eased, angle: ((-3 + 6 * eased) * Math.PI) / 180 };
}

function surface(width: number, height: number, dpr: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(width * dpr));
  canvas.height = Math.max(1, Math.ceil(height * dpr));
  const context = canvas.getContext("2d");
  if (!context) throw Error("Reward Canvas2D unavailable");
  context.scale(dpr, dpr);
  return { canvas, context };
}

/** Bounded, event-local text rasters. No layout/style reads in the frame loop. */
export class RewardLabels {
  private labels = new Set<Label>();
  private frame: (() => void) | null = null;
  private stats = {
    prepared: 0,
    fallbacks: 0,
    prepareMs: 0,
    drawMs: 0,
    draws: 0,
    peakBytes: 0,
  };
  private bytes = 0;
  private cache = new Map<string, CachedGlyph>();
  private cacheBytes = 0;

  beginSample() {
    this.stats = {
      prepared: 0,
      fallbacks: 0,
      prepareMs: 0,
      drawMs: 0,
      draws: 0,
      peakBytes: this.bytes + this.cacheBytes,
    };
  }
  snapshot() {
    return {
      ...this.stats,
      active: this.labels.size,
      bytes: this.bytes + this.cacheBytes,
      activeBytes: this.bytes,
      cachedBytes: this.cacheBytes,
      clockActive: !!this.frame,
    };
  }

  prepare(element: HTMLElement, dancing: boolean) {
    const began = performance.now();
    const allocated: HTMLCanvasElement[] = [];
    const acquired: CachedGlyph[] = [];
    try {
      const lettered = element.firstElementChild?.tagName === "I";
      const style = getComputedStyle(
          lettered ? element.firstElementChild! : element,
        ),
        rect = element.getBoundingClientRect();
      const semanticText = element.textContent!;
      const text =
        style.textTransform === "uppercase"
          ? semanticText.toLocaleUpperCase("ru")
          : semanticText;
      if (!text || !rect.width || !rect.height) return () => {};
      const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const shade = shadows(style.textShadow);
      const filter = getComputedStyle(element).filter;
      const drop =
        filter === "none"
          ? []
          : shadows(filter.replace(/drop-shadow\((.*)\)$/, "$1"));
      const pad = Math.ceil(
        Math.max(
          4,
          ...[...shade, ...drop].map(
            (s) => Math.max(Math.abs(s.x), Math.abs(s.y)) + s.blur * 2,
          ),
        ) + 9,
      );
      const probe = document.createElement("canvas").getContext("2d")!;
      probe.font = font;
      probe.fontKerning = lettered ? "none" : "auto";
      const pieces = lettered ? Array.from(text) : [text];
      const widths = pieces.map((p) => probe.measureText(p).width);
      const total = widths.reduce((a, b) => a + b, 0);
      const width = rect.width,
        height = rect.height;
      const estimate = pieces.reduce(
        (n, _, i) => n + (widths[i]! + pad * 2) * (height + pad * 2),
        (width + pad * 2) * (height + pad * 2),
      );
      const dpr = Math.max(
        1,
        Math.min(3, devicePixelRatio, Math.sqrt((2 * 1024 * 1024) / estimate)),
      );
      const view = surface(width + pad * 2, height + pad * 2, dpr);
      allocated.push(view.canvas);
      const glyphs: Glyph[] = [];
      let x = (width - total) / 2;
      for (let i = 0; i < pieces.length; i++) {
        const part = pieces[i]!,
          w = widths[i]!;
        const key = JSON.stringify([
          font,
          lettered,
          part,
          height,
          pad,
          dpr,
          style.color,
          style.textShadow,
          filter,
        ]);
        let entry = this.cache.get(key);
        if (entry) {
          this.cache.delete(key);
          this.cache.set(key, entry);
          entry.refs++;
          acquired.push(entry);
          glyphs.push({ image: entry.image, entry, x, width: w });
          x += w;
          continue;
        }
        const ink = surface(w + pad * 2, height + pad * 2, dpr);
        allocated.push(ink.canvas);
        const ctx = ink.context;
        ctx.font = font;
        ctx.fontKerning = lettered ? "none" : "auto";
        const metrics = ctx.measureText(part);
        const ascent =
          metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent;
        const descent =
          metrics.fontBoundingBoxDescent ?? metrics.actualBoundingBoxDescent;
        const baseline = pad + (height - ascent - descent) / 2 + ascent;
        // Draw only the shadow into the viewport; the source glyph lies outside.
        for (const shadow of [...shade].reverse()) {
          ctx.fillStyle = style.color;
          ctx.shadowColor = shadow.color;
          ctx.shadowBlur = shadow.blur * dpr;
          ctx.shadowOffsetX = (shadow.x + 4096) * dpr;
          ctx.shadowOffsetY = shadow.y * dpr;
          ctx.fillText(part, pad - 4096, baseline);
        }
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = ctx.shadowOffsetX = ctx.shadowOffsetY = 0;
        ctx.fillStyle = style.color;
        ctx.fillText(part, pad, baseline);
        let image = ink.canvas;
        if (filter !== "none") {
          const filtered = surface(w + pad * 2, height + pad * 2, dpr);
          allocated.push(filtered.canvas);
          filtered.context.filter = filter;
          if (filtered.context.filter === "none")
            throw Error("Reward filter unavailable");
          filtered.context.drawImage(
            ink.canvas,
            0,
            0,
            ink.canvas.width / dpr,
            ink.canvas.height / dpr,
          );
          image = filtered.canvas;
          ink.canvas.width = ink.canvas.height = 1;
        }
        const glyphBytes = image.width * image.height * 4;
        this.makeRoom(glyphBytes);
        entry = { image, bytes: glyphBytes, refs: 1 };
        this.cache.set(key, entry);
        this.cacheBytes += glyphBytes;
        allocated.splice(allocated.indexOf(image), 1);
        acquired.push(entry);
        glyphs.push({ image, entry, x, width: w });
        x += w;
      }
      const bytes = allocated.reduce((n, c) => n + c.width * c.height * 4, 0);
      if (
        bytes > 9 * 1024 * 1024 ||
        this.cacheBytes + this.bytes + bytes > 28 * 1024 * 1024
      )
        throw Error("Reward raster budget");
      const label: Label = {
        element,
        canvas: view.canvas,
        context: view.context,
        glyphs,
        width,
        height,
        pad,
        dpr,
        started: performance.now(),
        dancing,
        bytes,
      };
      this.draw(label, label.started);
      view.canvas.className = "reward-raster";
      view.canvas.setAttribute("aria-hidden", "true");
      view.canvas.style.cssText = `position:absolute;left:${-pad}px;top:${-pad}px;width:${width + pad * 2}px;height:${height + pad * 2}px;pointer-events:none`;
      const semantic = document.createElement("span");
      semantic.className = "sr-only";
      semantic.textContent = semanticText;
      element.style.width = `${width}px`;
      element.style.height = `${height}px`;
      element.style.display = "block";
      element.style.position = "relative";
      element.style.filter = element.style.textShadow = "none";
      element.dataset.rasterized = "true";
      element.replaceChildren(view.canvas, semantic);
      this.labels.add(label);
      this.bytes += bytes;
      this.stats.prepared++;
      this.stats.peakBytes = Math.max(
        this.stats.peakBytes,
        this.bytes + this.cacheBytes,
      );
      this.syncClock();
      let finished = false;
      return () => {
        if (finished) return;
        finished = true;
        this.labels.delete(label);
        this.bytes -= bytes;
        acquired.forEach((e) => e.refs--);
        allocated.forEach((c) => {
          c.width = c.height = 1;
        });
        this.syncClock();
      };
    } catch {
      acquired.forEach((e) => e.refs--);
      allocated.forEach((c) => {
        c.width = c.height = 1;
      });
      this.stats.fallbacks++;
      return () => {};
    } finally {
      this.stats.prepareMs += performance.now() - began;
    }
  }
  clearCache() {
    for (const [key, entry] of this.cache)
      if (!entry.refs) {
        entry.image.width = entry.image.height = 1;
        this.cache.delete(key);
        this.cacheBytes -= entry.bytes;
      }
  }
  private makeRoom(incoming: number) {
    while (this.cacheBytes + incoming > 12 * 1024 * 1024) {
      const oldest = [...this.cache].find(([, entry]) => !entry.refs);
      if (!oldest) throw Error("Reward glyph cache budget");
      const [key, entry] = oldest;
      this.cache.delete(key);
      this.cacheBytes -= entry.bytes;
      entry.image.width = entry.image.height = 1;
    }
  }
  private moving(label: Label) {
    return (
      label.dancing &&
      label.element.isConnected &&
      !label.element.parentElement?.classList.contains("yield-to-drag")
    );
  }
  private syncClock() {
    if ([...this.labels].some((l) => this.moving(l)))
      this.frame ??= visualClock.add(this.tick);
    else {
      this.frame?.();
      this.frame = null;
    }
  }
  private tick = (now: number) => {
    for (const label of this.labels)
      if (this.moving(label)) this.draw(label, now);
    this.syncClock();
  };
  private draw(label: Label, now: number) {
    const began = performance.now(),
      { context: ctx, pad, dpr, height } = label;
    ctx.clearRect(0, 0, label.canvas.width / dpr, label.canvas.height / dpr);
    for (const [i, glyph] of label.glyphs.entries()) {
      const pose = label.dancing
        ? letterPose(now - label.started, i)
        : { y: 0, angle: 0 };
      ctx.save();
      ctx.translate(pad + glyph.x + glyph.width / 2, pad + height / 2 + pose.y);
      ctx.rotate(pose.angle);
      ctx.drawImage(
        glyph.image,
        -glyph.width / 2 - pad,
        -height / 2 - pad,
        glyph.image.width / dpr,
        glyph.image.height / dpr,
      );
      ctx.restore();
    }
    this.stats.draws++;
    this.stats.drawMs += performance.now() - began;
  }
}
