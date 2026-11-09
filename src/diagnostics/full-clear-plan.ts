import { BASELINE_LAYER, CLEAR_LAYERS, type ClearLayer } from "./clear-layers";
const condition = (
  id: string,
  label: string,
  flags: Partial<ClearLayer>,
): ClearLayer => ({ ...BASELINE_LAYER, ...flags, id, label });
export const FULL_CONDITIONS: ClearLayer[] = [
  ...CLEAR_LAYERS.slice(1, 5),
  condition("no-point-flights", "Без перелётов очков", {
    skipPointFlights: true,
  }),
  condition("no-theme-impulse", "Без импульса темы", {
    skipThemeImpulse: true,
  }),
  condition("no-flight-or-theme-impulse", "Без перелётов и импульса", {
    skipPointFlights: true,
    skipThemeImpulse: true,
  }),
  CLEAR_LAYERS[5],
  CLEAR_LAYERS[6],
  condition("no-reward-or-theme", "Без блока наград и смены темы", {
    skipRewardDom: true,
    freezeTheme: true,
  }),
  condition("no-ink", "Без декора поля", { hideInk: true }),
  condition("no-board-vfx", "Без частиц поля", { hideVfx: true }),
  condition("no-festival", "Без внешнего праздника", { skipFestival: true }),
  condition("no-atmosphere", "Без фоновой анимации", { skipAtmosphere: true }),
];
export function fullPlan() {
  return [FULL_CONDITIONS, [...FULL_CONDITIONS].reverse()].flatMap(
    (order, round) => {
      const result = [{ condition: BASELINE_LAYER as ClearLayer, round }];
      order.forEach((condition, i) => {
        result.push({ condition, round });
        if (i % 3 === 2 || i === order.length - 1)
          result.push({ condition: BASELINE_LAYER, round });
      });
      return result;
    },
  );
}
export function fullFrameMetrics(
  frames: number[],
  times: number[],
  at: number,
  low = 0,
  high = 8000,
) {
  const fs = frames.filter(
      (ms, i) => times[i]! > at + low && times[i]! - ms < at + high,
    ),
    sorted = [...fs].sort((a, b) => a - b);
  return {
    intervals: fs.length,
    over33Raw: fs.filter((x) => x > 33.4).length,
    over33: fs.filter((x) => Math.round(x * 10) / 10 > 33.4).length,
    over34: fs.filter((x) => x > 34).length,
    over50: fs.filter((x) => x > 50).length,
    maxMs: Math.max(0, ...fs),
    p95Ms: sorted[Math.floor(sorted.length * 0.95)] ?? null,
  };
}
export type FullRow = {
  condition: ClearLayer;
  round?: number;
  phase: string;
  valid: boolean;
  metrics: ReturnType<typeof fullFrameMetrics>;
  [key: string]: unknown;
};
export function summarizeFull(rows: FullRow[], functionalOnly: boolean) {
  return FULL_CONDITIONS.map((condition) => {
    const rounds = [0, 1].map((round) => {
      const xs = rows.filter(
          (x) => x.phase === "comparison" && x.round === round,
        ),
        i = xs.findIndex((x) => x.condition.id === condition.id);
      const before = xs
          .slice(0, i)
          .reverse()
          .find((x) => x.condition.id === "baseline"),
        after = xs.slice(i + 1).find((x) => x.condition.id === "baseline"),
        candidate = xs[i];
      if (!before || !after || !candidate)
        return {
          round,
          comparable: false,
          meetsTarget: false,
          reason: "incomplete-bracket",
        };
      const reference = (before.metrics.over33 + after.metrics.over33) / 2;
      const stable =
        Math.abs(before.metrics.over33 - after.metrics.over33) <=
        Math.max(2, reference * 0.5);
      const comparable =
        !functionalOnly &&
        before.valid &&
        after.valid &&
        candidate.valid &&
        Math.min(
          before.metrics.intervals,
          after.metrics.intervals,
          candidate.metrics.intervals,
        ) >= 100;
      return {
        round,
        comparable,
        before: before.metrics,
        after: after.metrics,
        candidate: candidate.metrics,
        baselineStable: stable,
        meetsTarget:
          comparable &&
          stable &&
          reference >= 2 &&
          candidate.metrics.over33 <= reference / 2 &&
          candidate.metrics.maxMs <=
            Math.max(before.metrics.maxMs, after.metrics.maxMs) + 1,
      };
    });
    return {
      condition: condition.id,
      rounds,
      investigate: rounds.every((x) => x.meetsTarget),
    };
  });
}
