import { expect, it, vi } from "vitest";
import { PerformanceCapture } from "../src/platform/performance";

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
