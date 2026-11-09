import { THEMES } from "../game/themes";

const defaults = {
  hideInk: false,
  hideVfx: false,
  skipFestival: false,
  skipAtmosphere: false,
  skipRewardDom: false,
  freezeTheme: false,
  skipHudFlashes: false,
  skipRewardDecoration: false,
  freezeDomPalette: false,
  skipThemeNotice: false,
  skipPointFlights: false,
  skipThemeImpulse: false,
};
function layer<const Id extends string>(
  id: Id,
  label: string,
  flags: Partial<typeof defaults> = {},
) {
  return { ...defaults, ...flags, id, label };
}
export const CLEAR_LAYERS = [
  layer("baseline", "Все эффекты"),
  layer("no-hud-flashes", "Без вспышек счёта", { skipHudFlashes: true }),
  layer("no-reward-decoration", "Без подписи награды", {
    skipRewardDecoration: true,
  }),
  layer("no-dom-palette", "Без смены цветов интерфейса", {
    freezeDomPalette: true,
  }),
  layer("no-theme-notice", "Без плашки новой темы", { skipThemeNotice: true }),
  layer("no-reward-dom", "Без всего блока наград", { skipRewardDom: true }),
  layer("no-theme", "Без смены оформления", { freezeTheme: true }),
] as const;
export type ClearLayer = typeof defaults & { id: string; label: string };
export const BASELINE_LAYER = CLEAR_LAYERS[0];
export const LAYER_SEED = 0x5120cafe;
export function layerPlan() {
  const variants = CLEAR_LAYERS.slice(1);
  return [variants, [...variants].reverse()].flatMap((order, round) =>
    [BASELINE_LAYER, ...order, BASELINE_LAYER].map((condition, index) => ({
      kind: `layer-${round + 1}-${index}-${condition.id}`,
      round,
      condition,
      phase: "comparison" as const,
    })),
  );
}
export type RewardEffectProof = {
  captionAnimations: number;
  visibleEmblems: number;
  pointFlights: number;
  hudFlashes: number;
  themeNotices: number;
  themeImpulses: number;
};
export type LayerProof = {
  renderedTheme: number;
  savedTheme: number;
  score: number;
  boardEmpty: boolean;
  rewardDomCreated: number;
  rewardRenderer: "dom";
  rewardEffects: RewardEffectProof;
  scene: { draws: number; inkPeak: number; vfxPeak: number; theme: number };
  atmosphere: {
    draws: number;
    disabled: boolean;
    theme: number;
    domPaletteTheme: number;
    domPalette: { bg: string; ink: string; accent: string };
  };
  festival: {
    draws: number;
    bursts: number;
    spawned: number;
    disabled: boolean;
    theme: number;
  };
};
export function validateLayer(condition: ClearLayer, proof: LayerProof) {
  const errors: string[] = [];
  if (proof.score !== 1574 || !proof.boardEmpty || proof.savedTheme !== 5)
    errors.push("logical-outcome");
  const theme = condition.freezeTheme ? 1 : 5;
  if (
    proof.renderedTheme !== theme ||
    proof.scene.theme !== theme ||
    proof.atmosphere.theme !== theme ||
    proof.festival.theme !== theme
  )
    errors.push("presentation-theme");
  const palette = condition.freezeDomPalette ? 1 : theme,
    colors = THEMES[palette]!;
  if (
    proof.atmosphere.domPaletteTheme !== palette ||
    proof.atmosphere.domPalette.bg !== colors.bg ||
    proof.atmosphere.domPalette.ink !== colors.ink ||
    proof.atmosphere.domPalette.accent !== colors.accent
  )
    errors.push("dom-palette");
  if (!proof.scene.draws) errors.push("board-not-rendered");
  if ((proof.scene.inkPeak === 0) !== condition.hideInk)
    errors.push("ink-output");
  if ((proof.scene.vfxPeak === 0) !== condition.hideVfx)
    errors.push("vfx-output");
  if (
    proof.atmosphere.disabled !== condition.skipAtmosphere ||
    (proof.atmosphere.draws === 0) !== condition.skipAtmosphere
  )
    errors.push("atmosphere-output");
  if (
    proof.festival.disabled !== condition.skipFestival ||
    (proof.festival.bursts === 0) !== condition.skipFestival ||
    (proof.festival.draws === 0) !== condition.skipFestival ||
    proof.festival.spawned !== (condition.skipFestival ? 0 : 148)
  )
    errors.push("festival-output");
  const omit = condition.skipRewardDom,
    noNotice = omit || condition.skipThemeNotice || condition.freezeTheme;
  if (proof.rewardDomCreated !== (omit ? 0 : noNotice ? 2 : 3))
    errors.push("reward-dom-output");
  if (proof.rewardRenderer !== "dom") errors.push("renderer-path");
  const effects = proof.rewardEffects;
  if (
    !effects ||
    effects.captionAnimations !==
      (omit || condition.skipRewardDecoration ? 0 : 2) ||
    effects.visibleEmblems !== 0
  )
    errors.push("reward-decoration-output");
  if (
    !effects ||
    effects.pointFlights !== (omit || condition.skipPointFlights ? 0 : 2)
  )
    errors.push("point-flight-output");
  if (
    !effects ||
    effects.hudFlashes !== (omit || condition.skipHudFlashes ? 0 : 2)
  )
    errors.push("hud-flash-output");
  if (!effects || effects.themeNotices !== (noNotice ? 0 : 1))
    errors.push("theme-notice-output");
  if (
    !effects ||
    effects.themeImpulses !==
      (condition.freezeTheme || condition.skipThemeImpulse ? 0 : 1)
  )
    errors.push("theme-impulse-output");
  return { valid: errors.length === 0, errors };
}
type MeasuredEpisode = {
  phase?: string;
  round?: number;
  condition?: ClearLayer;
  validation?: { valid: boolean };
  sample: {
    frames: number[];
    frameTimes: number[];
    placements: { at: number }[];
  };
};
function frameMetrics(episode: MeasuredEpisode) {
  const at = episode.sample.placements[0]?.at;
  // Timestamp marks interval end, so the interval must overlap the effect window.
  const frames = episode.sample.frames.filter(
    (ms, i) =>
      at !== undefined &&
      episode.sample.frameTimes[i]! > at &&
      episode.sample.frameTimes[i]! - ms < at + 2400,
  );
  const sorted = [...frames].sort((a, b) => a - b);
  return {
    intervals: frames.length,
    over33: frames.filter((ms) => ms > 33.4).length,
    over50: frames.filter((ms) => ms > 50).length,
    maxMs: Math.max(0, ...frames),
    p95Ms: sorted[Math.floor(sorted.length * 0.95)] ?? null,
  };
}
export function summarizeLayers(
  episodes: MeasuredEpisode[],
  functionalOnly = false,
) {
  const rows = CLEAR_LAYERS.slice(1).map((condition) => {
    const rounds = [0, 1].map((round) => {
      const series = episodes.filter(
        (e) => e.phase === "comparison" && e.round === round,
      );
      const index = series.findIndex((e) => e.condition?.id === condition.id);
      const before = series
        .slice(0, index)
        .reverse()
        .find((e) => e.condition?.id === "baseline");
      const after = series
        .slice(index + 1)
        .find((e) => e.condition?.id === "baseline");
      const candidate = series[index];
      if (!candidate || !before || !after)
        return {
          round,
          comparable: false as const,
          reason: "incomplete-round",
        };
      const valid =
        candidate.validation?.valid &&
        before.validation?.valid &&
        after.validation?.valid;
      if (!valid)
        return {
          round,
          comparable: false as const,
          reason: "condition-validation",
        };
      const a = frameMetrics(before),
        b = frameMetrics(after),
        c = frameMetrics(candidate);
      const referenceOver33 = (a.over33 + b.over33) / 2;
      const baselineDriftOver33 = Math.abs(a.over33 - b.over33);
      const baselineStable =
        baselineDriftOver33 <= Math.max(2, referenceOver33 * 0.5);
      const enoughFrames =
        Math.min(a.intervals, b.intervals, c.intervals) >= 10;
      return {
        round,
        comparable: !functionalOnly && enoughFrames,
        reason: functionalOnly
          ? "functional-test-only"
          : enoughFrames
            ? ""
            : "insufficient-frames",
        before: a,
        after: b,
        candidate: c,
        baselineDriftOver33,
        baselineStable,
        referenceOver33,
        reductionOver33: referenceOver33
          ? 1 - c.over33 / referenceOver33
          : null,
        meetsTarget:
          !functionalOnly &&
          baselineStable &&
          enoughFrames &&
          referenceOver33 >= 2 &&
          c.over33 <= referenceOver33 / 2 &&
          c.maxMs <= Math.max(a.maxMs, b.maxMs) + 1,
      };
    });
    return {
      condition: condition.id,
      rounds,
      investigate: rounds.every((r) => "meetsTarget" in r && r.meetsTarget),
    };
  });
  return {
    clock: "Browser RAF intervals, not GPU execution/presentation timings",
    target:
      "At least 50% fewer >33.4ms intervals in both counterbalanced rounds; maximum no worse than bracket controls within 1ms; bracketing-control drift at most max(2 intervals, 50% of reference)",
    limitation:
      "Large-layer ablations localize output/submission cost; shared geometry calculations remain. Matching the target nominates investigation, not a shipping optimization or a causal proof for one effect.",
    functionalOnly,
    rows,
  };
}
