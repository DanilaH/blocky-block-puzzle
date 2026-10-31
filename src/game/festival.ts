import { visualClock } from "./visual-clock";
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
};
export class Festival {
  private canvas = document.createElement("canvas");
  private ctx: CanvasRenderingContext2D;
  private sparks: Spark[] = [];
  private frame: (() => void) | null = null;
  private last = 0;
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
    document.body.append(this.canvas);
    this.ctx = this.canvas.getContext("2d")!;
    window.addEventListener("resize", () => this.stop());
  }
  burst(
    board: DOMRect,
    cells: number[],
    lines: number,
    empty: boolean,
    record = false,
    sourceBoard?: number[],
    budget = 200,
  ) {
    const palette = COLORS.slice(1).map(
      (c) => "#" + c.toString(16).padStart(6, "0"),
    );
    const count = Math.min(
      budget,
      empty ? 200 : record ? 85 : Math.min(130, 24 + lines * 24),
    );
    const dpr = Math.min(1.5, devicePixelRatio);
    const width = Math.round(innerWidth * dpr);
    const height = Math.round(innerHeight * dpr);
    // A second burst can overlap the first. Do not reallocate/reset the full
    // viewport backing store on every clear (including two bursts in one move).
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (let i = 0; i < count; i++) {
      const cell = cells[i % Math.max(1, cells.length)] ?? 27;
      const x = empty
        ? board.left + board.width * (i % 2 ? 0.92 : 0.08)
        : board.left + (((cell % 8) + 0.5) * board.width) / 8;
      const y = empty
        ? board.bottom - 12
        : board.top + ((Math.floor(cell / 8) + 0.5) * board.height) / 8;
      const angle = empty
        ? -Math.PI / 2 + (Math.random() - 0.5) * 1.6
        : Math.random() * Math.PI * 2;
      const speed = empty
        ? 280 + Math.random() * 310
        : 90 + Math.random() * 210;
      this.sparks.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - (empty ? 0 : 80),
        age: 0,
        life: empty ? 1500 + Math.random() * 500 : 550 + Math.random() * 550,
        size: 9 + Math.random() * 9,
        color: palette[(sourceBoard?.[cell] || (i % palette.length) + 1) - 1]!,
        spin: Math.random() * 8 - 4,
        star: i % 8 === 0,
      });
    }
    if (this.sparks.length > 260)
      this.sparks.splice(0, this.sparks.length - 260);
    if (!this.frame) {
      this.last = performance.now();
      this.frame = visualClock.add((t) => this.draw(t));
    }
  }
  private draw(now: number) {
    const dt = Math.max(0, Math.min(40, now - this.last));
    this.last = now;
    const g = this.ctx;
    g.clearRect(0, 0, innerWidth, innerHeight);
    let live = 0;
    for (const spark of this.sparks)
      if (spark.age < spark.life) this.sparks[live++] = spark;
    this.sparks.length = live;
    for (const s of this.sparks) {
      s.age += dt;
      s.x += (s.vx * dt) / 1000;
      s.y += (s.vy * dt) / 1000;
      s.vy += (420 * dt) / 1000;
      const t = s.age / s.life;
      g.save();
      g.translate(s.x, s.y);
      g.rotate(s.spin * t * 4);
      g.globalAlpha = Math.min(1, Math.max(0, (1 - t) * 2));
      g.fillStyle = s.color;
      const texture = this.chips.get(s.color);
      if (s.star && this.flash) {
        g.globalCompositeOperation = "screen";
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
    if (!this.sparks.length) {
      this.frame?.();
      this.frame = null;
    }
    if (!this.frame) g.clearRect(0, 0, innerWidth, innerHeight);
  }
  stop() {
    this.frame?.();
    this.frame = null;
    this.sparks = [];
    this.ctx.clearRect(0, 0, innerWidth, innerHeight);
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
