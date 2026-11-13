import Phaser from "phaser";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { App } from "@capacitor/app";
import { APP_VERSION } from "../app-version";
import { BoardScene } from "../game/BoardScene";
import { prepareEnergyBorder } from "../game/sprite-ink";
import { Atmosphere } from "../game/atmosphere";
import { Festival } from "../game/festival";
import { THEMES } from "../game/themes";
import { newGame, applyMove, shapeById } from "../core/rules";
import { performanceCapture } from "../platform/performance";
import "../style.css";
import "../enamel.css";
import "../classic.css";
import "../arcade.css";
import "./clear.css";

type Profile = {
  id: string;
  cachedBorder?: boolean;
  hideInk?: boolean;
  hideVfx?: boolean;
  noFestival?: boolean;
  noAmbient?: boolean;
  noTheme?: boolean;
};
const profiles: Profile[] = [
  { id: "baseline" },
  { id: "cached-border", cachedBorder: true },
  { id: "without-ink", hideInk: true },
  { id: "without-vfx", hideVfx: true },
  { id: "without-festival", noFestival: true },
  { id: "without-ambient", noAmbient: true },
  { id: "without-theme", noTheme: true },
];
const fast =
  import.meta.env.DEV &&
  new URLSearchParams(location.search).get("test") === "fast";
const settleMs = fast ? 40 : 2100,
  measurementMs = fast ? 180 : 2400;
const status = document.querySelector<HTMLElement>("#bench-status")!;
const start = document.querySelector<HTMLButtonElement>("#bench-start")!;
const save = document.querySelector<HTMLButtonElement>("#bench-export")!;
const board = document.querySelector<HTMLElement>("#board")!;
const ambient = new Atmosphere(),
  festival = new Festival();
