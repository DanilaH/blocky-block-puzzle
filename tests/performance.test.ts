import { expect, it, vi } from "vitest";
import { PerformanceCapture } from "../src/platform/performance";
import { APP_VERSION } from "../src/app-version";

it("bounds capture storage and excludes inactive gaps", () => {
  let callback: FrameRequestCallback = () => {};
  vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => {
    callback = fn;
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal("innerWidth", 390);
  vi.stubGlobal("innerHeight", 844);
  vi.stubGlobal("devicePixelRatio", 2);
  try {
    const capture = new PerformanceCapture();
    capture.start();
    capture.setActive(true);
    for (let i = 1; i <= 8000; i++) callback(i * 16);
    for (let i = 0; i < 600; i++) capture.record("phase", i);
    const data = capture.snapshot();
    expect(data.version).toBe(APP_VERSION);
    expect(data.sampleCount).toBe(7200);
    expect(data.phases).toHaveLength(512);
    expect(data.median).toBe(16);
    expect(data.frameTimes).toHaveLength(7200);
    expect(data.frameTimes.at(-1)).toBe(128000);
    expect(data.phases[0]?.ms).toBe(88);
    expect(data.phases.at(-1)?.ms).toBe(599);
    expect(data.phaseSummary.phase).toEqual({
      count: 600,
      totalMs: 179700,
      maxMs: 599,
      meanMs: 299.5,
    });
    // The snapshot remains immutable as capture continues.
    capture.record("phase", 1000);
    expect(data.phaseSummary.phase?.count).toBe(600);
    expect(data.phases.at(-1)?.ms).toBe(599);
    capture.setActive(false);
    capture.setActive(true);
    callback(1000000);
    callback(1000016);
    expect(capture.snapshot().frames.at(-1)).toBe(16);
    expect(capture.snapshot().over50).toBe(0);
    capture.start();
    expect(capture.snapshot().phaseSummary).toEqual({});
    expect(capture.snapshot().frameTimes).toEqual([]);
    capture.record("invalid", NaN);
    capture.record("invalid", -1);
    for (let i = 0; i < 40; i++) capture.record(`phase-${i}`, 1);
    expect(Object.keys(capture.snapshot().phaseSummary)).toHaveLength(32);
    expect(capture.snapshot().phases).toHaveLength(32);
    capture.setActive(false);
  } finally {
    vi.unstubAllGlobals();
  }
});

it("bounds long tasks and placement markers, excludes pause and stale observers", () => {
  let now = 100;
  const clock = vi.spyOn(performance, "now").mockImplementation(() => now);
  const observers: Observer[] = [];
  class Observer {
    static supportedEntryTypes = ["longtask"];
    records: PerformanceEntry[] = [];
    disconnected = false;
    constructor(
      public callback: (list: { getEntries(): PerformanceEntry[] }) => void,
    ) {
      observers.push(this);
    }
    observe() {}
    disconnect() {
      this.disconnected = true;
    }
    takeRecords() {
      const records = this.records;
      this.records = [];
      return records;
    }
    emit(at: number) {
      this.callback({
        getEntries: () => [{ startTime: at, duration: 75 } as PerformanceEntry],
      });
    }
  }
  vi.stubGlobal("PerformanceObserver", Observer);
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal("innerWidth", 390);
  vi.stubGlobal("innerHeight", 844);
  vi.stubGlobal("devicePixelRatio", 2);
  try {
    const capture = new PerformanceCapture();
    capture.start();
    expect(observers).toHaveLength(0);
    capture.setActive(true);
    const first = observers[0]!;
    first.emit(99); // task started before recording resumed
    for (let i = 0; i < 140; i++) {
      now = 100 + i;
      first.emit(now);
      capture.markPlacement(6, i, true, false);
    }
    let snapshot = capture.snapshot();
    expect(snapshot.longTasks).toHaveLength(128);
    expect(snapshot.longTasks[0]?.at).toBe(112);
    expect(snapshot.placements[0]?.streak).toBe(12);
    first.records.push({ startTime: 240, duration: 60 } as PerformanceEntry);
    capture.setActive(false);
    expect(first.disconnected).toBe(true);
    expect(capture.snapshot().longTasks.at(-1)?.at).toBe(240);
    capture.markPlacement(0, 999, false, false);
    first.emit(999);
    expect(capture.snapshot().placements.at(-1)?.streak).toBe(139);
    now = 1000;
    capture.setActive(true);
    first.emit(1001); // obsolete callback must not enter the resumed session
    observers[1]!.emit(950);
    expect(capture.snapshot().longTasks.at(-1)?.at).toBe(240);
    observers[1]!.emit(1002);
    expect(capture.snapshot().longTasks.at(-1)?.at).toBe(1002);
    capture.start();
    expect(observers[1]!.disconnected).toBe(true);
    snapshot = capture.snapshot();
    expect(snapshot.longTasks).toEqual([]);
    expect(snapshot.placements).toEqual([]);
    capture.setActive(false);
  } finally {
    clock.mockRestore();
    vi.unstubAllGlobals();
  }
});

it("keeps exact clear fixtures immutable and removes their game identifier", async () => {
  const { newGame } = await import("../src/core/rules");
  const { createProfile } = await import("../src/core/profile");
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal("innerWidth", 392);
  vi.stubGlobal("innerHeight", 872);
  vi.stubGlobal("devicePixelRatio", 2.75);
  try {
    const before = newGame(1234, "private-game-id", "flow-v4");
    const fixture = {
      before,
      move: { slot: 0, x: 0, y: 0 },
      expectedScore: 1000,
      rows: [0],
      columns: [],
      beforeTheme: 0,
      afterTheme: 5,
      beforeWardrobe: { selected: 0, unlocked: [0], discoveries: 1 },
      afterWardrobe: { selected: 5, unlocked: [0, 5], discoveries: 2 },
      revealVariant: 2,
      newRecord: false,
      settings: createProfile(before).settings,
    };
    const capture = new PerformanceCapture(),
      context = { canvas: [1024, 1024] };
    capture.markPlacement(1, 1, true, false, fixture);
    capture.start(context);
    capture.setActive(true);
    capture.markPlacement(1, 1, true, false, fixture);
    before.board[0] = 6;
    fixture.move.x = 7;
    context.canvas[0] = 512;
    const sample = capture.snapshot(),
      saved = sample.placements[0]!.fixture!;
    expect(saved.before.gameId).toBe("diagnostic-game");
    expect(saved.before.board[0]).toBe(0);
    expect(saved.move.x).toBe(0);
    expect(sample.context).toEqual({ canvas: [1024, 1024] });
    saved.before.board[0] = 5;
    expect(capture.snapshot().placements[0]!.fixture!.before.board[0]).toBe(0);
    capture.start();
    expect(capture.snapshot().context).toBeNull();
    expect(capture.snapshot().placements).toEqual([]);
    capture.setActive(false);
  } finally {
    vi.unstubAllGlobals();
  }
});

it("waits for a recorded frame across the measurement boundary, not timer completion", async () => {
  vi.useFakeTimers();
  let callback: FrameRequestCallback = () => {};
  vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => {
    callback = fn;
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal("innerWidth", 390);
  vi.stubGlobal("innerHeight", 844);
  vi.stubGlobal("devicePixelRatio", 2);
  const capture = new PerformanceCapture();
  try {
    capture.start();
    capture.setActive(true);
    callback(16);
    callback(7866.6);
    let completed = false;
    const waiting = capture.waitForFrame(8000, new AbortController().signal)
      .then(() => { completed = true; });
    await vi.advanceTimersByTimeAsync(32);
    expect(completed).toBe(false);
    callback(8016.6);
    await vi.advanceTimersByTimeAsync(16);
    await waiting;
    expect(completed).toBe(true);
    expect(capture.snapshot().frameTimes.at(-1)).toBe(8016.6);
    expect(capture.snapshot().frames.at(-1)).toBe(150);
  } finally {
    capture.setActive(false);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});

it("bounds missing recorder frames and promptly cancels a pending boundary", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  const capture = new PerformanceCapture();
  try {
    capture.start();
    capture.setActive(true);
    const timedOut = expect(
      capture.waitForFrame(8000, new AbortController().signal),
    ).rejects.toThrow("capture-frame-timeout");
    await vi.advanceTimersByTimeAsync(2016);
    await timedOut;
    const controller = new AbortController();
    const cancelled = expect(
      capture.waitForFrame(8000, controller.signal),
    ).rejects.toThrow("background");
    controller.abort("background");
    await cancelled;
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    capture.setActive(false);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
