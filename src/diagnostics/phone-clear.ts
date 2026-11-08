import { Capacitor, registerPlugin } from "@capacitor/core";
import { App } from "@capacitor/app";
import { APP_VERSION } from "../app-version";
import { createProfile } from "../core/profile";
import { applyMove } from "../core/rules";
import { performanceCapture, type ClearFixture } from "../platform/performance";
import rawFixture from "./phone-clear-fixture.json";

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
  error?: string;
  reason?: string;
  bytes?: number;
};
type TraceBridge = {
  start(): Promise<TraceStatus>;
  stop(): Promise<TraceStatus>;
  share(p: { json: string }): Promise<void>;
};
type Hooks = {
  ready(): boolean;
  context(): unknown;
  reset(): Promise<void>;
  commit(): Promise<void>;
  state(): unknown;
  pause(paused: boolean): void;
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
  const native = Capacitor.isNativePlatform()
    ? registerPlugin<TraceBridge>("BlockyTrace")
    : null;
  const fast =
    import.meta.env.DEV &&
    new URLSearchParams(location.search).get("test") === "fast";
  const settleMs = fast ? 60 : 1800,
    measurementMs = fast ? 240 : 2400;
  const panel = document.createElement("section");
  panel.id = "phone-clear-panel";
  panel.style.cssText =
    "position:fixed;inset:0;z-index:1000;display:grid;place-items:center;background:rgba(8,15,30,.94);padding:20px;color:white;text-align:center";
  panel.innerHTML = `<div style="max-width:360px"><h2>Проверка очистки</h2><p id="phone-clear-status" role="status">Около 15 секунд. Игра сама повторит очистку три раза. Оставьте экран открытым.</p><p id="phone-clear-help">Ваша партия сохранена. После проверки отправьте один файл с результатом.</p><button id="phone-clear-start" class="primary" disabled>Начать проверку</button><button id="phone-clear-export" class="secondary" disabled>Отправить результат</button><button id="phone-clear-return" class="secondary">Вернуться в игру</button></div>`;
  panel.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
    button.style.cssText =
      "display:block;width:100%;margin:10px 0;min-height:48px";
    if (button.classList.contains("secondary")) button.style.color = "#f4f7ff";
  });
  document.body.append(panel);
  const status = panel.querySelector<HTMLElement>("#phone-clear-status")!;
  const start = panel.querySelector<HTMLButtonElement>("#phone-clear-start")!;
  const share = panel.querySelector<HTMLButtonElement>("#phone-clear-export")!;
  const back = panel.querySelector<HTMLButtonElement>("#phone-clear-return")!;
  let controller: AbortController | null = null;
  let report: {
    schema: string;
    appVersion: string;
    startedAt: string;
    completed: boolean;
    interrupted: boolean;
    trace: TraceStatus;
    notes: string[];
    fixture: ClearFixture;
    episodes: {
      kind: string;
      sample: ReturnType<typeof performanceCapture.snapshot>;
      state: unknown;
    }[];
  } | null = null;
  while (!hooks.ready()) await new Promise((r) => setTimeout(r, 25));
  hooks.pause(true);
  function visible(yes: boolean) {
    // No layout or canvas resizing: the complete ordinary game stays mounted.
    panel.style.background = yes ? "rgba(8,15,30,.94)" : "transparent";
    (panel.firstElementChild as HTMLElement).style.visibility = yes
      ? "visible"
      : "hidden";
  }
  async function episode(kind: string, signal: AbortSignal) {
    hooks.pause(true);
    await hooks.reset();
    hooks.pause(false);
    await sleep(settleMs, signal);
    performanceCapture.start(hooks.context());
    performanceCapture.setActive(true);
    const mark = `blocky-clear:${kind}`;
    performance.mark(`${mark}:start`);
    try {
      await hooks.commit();
      performance.mark(`${mark}:committed`);
      await sleep(measurementMs, signal);
      report!.episodes.push({
        kind,
        sample: performanceCapture.snapshot(),
        state: structuredClone(hooks.state()),
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
    start.disabled = share.disabled = true;
    report = {
      schema: "blocky-phone-clear-v1",
      appVersion: APP_VERSION,
      startedAt: new Date().toISOString(),
      completed: false,
      interrupted: false,
      trace: { error: native ? "not-started" : "native-unavailable" },
      fixture: structuredClone(phoneFixture),
      episodes: [],
      notes: [
        "Actual Classic UI, move calculator, IndexedDB transaction, score/reward DOM and rendering paths; separate blocky-clear-trace database.",
        "Position/wardrobe from POCO 0.51: two columns, 121 -> 1574, theme 1 -> 5, reveal variant 2. Not the original complete session.",
        "Previous one-line clear history is not replayed. Audio/haptics off; ads and native product analytics disabled.",
        "Episodes: warmup, ordinary capture, native-traced capture. Tracing adds overhead: use it to locate work, not as an FPS improvement comparison.",
        "Native trace may omit events if the WebView internal buffer fills; absent GPU events do not prove an idle GPU.",
      ],
    };
    visible(false);
    try {
      await episode("warmup", signal);
      await episode("untraced", signal);
      if (native) {
        try {
          report.trace = await native.start();
        } catch {
          report.trace = { error: "native-start-failed" };
        }
      }
      if (signal.aborted) throw new DOMException("Interrupted", "AbortError");
      await episode("traced", signal);
      report.completed = true;
      status.textContent =
        "Готово. Нажмите «Отправить результат» и пришлите файл в чат";
    } catch {
      report.interrupted = true;
      status.textContent = signal.aborted
        ? "Проверка прервана. Можно повторить"
        : "Проверка не завершилась. Отправьте результат для разбора";
    } finally {
      // Also stop when native.start() completed after a visibility interruption.
      if (native) {
        try {
          report.trace = await native.stop();
        } catch {
          report.trace = { error: "native-stop-failed" };
        }
      }
      hooks.pause(true);
      visible(true);
      controller = null;
      start.disabled = false;
      share.disabled = false;
    }
  };
  share.onclick = async () => {
    if (!report || controller) return;
    share.disabled = start.disabled = true;
    try {
      const json = JSON.stringify(report);
      if (native) await native.share({ json });
      else {
        const url = URL.createObjectURL(
          new Blob([json], { type: "application/json" }),
        );
        const link = document.createElement("a");
        link.href = url;
        link.download = "blocky-phone-clear.json";
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
  function leave() {
    controller?.abort();
    if (native) void native.stop().catch(() => {});
    location.href = new URL("./", location.href).href;
  }
  back.onclick = leave;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) controller?.abort();
  });
  window.addEventListener("resize", () => controller?.abort());
  document
    .querySelector("#board canvas")
    ?.addEventListener("webglcontextlost", () => controller?.abort());
  if (native) {
    await App.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) controller?.abort();
    });
    // Main's listener is also installed; returning after it cannot touch the real DB.
    await App.addListener("backButton", leave);
  }
  start.disabled = false;
}
