import { it, expect } from "vitest";
import { BASELINE_LAYER } from "../src/diagnostics/clear-layers";
import { type FullRow } from "../src/diagnostics/full-clear-plan";
import {
  SCORE_FEEDBACK_PLAN,
  summarizeScoreFeedback,
} from "../src/diagnostics/score-feedback-plan";

function fixture(): FullRow[] {
  return SCORE_FEEDBACK_PLAN.map((scoreFeedback) => ({
    condition: BASELINE_LAYER,
    phase: "comparison",
    scoreFeedback,
    valid: true,
    metrics: {
      intervals: 480,
      over33Raw: 8,
      over33: scoreFeedback === "legacy" ? 8 : 2,
      over34: 2,
      over50: 0,
      maxMs: 50,
      p95Ms: 17,
    },
  }));
}
it("requires improvement in both directions with valid and stable controls", () => {
  const rows = fixture();
  expect(summarizeScoreFeedback(rows, false).improved).toBe(true);
  expect(summarizeScoreFeedback(rows, true).improved).toBe(false);
  expect(summarizeScoreFeedback(rows.slice(1), false).improved).toBe(false);
  for (const mutate of [
    (r: FullRow[]) => {
      r[2]!.metrics.over33 = 15;
    },
    (r: FullRow[]) => {
      r[4]!.metrics.over33 = 0;
    },
    (r: FullRow[]) => {
      r[5]!.metrics.maxMs = 66;
    },
    (r: FullRow[]) => {
      r[6]!.valid = false;
    },
    (r: FullRow[]) => {
      r[7]!.metrics.intervals = 1;
    },
  ]) {
    const changed = fixture();
    mutate(changed);
    expect(summarizeScoreFeedback(changed, false).improved).toBe(false);
  }
  expect(
    summarizeScoreFeedback(
      rows.map((r) => ({ ...r, phase: "attribution" })),
      false,
    ).improved,
  ).toBe(false);
});
