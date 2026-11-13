import type { FullRow } from "./full-clear-plan";
export const SCORE_FEEDBACK_PLAN = [
  "legacy",
  "filter",
  "filter",
  "legacy",
  "legacy",
  "filter",
  "filter",
  "legacy",
] as const;

export function summarizeScoreFeedback(
  rows: FullRow[],
  functionalOnly: boolean,
) {
  const samples = rows.filter((r) => r.phase === "comparison");
  const orders = [0, 1].map((direction) => {
    const pairs = [direction, direction + 2].map((i) =>
      samples.slice(i * 2, i * 2 + 2),
    );
    const old = pairs.flat().filter((r) => r.scoreFeedback === "legacy");
    const next = pairs.flat().filter((r) => r.scoreFeedback === "filter");
    if (old.length !== 2 || next.length !== 2)
      return { direction, comparable: false, meetsTarget: false };
    const mean = (rs: FullRow[]) =>
      rs.reduce((n, r) => n + r.metrics.over33, 0) / rs.length;
    const reference = mean(old),
      candidate = mean(next);
    const stable =
      Math.abs(old[0]!.metrics.over33 - old[1]!.metrics.over33) <=
      Math.max(2, reference * 0.5);
    const comparable =
      !functionalOnly &&
      [...old, ...next].every((r) => r.valid && r.metrics.intervals >= 100);
    return {
      direction,
      comparable,
      baselineStable: stable,
      beforeMean: reference,
      candidateMean: candidate,
      meetsTarget:
        comparable &&
        stable &&
        reference >= 2 &&
        candidate <= reference / 2 &&
        Math.max(...next.map((r) => r.metrics.maxMs)) <=
          Math.max(...old.map((r) => r.metrics.maxMs)) + 1,
    };
  });
  return {
    orders,
    improved: samples.length === 8 && orders.every((r) => r.meetsTarget),
  };
}
