import { clearSignature } from "./clear-signature";
import { visualClock } from "./visual-clock";
import { THEMES, themeTile } from "./themes";
import { COLORS } from "./tiles";
// Full-viewport cosmetic layer. No gameplay RNG, input, state, or persistent loop.
type Spark = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  color: string;
  spin: number;
  star: boolean;
  mode: number;
  floor: number;
};
export class Festival {
  private diagnosticDisabled = false;
  private diagnosticRandom: (() => number) | null = null;
  private diagnosticSample: {
    draws: number;
    bursts: number;
    spawned: number;
    peakParticles: number;
  } | null = null;
  setDiagnosticDisabled(disabled: boolean) {
    this.diagnosticDisabled = disabled;
    if (disabled) this.stop();
  }
  setDiagnosticSeed(seed: number) {
    this.diagnosticRandom = () =>
      (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  }
  private random() {
    return this.diagnosticRandom ? this.diagnosticRandom() : Math.random();
  }
  beginDiagnosticSample() {
    this.diagnosticSample = {
      draws: 0,
      bursts: 0,
      spawned: 0,
      peakParticles: 0,
    };
  }
  diagnosticSnapshot() {
    return {
      draws: 0,
      bursts: 0,
      spawned: 0,
      peakParticles: 0,
      ...this.diagnosticSample,
      disabled: this.diagnosticDisabled,
      theme: this.theme,
      canvas: [this.canvas.width, this.canvas.height],
    };
  }
  private theme = 0;
  private reveals: {
    board: DOMRect;
    age: number;
    mode: number;
    color: string;
    rear?: SVGSVGElement;
  }[] = [];
  setPalette(theme: number) {
    this.theme = theme;
  }
  private canvas = document.createElement("canvas");
  private rear = document.createElement("div");
  private ctx: CanvasRenderingContext2D;
  private sparks: Spark[] = [];
  private frame: (() => void) | null = null;
  private last = 0;
  private width = 0;
  private height = 0;
  private syncViewport() {
    this.width = innerWidth;
    this.height = innerHeight;
    const dpr = Math.min(1.5, devicePixelRatio);
    const width = Math.round(this.width * dpr);
    const height = Math.round(this.height * dpr);
    // Overlapping bursts keep the same backing store and existing particles.
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  private chips = new Map<string, HTMLCanvasElement>();
  private flash: CanvasImageSource | null = null;
  setTextures(chip: CanvasImageSource, flash: CanvasImageSource) {
    this.flash = flash;
    for (const color of COLORS.slice(1).concat(0xffffff)) {
      const key = "#" + color.toString(16).padStart(6, "0");
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const g = c.getContext("2d")!;
      g.drawImage(chip, 0, 0, 64, 64);
      g.globalCompositeOperation = "multiply";
      g.fillStyle = key;
      g.fillRect(0, 0, 64, 64);
      g.globalCompositeOperation = "destination-in";
      g.drawImage(chip, 0, 0, 64, 64);
      this.chips.set(key, c);
    }
  }
  constructor() {
    this.canvas.className = "festival-canvas";
    this.canvas.setAttribute("aria-hidden", "true");
    this.rear.classList.add("festival-rear");
    this.rear.setAttribute("aria-hidden", "true");
    document.body.append(this.rear, this.canvas);
    this.ctx = this.canvas.getContext("2d")!;
    this.syncViewport();
    window.addEventListener("resize", () => {
      this.stop();
      this.syncViewport();
    });
  }
  burst(
    board: DOMRect,
    cells: number[],
    lines: number,
    empty: boolean,
    record = false,
    sourceBoard?: number[],
    budget = 200,
    variant = 0,
  ) {
    if (this.diagnosticDisabled) return;
    this.syncViewport();
    const signature = clearSignature(cells);
    const directional = !empty && !record && lines >= 2 && signature.count >= 2;
    const palette = Array.from(
      { length: 6 },
      (_, i) =>
        "#" +
        COLORS[themeTile(this.theme, i + 1)]!.toString(16).padStart(6, "0"),
    );
    if (empty) {
      let rear: SVGSVGElement | undefined;
      if (variant === 2) {
        rear = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        const radius = board.width * 0.75,
          ry = radius * 0.16;
        rear.setAttribute(
          "viewBox",
          `${-radius - 2} ${-ry - 2} ${radius * 2 + 4} ${ry * 2 + 4}`,
        );
        rear.style.cssText = `position:absolute;left:${board.left + board.width / 2 - radius - 2}px;top:${board.bottom - ry - 2}px;width:${radius * 2 + 4}px;height:${ry * 2 + 4}px;transform-origin:center;will-change:transform,opacity;overflow:visible`;
        const path = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "path",
        );
        path.setAttribute("fill", "none");
        path.setAttribute("stroke-width", "3");
        path.setAttribute("vector-effect", "non-scaling-stroke");
        path.setAttribute("stroke", THEMES[this.theme]!.accent);
        path.setAttribute(
          "d",
          `M ${-radius} 0 A ${radius} ${ry} 0 0 1 ${radius} 0`,
        );
        rear.append(path);
        this.rear.append(rear);
      }
      this.reveals.push({
        rear,
        board,
        age: 0,
        mode: variant,
        color: THEMES[this.theme]!.accent,
      });
      if (this.reveals.length > 2) this.reveals.shift()?.rear?.remove();
    }
    const count = Math.min(
      budget,
      empty ? 110 : record ? 35 : Math.min(80, 10 + lines * 14),
    );
    for (let i = 0; i < count; i++) {
      const cell = cells[i % Math.max(1, cells.length)] ?? 27;
      let x = empty
        ? board.left + board.width * (i % 2 ? 0.92 : 0.08)
        : board.left + (((cell % 8) + 0.5) * board.width) / 8;
      let y = empty
        ? board.bottom - 12
        : board.top + ((Math.floor(cell / 8) + 0.5) * board.height) / 8;
      let angle = empty
        ? -Math.PI / 2 + (this.random() - 0.5) * 1.6
        : this.random() * Math.PI * 2;
      const speed = empty
        ? 280 + this.random() * 310
        : 90 + this.random() * 210;
      if (empty && variant === 1) {
        x = board.left + board.width / 2;
        y = board.bottom;
      }
      if (empty && variant === 2) {
        x = board.left + this.random() * board.width;
        y = board.top - board.height * 0.2;
      }
      let delay = 0;
      if (directional) {
        const horizontal = signature.rows.length > 0;
        const lanes = horizontal ? signature.rows : signature.cols;
        const lane = i % Math.max(1, lanes.length);
        if (signature.kind === "cross") {
          x = board.left + ((signature.cols[0]! + 0.5) * board.width) / 8;
          y = board.top + ((signature.rows[0]! + 0.5) * board.height) / 8;
          angle = ((i % 4) * Math.PI) / 2 + (this.random() - 0.5) * 0.22;
          delay = 180;
        } else {
          const along = lines === 2 ? (lane === 0 ? 0.1 : 0.9) : (i % 8) / 8;
          x =
            board.left +
            (horizontal ? along : (lanes[lane]! + 0.5) / 8) * board.width;
          y =
            board.top +
            (horizontal ? (lanes[lane]! + 0.5) / 8 : along) * board.height;
          angle =
            (horizontal ? 0 : Math.PI / 2) +
            (lines === 2 && lane === 1 ? Math.PI : 0) +
            (this.random() - 0.5) * 0.65;
          delay = lane * (lines === 2 ? 160 : 120);
        }
      }
      this.sparks.push({
        mode: empty ? variant + 1 : 0,
        floor: board.bottom,
        x,
        y,
        vx: empty && variant === 2 ? 0 : Math.cos(angle) * speed,
        vy:
          empty && variant === 2
            ? 220 + this.random() * 100
            : Math.sin(angle) * speed - (empty ? 0 : 80),
        age: empty && variant === 2 ? -this.random() * 650 : -delay,
        life: empty ? 1500 + this.random() * 500 : 550 + this.random() * 550,
        size: 9 + this.random() * 9,
        color: palette[(sourceBoard?.[cell] || (i % palette.length) + 1) - 1]!,
        spin: this.random() * 8 - 4,
        star: i % 8 === 0,
      });
    }
    if (this.sparks.length > 260)
      this.sparks.splice(0, this.sparks.length - 260);
    if (this.diagnosticSample) {
      this.diagnosticSample.bursts++;
      this.diagnosticSample.spawned += count;
      this.diagnosticSample.peakParticles = Math.max(
        this.diagnosticSample.peakParticles,
        this.sparks.length,
      );
    }
    if (!this.frame) {
      this.last = performance.now();
      this.frame = visualClock.add((t) => this.draw(t));
    }
  }
  private draw(now: number) {
    if (this.diagnosticSample) this.diagnosticSample.draws++;
    const dt = Math.max(0, Math.min(40, now - this.last));
    this.last = now;
    const g = this.ctx;
    g.clearRect(0, 0, this.width, this.height);
    let live = 0;
    for (const spark of this.sparks)
      if (spark.age < spark.life) this.sparks[live++] = spark;
    this.sparks.length = live;
    // Draw normal chips together, then additive stars: two blend batches,
    // rather than switching source-over/screen for every eighth particle.
    for (let pass = 0; pass < 2; pass++) {
      g.globalCompositeOperation = pass ? "screen" : "source-over";
      for (const s of this.sparks) {
        if (Number(s.star && !!this.flash) !== pass) continue;
        s.age += dt;
        if (s.age < 0) continue;
        s.x += (s.vx * dt) / 1000;
        s.y += (s.vy * dt) / 1000;
        s.vy += ((s.mode === 3 ? 0 : s.mode === 2 ? 170 : 420) * dt) / 1000;
        if (s.mode === 3 && s.y > s.floor) {
          const radius = Math.min(22, (s.y - s.floor) * 0.4);
          g.strokeStyle = s.color;
          g.globalAlpha = Math.max(0, 1 - radius / 22);
          g.lineWidth = 2;
          g.beginPath();
          g.ellipse(s.x, s.floor, radius, radius * 0.3, 0, 0, Math.PI * 2);
          g.stroke();
          g.globalAlpha = 1;
          if (radius >= 22) s.age = s.life;
          continue;
        }
        if (s.mode === 3) {
          g.strokeStyle = s.color;
          g.globalAlpha = 0.35;
          g.lineWidth = 2;
          g.beginPath();
          g.moveTo(s.x, s.y - 32);
          g.lineTo(s.x, s.y);
          g.stroke();
          g.globalAlpha = 1;
        }
        const t = s.age / s.life;
        g.save();
        g.translate(s.x, s.y);
        g.rotate(s.spin * t * 4);
        g.globalAlpha = Math.min(1, Math.max(0, (1 - t) * 2));
        g.fillStyle = s.color;
        const texture = this.chips.get(s.color);
        if (s.star && this.flash) {
          g.drawImage(this.flash, -s.size, -s.size, s.size * 2, s.size * 2);
        } else if (texture) {
          const height = s.size * (0.45 + Math.abs(Math.cos(t * 9)) * 0.55);
          g.drawImage(texture, -s.size / 2, -height / 2, s.size, height);
        } else if (s.star) {
          g.beginPath();
          for (let n = 0; n < 10; n++) {
            const a = (n * Math.PI) / 5;
            const r = s.size * (n % 2 ? 0.4 : 1.5);
            g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
          }
          g.closePath();
          g.fill();
        } else {
          g.fillRect(
            -s.size / 2,
            -s.size / 2,
            s.size,
            s.size * (0.4 + Math.abs(Math.cos(t * 12))),
          );
        }
        g.restore();
      }
    }
    g.globalCompositeOperation = "source-over";
    this.reveals = this.reveals.filter((r) => {
      if (r.age >= 2400) r.rear?.remove();
      return r.age < 2400;
    });
    for (const r of this.reveals) {
      r.age += dt;
      const t = r.age / 2400,
        b = r.board;
      g.save();
      g.strokeStyle = r.color;
      g.fillStyle = r.color;
      g.globalAlpha = Math.sin(Math.min(1, t) * Math.PI) * 0.85;
      g.lineWidth = 3;
      // Shared long tail around the field, with three distinct centre motifs.
      g.globalAlpha = (1 - t) ** 1.5 * 0.8;
      g.strokeRect(b.left - 3, b.top - 3, b.width + 6, b.height + 6);
      g.globalAlpha = Math.sin(Math.min(1, t) * Math.PI) * 0.85;
      if (r.mode !== 2 && t < 0.65) {
        g.save();
        g.translate(b.left + b.width / 2, b.top + b.height / 2);
        g.rotate(r.mode === 0 ? t * 0.65 : -t * 0.9);
        g.globalAlpha *= 1 - t / 0.65;
        const radius = b.width * (0.12 + t * 0.45);
        g.beginPath();
        const sides = r.mode === 0 ? 8 : 4;
        for (let i = 0; i <= sides; i++) {
          const a = (i * Math.PI * 2) / sides - Math.PI / 2;
          const rr = r.mode === 0 && i % 2 ? radius * 0.48 : radius;
          if (i === 0) g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
          else g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        g.stroke();
        g.restore();
      }
      if (r.mode === 0) {
        const length = 2 * (b.width + b.height);
        g.setLineDash([length * 0.22, length * 0.78]);
        g.lineDashOffset = -length * t * 2;
        g.strokeRect(b.left - 3, b.top - 3, b.width + 6, b.height + 6);
        g.setLineDash([]);
      } else if (r.mode === 1) {
        g.translate(b.left + b.width / 2, b.top + b.height * 0.18);
        g.rotate(t * 0.8);
        const size = 14 + Math.sin((Math.min(1, t * 3) * Math.PI) / 2) * 25;
        g.beginPath();
        g.moveTo(0, -size);
        g.lineTo(size, 0);
        g.lineTo(0, size);
        g.lineTo(-size, 0);
        g.closePath();
        g.stroke();
        g.globalAlpha *= 0.25;
        g.fill();
      } else {
        const radius = b.width * (0.15 + t * 0.6);
        g.beginPath();
        g.ellipse(
          b.left + b.width / 2,
          b.bottom,
          radius,
          radius * 0.16,
          0,
          0,
          Math.PI,
        );
        g.stroke();
        // Same age/geometry: the upper arc sits behind the opaque board,
        // the lower arc remains in the foreground with the falling sparks.
        if (r.rear) {
          r.rear.style.transform = `scale(${radius / (b.width * 0.75)})`;
          r.rear.style.opacity = String(g.globalAlpha);
        }
      }
      g.restore();
    }
    if (!this.sparks.length && !this.reveals.length) {
      this.frame?.();
      this.frame = null;
    }
    if (!this.frame) g.clearRect(0, 0, this.width, this.height);
  }
  stop() {
    this.frame?.();
    this.frame = null;
    this.sparks = [];
    this.reveals = [];
    this.rear.replaceChildren();
    this.ctx.clearRect(0, 0, this.width, this.height);
  }
}
export class MusicalChain {
  private at = -Infinity;
  private step = -1;
  next(now: number) {
    this.step = now - this.at <= 2800 ? Math.min(7, this.step + 1) : 0;
    this.at = now;
    return this.semitones;
  }
  get semitones() {
    return [0, 3, 5, 7, 10, 12, 15, 17][Math.max(0, this.step)]!;
  }
  reset() {
    this.at = -Infinity;
    this.step = -1;
  }
}
