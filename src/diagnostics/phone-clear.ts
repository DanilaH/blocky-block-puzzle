import { Capacitor, registerPlugin } from "@capacitor/core";
import { App } from "@capacitor/app";
import { APP_VERSION } from "../app-version";
import { createProfile } from "../core/profile";
import { applyMove } from "../core/rules";
import { performanceCapture, type ClearFixture } from "../platform/performance";
import rawFixture from "./phone-clear-fixture.json";
import {
  BASELINE_LAYER,
  LAYER_SEED,
  layerPlan,
  summarizeLayers,
  validateLayer,
  type ClearLayer,
  type LayerProof,
} from "./clear-layers";

export const phoneFixture = rawFixture as ClearFixture;
export function fixtureProfile(revision: number) {
  const profile = createProfile(structuredClone(phoneFixture.before));
  profile.revision = revision;
  profile.tutorialStep = 4;
  profile.best = profile.festivalBest = profile.progressionBest = 100000;
  profile.wardrobe = structuredClone(phoneFixture.beforeWardrobe);
  profile.settings = { ...phoneFixture.settings, sound: false, haptics: false };
  const result = applyMove(
    profile.game,
    phoneFixture.move,
    profile.game.revision,
  );
  if (
    !result?.allClear ||
    result.lines !== 2 ||
    result.state.score !== phoneFixture.expectedScore
  )
    throw Error("Invalid phone clear fixture");
  return profile;
}
type TraceStatus = {
  ready?: boolean;
  recording?: boolean;
  error?: string;
  reason?: string;
  bytes?: number;
  captureId?: string;
};
type TraceBridge = {
  reset(): Promise<TraceStatus>;
  start(): Promise<TraceStatus>;
  stop(): Promise<TraceStatus>;
  share(p: {
    json: string;
    kind: "clear" | "layers";
    includeTrace: boolean;
  }): Promise<void>;
};
type Hooks = {
  ready(): boolean;
  context(): unknown;
  configure?(condition: ClearLayer): void;
  beginSample?(): void;
  reset(): Promise<void>;
  commit(): Promise<void>;
  state(): { proof?: LayerProof; [key: string]: unknown };
  pause(paused: boolean): void;
};
type Episode = {
  kind: string;
  phase: "warmup" | "ordinary" | "comparison" | "trace";
  round?: number;
  condition?: ClearLayer;
  traceActive: boolean;
  sample: ReturnType<typeof performanceCapture.snapshot>;
  state: ReturnType<Hooks["state"]>;
  validation?: ReturnType<typeof validateLayer>;
};
function sleep(ms: number, signal: AbortSignal) {
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
export async function installPhoneClear(hooks: Hooks) {
  const layers =
    new URLSearchParams(location.search).get("clearTrace") === "layers";
  if (layers && !hooks.configure) throw Error("Layer diagnostic hooks missing");
  const native = Capacitor.isNativePlatform()
    ? registerPlugin<TraceBridge>("BlockyTrace")
    : null;
  const fast =
    import.meta.env.DEV &&
    new URLSearchParams(location.search).get("test") === "fast";
  const settleMs = fast ? 60 : 1800;
  const measurementMs = fast ? (layers ? 750 : 240) : 2400;
  const plan = layerPlan();
  const total = layers ? plan.length + 2 : 3;
  const panel = document.createElement("section");
  panel.id = "phone-clear-panel";
  panel.style.cssText =
    "position:fixed;inset:0;z-index:1000;display:flex;flex-direction:column;overflow-y:auto;background:rgba(8,15,30,.94);padding:20px;color:white;text-align:center";
  panel.innerHTML = `<div style="max-width:360px;width:100%;margin:auto;flex-shrink:0"><h2>${layers ? "Проверка слоёв" : "Проверка очистки"}</h2><p id="phone-clear-status" role="status">${layers ? "Около 90 секунд. Игра сама сравнит слои эффектов в двух проходах. Оставьте экран открытым." : "Около 15 секунд. Игра сама повторит очистку три раза. Оставьте экран открытым."}</p><p id="phone-clear-help">Ваша партия сохранена. После проверки отправьте один файл с результатом.</p><button id="phone-clear-start" class="primary" disabled>Начать проверку</button><button id="phone-clear-export" class="secondary" disabled>Отправить результат</button><button id="phone-clear-return" class="secondary">Вернуться в игру</button></div><div id="phone-clear-progress" hidden style="position:fixed;left:12px;right:12px;bottom:max(8px,env(safe-area-inset-bottom));display:none;align-items:center;justify-content:space-between;gap:12px;padding:8px 12px;border-radius:8px;background:#08152b;color:white;font:12px system-ui"><span id="phone-clear-step" role="status"></span><button id="phone-clear-cancel" style="min-height:36px;padding:4px 10px;color:white;background:#23456e;border:0;border-radius:6px">Прервать</button></div>`;
  panel
    .querySelectorAll<HTMLButtonElement>(
      "#phone-clear-start,#phone-clear-export,#phone-clear-return",
    )
    .forEach((button) => {
      button.style.cssText =
        "display:block;width:100%;margin:10px 0;min-height:48px";
      if (button.classList.contains("secondary"))
        button.style.color = "#f4f7ff";
    });
  document.body.append(panel);
  const status = panel.querySelector<HTMLElement>("#phone-clear-status")!;
  const start = panel.querySelector<HTMLButtonElement>("#phone-clear-start")!;
  const share = panel.querySelector<HTMLButtonElement>("#phone-clear-export")!;
  const back = panel.querySelector<HTMLButtonElement>("#phone-clear-return")!;
  const progress = panel.querySelector<HTMLElement>("#phone-clear-progress")!;
  const step = panel.querySelector<HTMLElement>("#phone-clear-step")!;
  const cancel = panel.querySelector<HTMLButtonElement>("#phone-clear-cancel")!;
  let controller: AbortController | null = null;
  let report: {
    schema: string;
    appVersion: string;
    startedAt: string;
    elapsedMs?: number;
    completed: boolean;
    interrupted: boolean;
    failure?: string;
    trace: TraceStatus;
    traceEpisode?: string;
    notes: string[];
    fixture: ClearFixture;
    episodes: Episode[];
    protocol?: {
      settleMs: number;
      measurementMs: number;
      functionalOnly: boolean;
      cosmeticSeed: number;
      order: typeof plan;
    };
    summary?: ReturnType<typeof summarizeLayers>;
  } | null = null;
  while (!hooks.ready()) await new Promise((r) => setTimeout(r, 25));
  hooks.pause(true);
  function visible(yes: boolean) {
    panel.style.background = yes ? "rgba(8,15,30,.94)" : "transparent";
    (panel.firstElementChild as HTMLElement).style.visibility = yes
      ? "visible"
      : "hidden";
    progress.hidden = yes || !layers;
    progress.style.display = progress.hidden ? "none" : "flex";
  }
  async function episode(
    kind: string,
    phase: Episode["phase"],
    signal: AbortSignal,
    condition = BASELINE_LAYER as ClearLayer,
    round?: number,
    traceActive = false,
  ) {
    if (signal.aborted) throw new DOMException("Interrupted", "AbortError");
    step.textContent = `Проверка ${report!.episodes.length + 1} из ${total}`;
    hooks.pause(true);
    if (layers) hooks.configure!(condition);
    await hooks.reset();
    if (signal.aborted) throw new DOMException("Interrupted", "AbortError");
    hooks.pause(false);
    await sleep(settleMs, signal);
    const context = hooks.context();
    hooks.beginSample?.();
    performanceCapture.start(context);
    performanceCapture.setActive(true);
    const mark = `blocky-clear:${kind}`;
    performance.mark(`${mark}:start`);
    try {
      await hooks.commit();
      performance.mark(`${mark}:committed`);
      await sleep(measurementMs, signal);
      const state = structuredClone(hooks.state());
      report!.episodes.push({
        kind,
        phase,
        traceActive,
        ...(layers ? { condition, round } : {}),
        sample: performanceCapture.snapshot(),
        state,
        ...(layers && state.proof
          ? { validation: validateLayer(condition, state.proof) }
          : {}),
      });
    } finally {
      performance.mark(`${mark}:end`);
      performanceCapture.setActive(false);
      hooks.pause(true);
    }
  }
  start.onclick = async () => {
    if (controller) return;
    controller = new AbortController();
    const signal = controller.signal;
    const began = performance.now();
    const deadline = setTimeout(() => controller?.abort("deadline"), 120000);
    let nativeStarted = false;
    let captureId: string | undefined;
    start.disabled = share.disabled = true;
    report = {
      schema: layers ? "blocky-phone-layers-v1" : "blocky-phone-clear-v1",
      appVersion: APP_VERSION,
      startedAt: new Date().toISOString(),
      completed: false,
      interrupted: false,
      trace: { error: native ? "not-started" : "native-unavailable" },
      fixture: structuredClone(phoneFixture),
      episodes: [],
      ...(layers
        ? {
            protocol: {
              settleMs,
              measurementMs,
              functionalOnly: fast,
              cosmeticSeed: LAYER_SEED,
              order: plan,
            },
          }
        : {}),
      notes: [
        "Actual Classic UI, move calculator, IndexedDB transaction, score/reward DOM and rendering paths; separate blocky-clear-trace database.",
        "Position/wardrobe from POCO 0.51: two columns, 121 -> 1574, theme 1 -> 5, reveal variant 2. Not the original complete session.",
        "Previous one-line clear history is not replayed. Audio/haptics off; ads and native product analytics disabled.",
        "Native trace may omit events if the WebView internal buffer fills; absent GPU events do not prove an idle GPU.",
        layers
          ? "Two reversed untraced comparison rounds with bracketing baselines. Warmup and final native baseline excluded from comparisons. Native tracing begins only after every untraced episode."
          : "Episodes: warmup, ordinary capture, native-traced capture. Tracing adds overhead: use it to locate work, not as an FPS improvement comparison.",
        ...(layers
          ? [
              "Local cosmetic seed and ambient animation reset per episode; original complete-session cosmetics are not replayed.",
              "Ink/VFX submission is skipped at the primitive/stamp boundary; shared coordinate/age calculations still run. Ambient ablation omits its animated canvas but retains background/theme DOM. Reward ablation retains score arrival and HUD count-up; no-theme freezes all presentation palettes at1 while saved wardrobe still advances to5.",
              "Functional-only fast mode cannot nominate a performance candidate.",
            ]
          : []),
      ],
    };
    visible(false);
    try {
      // Clear stale native output before any comparison or cancellation can occur.
      if (native) report.trace = await native.reset();
      await episode("warmup", "warmup", signal);
      if (layers) {
        for (const item of plan)
          await episode(
            item.kind,
            item.phase,
            signal,
            item.condition,
            item.round,
          );
      } else await episode("untraced", "ordinary", signal);
      if (native) {
        try {
          nativeStarted = true;
          report.trace = await native.start();
          captureId = report.trace.captureId;
        } catch {
          report.trace = { error: "native-start-failed" };
        }
      }
      if (signal.aborted) throw new DOMException("Interrupted", "AbortError");
      const traceKind = layers ? "native-baseline" : "traced";
      report.traceEpisode = traceKind;
      await episode(
        traceKind,
        "trace",
        signal,
        BASELINE_LAYER,
        undefined,
        !!report.trace.recording,
      );
      report.completed = true;
      const invalid = report.episodes.filter(
        (e) => e.validation && !e.validation.valid,
      ).length;
      status.textContent = invalid
        ? `Готово. В ${invalid} повторах слои не подтвердились. Отправьте результат для разбора`
        : "Готово. Нажмите «Отправить результат» и пришлите файл в чат";
    } catch (error) {
      report.interrupted = true;
      report.failure = signal.aborted
        ? String(signal.reason ?? "interrupted")
        : error instanceof Error
          ? error.message
          : "unknown";
      status.textContent = signal.aborted
        ? "Проверка прервана. Можно повторить"
        : "Проверка не завершилась. Отправьте результат для разбора";
    } finally {
      clearTimeout(deadline);
      if (native) {
        try {
          const stopped = await native.stop();
          report.trace =
            nativeStarted && (!captureId || captureId === stopped.captureId)
              ? stopped
              : {
                  ...stopped,
                  ready: false,
                  error: stopped.error || "not-captured-this-run",
                };
        } catch {
          report.trace = { error: "native-stop-failed" };
        }
      }
      hooks.pause(true);
      if (layers) {
        report.summary = summarizeLayers(report.episodes, fast);
        hooks.configure!(BASELINE_LAYER);
      }
      report.elapsedMs = performance.now() - began;
      visible(true);
      controller = null;
      start.disabled = share.disabled = false;
    }
  };
  share.onclick = async () => {
    if (!report || controller) return;
    share.disabled = start.disabled = true;
    try {
      const json = JSON.stringify(report);
      if (native)
        await native.share({
          json,
          kind: layers ? "layers" : "clear",
          includeTrace: !!report.trace.ready,
        });
      else {
        const url = URL.createObjectURL(
          new Blob([json], { type: "application/json" }),
        );
        const link = document.createElement("a");
        link.href = url;
        link.download = layers
          ? "blocky-phone-layers.json"
          : "blocky-phone-clear.json";
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch {
      status.textContent =
        "Не удалось отправить. Нажмите «Отправить результат» ещё раз";
    } finally {
      share.disabled = start.disabled = false;
    }
  };
  cancel.onclick = () => controller?.abort("cancelled");
  function leave() {
    controller?.abort("return");
    if (native) void native.stop().catch(() => {});
    location.href = new URL("./", location.href).href;
  }
  back.onclick = leave;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) controller?.abort("background");
  });
  window.addEventListener("resize", () => controller?.abort("resize"));
  document
    .querySelector("#board canvas")
    ?.addEventListener("webglcontextlost", () =>
      controller?.abort("context-lost"),
    );
  if (native) {
    await App.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) controller?.abort("background");
    });
    await App.addListener("backButton", leave);
  }
  start.disabled = false;
}
