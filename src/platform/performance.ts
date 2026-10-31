import { Capacitor, registerPlugin } from "@capacitor/core";
/** Opt-in, bounded diagnostics. No board, save data or persistent identifiers. */
export class PerformanceCapture {
  private frames = new Float32Array(7200);
  private cursor = 0;
  private count = 0;
  private last = 0;
  private frame = 0;
  private active = false;
  enabled = false;
  private phases: { name: string; ms: number; at: number }[] = [];
  start() {
    this.cursor = this.count = 0;
    this.phases = [];
    this.enabled = true;
    this.sync();
  }
  setActive(active: boolean) {
    this.active = active;
    this.sync();
  }
  private sync() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.last = 0;
    if (this.enabled && this.active)
      this.frame = requestAnimationFrame(this.tick);
  }
  private tick = (now: number) => {
    if (this.last) {
      this.frames[this.cursor] = now - this.last;
      this.cursor = (this.cursor + 1) % this.frames.length;
      this.count = Math.min(this.frames.length, this.count + 1);
    }
    this.last = now;
    this.frame = requestAnimationFrame(this.tick);
  };
  measure<T>(name: string, operation: () => T): T {
    if (!this.enabled) return operation();
    const at = performance.now();
    try {
      return operation();
    } finally {
      this.record(name, performance.now() - at);
    }
  }
  record(name: string, ms: number) {
    if (!this.enabled) return;
    if (this.phases.length === 512) this.phases.shift();
    this.phases.push({ name, ms, at: performance.now() });
  }
  snapshot() {
    const samples = Array.from(
      { length: this.count },
      (_, i) =>
        this.frames[
          (this.cursor - this.count + i + this.frames.length) %
            this.frames.length
        ]!,
    );
    const sorted = samples.slice().sort((a, b) => a - b);
    return {
      version: "0.27",
      clock: "browser RAF intervals; not GPU timings",
      viewport: {
        width: innerWidth,
        height: innerHeight,
        dpr: devicePixelRatio,
      },
      sampleCount: samples.length,
      median: sorted[Math.floor(sorted.length * 0.5)] ?? null,
      p95: sorted[Math.floor(sorted.length * 0.95)] ?? null,
      over33: samples.filter((x) => x > 33.4).length,
      over50: samples.filter((x) => x > 50).length,
      frames: samples,
      phases: this.phases.slice(),
    };
  }
  async export() {
    this.enabled = false;
    this.sync();
    const json = JSON.stringify(this.snapshot(), null, 2);
    if (Capacitor.isNativePlatform()) {
      await registerPlugin<{ share(options: { json: string }): Promise<void> }>(
        "BlockyDiagnostics",
      ).share({ json });
    } else {
      const url = URL.createObjectURL(
        new Blob([json], { type: "application/json" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "blocky-performance-0.27.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
}
export const performanceCapture = new PerformanceCapture();