let controller: AbortController | null = null;
let report: ReturnType<typeof makeReport> | null = null;
class BenchmarkScene extends BoardScene {
  override preload() {
    this.load.setBaseURL(new URL("../", location.href).href);
    super.preload();
  }
}
const scene = new BenchmarkScene("classic");
function resolution() {
  return Math.min(
    1024,
    Math.max(
      512,
      Math.ceil(
        (board.getBoundingClientRect().width *
          Math.min(devicePixelRatio || 1, 3)) /
          64,
      ) * 64,
    ),
  );
}
let ready!: () => void;
const loaded = new Promise<void>((r) => (ready = r));
scene.onTexturesReady = () => {
  festival.setTextures(
    scene.textures.get("vfx-chip").getSourceImage() as HTMLImageElement,
    scene.textures.get("vfx-flash").getSourceImage() as HTMLImageElement,
  );
  prepareEnergyBorder(scene);
  ready();
};
const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: resolution(),
  height: resolution(),
  parent: "board",
  transparent: true,
  scene,
  antialias: true,
  antialiasGL: false,
  banner: false,
  audio: { noAudio: true },
  scale: { mode: Phaser.Scale.NONE, resizeInterval: Number.POSITIVE_INFINITY },
  fps: { target: 60, limit: 60 },
});
function rendererInfo() {
  const renderer = game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
  const gl = renderer.gl;
  if (!gl)
    return {
      type: "canvas",
      canvas: [game.canvas.width, game.canvas.height],
      userAgent: navigator.userAgent,
    };
  const debug = gl.getExtension("WEBGL_debug_renderer_info");
  return {
    type: "webgl",
    canvas: [game.canvas.width, game.canvas.height],
    userAgent: navigator.userAgent,
    renderer: gl.getParameter(
      debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER,
    ),
    vendor: gl.getParameter(debug ? debug.UNMASKED_VENDOR_WEBGL : gl.VENDOR),
    maxTextureUnits: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),
    phaserTextureUnits: renderer.renderNodes.maxParallelTextureUnits,
    timerQueryAvailable: !!(
      gl.getExtension("EXT_disjoint_timer_query_webgl2") ||
      gl.getExtension("EXT_disjoint_timer_query")
    ),
  };
}
function makeReport() {
  return {
    schema: "blocky-clear-benchmark-v1",
    appVersion: APP_VERSION,
    startedAt: new Date().toISOString(),
    completed: false,
    interrupted: false,
    viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
    renderer: rendererInfo(),
    notes: [
      "Scripted presentation comparison on the physical device; not a saved game or a balance test.",
      "Synthetic triple-row full clear, streak 1; not the user's unknown original board/theme.",
      "Audio and haptics muted. No ads. No game/profile writes.",
      "Without-layer conditions are deliberately incomplete images for diagnosis, never proposed fixes.",
      "Cached border is experimental, not enabled in ordinary play.",
      "Independent rAF intervals; no GPU duration measurement. First warmup is retained separately.",
    ],
    settleMs,
    measurementMs,
    profiles,
    warmup: null as null | {
      profile: Profile;
      sample: ReturnType<typeof performanceCapture.snapshot>;
    },
    episodes: [] as {
      round: number;
      profile: Profile;
      sample: ReturnType<typeof performanceCapture.snapshot>;
    }[],
  };
}
function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
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
function stateFixture() {
  const before = {
    ...newGame(1234, "clear-benchmark", "flow-v4"),
    moves: 10,
    streak: 0,
    score: 0,
  };
  before.tray = [
    { shapeId: "I3-1", color: 2, used: false },
    { shapeId: "S1-0", color: 3, used: false },
    { shapeId: "S1-0", color: 4, used: false },
  ];
  for (let y = 0; y < 3; y++)
    for (let x = 0; x < 7; x++) before.board[y * 8 + x] = ((x + y) % 6) + 1;
  const move = { slot: 0, x: 7, y: 0 },
    result = applyMove(before, move, before.revision);
  if (!result || result.lines !== 3 || !result.allClear)
    throw Error("Benchmark fixture invalid");
  const placed = shapeById("I3-1").cells.map(
    ([x, y]) => (move.y + y) * 8 + move.x + x,
  );
  const effectBoard = [...before.board];
  for (const i of placed) effectBoard[i] = 2;
  return { before, result, placed, effectBoard };
}
async function episode(profile: Profile, signal: AbortSignal) {
  performanceCapture.setActive(false);
  festival.stop();
  ambient.set(0, false, false);
  scene.stopEffects();
  scene.setDiagnosticProfile(profile);
  const { before, result, placed, effectBoard } = stateFixture();
  scene.setState(before);
  scene.setTheme(0, THEMES[0]!.accent);
  festival.setPalette(0);
  ambient.set(0, !profile.noAmbient, false);
  game.loop.wake();
  await sleep(settleMs, signal);
  const rect = board.getBoundingClientRect();
  performanceCapture.start();
  performanceCapture.setActive(true);
  scene.setState(result.state);
  scene.impact(placed, result.cells, effectBoard, result.lines, true);
  performanceCapture.markPlacement(3, 1, true, false);
  ambient.origin(rect, placed);
  ambient.impulse(3);
  if (!profile.noFestival)
    festival.burst(rect, result.cells, 3, false, false, effectBoard);
  const timers = [
    setTimeout(() => {
      if (!signal.aborted && !profile.noTheme) {
        performanceCapture.record("themeReveal", 0);
        scene.setTheme(5, THEMES[5]!.accent);
        ambient.set(THEMES[5]!.at, !profile.noAmbient, false);
        festival.setPalette(5);
      }
    }, 320),
    setTimeout(() => {
      if (!signal.aborted && !profile.noFestival) {
        performanceCapture.record("allClearFestival", 0);
        festival.burst(rect, [], 3, true, false, undefined, 110, 2);
      }
    }, 650),
  ];
  try {
    await sleep(measurementMs, signal);
  } finally {
    for (const timer of timers) clearTimeout(timer);
    performanceCapture.setActive(false);
  }
  return performanceCapture.snapshot();
}
function cleanup() {
  performanceCapture.setActive(false);
  festival.stop();
  ambient.set(0, false, false);
  scene.setDiagnosticProfile();
  scene.stopEffects();
  game.loop.sleep();
}
start.onclick = async () => {
  if (controller || !APP_VERSION.endsWith("-preview")) return;
  controller = new AbortController();
  const signal = controller.signal;
  start.disabled = true;
  save.disabled = true;
  game.scale.resize(resolution(), resolution());
  scene.syncResolution();
  report = makeReport();
  try {
    status.textContent = "Подготовка замера…";
    report.warmup = {
      profile: profiles[1]!,
      sample: await episode(profiles[1]!, signal),
    };
    let index = 0;
    for (let round = 0; round < 2; round++)
      for (const profile of round ? [...profiles].reverse() : profiles) {
        status.textContent = `Замер ${++index} из ${profiles.length * 2}. Оставьте экран открытым`;
        const sample = await episode(profile, signal);
        report.episodes.push({ round, profile, sample });
      }
    report.completed = true;
    status.textContent = "Готово. Сохраните замер и отправьте файл в чат";
  } catch (error) {
    report.interrupted = true;
    status.textContent = signal.aborted
      ? "Замер прерван. Можно запустить заново"
      : "Не удалось закончить замер. Можно повторить";
    if (!signal.aborted) console.error(error);
  } finally {
    cleanup();
    controller = null;
    start.disabled = false;
    save.disabled = !report.episodes.length;
  }
};
save.onclick = async () => {
  if (!report) return;
  save.disabled = true;
  try {
    const json = JSON.stringify(report);
    if (Capacitor.isNativePlatform())
      await registerPlugin<{ share(p: { json: string }): Promise<void> }>(
        "BlockyDiagnostics",
      ).share({ json });
    else {
      const url = URL.createObjectURL(
        new Blob([json], { type: "application/json" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "blocky-clear-benchmark.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  } catch {
    status.textContent =
      "Не удалось сохранить файл. Нажмите «Сохранить замер» ещё раз";
  } finally {
    save.disabled = false;
  }
};
document.querySelector("#bench-return")!.addEventListener("click", () => {
  controller?.abort();
  location.href = new URL("../", location.href).href;
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) controller?.abort();
});
window.addEventListener("resize", () => controller?.abort());
game.canvas.addEventListener("webglcontextlost", () => controller?.abort());
if (Capacitor.isNativePlatform()) {
  void App.addListener("appStateChange", ({ isActive }) => {
    if (!isActive) controller?.abort();
  });
  void App.addListener("backButton", () => {
    controller?.abort();
    location.href = new URL("../", location.href).href;
  });
}
await loaded;
cleanup();
if (APP_VERSION.endsWith("-preview")) {
  start.disabled = false;
  status.textContent = "Готов к замеру. Партия сохранена";
} else status.textContent = "Диагностика доступна в тестовой сборке";
