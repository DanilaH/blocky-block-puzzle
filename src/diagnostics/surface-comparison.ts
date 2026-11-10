import { Capacitor, registerPlugin } from "@capacitor/core";
import { App } from "@capacitor/app";
import { APP_VERSION } from "../app-version";
import { performanceCapture } from "../platform/performance";
import { BASELINE_LAYER, LAYER_SEED, validateLayer } from "./clear-layers";
import { fullFrameMetrics } from "./full-clear-plan";
import { setDiagnosticScoreGlow } from "../game/score-glow";
import type { PreparedSurfaces } from "../game/prepared-surfaces";
import type { PhoneClearHooks } from "./phone-clear";
import {
  SURFACE_ORDER,
  SURFACE_WARMUPS,
  summarizeSurfaces,
  surfaceDeviceStable,
  type SurfaceDevice,
  type SurfaceRow,
} from "./surface-plan";

function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(Error(String(signal.reason ?? "interrupted")));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}
async function boundedNative<T>(
  work: Promise<T> | undefined,
  fallback: T,
): Promise<T> {
  if (!work) return fallback;
  let timer = 0;
  try {
    return await Promise.race([
      work,
      new Promise<T>((resolve) => {
        timer = window.setTimeout(() => resolve(fallback), 2000);
      }),
    ]);
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}
export async function installSurfaceComparison(
  hooks: PhoneClearHooks,
  surfaces: PreparedSurfaces,
) {
  const fast =
    import.meta.env.DEV &&
    new URLSearchParams(location.search).get("test") === "fast";
  const physical = Capacitor.isNativePlatform();
  const measurementMs = fast ? 2600 : 8000,
    settleMs = fast ? 20 : 1800;
  // No CDP recording or preflight. Metadata reads never start a trace.
  const native = physical
    ? registerPlugin<{ setScreenOn(p: { enabled: boolean }): Promise<void> }>(
        "BlockyTrace",
      )
    : null;
  const device = physical
    ? registerPlugin<{ device(): Promise<SurfaceDevice> }>("BlockyCdp")
    : null;
  const share = physical
    ? registerPlugin<{
        share(p: { json: string; kind: string }): Promise<void>;
      }>("BlockyDiagnostics")
    : null;
  const panel = document.createElement("section");
  panel.id = "surface-comparison";
  panel.style.cssText =
    "position:fixed;inset:0;z-index:1000;background:#08152bf5;color:white;padding:20px;overflow:auto;display:grid;place-content:center;gap:14px;text-align:center";
  panel.innerHTML = `<h2>Проверка перехода фона</h2><p id="surface-status" role="status">Около 100 секунд. Старый и новый переходы сравнятся автоматически. Партия сохранена.</p><p id="surface-error" role="alert" hidden></p><button id="surface-start" class="primary" disabled>Начать сравнение</button><button id="surface-share" class="secondary" disabled>Отправить результат</button><button id="surface-return" class="secondary">Вернуться в игру</button><button id="surface-cancel" class="secondary" hidden>Прервать проверку</button>`;
  document.body.append(panel);
  const el = <T extends HTMLElement>(id: string) =>
    panel.querySelector<T>("#surface-" + id)!;
  const start = el<HTMLButtonElement>("start"),
    send = el<HTMLButtonElement>("share"),
    cancel = el<HTMLButtonElement>("cancel"),
    status = el("status"),
    error = el("error");
  let controller: AbortController | null = null;
  let report: any = null;
  const geometry = () =>
    [
      innerWidth,
      innerHeight,
      devicePixelRatio,
      document.querySelector<HTMLCanvasElement>("#board canvas")?.width,
      document.querySelector<HTMLCanvasElement>("#board canvas")?.height,
    ].join(":");
  function visible(yes: boolean) {
    panel.style.background = yes ? "#08152bf5" : "transparent";
    panel.style.pointerEvents = yes ? "auto" : "none";
    panel.style.placeContent = yes ? "center" : "end";
    for (const child of [...panel.children])
      (child as HTMLElement).hidden = !yes;
    cancel.hidden = yes;
    cancel.style.pointerEvents = "auto";
  }
  const abort = (reason: string) => controller?.abort(reason);
  async function episode(
    mode: SurfaceRow["mode"],
    phase: SurfaceRow["phase"],
    signal: AbortSignal,
  ) {
    hooks.pause(true);
    surfaces.setMode(mode);
    hooks.configure!(BASELINE_LAYER);
    await hooks.reset();
    hooks.pause(false);
    await delay(settleMs, signal);
    const before = surfaces.snapshot();
    hooks.beginSample?.();
    performanceCapture.start(hooks.context());
    performanceCapture.setActive(true);
    try {
      await hooks.commit();
      await delay(measurementMs, signal);
      const sample = performanceCapture.snapshot(),
        state = structuredClone(hooks.state()),
        proof = state.proof!;
      const after = surfaces.snapshot(),
        at = sample.placements[0]?.at ?? 0;
      const errors = [...validateLayer(BASELINE_LAYER, proof).errors];
      if (sample.placements.length !== 1) errors.push("placement-count");
      if (proof.effectProfile !== "legacy") errors.push("effect-profile");
      if (after.mode !== mode) errors.push("surface-path");
      if (
        mode === "generated" &&
        (!after.artReady || after.decodedArt !== 2 || !after.hooksActive)
      )
        errors.push("prepared-art");
      if (
        mode === "original" &&
        (after.hooksActive || after.activeImages !== 0)
      )
        errors.push("original-path");
      if (!fast) {
        if ((sample.frameTimes.at(-1) ?? 0) - at < 7900)
          errors.push("measurement-window");
        if (
          (proof as any).pendingPoints !== 0 ||
          (proof as any).shownScore !== 1574
        )
          errors.push("score-arrival");
        const festival = proof.festival as any;
        if (
          festival.spawned !== 148 ||
          festival.activeParticles !== 0 ||
          festival.activeReveals !== 0
        )
          errors.push("festival-contract");
        if (
          proof.rewardDomCreated !== 3 ||
          document.querySelectorAll(".reward-event,.hud-notice").length
        )
          errors.push("reward-contract");
        if (
          mode === "generated" &&
          ["page", "bed"].some((k) => {
            const b = before[k as "page" | "bed"],
              a = after[k as "page" | "bed"];
            return (
              a.active ||
              a.visibleLayers !== 1 ||
              a.transitions <= b.transitions ||
              a.target !== "5"
            );
          })
        )
          errors.push("prepared-completion");
      }
      const metrics = fullFrameMetrics(
        sample.frames,
        sample.frameTimes,
        at,
        0,
        measurementMs,
      );
      // Preserve only the intervals needed for independent recomputation. No DOM
      // dumps, screenshots, traces, ordinary profile, or per-frame phase log.
      const frameIntervals = sample.frames.filter(
        (v, i) =>
          sample.frameTimes[i]! > at &&
          sample.frameTimes[i]! - v < at + measurementMs,
      );
      const row: SurfaceRow = {
        mode,
        phase,
        valid: errors.length === 0,
        validation: { errors },
        metrics,
        proof,
        surfaces: after,
        frameIntervals,
      };
      report.episodes.push(row);
      if (errors.length)
        throw Error("Проверка не завершена: " + errors.join(", "));
    } finally {
      performanceCapture.setActive(false);
      hooks.pause(true);
    }
  }
  async function run() {
    if (controller) return;
    controller = new AbortController();
    const signal = controller.signal;
    const deadline = setTimeout(() => abort("deadline"), 150000),
      fixedGeometry = geometry();
    report = {
      schema: "blocky-surface-comparison-v1",
      appVersion: APP_VERSION,
      sourceCommit: import.meta.env.VITE_SOURCE_COMMIT ?? "local-uncommitted",
      physical,
      functionalOnly: !physical || fast,
      completed: false,
      interrupted: false,
      startedAt: new Date().toISOString(),
      context: hooks.context(),
      geometry: fixedGeometry,
      protocol: {
        measurementMs,
        settleMs,
        cosmeticSeed: LAYER_SEED,
        warmups: SURFACE_WARMUPS,
        order: SURFACE_ORDER,
        traces: false,
        primaryMetric: "RAF >33.4ms rounded to 0.1ms; complete 8-second event",
        intervalStorage: "Float32 values without extra rounding",
      },
      episodes: [],
      summary: null,
    };
    start.disabled = send.disabled = true;
    error.hidden = true;
    error.textContent = "";
    visible(false);
    try {
      if (!surfaces.artReady)
        throw Error(
          "Не удалось загрузить фоны. Вернитесь в игру и повторите проверку.",
        );
      setDiagnosticScoreGlow("legacy");
      report.deviceStart = await boundedNative(device?.device(), null);
      await boundedNative(native?.setScreenOn({ enabled: true }), undefined);
      const plan = [
        ...SURFACE_WARMUPS.map((mode) => ({ mode, phase: "warmup" as const })),
        ...SURFACE_ORDER.map((mode) => ({
          mode,
          phase: "comparison" as const,
        })),
      ];
      for (let i = 0; i < plan.length; i++) {
        if (geometry() !== fixedGeometry) throw Error("resize");
        cancel.textContent = `Прервать · ${i + 1}/${plan.length}`;
        const item = plan[i]!;
        await episode(item.mode, item.phase, signal);
      }
      report.completed = true;
    } catch (e) {
      report.interrupted = true;
      report.error = signal.aborted
        ? String(signal.reason)
        : e instanceof Error
          ? e.message
          : String(e);
      error.hidden = false;
      error.textContent = "Проверка прервана: " + report.error;
    } finally {
      clearTimeout(deadline);
      performanceCapture.setActive(false);
      hooks.pause(true);
      surfaces.setMode("generated");
      setDiagnosticScoreGlow(null);
      await boundedNative(native?.setScreenOn({ enabled: false }), undefined);
      report.deviceEnd = await boundedNative(device?.device(), null);
      report.deviceStable = surfaceDeviceStable(
        report.deviceStart,
        report.deviceEnd,
      );
      report.summary = summarizeSurfaces(
        report.episodes,
        physical && !fast && report.deviceStable,
        report.completed,
      );
      controller = null;
      visible(true);
      error.hidden = !report.error;
      start.disabled = false;
      send.disabled = false;
      status.textContent = report.completed
        ? "Готово. Нажмите «Отправить результат». " +
          (report.summary.improved
            ? "Новый переход прошёл порог в обоих порядках."
            : "Результат записан; устойчивое ускорение ещё не подтверждено.")
        : "Проверка остановлена. Партия не изменена. Можно повторить.";
    }
  }
  send.onclick = () => {
    void (async () => {
      const json = JSON.stringify(report);
      if (new TextEncoder().encode(json).length > 900000)
        throw Error("report-too-large");
      if (share) await share.share({ json, kind: "surfaces" });
      else {
        const url = URL.createObjectURL(
          new Blob([json], { type: "application/json" }),
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = `blocky-surfaces-${APP_VERSION}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    })().catch((e) => {
      error.hidden = false;
      error.textContent =
        "Не удалось отправить результат. Повторите отправку. " + String(e);
    });
  };
  function leave() {
    abort("return");
    location.href = new URL("./", location.href).href;
  }
  cancel.onclick = () => abort("cancelled");
  start.onclick = () => void run();
  el("return").onclick = leave;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) abort("background");
  });
  window.addEventListener("pagehide", () => abort("background"));
  window.addEventListener("resize", () => abort("resize"));
  document
    .querySelector("#board canvas")
    ?.addEventListener("webglcontextlost", () => abort("context-lost"));
  if (physical) {
    await App.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) abort("background");
    });
    await App.addListener("backButton", leave);
  }
  const readyDeadline = performance.now() + 15000;
  while (!hooks.ready()) {
    if (performance.now() > readyDeadline) {
      error.hidden = false;
      error.textContent =
        "Не удалось подготовить поле. Вернитесь в игру и повторите проверку.";
      return;
    }
    await new Promise((r) => setTimeout(r, 25));
  }
  hooks.pause(true);
  start.disabled = false;
  (window as any).__blockySurfaceComparison = {
    run,
    get report() {
      return report;
    },
    get running() {
      return !!controller;
    },
    cancel: () => abort("external-cancel"),
  };
}
