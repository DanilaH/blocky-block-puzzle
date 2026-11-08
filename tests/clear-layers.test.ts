import { describe, it, expect } from "vitest";
import {
  CLEAR_LAYERS,
  BASELINE_LAYER,
  layerPlan,
  summarizeLayers,
  validateLayer,
  type LayerProof,
} from "../src/diagnostics/clear-layers";
function proof(
  condition = BASELINE_LAYER as (typeof CLEAR_LAYERS)[number],
): LayerProof {
  const theme = condition.freezeTheme ? 1 : 5;
  const palette = condition.freezeDomPalette ? 1 : theme;
  const omit = condition.skipRewardDom;
  const noNotice = omit || condition.skipThemeNotice || condition.freezeTheme;
  return {
    renderedTheme: theme,
    savedTheme: 5,
    score: 1574,
    boardEmpty: true,
    rewardDomCreated: omit ? 0 : noNotice ? 2 : 3,
    rewardRenderer: "dom",
    rewardEffects: {
      captionAnimations: omit || condition.skipRewardDecoration ? 0 : 2,
      visibleEmblems: 0,
      pointFlights: omit ? 0 : 2,
      hudFlashes: omit || condition.skipHudFlashes ? 0 : 2,
      themeNotices: noNotice ? 0 : 1,
      themeImpulses: condition.freezeTheme ? 0 : 1,
    },
    scene: { draws: 140, inkPeak: 48, vfxPeak: 90, theme },
    atmosphere: {
      draws: 70,
      disabled: false,
      theme,
      domPaletteTheme: palette,
      domPalette:
        palette === 1
          ? { bg: "#f4f3ee", ink: "#325376", accent: "#72a8ec" }
          : { bg: "#233f57", ink: "#f2f4f7", accent: "#a5e8ef" },
    },
    festival: { draws: 140, bursts: 2, spawned: 148, disabled: false, theme },
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
    expect(plan).toHaveLength(16);
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
      "skipHudFlashes",
      "skipRewardDecoration",
      "freezeDomPalette",
      "skipThemeNotice",
    ] as const;
    for (const c of CLEAR_LAYERS.slice(1))
      expect(flags.filter((f) => c[f])).toHaveLength(1);
  });
  it("validates each actual output without freezing unrelated palettes or omitting flights", () => {
    for (const condition of CLEAR_LAYERS)
      expect(validateLayer(condition, proof(condition)).errors).toEqual([]);
    const condition = CLEAR_LAYERS.find((c) => c.id === "no-dom-palette")!;
    const p = proof(condition);
    p.scene.theme = 1;
    expect(validateLayer(condition, p).errors).toContain("presentation-theme");
    p.scene.theme = 5;
    p.atmosphere.domPalette.ink = "#f2f4f7";
    expect(validateLayer(condition, p).errors).toContain("dom-palette");
    const decoration = CLEAR_LAYERS.find(
      (c) => c.id === "no-reward-decoration",
    )!;
    const q = proof(decoration);
    q.rewardEffects.pointFlights = 0;
    expect(validateLayer(decoration, q).errors).toContain(
      "point-flight-output",
    );
    q.savedTheme = 1;
    expect(validateLayer(decoration, q).errors).toContain("logical-outcome");
  });
  it("rejects the old raster path, missing counters and accidental reward removal", () => {
    const p = proof();
    p.rewardRenderer = "raster" as "dom";
    expect(validateLayer(BASELINE_LAYER, p).errors).toContain("renderer-path");
    p.rewardRenderer = "dom";
    p.rewardEffects.captionAnimations = 0;
    expect(validateLayer(BASELINE_LAYER, p).errors).toContain(
      "reward-decoration-output",
    );
    const q = proof();
    q.rewardEffects = undefined as unknown as LayerProof["rewardEffects"];
    expect(validateLayer(BASELINE_LAYER, q).valid).toBe(false);
  });
  it("keeps the theme impulse when omitting only its notice and requires only two score flashes", () => {
    const condition = CLEAR_LAYERS.find((c) => c.id === "no-theme-notice")!;
    const p = proof(condition);
    p.rewardEffects.themeImpulses = 0;
    expect(validateLayer(condition, p).errors).toContain(
      "theme-impulse-output",
    );
    const flashes = CLEAR_LAYERS.find((c) => c.id === "no-hud-flashes")!;
    const q = proof(flashes);
    q.rewardEffects.themeNotices = 0;
    expect(validateLayer(flashes, q).errors).toContain("theme-notice-output");
    q.rewardEffects.hudFlashes = 1;
    expect(validateLayer(flashes, q).errors).toContain("hud-flash-output");
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
      (e) => e.round === 1 && e.condition.id === "no-hud-flashes",
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
