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
  views: HTMLCanvasElement[];
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

function surface(width: number, height: number, dpr: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(width * dpr));
  canvas.height = Math.max(1, Math.ceil(height * dpr));
  const context = canvas.getContext("2d");
  if (!context) throw Error("Reward Canvas2D unavailable");
  context.scale(dpr, dpr);
  return { canvas, context };
}

/** Prepare bounded text rasters once; native transform animations move static pixels. */
export class RewardLabels {
  private labels = new Set<Label>();
  private stats = {
    prepared: 0,
    cacheHits: 0,
    cacheMisses: 0,
    maxPrepareMs: 0,
    initialCachedBytes: 0,
    fallbacks: 0,
    prepareMs: 0,
    copyMs: 0,
    rasterCopies: 0,
    peakBytes: 0,
  };
  private bytes = 0;
  private cache = new Map<string, CachedGlyph>();
  private cacheBytes = 0;

  beginSample() {
    this.stats = {
      prepared: 0,
      cacheHits: 0,
      cacheMisses: 0,
      maxPrepareMs: 0,
      initialCachedBytes: this.cacheBytes,
      fallbacks: 0,
      prepareMs: 0,
      copyMs: 0,
      rasterCopies: 0,
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
      clockActive: false,
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
          this.stats.cacheHits++;
          this.cache.delete(key);
          this.cache.set(key, entry);
          entry.refs++;
          acquired.push(entry);
          glyphs.push({ image: entry.image, entry, x, width: w });
          x += w;
          continue;
        }
        this.stats.cacheMisses++;
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
      const views: HTMLCanvasElement[] = [];
      const copied = performance.now();
      for (const [i, glyph] of glyphs.entries()) {
        const view = surface(glyph.width + pad * 2, height + pad * 2, dpr);
        allocated.push(view.canvas);
        view.context.drawImage(
          glyph.image,
          0,
          0,
          glyph.image.width / dpr,
          glyph.image.height / dpr,
        );
        view.canvas.className =
          "reward-raster" + (dancing ? " reward-raster-letter" : "");
        view.canvas.setAttribute("aria-hidden", "true");
        view.canvas.style.cssText = `position:absolute;left:${glyph.x - pad}px;top:${-pad}px;width:${glyph.width + pad * 2}px;height:${height + pad * 2}px;pointer-events:none`;
        view.canvas.style.setProperty("--letter", String(i));
        views.push(view.canvas);
      }
      this.stats.rasterCopies += views.length;
      this.stats.copyMs += performance.now() - copied;
      const bytes = allocated.reduce((n, c) => n + c.width * c.height * 4, 0);
      if (
        bytes > 9 * 1024 * 1024 ||
        this.cacheBytes + this.bytes + bytes > 28 * 1024 * 1024
      )
        throw Error("Reward raster budget");
      const label: Label = { element, views, bytes };
      const semantic = document.createElement("span");
      semantic.className = "sr-only";
      semantic.textContent = semanticText;
      element.style.width = `${width}px`;
      element.style.height = `${height}px`;
      element.style.display = "block";
      element.style.position = "relative";
      element.style.filter = element.style.textShadow = "none";
      element.dataset.rasterized = "true";
      element.replaceChildren(...views, semantic);
      this.labels.add(label);
      this.bytes += bytes;
      this.stats.prepared++;
      this.stats.peakBytes = Math.max(
        this.stats.peakBytes,
        this.bytes + this.cacheBytes,
      );
      let finished = false;
      return () => {
        if (finished) return;
        finished = true;
        this.labels.delete(label);
        this.bytes -= bytes;
        acquired.forEach((e) => e.refs--);
        allocated.forEach((c) => {
          c.getAnimations().forEach((a) => a.cancel());
          c.width = c.height = 1;
        });
      };
    } catch {
      acquired.forEach((e) => e.refs--);
      allocated.forEach((c) => {
        c.getAnimations().forEach((a) => a.cancel());
        c.width = c.height = 1;
      });
      this.stats.fallbacks++;
      return () => {};
    } finally {
      const elapsed = performance.now() - began;
      this.stats.prepareMs += elapsed;
      this.stats.maxPrepareMs = Math.max(this.stats.maxPrepareMs, elapsed);
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
}
