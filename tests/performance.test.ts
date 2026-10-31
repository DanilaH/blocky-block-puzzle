import { expect, it, vi } from "vitest";
import { PerformanceCapture } from "../src/platform/performance";

it("bounds capture storage and excludes inactive gaps", () => {
  let callback: FrameRequestCallback = () => {};
  vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => {callback=fn;return 1;});
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal("innerWidth",390);vi.stubGlobal("innerHeight",844);vi.stubGlobal("devicePixelRatio",2);
  try {
    const capture=new PerformanceCapture();capture.start();capture.setActive(true);
    for(let i=1;i<=8000;i++) callback(i*16);
    for(let i=0;i<600;i++)capture.record("phase",i);
    const data=capture.snapshot();expect(data.sampleCount).toBe(7200);expect(data.phases).toHaveLength(512);expect(data.median).toBe(16);
    capture.setActive(false);capture.setActive(true);callback(1000000);callback(1000016);
    expect(capture.snapshot().frames.at(-1)).toBe(16);
    expect(capture.snapshot().over50).toBe(0);
  } finally {vi.unstubAllGlobals();}
});
