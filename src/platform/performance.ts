import { Capacitor, registerPlugin } from "@capacitor/core";
type Phase = { name: string; ms: number; at: number };
type Marker = {
  at: number;
  lines: number;
  streak: number;
  allClear: boolean;
  calm: boolean;
};
type Summary = { count: number; totalMs: number; maxMs: number };
/** Opt-in, bounded diagnostics. No board, save data or persistent identifiers. */
export class PerformanceCapture {
  private frames = new Float32Array(7200);
  private frameTimes = new Float64Array(7200);
  private cursor = 0;
  private count = 0;
  private last = 0;
  private frame = 0;
  private active = false;
  enabled = false;
  private phases: Phase[] = [];
  private phaseCursor = 0;
  private summaries = new Map<string, Summary>();
  private markers: Marker[] = [];
  private markerCursor = 0;
  private longTasks: { at: number; ms: number }[] = [];
  private longTaskCursor = 0;
  private observer: PerformanceObserver | null = null;
  private activeSince = 0;
  private longTaskSupported = false;
  markPlacement(
    lines: number,
    streak: number,
    allClear: boolean,
    calm: boolean,
  ) {
    if (!this.enabled || !this.active) return;
    this.markers[this.markerCursor] = {
      at: performance.now(),
      lines,
      streak,
      allClear,
      calm,
    };
    this.markerCursor = (this.markerCursor + 1) % 128;
  }
  private collectTasks(entries: PerformanceEntry[]) {
    for (const entry of entries) {
      if (entry.startTime < this.activeSince) continue;
      this.longTasks[this.longTaskCursor] = {
        at: entry.startTime,
        ms: entry.duration,
      };
      this.longTaskCursor = (this.longTaskCursor + 1) % 128;
    }
  }
  start() {
    this.observer?.disconnect();
    this.observer = null;
    this.markers = [];
    this.longTasks = [];
    this.markerCursor = this.longTaskCursor = 0;
    this.cursor = this.count = 0;
    this.phases = [];
    this.phaseCursor = 0;
    this.summaries.clear();
    this.enabled = true;
    this.sync();
  }
  setActive(active: boolean) {
    this.active = active;
    this.sync();
  }
  private sync() {
    if (this.observer) {
      this.collectTasks(this.observer.takeRecords());
      this.observer.disconnect();
      this.observer = null;
    }
    this.longTaskSupported =
      typeof PerformanceObserver !== "undefined" &&
      PerformanceObserver.supportedEntryTypes.includes("longtask");
    if (this.enabled && this.active && this.longTaskSupported) {
      this.activeSince = performance.now();
      const observer = new PerformanceObserver((list) => {
        if (this.observer === observer) this.collectTasks(list.getEntries());
      });
      this.observer = observer;
      observer.observe({ type: "longtask" });
    }
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.last = 0;
    if (this.enabled && this.active)
      this.frame = requestAnimationFrame(this.tick);
  }
  private tick = (now: number) => {
    if (this.last) {
      this.frames[this.cursor] = now - this.last;
      this.frameTimes[this.cursor] = now;
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
    if (!Number.isFinite(ms) || ms < 0) return;
    let summary = this.summaries.get(name);
    // Call sites use fixed names; still bound storage if a new caller does not.
    if (!summary) {
      if (this.summaries.size >= 32) return;
      summary = { count: 0, totalMs: 0, maxMs: 0 };
      this.summaries.set(name, summary);
    }
    summary.count++;
    summary.totalMs += ms;
    summary.maxMs = Math.max(summary.maxMs, ms);
    this.phases[this.phaseCursor] = { name, ms, at: performance.now() };
    this.phaseCursor = (this.phaseCursor + 1) % 512;
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
      version: "0.30",
      schemaVersion: 3,
      timestampClock:
        "performance.now milliseconds; frame timestamps mark interval end",
      phaseUnits:
        "milliseconds; commitIncludingSaveWallTime includes asynchronous storage wait",
      clock: "browser RAF intervals; not GPU timings",
      viewport: {
        width: innerWidth,
        height: innerHeight,
        dpr: devicePixelRatio,
      },
      longTaskSupported: this.longTaskSupported,
      longTasks: Array.from({ length: this.longTasks.length }, (_, i) => ({
        ...this.longTasks[
          (this.longTaskCursor - this.longTasks.length + i + 128) % 128
        ]!,
      })),
      placements: Array.from({ length: this.markers.length }, (_, i) => ({
        ...this.markers[
          (this.markerCursor - this.markers.length + i + 128) % 128
        ]!,
      })),
      sampleCount: samples.length,
      median: sorted[Math.floor(sorted.length * 0.5)] ?? null,
      p95: sorted[Math.floor(sorted.length * 0.95)] ?? null,
      over33: samples.filter((x) => x > 33.4).length,
      over50: samples.filter((x) => x > 50).length,
      frames: samples,
      frameTimes: Array.from(
        { length: this.count },
        (_, i) =>
          this.frameTimes[
            (this.cursor - this.count + i + this.frames.length) %
              this.frames.length
          ]!,
      ),
      phases: Array.from({ length: this.phases.length }, (_, i) => ({
        ...this.phases[
          (this.phaseCursor - this.phases.length + i + 512) % 512
        ]!,
      })),
      phaseSummary: Object.fromEntries(
        Array.from(this.summaries, ([name, value]) => [
          name,
          { ...value, meanMs: value.totalMs / value.count },
        ]),
      ),
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
      link.download = "blocky-performance-0.30.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
}
export const performanceCapture = new PerformanceCapture();
