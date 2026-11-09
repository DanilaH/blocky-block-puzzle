// Study only: replace gameplay ink paints during the existing theme fade.
// The native CSS color clock is sampled through one hidden proxy per color pair.
type Style = {
  font: string;
  spacing: string;
  color: string;
  lineHeight: string;
  align: string;
  opacity: number;
  shadow: string;
};
type Glyph = {
  image: ImageBitmap;
  advance: number;
  pad: number;
  width: number;
  height: number;
};
type Tone = { proxy: HTMLElement; animation: Animation };
type Slot = {
  element: HTMLElement | SVGSVGElement;
  box: DOMRect;
  style: Style;
  saved: { name: string; value: string; priority: string }[];
  tone?: Tone;
  mask?: ImageBitmap;
  glyphs?: Map<string, Glyph>;
  buffer: OffscreenCanvas;
  pad: number;
  baseline?: number;
  paths?: {
    path: Path2D;
    fill: boolean;
    stroke: boolean;
    width: number;
    cap: CanvasLineCap;
    join: CanvasLineJoin;
  }[];
  parent?: { element: HTMLElement; box: DOMRect };
};
export class ThemeInkStudy {
  private direct =
    new URLSearchParams(location.search).get("studyInk") !== "mask";
  private baselineCache = new Map<string, number>();
  private index: number | null = null;
  private slots: Slot[] = [];
  private tones = new Map<string, Tone>();
  private svgCache = new Map<string, Promise<ImageBitmap>>();
  private glyphCache = new Map<string, Map<string, Glyph>>();
  private values = new Map<HTMLElement, string>();
  private parents: { element: HTMLElement; value: string; priority: string }[] =
    [];
  private pending = false;
  private started = 0;
  private ready = false;
  private generation = 0;
  private duration = 1000;
  private seekTime: number | null = null;
  draws = 0;
  preparations: number[] = [];
  errors: string[] = [];
  constructor(
    readonly enabled: boolean,
    private wake: () => void,
    private ratio: number,
  ) {}
  snapshot() {
    return {
      active: this.slots.length,
      draws: this.draws,
      fontCaches: this.glyphCache.size,
      preparationMs: this.preparations,
      errors: this.errors,
    };
  }
  setText(e: HTMLElement, value: string) {
    if (this.enabled && this.slots.some((s) => s.element === e)) {
      this.values.set(e, value);
      return;
    }
    e.textContent = value;
    this.values.delete(e);
  }
  private style(e: Element): Style {
    const s = getComputedStyle(e);
    return {
      font: `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`,
      spacing: s.letterSpacing === "normal" ? "0px" : s.letterSpacing,
      color: s.color,
      lineHeight: s.lineHeight,
      align: s.textAlign,
      opacity: Number(s.opacity),
      shadow: s.textShadow,
    };
  }
  before(index: number, active: boolean) {
    if (!this.enabled || this.index === index) return;
    this.index = index;
    this.stop();
    if (!active) return;
    this.pending = true;
    this.started = performance.now();
    this.duration = index === 0 ? 1800 : 1000;
    const elements = Array.from(
      document.querySelectorAll<HTMLElement | SVGSVGElement>(
        "#score,#best,#combo-title,#combo-stock,#caption,#pause svg",
      ),
    ).filter(
      (e) =>
        getComputedStyle(e).display !== "none" &&
        (e instanceof SVGSVGElement || e.textContent?.trim()),
    );
    const transformed = new Map<HTMLElement, string>();
    for (const e of elements)
      for (
        let p = e instanceof HTMLElement ? e : e.parentElement;
        p && p.id !== "app";
        p = p.parentElement
      ) {
        if (getComputedStyle(p).transform !== "none" && !transformed.has(p)) {
          transformed.set(p, p.style.cssText);
          p.style.setProperty("transform", "none", "important");
        }
      }
    this.slots = elements.map((element) => {
      const style = this.style(element),
        box = element.getBoundingClientRect(),
        pad =
          element.id === "score"
            ? 32
            : Math.ceil(parseFloat(getComputedStyle(element).fontSize) * 0.25) +
              2;
      // The score is a flex item centered by its parent. Its hidden DOM keeps
      // the captured width while the displayed value can gain or lose digits.
      if (element.id === "score") style.align = "center";
      let opacity = 1;
      for (
        let p: Element | null = element;
        p && p.id !== "app";
        p = p.parentElement
      )
        opacity *= Number(getComputedStyle(p).opacity);
      style.opacity = opacity;
      const parent = element.closest<HTMLElement>(".combo-hud");
      return {
        element,
        style,
        box,
        pad,
        buffer: new OffscreenCanvas(
          Math.max(1, Math.ceil((box.width + pad * 2) * this.ratio)),
          Math.max(1, Math.ceil((box.height + pad * 2) * this.ratio)),
        ),
        saved: ["visibility", "transition", "color"].map((name) => ({
          name,
          value: element.style.getPropertyValue(name),
          priority: element.style.getPropertyPriority(name),
        })),
        parent: parent
          ? { element: parent, box: parent.getBoundingClientRect() }
          : undefined,
      };
    });
    for (const [e, s] of transformed) e.style.cssText = s;
  }
  after() {
    if (!this.pending) return;
    this.pending = false;
    const generation = ++this.generation;
    const begin = performance.now();
    // Parents with inherited color must snap too; they remain transparent geometry.
    for (const e of document.querySelectorAll<HTMLElement>(
      ".best,.board-caption,#score,#combo-title,#combo-stock,#pause",
    )) {
      this.parents.push({
        element: e,
        value: e.style.getPropertyValue("transition"),
        priority: e.style.getPropertyPriority("transition"),
      });
      e.style.setProperty("transition", "none", "important");
    }
    const tasks: Promise<void>[] = [];
    for (const slot of this.slots) {
      const final = this.style(slot.element),
        key = slot.style.color + ">" + final.color;
      let tone = this.tones.get(key);
      if (!tone) {
        const proxy = document.createElement("span");
        proxy.style.cssText =
          "position:fixed;visibility:hidden;pointer-events:none;width:0;height:0";
        document.body.append(proxy);
        const animation = proxy.animate(
          [{ color: slot.style.color }, { color: final.color }],
          { duration: this.duration, easing: "ease", fill: "both" },
        );
        animation.startTime = document.timeline.currentTime;
        tone = { proxy, animation };
        this.tones.set(key, tone);
      }
      slot.tone = tone;
      slot.element.style.setProperty("color", slot.style.color, "important");
      if (this.direct) {
        if (slot.element instanceof SVGSVGElement)
          slot.paths = Array.from(
            slot.element.querySelectorAll("path,circle"),
          ).map((e) => {
            const path =
              e.tagName === "path"
                ? new Path2D(e.getAttribute("d") ?? "")
                : new Path2D();
            if (e.tagName === "circle")
              path.arc(
                Number(e.getAttribute("cx")),
                Number(e.getAttribute("cy")),
                Number(e.getAttribute("r")),
                0,
                Math.PI * 2,
              );
            const style = getComputedStyle(e);
            return {
              path,
              fill: style.fill !== "none",
              stroke: style.stroke !== "none",
              width: parseFloat(style.strokeWidth) || 2,
              cap: style.strokeLinecap as CanvasLineCap,
              join: style.strokeLinejoin as CanvasLineJoin,
            };
          });
        else slot.baseline = this.baseline(slot.style);
      } else if (slot.element instanceof SVGSVGElement)
        tasks.push(
          this.svgMask(slot).then((mask) => {
            slot.mask = mask;
          }),
        );
      else
        slot.glyphs = this.glyphs(
          slot.style,
          slot.box.height,
          slot.element.textContent ?? "",
        );
    }
    void Promise.all(tasks)
      .then(() => {
        if (generation !== this.generation) return;
        for (const s of this.slots)
          s.element.style.setProperty("visibility", "hidden", "important");
        this.ready = true;
        this.preparations.push(performance.now() - begin);
        this.wake();
      })
      .catch((e) => this.errors.push(String(e)));
  }
  private baseline(s: Style) {
    const key = s.font + s.lineHeight;
    const cached = this.baselineCache.get(key);
    if (cached !== undefined) return cached;
    const probe = document.createElement("span"),
      marker = document.createElement("span");
    probe.style.cssText = `position:fixed;left:-10000px;top:0;visibility:hidden;display:inline-block;font:${s.font};line-height:${s.lineHeight};white-space:pre`;
    marker.style.cssText =
      "display:inline-block;vertical-align:baseline;width:0;height:0";
    probe.append(document.createTextNode("Hg"), marker);
    document.body.append(probe);
    const baseline =
      marker.getBoundingClientRect().top - probe.getBoundingClientRect().top;
    probe.remove();
    this.baselineCache.set(key, baseline);
    return baseline;
  }
  private glyphs(s: Style, height: number, text: string) {
    const key = [s.font, s.spacing, s.lineHeight].join("|");
    let glyphs = this.glyphCache.get(key);
    if (glyphs) return glyphs;
    glyphs = new Map();
    this.glyphCache.set(key, glyphs);
    const probe = document.createElement("span"),
      marker = document.createElement("span");
    probe.style.cssText = `position:fixed;left:-10000px;top:0;visibility:hidden;display:inline-block;font:${s.font};line-height:${s.lineHeight};white-space:pre`;
    marker.style.cssText =
      "display:inline-block;vertical-align:baseline;width:0;height:0";
    probe.append(document.createTextNode("Hg"), marker);
    document.body.append(probe);
    const baseline =
      marker.getBoundingClientRect().top - probe.getBoundingClientRect().top;
    probe.remove();
    const measure = new OffscreenCanvas(1, 1).getContext("2d")!;
    measure.font = s.font;
    measure.letterSpacing = s.spacing;
    for (const char of new Set("0123456789\u00a0 " + text)) {
      const advance = measure.measureText(char).width,
        pad =
          Math.ceil(parseFloat(s.font.match(/[\d.]+px/)?.[0] ?? "12") * 0.25) +
          2;
      const width = Math.max(1, advance + pad * 2),
        h = height + pad * 2;
      const c = new OffscreenCanvas(
          Math.ceil(width * this.ratio),
          Math.ceil(h * this.ratio),
        ),
        g = c.getContext("2d")!;
      g.scale(this.ratio, this.ratio);
      g.font = s.font;
      g.fillStyle = "white";
      g.textBaseline = "alphabetic";
      g.fillText(char, pad, pad + baseline);
      glyphs.set(char, {
        image: c.transferToImageBitmap(),
        advance,
        pad,
        width,
        height: h,
      });
    }
    return glyphs;
  }
  private svgMask(s: Slot) {
    const svg = (s.element as SVGSVGElement).cloneNode(true) as SVGSVGElement;
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    svg.setAttribute("width", String(s.box.width * this.ratio));
    svg.setAttribute("height", String(s.box.height * this.ratio));
    svg.style.color = "white";
    const key = new XMLSerializer().serializeToString(svg);
    const cached = this.svgCache.get(key);
    if (cached) return cached;
    const task = (async () => {
      const image = new Image();
      image.src =
        "data:image/svg+xml;charset=utf-8," +
        encodeURIComponent(new XMLSerializer().serializeToString(svg));
      await image.decode();
      const buffer = new OffscreenCanvas(image.width, image.height);
      buffer.getContext("2d")!.drawImage(image, 0, 0);
      return buffer.transferToImageBitmap();
    })();
    this.svgCache.set(key, task);
    return task;
  }
  draw(g: CanvasRenderingContext2D, now: number) {
    if (!this.slots.length) return false;
    if ((this.seekTime ?? now - this.started) >= this.duration) {
      this.stop();
      return false;
    }
    if (!this.ready) return true;
    this.draws++;
    const colors = new Map<Tone, string>();
    for (const tone of this.tones.values())
      colors.set(tone, getComputedStyle(tone.proxy).color);
    g.save();
    g.globalCompositeOperation = "source-over";
    for (const slot of this.slots) {
      const { box, pad, buffer } = slot,
        b = buffer.getContext("2d")!;
      if (!this.direct) {
        b.resetTransform();
        b.clearRect(0, 0, buffer.width, buffer.height);
        b.setTransform(
          this.ratio,
          0,
          0,
          this.ratio,
          pad * this.ratio,
          pad * this.ratio,
        );
        b.globalCompositeOperation = "source-over";
        if (slot.mask) b.drawImage(slot.mask, 0, 0, box.width, box.height);
        else {
          const text =
              this.values.get(slot.element as HTMLElement) ??
              slot.element.textContent ??
              "",
            glyphs = slot.glyphs!;
          let width = 0;
          for (const c of text) width += glyphs.get(c)?.advance ?? 0;
          let x =
            slot.style.align === "center"
              ? (box.width - width) / 2
              : slot.style.align === "right"
                ? box.width - width
                : 0;
          for (const c of text) {
            const glyph = glyphs.get(c);
            if (!glyph) {
              this.errors.push("missing-glyph:" + c);
              continue;
            }
            b.drawImage(
              glyph.image,
              x - glyph.pad,
              -glyph.pad,
              glyph.width,
              glyph.height,
            );
            x += glyph.advance;
          }
        }
        b.globalCompositeOperation = "source-in";
        b.fillStyle = colors.get(slot.tone!)!;
        b.fillRect(-pad, -pad, box.width + 2 * pad, box.height + 2 * pad);
        b.globalCompositeOperation = "source-over";
      }
      g.save();
      g.globalAlpha = slot.style.opacity;
      if (slot.parent) {
        const p = slot.parent,
          s = getComputedStyle(p.element),
          m = new DOMMatrix(s.transform === "none" ? undefined : s.transform);
        g.translate(p.box.left + p.box.width / 2, p.box.top + p.box.height / 2);
        g.transform(m.a, m.b, m.c, m.d, m.e, m.f);
        g.translate(
          -p.box.left - p.box.width / 2,
          -p.box.top - p.box.height / 2,
        );
      }
      g.translate(box.left + box.width / 2, box.top + box.height / 2);
      const style = getComputedStyle(slot.element),
        m = new DOMMatrix(
          style.transform === "none" ? undefined : style.transform,
        );
      g.transform(m.a, m.b, m.c, m.d, m.e, m.f);
      g.translate(-box.width / 2, -box.height / 2);
      const shadow = style.textShadow,
        color = shadow.match(/rgba?\([^)]+\)/)?.[0],
        numbers = shadow
          .replace(/rgba?\([^)]+\)/g, "")
          .match(/-?[\d.]+px/g)
          ?.map(parseFloat);
      if (color && numbers) {
        g.shadowColor = color;
        const matrix = g.getTransform(),
          x = numbers[0] ?? 0,
          y = numbers[1] ?? 0;
        g.shadowOffsetX = x * matrix.a + y * matrix.c;
        g.shadowOffsetY = x * matrix.b + y * matrix.d;
        g.shadowBlur = (numbers[2] ?? 0) * Math.hypot(matrix.a, matrix.b);
      }
      if (this.direct) {
        const tone = colors.get(slot.tone!)!;
        g.fillStyle = tone;
        g.strokeStyle = tone;
        if (slot.paths) {
          const view = (slot.element as SVGSVGElement).viewBox.baseVal;
          g.scale(box.width / view.width, box.height / view.height);
          for (const p of slot.paths) {
            g.lineWidth = p.width;
            g.lineCap = p.cap;
            g.lineJoin = p.join;
            if (p.fill) g.fill(p.path);
            if (p.stroke) g.stroke(p.path);
          }
        } else {
          g.font = slot.style.font;
          g.letterSpacing = slot.style.spacing;
          g.textBaseline = "alphabetic";
          g.textAlign = "left";
          const text =
              this.values.get(slot.element as HTMLElement) ??
              slot.element.textContent ??
              "",
            width = g.measureText(text).width,
            x =
              slot.style.align === "center"
                ? (box.width - width) / 2
                : slot.style.align === "right"
                  ? box.width - width
                  : 0;
          g.fillText(text, x, slot.baseline!);
        }
      } else
        g.drawImage(
          buffer,
          -pad,
          -pad,
          box.width + pad * 2,
          box.height + pad * 2,
        );
      g.restore();
    }
    g.restore();
    return true;
  }
  seek(time: number) {
    this.seekTime = time;
    for (const t of this.tones.values()) {
      t.animation.pause();
      t.animation.currentTime = time;
    }
  }
  stop() {
    this.seekTime = null;
    this.generation++;
    this.ready = false;
    for (const slot of this.slots) {
      const value = this.values.get(slot.element as HTMLElement);
      if (value !== undefined) slot.element.textContent = value;
      for (const p of slot.saved)
        if (p.name !== "transition") {
          if (p.value)
            slot.element.style.setProperty(p.name, p.value, p.priority);
          else slot.element.style.removeProperty(p.name);
        }
    }
    // Commit the new inherited colors before reinstating the old CSS transitions.
    if (this.slots[0]) getComputedStyle(this.slots[0].element).color;
    for (const p of this.parents) {
      if (p.value)
        p.element.style.setProperty("transition", p.value, p.priority);
      else p.element.style.removeProperty("transition");
    }
    this.parents = [];
    this.slots = [];
    this.values.clear();
    for (const t of this.tones.values()) {
      t.animation.cancel();
      t.proxy.remove();
    }
    this.tones.clear();
  }
}
