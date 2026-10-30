import { THEMES, themeFor, themeAccent } from "./themes";
// Cosmetic RNG is isolated from saved game RNG. One bounded RAF, suspended with gameplay.
export class Atmosphere {
  private canvas = document.createElement("canvas");
  private ctx: CanvasRenderingContext2D;
  private frame = 0;
  private last = 0;
  private time = 0;
  private energy = 0;
  private wave = 0;
  private source = { x: 0.5, y: 0.4 };
  private prism = [146, 221, 237];
  origin(board: DOMRect, cells: number[]) {
    const cell = cells[0] ?? 27;
    this.source = {
      x: (board.left + (((cell % 8) + 0.5) * board.width) / 8) / innerWidth,
      y:
        (board.top + ((Math.floor(cell / 8) + 0.5) * board.height) / 8) /
        innerHeight,
    };
  }
  private active = false;
  private calm = false;
  private index = 0;
  private streak = 0;
  private weights: number[] = THEMES.map((_, i) => (i === 0 ? 1 : 0));
  private motes = Array.from({ length: 48 }, (_, i) => ({
    x: Math.random(),
    y: Math.random(),
    s: 1 + Math.random() * 3,
    p: Math.random() * 6.28,
    side: i % 2,
  }));
  constructor() {
    this.canvas.className = "ambient-canvas";
    this.canvas.setAttribute("aria-hidden", "true");
    document.body.prepend(this.canvas);
    this.ctx = this.canvas.getContext("2d")!;
  }
  set(streak: number, active: boolean, calm: boolean) {
    const next = themeFor(streak);
    this.streak = streak;
    if (next !== this.index && active && !calm) this.wave = performance.now();
    this.index = next;
    this.active = active;
    this.calm = calm;
    document.documentElement.style.setProperty("--world-bg", THEMES[next]!.bg);
    document.documentElement.style.setProperty(
      "--world-ink",
      THEMES[next]!.ink,
    );
    document.documentElement.style.setProperty(
      "--world-accent",
      themeAccent(streak),
    );
    document.documentElement.dataset.material = THEMES[next]!.material;
    const boardColor = "#" + THEMES[next]!.board.toString(16).padStart(6, "0");
    document.documentElement.style.setProperty("--study-board", boardColor);
    document.documentElement.style.setProperty("--tile-sheen", next === 0 ? "0" : next === 4 || next === 5 ? ".22" : ".10");
    document.documentElement.style.setProperty(
      "--world-duration",
      calm ? "250ms" : next === 0 ? "1800ms" : "1000ms",
    );
    if (active && !calm && !this.frame) {
      this.last = performance.now();
      this.frame = requestAnimationFrame((t) => this.draw(t));
    }
    if (!active || calm) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
      this.energy = 0;
      this.wave = 0;
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }
  impulse(amount: number) {
    if (this.active && !this.calm) {
      this.energy = Math.min(3, this.energy + amount);
      if (amount >= 1) this.wave = performance.now();
    }
  }
  private draw(now: number) {
    const dt = Math.max(0, Math.min(40, now - this.last));
    this.last = now;
    this.time += dt / 1000;
    this.weights = this.weights.map(
      (v, i) =>
        v +
        ((i === this.index ? 1 : 0) - v) *
          (1 - Math.exp(-dt / (this.index === 0 ? 450 : 250))),
    );
    this.energy *= Math.exp(-dt / 1100);
    const w = innerWidth,
      h = innerHeight,
      dpr = Math.min(1.5, devicePixelRatio);
    if (
      this.canvas.width !== Math.round(w * dpr) ||
      this.canvas.height !== Math.round(h * dpr)
    ) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    const c = this.ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    const target = parseInt(themeAccent(this.streak).slice(1), 16);
    this.prism = this.prism.map(
      (v, i) =>
        v + (((target >> ((2 - i) * 8)) & 255) - v) * (1 - Math.exp(-dt / 250)),
    );
    const prismColor = `rgb(${this.prism.map(Math.round).join(",")})`;
    for (const [idx, opacity] of this.weights.entries()) {
      const theme = THEMES[idx!]!;
      if (opacity < 0.01) continue;
      c.fillStyle = idx === 10 ? prismColor : theme.accent;
      c.strokeStyle = c.fillStyle;
      c.save();
      c.globalAlpha = opacity * 0.09;
      if (idx === 3 || idx === 5) {
        for (let band = 0; band < 3; band++) {
          const x = ((band / 3 + this.time * 0.006) % 1) * w;
          c.beginPath();
          c.moveTo(x - w * 0.35, 0);
          c.lineTo(x - w * 0.28, 0);
          c.lineTo(x + w * 0.4, h);
          c.lineTo(x + w * 0.3, h);
          c.fill();
        }
      } else if (idx === 6) {
        c.lineWidth = 2;
        for (const side of [0.025, 0.975]) {
          c.beginPath();
          c.moveTo(w * side, 0);
          for (let k = 1; k <= 10; k++)
            c.lineTo(w * side + Math.sin(k * 3.1) * 13, (h * k) / 10);
          c.stroke();
        }
      } else if (idx >= 8) {
        c.lineWidth = idx === 9 ? 4 : 2;
        for (let ring = 0; ring < 3; ring++) {
          c.beginPath();
          c.ellipse(
            w * 0.5,
            h * 0.42,
            w * (0.52 + ring * 0.12),
            h * (0.36 + ring * 0.1),
            Math.sin(this.time * 0.08) * 0.12,
            0,
            Math.PI * 2,
          );
          c.stroke();
        }
      } else if (idx === 4 || idx === 7) {
        c.beginPath();
        c.moveTo(0, h * 0.1);
        c.lineTo(w * 0.18, h * 0.45);
        c.lineTo(0, h * 0.65);
        c.fill();
        c.beginPath();
        c.moveTo(w, h * 0.3);
        c.lineTo(w * 0.84, h * 0.65);
        c.lineTo(w, h * 0.9);
        c.fill();
      }
      c.restore();
      const count = Math.min(48, 20 + idx! * 3);
      for (let i = 0; i < count; i++) {
        const m = this.motes[i]!;
        const speed = 0.018 + idx! * 0.002;
        const y =
          ((((m.y - this.time * speed * (idx === 4 ? -1 : 1)) % 1) + 1) % 1) *
          h;
        const edge = m.side ? 0.83 + m.x * 0.16 : 0.01 + m.x * 0.16;
        const x =
          edge * w +
          Math.sin(this.time * 0.5 + m.p) * 10 +
          Math.sin(m.p) * this.energy * 24;
        c.save();
        c.translate(x, y);
        c.rotate(this.time * (idx === 5 ? 1 : 0.2) + m.p);
        c.globalAlpha =
          opacity! *
          (0.18 + 0.22 * (0.5 + 0.5 * Math.sin(this.time + m.p))) *
          Math.min(1.5, 1 + this.energy * 0.3);
        if (idx === 5) c.fillRect(-m.s * 3, 0, m.s * 6, 1);
        else if (idx === 4 || idx === 7 || idx === 10) {
          c.rotate(Math.PI / 4);
          c.fillRect(-m.s, -m.s, m.s * 2, m.s * 2);
        } else {
          c.beginPath();
          c.arc(0, 0, m.s * (1 + this.energy * 0.3), 0, Math.PI * 2);
          c.fill();
        }
        c.restore();
      }
    }
    if (this.wave) {
      const phase = Math.max(0, (now - this.wave) / 1200);
      if (phase < 1) {
        const x = this.source.x * w,
          y = this.source.y * h;
        c.strokeStyle =
          this.index === 10 ? prismColor : themeAccent(this.streak);
        c.globalAlpha = Math.sin(phase * Math.PI) * 0.3;
        c.lineWidth = 24 * (1 - phase) + 1;
        c.beginPath();
        c.arc(x, y, phase * Math.hypot(w, h) * 0.65, 0, Math.PI * 2);
        c.stroke();
        c.globalAlpha = 1;
      } else this.wave = 0;
    }
    this.frame = requestAnimationFrame((t) => this.draw(t));
  }
}
