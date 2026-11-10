import { fullFrameMetrics } from "./full-clear-plan";
export const SURFACE_WARMUPS = ["original", "generated"] as const;
export const SURFACE_ORDER = [
  "original",
  "generated",
  "generated",
  "original",
  "original",
  "generated",
  "generated",
  "original",
] as const;
export type SurfaceRow = {
  mode: (typeof SURFACE_ORDER)[number];
  phase: "warmup" | "comparison";
  valid: boolean;
  metrics: ReturnType<typeof fullFrameMetrics>;
  [key: string]: unknown;
};
export function summarizeSurfaces(
  rows: SurfaceRow[],
  physical: boolean,
  completed: boolean,
) {
  const samples = rows.filter((r) => r.phase === "comparison");
  const orders = [0, 1].map((direction) => {
    const selected = [direction, direction + 2].flatMap((pair) =>
      samples.slice(pair * 2, pair * 2 + 2),
    );
    const old = selected.filter((r) => r.mode === "original"),
      next = selected.filter((r) => r.mode === "generated");
    const complete = old.length === 2 && next.length === 2;
    const reference = complete
      ? old.reduce((n, r) => n + r.metrics.over33, 0) / 2
      : null;
    const candidate = complete
      ? next.reduce((n, r) => n + r.metrics.over33, 0) / 2
      : null;
    const baselineStable =
      complete &&
      Math.abs(old[0]!.metrics.over33 - old[1]!.metrics.over33) <=
        Math.max(2, reference! * 0.5);
    const comparable =
      physical &&
      completed &&
      complete &&
      selected.every((r) => r.valid && r.metrics.intervals >= 100);
    return {
      direction: direction === 0 ? "original-first" : "generated-first",
      comparable,
      baselineStable,
      beforeMean: reference,
      candidateMean: candidate,
      meetsTarget:
        comparable &&
        baselineStable &&
        reference! >= 2 &&
        candidate! <= reference! * 0.75 &&
        Math.max(...next.map((r) => r.metrics.maxMs)) <=
          Math.max(...old.map((r) => r.metrics.maxMs)) + 1,
    };
  });
  return {
    orders,
    improved:
      samples.length === 8 &&
      samples.every((r, i) => r.mode === SURFACE_ORDER[i]) &&
      orders.every((o) => o.meetsTarget),
  };
}
export type SurfaceDevice = {
  sdk?: number;
  webViewVersion?: string;
  thermalStatus?: number;
  error?: string;
};
export function surfaceDeviceStable(
  before: SurfaceDevice | null,
  after: SurfaceDevice | null,
) {
  return (
    !!before &&
    !!after &&
    typeof before.sdk === "number" &&
    before.sdk === after.sdk &&
    (before.sdk < 26 ||
      (typeof before.webViewVersion === "string" &&
        before.webViewVersion === after.webViewVersion)) &&
    (before.sdk < 29 ||
      (before.thermalStatus === 0 && after.thermalStatus === 0))
  );
}
