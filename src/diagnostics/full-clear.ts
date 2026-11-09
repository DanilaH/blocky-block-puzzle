import { Capacitor, registerPlugin } from "@capacitor/core";
import { App } from "@capacitor/app";
import { APP_VERSION } from "../app-version";
import { performanceCapture } from "../platform/performance";
import {
  BASELINE_LAYER,
  LAYER_SEED,
  validateLayer,
  type ClearLayer,
} from "./clear-layers";
import {
  FULL_CONDITIONS,
  fullFrameMetrics,
  fullPlan,
  summarizeFull,
  type FullRow,
} from "./full-clear-plan";
import type { PhoneClearHooks } from "./phone-clear";
import { setDiagnosticScoreGlow, type ScoreGlowMode } from "../game/score-glow";
import {
  SCORE_FEEDBACK_PLAN,
  summarizeScoreFeedback,
} from "./score-feedback-plan";

type Capture = {
  ready?: boolean;
  captureId?: string;
  recording?: boolean;
  error?: string;
  [key: string]: unknown;
};
export type FullBridge = {
  reset(): Promise<Capture>;
  preflight(): Promise<Capture>;
  start(p: { condition: string }): Promise<Capture>;
  stop(p: { captureId: string }): Promise<Capture>;
  abort(): Promise<unknown>;
  device(): Promise<Record<string, unknown>>;
  setScreenOn(p: { enabled: boolean }): Promise<unknown>;
  share(p: { json: string }): Promise<unknown>;
};
function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException("Interrupted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}
export async function installFullClear(hooks: PhoneClearHooks) {
  const params = new URLSearchParams(location.search),
    fast = import.meta.env.DEV && params.get("test") === "fast";
  const functionalOnly = fast || !Capacitor.isNativePlatform();
  const scoreOnly = params.get("scoreFeedback") === "compare";
  const episodeCount = scoreOnly ? 10 : 57;
  const settleMs = fast ? 80 : 1800,
    measurementMs = fast ? 2600 : 8000;
  let bridge: FullBridge | null = Capacitor.isNativePlatform()
    ? registerPlugin<FullBridge>("BlockyCdp")
    : null;
  if (import.meta.env.DEV) bridge = (window as any).__blockyCdpTest ?? bridge;
  const sourceCommit =
    import.meta.env.VITE_SOURCE_COMMIT ?? "local-uncommitted";
  const panel = document.createElement("section");
  panel.id = "full-clear-panel";
  panel.style.cssText =
    "position:fixed;inset:0;z-index:1000;background:#08152bf5;color:white;padding:20px;overflow:auto;display:grid;place-content:center;gap:14px;text-align:center";
  panel.innerHTML =
    '<h2>Полная диагностика очистки</h2><p id="full-status" role="status">Около 10 минут. Проверка пройдёт автоматически. Оставьте приложение открытым.</p><p id="full-error" role="alert" hidden style="color:#ffb9a8;overflow-wrap:anywhere;max-height:25vh;overflow:auto" tabindex="-1"></p><p>Ваша партия сохранена. После завершения отправьте один файл.</p><button id="full-start" class="primary" disabled>Начать полную проверку</button><button id="full-export" class="secondary" disabled>Отправить результат</button><button id="full-return" class="secondary">Вернуться в игру</button><div id="full-progress" hidden style="position:fixed;bottom:10px;left:10px;right:10px;background:#08152b;padding:8px;display:none"><span id="full-step"></span><button id="full-cancel" class="secondary">Прервать</button></div>';
  document.body.append(panel);
  const element = <T extends HTMLElement>(id: string) =>
    document.getElementById(id) as T;
  const start = element<HTMLButtonElement>("full-start"),
    share = element<HTMLButtonElement>("full-export"),
    status = element("full-status"),
    failure = element("full-error"),
    progress = element("full-progress"),
    step = element("full-step");
  if (scoreOnly) {
    panel.querySelector("h2")!.textContent = "Проверка оптимизации";
    status.textContent =
      "Около двух минут. Автоматически сравним прежний и новый вариант. Все эффекты сохраняются. Результат — один небольшой файл.";
    start.textContent = "Начать сравнение";
  }
  let controller: AbortController | null = null,
    report: any = null,
    lastCondition: ClearLayer = BASELINE_LAYER;
  while (!hooks.ready()) await new Promise((r) => setTimeout(r, 25));
  hooks.pause(true);
  const allConditions = [BASELINE_LAYER, ...FULL_CONDITIONS];
  const comparisonPlan = scoreOnly
    ? SCORE_FEEDBACK_PLAN.map((scoreFeedback, i) => ({
        condition: BASELINE_LAYER,
        round: Math.floor(i / 2),
        scoreFeedback,
      }))
    : fullPlan().map((item) => ({ ...item, scoreFeedback: undefined }));
  const summary = () =>
    scoreOnly
      ? summarizeScoreFeedback(
          report.episodes,
          functionalOnly || !report.completed,
        )
      : summarizeFull(report.episodes, functionalOnly || !report.completed);
  function visible(yes: boolean) {
    panel.style.background = yes ? "#08152bf5" : "transparent";
    panel.style.placeContent = yes ? "center" : "start";
    for (const child of Array.from(panel.children))
      if (child !== progress)
        (child as HTMLElement).style.visibility = yes ? "visible" : "hidden";
    progress.hidden = yes;
    progress.style.display = yes ? "none" : "flex";
  }
  async function prepare(condition: ClearLayer, signal: AbortSignal) {
    if (signal.aborted) throw Error("interrupted");
    hooks.pause(true);
    hooks.configure!(condition);
    lastCondition = condition;
    await hooks.reset();
    hooks.pause(false);
    await delay(settleMs, signal);
  }
  function begin() {
    hooks.beginSample?.();
    performanceCapture.start(hooks.context());
    performanceCapture.setActive(true);
  }
  function finish(
    condition: ClearLayer,
    phase: string,
    round?: number,
    scoreFeedback?: ScoreGlowMode,
  ): FullRow {
    const sample = performanceCapture.snapshot(),
      state = structuredClone(hooks.state()),
      proof = state.proof!;
    performanceCapture.setActive(false);
    const validity = validateLayer(condition, proof),
      errors = [...validity.errors];
    if (
      (proof as any).pendingPoints !== 0 ||
      (proof as any).shownScore !== 1574
    )
      errors.push("score-arrival");
    if (!functionalOnly) {
      const festival = proof.festival as any;
      if (
        (festival.activeParticles ?? 0) !== 0 ||
        (festival.activeReveals ?? 0) !== 0
      )
        errors.push("unfinished-festival");
      if (document.querySelectorAll(".reward-event,.hud-notice").length)
        errors.push("unfinished-dom-effects");
    }
    const placement = sample.placements[0]?.at;
    if (sample.placements.length !== 1 || placement === undefined)
      errors.push("placement-count");
    const metrics = fullFrameMetrics(
      sample.frames,
      sample.frameTimes,
      placement ?? 0,
      0,
      measurementMs,
    );
    if (
      !functionalOnly &&
      (sample.frameTimes.at(-1) ?? 0) - (placement ?? 0) < 7900
    )
      errors.push("measurement-window");
    if (
      scoreFeedback &&
      proof.scoreGlowProperties?.join(",") !==
        (scoreFeedback === "legacy"
          ? "text-shadow,text-shadow"
          : "filter,filter")
    )
      errors.push("score-glow-path");
    return {
      condition,
      phase,
      round,
      scoreFeedback,
      valid: errors.length === 0,
      validation: { valid: errors.length === 0, errors },
      metrics,
      windows: [
        ...[
          [0, 2400],
          [2400, 8000],
          [0, 8000],
        ].map(([low, high]) => ({
          afterCommitMs: [low, high],
          metrics: fullFrameMetrics(
            sample.frames,
            sample.frameTimes,
            placement ?? 0,
            low!,
            high!,
          ),
        })),
      ],
      sample,
      state,
    };
  }
  async function episode(
    condition: ClearLayer,
    phase: string,
    signal: AbortSignal,
    round?: number,
    scoreFeedback?: ScoreGlowMode,
  ) {
    const index = report.episodes.length;
    step.textContent = `Проверка ${index + 1} из ${episodeCount}`;
    const device = await bridge!.device();
    if (Number(device.thermalStatus) >= 4)
      throw Error("device-thermal-critical");
    if (scoreFeedback) setDiagnosticScoreGlow(scoreFeedback);
    await prepare(condition, signal);
    let capture: Capture | undefined;
    const label = `${phase}-${index}-${condition.id}`;
    try {
      if (phase === "attribution") {
        capture = await bridge!.start({ condition: condition.id });
        if (!capture.recording || !capture.captureId)
          throw Error("cdp-start-not-recording");
      }
      begin();
      performance.mark(`blocky-full:${label}:start`);
      await hooks.commit();
      performance.mark(`blocky-full:${label}:committed`);
      await delay(measurementMs, signal);
      if (phase === "warmup" && !functionalOnly) {
        const deadline = performance.now() + 12000;
        while (performance.now() < deadline) {
          const proof = hooks.state().proof as any;
          if (
            !proof.festival.activeParticles &&
            !proof.festival.activeReveals &&
            !document.querySelector(".reward-event,.hud-notice")
          )
            break;
          await delay(250, signal);
        }
      }
      const row = finish(condition, phase, round, scoreFeedback);
      performance.mark(`blocky-full:${label}:end`);
      hooks.pause(true);
      if (capture) {
        row.capture = { ...capture, ready: false };
        try {
          const result = await bridge!.stop({ captureId: capture.captureId! });
          if (result.captureId !== capture.captureId)
            throw Error("capture-id-mismatch");
          row.capture = result;
          if (!result.ready) throw Error("cdp-attribution-incomplete");
        } catch (error) {
          row.valid = false;
          row.capture = {
            ...((row.capture as object) ?? {}),
            error: String(error),
          };
          (row.validation as any).errors.push("cdp-attribution-incomplete");
        }
      }
      report.episodes.push({
        ...row,
        device,
        traceActive: phase === "attribution",
      });
    } finally {
      performanceCapture.setActive(false);
      hooks.pause(true);
      if (capture) await bridge!.abort().catch(() => {});
    }
  }
  async function run() {
    if (controller) return;
    controller = new AbortController();
    const signal = controller.signal;
    let stage = "подготовка";
    const began = performance.now(),
      deadline = setTimeout(
        () => controller?.abort("deadline"),
        (scoreOnly ? 4 : 15) * 60 * 1000,
      );
    report = {
      schema: scoreOnly ? "blocky-score-feedback-v1" : "blocky-full-clear-v1",
      appVersion: APP_VERSION,
      sourceCommit,
      functionalOnly,
      completed: false,
      interrupted: false,
      startedAt: new Date().toISOString(),
      protocol: {
        settleMs,
        measurementMs,
        warmupMaxMs: functionalOnly ? measurementMs : 20000,
        cosmeticSeed: LAYER_SEED,
        conditions: scoreOnly ? [BASELINE_LAYER] : allConditions,
        comparisonOrder: comparisonPlan,
        attributionOrder: scoreOnly ? [] : allConditions,
        nativeTracesUsed: !scoreOnly,
        primaryMetric:
          "RAF intervals >33.4ms after rounding to 0.1ms; full 8 seconds",
        tracedTimingUsedForPerformance: false,
      },
      episodes: [],
      notes: [
        "Actual Classic move/store/reward paths in separate blocky-clear-trace database. Ordinary profile and backup are not read or modified.",
        "Two warmups, two opposite-order untraced passes with baseline every three candidates, then every condition recorded separately through CDP.",
        "Fourteen standalone/combined ablations; two planned 2x2 interactions: point flights x theme impulse, whole reward DOM x whole theme. Other higher-order interactions are not exhaustively searched.",
        "All tracing/DOM snapshots occur after untraced comparisons. They are for attribution, not an FPS comparison.",
        "Audio, haptics, ads and native product analytics are disabled by the diagnostic entry. Orientation/context loss/background abort instead of mixing geometry.",
      ],
    };
    if (scoreOnly)
      report.notes = [
        "Two warmups, then four adjacent old/new pairs in opposite directions (ABBAABBA); full 8 seconds each. No feature is disabled.",
        "Legacy text-shadow and compositor drop-shadow are identified from real Animation keyframes. Native CDP traces are not recorded or used for this comparison.",
        "Same separate blocky-clear-trace fixture, score 1574, ordinary save preserved; ads/audio/haptics disabled. RAF is not physical presentation or GPU execution time.",
      ];
    start.disabled = share.disabled = true;
    failure.hidden = true;
    failure.textContent = "";
    visible(false);
    try {
      if (!bridge) throw Error("native-cdp-unavailable");
      if (!functionalOnly && !/^[a-f0-9]{40}$/.test(sourceCommit))
        throw Error("source-identity-missing");
      report.session = await bridge.reset();
      await bridge.setScreenOn({ enabled: true });
      report.environment = hooks.context();
      if (report.environment?.reducedMotion)
        throw Error("system-reduced-motion-enabled");
      step.textContent = "Проверяем полноту записи";
      if (!scoreOnly) {
        stage = "проверка записи";
        report.preflight = await bridge.preflight();
        if (!report.preflight.ready)
          throw Error(
            `preflight:${report.preflight.error ?? "missing-identities"}`,
          );
      }
      for (let i = 0; i < 2; i++) {
        stage = `прогрев ${i + 1} из 2`;
        await episode(
          BASELINE_LAYER,
          "warmup",
          signal,
          undefined,
          scoreOnly ? (i === 0 ? "legacy" : "filter") : undefined,
        );
        const warmup = report.episodes.at(-1);
        if (!warmup.valid)
          throw Error(
            `warmup-validation:${warmup.validation.errors.join(",")}`,
          );
      }
      stage = "сравнение эффектов";
      for (const item of comparisonPlan)
        await episode(
          item.condition,
          "comparison",
          signal,
          item.round,
          item.scoreFeedback,
        );
      stage = "запись трасс";
      for (const condition of scoreOnly ? [] : allConditions)
        await episode(condition, "attribution", signal);
      report.completed =
        report.episodes.length === episodeCount &&
        report.episodes.every((x: FullRow) => x.valid);
      report.summary = summary();
      status.textContent = report.completed
        ? "Готово. Отправьте один файл с результатом."
        : "Сбор завершён с замечаниями. Отправьте результат для разбора.";
    } catch (error) {
      report.interrupted = signal.aborted;
      report.failure = signal.aborted
        ? String(signal.reason)
        : error instanceof Error
          ? error.message
          : typeof error === "object" && error && "message" in error
            ? String(error.message)
            : String(error);
      report.failureStage = stage;
      status.textContent = `Проверка остановлена: ${stage}. Нажмите «Отправить результат» — причина остановки сохранена в файле.`;
      failure.textContent = `Причина: ${report.failure}`;
      failure.hidden = false;
    } finally {
      clearTimeout(deadline);
      document.getElementById("blocky-cdp-probe")?.remove();
      performanceCapture.setActive(false);
      hooks.pause(true);
      hooks.configure!(BASELINE_LAYER);
      if (scoreOnly) setDiagnosticScoreGlow(null);
      document
        .querySelector("#app")
        ?.getAnimations({ subtree: true })
        .forEach((a) => a.cancel());
      if (bridge) {
        await bridge.abort().catch(() => {});
        await bridge.setScreenOn({ enabled: false }).catch(() => {});
      }
      report.summary = summary();
      report.elapsedMs = performance.now() - began;
      visible(true);
      controller = null;
      start.disabled = share.disabled = false;
      start.textContent = scoreOnly
        ? "Повторить сравнение"
        : "Повторить проверку";
      if (!failure.hidden) failure.focus();
    }
  }
  start.onclick = () => void run();
  share.onclick = async () => {
    if (!report || controller || !bridge) return;
    share.disabled = true;
    try {
      await bridge.share({ json: JSON.stringify(report) });
    } catch {
      status.textContent = "Не удалось отправить. Попробуйте ещё раз.";
    } finally {
      share.disabled = false;
    }
  };
  element("full-cancel").onclick = () => controller?.abort("cancelled");
  const leave = () => {
    if (scoreOnly) setDiagnosticScoreGlow(null);
    controller?.abort("return");
    void bridge?.abort().catch(() => {});
    void bridge?.setScreenOn({ enabled: false }).catch(() => {});
    location.href = new URL("./", location.href).href;
  };
  element("full-return").onclick = leave;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) controller?.abort("background");
  });
  window.addEventListener("resize", () => controller?.abort("resize"));
  document
    .querySelector("#board canvas")
    ?.addEventListener("webglcontextlost", () =>
      controller?.abort("context-lost"),
    );
  if (Capacitor.isNativePlatform()) {
    await App.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) controller?.abort("background");
    });
    await App.addListener("backButton", leave);
  }
  (window as any).__blockyFullDiagnostic = {
    sourceCommit,
    conditions: allConditions,
    get report() {
      return report;
    },
    get running() {
      return !!controller;
    },
    cancel: () => controller?.abort("external-cancel"),
    useExternalBridge(value: FullBridge) {
      if (controller) throw Error("diagnostic-busy");
      bridge = value;
    },
    run,
  };
  if (import.meta.env.DEV) {
    (window as any).__blockyFullDiagnostic.prepare = async (id: string) => {
      if (controller) throw Error("diagnostic-busy");
      const condition = allConditions.find((x) => x.id === id);
      if (!condition) throw Error("unknown-condition");
      visible(false);
      await prepare(condition, new AbortController().signal);
    };
    (window as any).__blockyFullDiagnostic.measure = async (ms = 8000) => {
      begin();
      await hooks.commit();
      await new Promise((r) => setTimeout(r, ms));
      try {
        return finish(lastCondition, "attribution");
      } finally {
        hooks.pause(true);
      }
    };
  }
  start.disabled = false;
}
