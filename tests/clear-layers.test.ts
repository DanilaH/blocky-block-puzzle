import { describe, it, expect } from "vitest";
import {
  CLEAR_LAYERS,
  BASELINE_LAYER,
  layerPlan,
  summarizeLayers,
  validateLayer,
  type LayerProof,
} from "../src/diagnostics/clear-layers";
function proof(): LayerProof {
  return {
    renderedTheme: 5,
    savedTheme: 5,
    score: 1574,
    boardEmpty: true,
    rewardDomCreated: 3,
    rewardRasters: { prepared: 4, fallbacks: 0 },
    scene: { draws: 140, inkPeak: 48, vfxPeak: 90 },
    atmosphere: { draws: 70, disabled: false },
    festival: { draws: 140, bursts: 2, spawned: 148, disabled: false },
  };
}
function sample(slow: number, max = 40) {
  const frames = Array.from({ length: 100 }, (_, i) => (i < slow ? max : 16.7));
  let t = 1000;
  return {
    placements: [{ at: 1000 }],
    frames,
    frameTimes: frames.map((ms) => (t += ms)),
  };
}
describe("layer study protocol", () => {
  it("brackets both reversed orders and changes exactly one dimension", () => {
    const plan = layerPlan();
    expect(plan).toHaveLength(18);
    const a = plan.filter((e) => e.round === 0),
      b = plan.filter((e) => e.round === 1);
    expect(a[0]!.condition.id).toBe("baseline");
    expect(a.at(-1)!.condition.id).toBe("baseline");
    expect(b[0]!.condition.id).toBe("baseline");
    expect(b.at(-1)!.condition.id).toBe("baseline");
    expect(a.slice(1, -1).map((e) => e.condition.id)).toEqual(
      b
        .slice(1, -1)
        .reverse()
        .map((e) => e.condition.id),
    );
    const flags = [
      "hideInk",
      "hideVfx",
      "skipFestival",
      "skipAtmosphere",
      "skipRewardDom",
      "freezeTheme",
      "legacyRewardText",
    ] as const;
    for (const c of CLEAR_LAYERS.slice(1))
      expect(flags.filter((f) => c[f])).toHaveLength(1);
  });
  it("does not mistake a disabled scene or wrong logical result for a valid condition", () => {
    expect(validateLayer(BASELINE_LAYER, proof()).valid).toBe(true);
    expect(validateLayer(CLEAR_LAYERS[1], proof()).errors).toContain(
      "ink-output",
    );
    const p = proof();
    p.scene.inkPeak = 0;
    expect(validateLayer(CLEAR_LAYERS[1], p).valid).toBe(true);
    p.scene.vfxPeak = 0;
    expect(validateLayer(CLEAR_LAYERS[1], p).errors).toContain("vfx-output");
    const q = proof();
    q.renderedTheme = 1;
    expect(validateLayer(CLEAR_LAYERS[6], q).valid).toBe(true);
    q.savedTheme = 1;
    expect(validateLayer(CLEAR_LAYERS[6], q).errors).toContain(
      "logical-outcome",
    );
  });
  it("requires the selected reward renderer and rejects fallback results", () => {
    const p = proof();
    expect(validateLayer(CLEAR_LAYERS[7], p).errors).toContain("renderer-path");
    p.rewardRasters.prepared = 0;
    expect(validateLayer(CLEAR_LAYERS[7], p).valid).toBe(true);
    expect(validateLayer(BASELINE_LAYER, p).errors).toContain("renderer-path");
    p.rewardRasters = { prepared: 4, fallbacks: 1 };
    expect(validateLayer(BASELINE_LAYER, p).errors).toContain("renderer-path");
    p.rewardRasters.prepared = 0;
    expect(validateLayer(CLEAR_LAYERS[7], p).errors).toContain("renderer-path");
  });
  it("requires both comparable rounds and a stable maximum, excluding warmup/trace and functional runs", () => {
    const episodes = layerPlan().map((e) => ({
      ...e,
      validation: { valid: true },
      sample: sample(
        e.condition.id === "baseline" ? 8 : 2,
        e.condition.id === "baseline" ? 40 : 35,
      ),
    }));
    const summary = summarizeLayers(episodes);
    expect(summary.rows.every((r) => r.investigate)).toBe(true);
    const bad = structuredClone(episodes);
    bad.find(
      (e) => e.round === 1 && e.condition.id === "no-board-ink",
    )!.sample = sample(2, 90);
    expect(summarizeLayers(bad).rows[0]!.investigate).toBe(false);
    expect(
      summarizeLayers(episodes, true).rows.every((r) => !r.investigate),
    ).toBe(true);
    expect(
      summarizeLayers(episodes.filter((e) => e.round === 0)).rows.every(
        (r) => !r.investigate,
      ),
    ).toBe(true);
    const withTrace = [
      ...episodes,
      { ...episodes[0], phase: "trace", sample: sample(99, 200) },
    ];
    expect(summarizeLayers(withTrace)).toEqual(summary);
  });
  it("rejects invalid controls and does not claim a gain when controls contain no jank", () => {
    const episodes = layerPlan().map((e) => ({
      ...e,
      validation: { valid: true },
      sample: sample(0),
    }));
    expect(summarizeLayers(episodes).rows.every((r) => !r.investigate)).toBe(
      true,
    );
    const drifting = layerPlan().map((e) => ({
      ...e,
      validation: { valid: true },
      sample: sample(
        e.condition.id === "baseline" ? 8 : 2,
        e.condition.id === "baseline" ? 40 : 35,
      ),
    }));
    drifting[drifting.length - 1]!.sample = sample(40, 40);
    expect(summarizeLayers(drifting).rows.every((r) => !r.investigate)).toBe(
      true,
    );
    episodes[0]!.validation.valid = false;
    expect(summarizeLayers(episodes).rows[0]!.rounds[0]!.comparable).toBe(
      false,
    );
  });
});
