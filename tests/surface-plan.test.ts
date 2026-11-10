import { expect, it } from "vitest";
import {
  SURFACE_ORDER,
  summarizeSurfaces,
  type SurfaceRow,
} from "../src/diagnostics/surface-plan";
const rows = (): SurfaceRow[] =>
  SURFACE_ORDER.map((mode) => ({
    mode,
    phase: "comparison",
    valid: true,
    metrics: {
      intervals: 470,
      over33Raw: mode === "original" ? 12 : 5,
      over33: mode === "original" ? 12 : 5,
      over34: 4,
      over50: 1,
      maxMs: 60,
      p95Ms: 16.7,
    },
  }));
it("accepts a lower long-frame count only in both opposite orders", () =>
  expect(summarizeSurfaces(rows(), true, true).improved).toBe(true));
it("does not call a browser run or incomplete report a physical win", () => {
  expect(summarizeSurfaces(rows(), false, true).improved).toBe(false);
  expect(summarizeSurfaces(rows(), true, false).improved).toBe(false);
  expect(summarizeSurfaces(rows().slice(0, 7), true, true).improved).toBe(
    false,
  );
});
it("rejects a worse tail even when average long-frame counts improve", () => {
  const r = rows();
  r[1]!.metrics.maxMs = 100;
  expect(summarizeSurfaces(r, true, true).improved).toBe(false);
});
it("rejects invalid paths and a changed comparison order", () => {
  const a = rows();
  a[0]!.valid = false;
  expect(summarizeSurfaces(a, true, true).improved).toBe(false);
  const b = rows();
  [b[0], b[1]] = [b[1]!, b[0]!];
  expect(summarizeSurfaces(b, true, true).improved).toBe(false);
});
it("does not promote a near-clean or unstable baseline", () => {
  const a = rows();
  for (const r of a) if (r.mode === "original") r.metrics.over33 = 1;
  expect(summarizeSurfaces(a, true, true).improved).toBe(false);
  const b = rows();
  b[4]!.metrics.over33 = 50;
  expect(summarizeSurfaces(b, true, true).improved).toBe(false);
});
it("requires known unchanged device/WebView and cool thermal state for a native verdict", async () => {
  const { surfaceDeviceStable } = await import(
    "../src/diagnostics/surface-plan"
  );
  const d = { sdk: 35, webViewVersion: "156", thermalStatus: 0 };
  expect(surfaceDeviceStable(d, { ...d })).toBe(true);
  expect(surfaceDeviceStable(d, { ...d, thermalStatus: 2 })).toBe(false);
  expect(surfaceDeviceStable(d, null)).toBe(false);
  expect(surfaceDeviceStable(d, { ...d, webViewVersion: "157" })).toBe(false);
});
