import { describe, it, expect } from "vitest";
import {
  FULL_CONDITIONS,
  fullPlan,
  fullFrameMetrics,
  summarizeFull,
  type FullRow,
} from "../src/diagnostics/full-clear-plan";
import { BASELINE_LAYER } from "../src/diagnostics/clear-layers";
describe("complete one-session diagnostic", () => {
  it("covers both targeted factorials and every original rendering layer in counterbalanced brackets", () => {
    const plan = fullPlan();
    expect(FULL_CONDITIONS).toHaveLength(14);
    expect(new Set(FULL_CONDITIONS.map((x) => x.id)).size).toBe(14);
    expect(plan).toHaveLength(40);
    for (const round of [0, 1]) {
      const xs = plan.filter((x) => x.round === round);
      expect(xs[0]!.condition.id).toBe("baseline");
      expect(xs.at(-1)!.condition.id).toBe("baseline");
      expect(
        xs
          .filter((x) => x.condition.id !== "baseline")
          .map((x) => x.condition.id),
      ).toEqual(
        (round ? [...FULL_CONDITIONS].reverse() : FULL_CONDITIONS).map(
          (x) => x.id,
        ),
      );
      let gap = 0;
      for (const x of xs) {
        if (x.condition.id === "baseline") gap = 0;
        else gap++;
        expect(gap).toBeLessThanOrEqual(3);
      }
    }
    expect(
      FULL_CONDITIONS.find((x) => x.id === "no-flight-or-theme-impulse"),
    ).toMatchObject({ skipPointFlights: true, skipThemeImpulse: true });
    expect(
      FULL_CONDITIONS.find((x) => x.id === "no-reward-or-theme"),
    ).toMatchObject({ skipRewardDom: true, freezeTheme: true });
  });
  it("counts real 33.6ms phone intervals while avoiding the Float32 33.4 threshold artifact", () => {
    const m = fullFrameMetrics(
      [33.4000015, 33.6, 50.1],
      [100, 133.6, 183.7],
      0,
    );
    expect(m).toMatchObject({ over33Raw: 3, over33: 2, over34: 1, over50: 1 });
  });
  it("requires valid nearest controls and a benefit in both orders; instrumented episodes cannot nominate", () => {
    const metrics = {
      intervals: 480,
      over33Raw: 8,
      over33: 8,
      over34: 2,
      over50: 0,
      maxMs: 50,
      p95Ms: 17,
    };
    const rows: FullRow[] = fullPlan().map((x) => ({
      ...x,
      phase: "comparison",
      valid: true,
      metrics: { ...metrics, over33: x.condition.id === "baseline" ? 8 : 2 },
    }));
    expect(summarizeFull(rows, false).every((x) => x.investigate)).toBe(true);
    expect(summarizeFull(rows, true).some((x) => x.investigate)).toBe(false);
    rows.find(
      (x) => x.round === 1 && x.condition.id === "no-point-flights",
    )!.valid = false;
    expect(
      summarizeFull(rows, false).find(
        (x) => x.condition === "no-point-flights",
      )!.investigate,
    ).toBe(false);
    const traces = rows.map((x) => ({ ...x, phase: "attribution" }));
    expect(summarizeFull(traces, false).some((x) => x.investigate)).toBe(false);
  });
});
