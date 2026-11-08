import { readRenderInfo } from "./platform/render-info";
import { RewardLabels } from "./game/reward-label";
import type { ClearLayer } from "./diagnostics/clear-layers";
import { APP_VERSION } from "./app-version";
import { presentReviveClock } from "./game/revive-clock";
import { MoveCalculator } from "./game/move-calculator";
import { PlayCapture } from "./platform/play-capture";
import { sharePlayRecord } from "./platform/share-json";
import { presentResult } from "./game/result-presentation";
import {
  startReviveOffer,
  acceptReviveOffer,
  expireReviveOffer,
} from "./core/revive-offer";
import { clearSignature } from "./game/clear-signature";
import { discoverTheme } from "./core/wardrobe";
import { ProductAnalytics, nativeAnalytics } from "./platform/analytics";
import { TileMaterialDOM } from "./game/tile-material";
import {
  TILE_MATERIALS,
  tileMaterialForTheme,
  tileTransitionDuration,
} from "./game/tile-study-config";
import { performanceCapture } from "./platform/performance";
import { Atmosphere } from "./game/atmosphere";
import {
  THEMES,
  themeFor,
  themeTile,
  themeAccent,
  seriesVisual,
  labelDevelopment,
} from "./game/themes";
import { praiseFor, type PraiseResult } from "./core/praise";
import { Festival } from "./game/festival";
import { GameHaptics, clearHapticLevel } from "./platform/haptics";
import { comboMultiplier } from "./core/scoring";
import { bestFor, recordScore } from "./core/profile";
import { AudioFocus, nativeAudioFocus } from "./platform/audio-focus";
import { AdsController, nativeAds, watchBanner } from "./platform/ads";
import { claimRevive, revivePlan } from "./core/monetization";
import Phaser from "phaser";
import { Capacitor, registerPlugin } from "@capacitor/core";
import "./style.css";
import "./enamel.css";
import "./classic.css";
import "./arcade.css";
import { BoardScene } from "./game/BoardScene";
import { COLORS, tileURL } from "./game/tiles";
import { GameAudio } from "./game/audio";
import {
  applyMove,
  fits,
  placements,
  newGame,
  shapeById,
  type DealerVersion,
  type Move,
  type GameState,
} from "./core/rules";
import { createProfile, dayKey, withHint, type Profile } from "./core/profile";
import {
  IndexedSave,
  ProfileStore,
  DamagedSaveError,
  SaveConflictError,
} from "./platform/save";
import {
  GameplayActivityCoordinator,
  installDocumentVisibilityBlocker,
} from "./vendor/mini-games-kit/activity";
import type { HintResult } from "./core/hints";

import { lessonGame, LESSON_MOVES, LESSON_TEXT } from "./core/tutorial";

const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
const pauseIcon = svg(
  '<path d="m9 3-.7 2.2-2 .9L4 5.6 2 9l1.8 1.6v2.8L2 15l2 3.4 2.3-.5 2 .9L9 21h4l.7-2.2 2-.9 2.3.5 2-3.4-1.8-1.6v-2.8L20 9l-2-3.4-2.3.5-2-.9L13 3Z"/><circle cx="11" cy="12" r="3"/>',
);
const bulb = svg(
  '<path d="M9 18h6m-5 3h4M8 14a6 6 0 1 1 8 0c-1 1-1 2-1 2H9s0-1-1-2Z"/>',
);
const crown = svg('<path d="m3 6 4 5 5-7 5 7 4-5-2 12H5Z"/>');
const root = document.querySelector<HTMLDivElement>("#app")!;
const seed = () => crypto.getRandomValues(new Uint32Array(1))[0]!;
const fresh = (dealer: DealerVersion = "flow-v4") => ({
  ...newGame(seed(), crypto.randomUUID(), dealer),
  scoringVersion: "festival-v4" as const,
  seriesBonusVersion: 1 as const,
});
async function start() {
  document.documentElement.dataset.presentation = "classic";
  const traceRequest = new URLSearchParams(location.search).get("clearTrace");
  const phoneTrace =
    APP_VERSION.endsWith("-preview") &&
    (traceRequest === "1" || traceRequest === "layers");
  const phoneLayers = phoneTrace && traceRequest === "layers";
  let diagnosticLayer: ClearLayer | null = null;
  let diagnosticRewardDom = 0;
  // A fixed separate database keeps all ordinary transaction/render paths real,
  // while the scripted diagnostic cannot modify the player's profile or backup.
  const adapter = new IndexedSave(
    phoneTrace ? "blocky-clear-trace" : "blocky-classic",
  );
  const loaded = await adapter.load();
  const traceModule = phoneTrace
    ? await import("./diagnostics/phone-clear")
    : null;
  const initial = traceModule
    ? traceModule.fixtureProfile((loaded.profile?.revision ?? 0) + 1)
    : (loaded.profile ?? createProfile(fresh()));
  if (traceModule || !loaded.profile) await adapter.write(initial);
  const store = new ProfileStore(initial, adapter),
    audio = new GameAudio(),
    scene = new BoardScene("classic");
  const analytics = new ProductAnalytics(phoneTrace ? null : nativeAnalytics());
  const playCapture = new PlayCapture();
  let exportedPlayEvents = 0;
  let performanceExported = false;
  store.observer = {
    prepare: (before, next) => analytics.prepare(before, next),
    committed: (before, next, reason) => {
      playCapture.committed(before, next);
      analytics.committed(before, next, reason);
    },
    saveFailed: () => analytics.saveFailed(),
  };
  analytics.boot(initial, !loaded.profile, loaded.recovered);
  void analytics.init();
  if (import.meta.env.DEV) (window as any).__blockyAnalytics = analytics;
  const atmosphere = new Atmosphere();
  const festival = new Festival(),
    haptics = new GameHaptics();
  let movePending = false;
  const moveCalculator = new MoveCalculator(
    () =>
      new Worker(new URL("./game/move.worker.ts", import.meta.url), {
        type: "module",
      }),
  );
  let praiseWorker: Worker | null = null;
  let praiseResult: PraiseResult | null = null;
  let praiseKey = "";
  let praiseTimer = 0;
  let lastPraiseMove = -5;
  let defeatPlayed = "";
  let themeKey = "";
  let themeGame = "";
  let themeIndex = 0;
  function suspendPraise() {
    clearTimeout(praiseTimer);
    praiseTimer = 0;
    praiseWorker?.terminate();
    praiseWorker = null;
    if (!praiseResult) praiseKey = "";
  }
  function stopPraise() {
    clearTimeout(praiseTimer);
    praiseTimer = 0;
    praiseWorker?.terminate();
    praiseWorker = null;
    praiseKey = "";
    praiseResult = null;
  }
  function schedulePraise(g: GameState) {
    const key = `${g.gameId}:${g.revision}`;
    if (!running || inLesson() || g.status !== "playing") {
      stopPraise();
      return;
    }
    if (drag || key === praiseKey) return;
    stopPraise();
    praiseKey = key;
    if (g.board.filter(Boolean).length < 12 || worker) return;
    // Leave the placement/first effect frame free of worker startup and ranking.
    praiseTimer = window.setTimeout(() => {
      praiseTimer = 0;
      if (!running || praiseKey !== key) return;
      const job = new Worker(
        new URL("./game/praise.worker.ts", import.meta.url),
        { type: "module" },
      );
      praiseWorker = job;
      job.onmessage = (event: MessageEvent<PraiseResult>) => {
        if (praiseWorker !== job) return;
        praiseResult = event.data;
        job.terminate();
        praiseWorker = null;
      };
      job.onerror = () => {
        job.terminate();
        if (praiseWorker === job) praiseWorker = null;
      };
      job.postMessage(g);
    }, 180);
  }
  const festivalTimers = new Set<number>();
  const later = (fn: () => void, delay: number) => {
    const id = window.setTimeout(() => {
      festivalTimers.delete(id);
      if (running) fn();
    }, delay);
    festivalTimers.add(id);
  };
  const audioFocus = new AudioFocus(nativeAudioFocus(), (allowed) =>
    audio.setAllowed(allowed),
  );
  audio.beforeUnlock = () => audioFocus.request();
  const lessonStep = () => store.state.tutorialStep ?? 4;
  const inLesson = () => lessonStep() < 4;
  const currentGame = () =>
    inLesson() ? lessonGame(lessonStep()) : store.state.game;
  function visualSeriesFor(g: GameState) {
    const debug = import.meta.env.DEV
      ? Number(new URLSearchParams(location.search).get("themeSeries"))
      : 0;
    return debug > 0
      ? debug
      : g.scoringVersion === "festival-v4"
        ? seriesVisual(g.streak)
        : g.streak;
  }
  let heldTheme: number | null = null;
  let themeRevealGeneration = 0;
  function presentationTheme() {
    if (phoneLayers && diagnosticLayer?.freezeTheme) return 1;
    if (heldTheme !== null) return heldTheme;
    const params = new URLSearchParams(location.search);
    return import.meta.env.DEV && params.has("themeSeries")
      ? themeFor(Number(params.get("themeSeries")) || 0)
      : (store.state.wardrobe?.selected ?? 0);
  }
  root.innerHTML = `<main class="shell"><header class="topbar"><a href="?mode=adventure" class="campaign-entry" aria-label="Кампания">Приключение</a><div class="brand"><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>blocky</div><button class="icon" id="pause" aria-label="Пауза">${pauseIcon}</button></header><div class="play-layout"><section class="board-column"><div class="board-wrap"><div class="combo-hud" id="combo-hud" aria-live="polite"><strong id="combo-title"></strong><span id="combo-stock"></span></div><div class="clear-glow" id="clear-glow" aria-hidden="true"></div><div id="board" role="img" aria-label="Игровое поле 8 на 8"></div></div><div class="board-caption"><span id="caption"></span><span class="toast" id="toast" role="status"></span></div></section><aside class="side"><section class="score-panel"><span class="lesson-heading">Обучение</span><div><div class="sr-only">Ваш счёт</div><div class="score" id="score">0</div></div><div class="best">${crown}<span><span class="sr-only">Рекорд </span><b id="best">0</b></span></div><div class="reward-line"><span id="streak"></span><span class="burst" id="burst" aria-hidden="true"></span></div></section><section class="tray-area"><div class="tray-label"><span>Следующие фигуры</span><span id="tray-progress">3 / 3</span></div><div class="tray" id="tray" aria-label="Доступные фигуры"></div></section><section class="hint-area"><div id="lesson" hidden><p id="lesson-text" role="status"></p><button id="lesson-skip" class="lesson-skip">Пропустить</button></div><button class="hint" id="hint">${bulb}<span id="hint-label">Подсказка</span><span class="hint-count" id="hint-count">3</span></button><button class="hint" id="play-again" hidden>Ещё раз</button></section></aside></div></main><div class="ad-slot" id="ad-slot" aria-hidden="true"></div><div class="floating" id="floating" hidden></div><dialog id="dialog" aria-labelledby="dialog-title"></dialog><span id="announce" class="sr-only" aria-live="polite"></span>`;
  const el = <T extends HTMLElement = HTMLElement>(id: string) =>
    document.getElementById(id) as T;
  const dialog = el<HTMLDialogElement>("dialog"),
    canvasBox = el("board"),
    floating = el("floating");
  let selected: number | null = null,
    drag: {
      id: number;
      slot: number;
      startX: number;
      startY: number;
      revision: number;
      touch: boolean;
      moved: boolean;
      rect: DOMRect;
    } | null = null;
  let currentMove: Move | null = null,
    worker: Worker | null = null,
    hintGeneration = 0,
    toastTimer = 0,
    modal = "";
  let hintSaving = false;
  let hintTimeout = 0;
  let dragFrame = 0;
  let dragSample: PointerEvent | null = null;
  let rejectedDrags = 0;
  let tapHelpShown = false;
  let running = false;
  let phaser: Phaser.Game | null = null;
  let rendererReady = false;
  function syncRenderer() {
    if (!phaser || !rendererReady) return;
    atmosphere.set(THEMES[presentationTheme()]!.at, running, scene.calm);
    if (running) schedulePraise(currentGame());
    if (running) phaser.loop.wake();
    else phaser.loop.sleep();
  }
  let recordCelebrated =
    initial.game.score > 0 && initial.game.score >= bestFor(initial);
  let rewardHoldUntil = 0;
  let pendingPoints = 0;
  const rewards = new Map<HTMLElement, () => void>();
  const rewardLabels = new RewardLabels();
  let resultTimer = 0,
    resultPending = false;
  let resultFeedbackTimer = 0;
  let finishResultPresentation = () => {};
  let scoreFrame = 0,
    scoreShown = initial.game.score,
    scoreTarget = initial.game.score;
  let scoreGame = initial.game.gameId;
  let visibleBestFloor = bestFor(initial);
  const rewardAnchor = document.createElement("div");
  rewardAnchor.className = "board-reward";
  document.querySelector(".board-wrap")!.append(rewardAnchor);
  rewardAnchor.append(el("burst"));
  let cancelRewardWarmup: (() => void) | null = null;
  function queueRewardWarmup() {
    if (cancelRewardWarmup) return;
    const warm = () => {
      cancelRewardWarmup = null;
      if (!rendererReady || document.hidden) return;
      if (movePending || drag || rewards.size) {
        const timer = window.setTimeout(() => {
          cancelRewardWarmup = null;
          queueRewardWarmup();
        }, 400);
        cancelRewardWarmup = () => clearTimeout(timer);
        return;
      }
      const board = rewardAnchor.getBoundingClientRect();
      if (!board.width) return;
      const node = document.createElement("span");
      node.className = "reward-event";
      node.dataset.tier = "all-clear";
      node.style.visibility = "hidden";
      node.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.className = "reward-praise";
      for (const [i, letter] of Array.from("Чистое поле!").entries()) {
        const glyph = document.createElement("i");
        glyph.textContent = letter;
        glyph.style.setProperty("--letter", String(i));
        label.append(glyph);
      }
      label.style.fontSize = `${Math.min(42, board.width * 0.13)}px`;
      node.append(label);
      el("burst").append(node);
      const width = label.getBoundingClientRect().width,
        max = Math.max(1, (board.width - 32) / 1.2);
      if (width > max)
        label.style.fontSize = `${(parseFloat(label.style.fontSize) * max) / width}px`;
      rewardLabels.prepare(label, false)();
      node.remove();
    };
    if (typeof window.requestIdleCallback === "function") {
      const idle = window.requestIdleCallback(warm);
      cancelRewardWarmup = () => window.cancelIdleCallback(idle);
    } else {
      const timer = window.setTimeout(warm, 100);
      cancelRewardWarmup = () => clearTimeout(timer);
    }
  }
  function paintBest() {
    el("best").textContent = Math.max(
      visibleBestFloor,
      Math.round(scoreShown),
    ).toLocaleString("ru");
  }
  function updateScore(value: number, gameId: string, smooth: boolean) {
    if (value === scoreTarget && gameId === scoreGame && scoreFrame) return;
    cancelAnimationFrame(scoreFrame);
    scoreFrame = 0;
    const from = scoreShown;
    scoreTarget = value;
    const sameGame = scoreGame === gameId;
    scoreGame = gameId;
    const paint = (n: number) => {
      scoreShown = n;
      el("score").textContent = Math.round(n).toLocaleString("ru");
      paintBest();
    };
    if (!smooth || scene.calm || !sameGame || value <= from) {
      paint(value);
      return;
    }
    const start = performance.now(),
      duration =
        value - from < 20
          ? 180
          : Math.min(900, 340 + Math.log2(value - from + 1) * 36);
    const tick = (now: number) => {
      const t = Math.max(0, Math.min(1, (now - start) / duration));
      paint(from + (value - from) * (1 - (1 - t) ** 3));
      scoreFrame = t < 1 ? requestAnimationFrame(tick) : 0;
    };
    scoreFrame = requestAnimationFrame(tick);
  }
  const cosmetic = new Set<Animation>();
  function animate(
    target: Element,
    frames: Keyframe[],
    duration: number,
    delay = 0,
  ) {
    if (scene.calm) return;
    const a = target.animate(frames, {
      duration,
      delay,
      easing: "cubic-bezier(.2,.8,.25,1)",
    });
    cosmetic.add(a);
    a.onfinish = a.oncancel = () => cosmetic.delete(a);
    return a;
  }
  function stopCosmetics() {
    finishResultPresentation();
    heldTheme = null;
    themeRevealGeneration++;
    festivalTimers.forEach(clearTimeout);
    festivalTimers.clear();
    festival.stop();
    cancelAnimationFrame(scoreFrame);
    scoreFrame = 0;
    pendingPoints = 0;
    scoreTarget = currentGame().score;
    scoreShown = scoreTarget;
    el("score").textContent = scoreTarget.toLocaleString("ru");
    paintBest();
    document.querySelectorAll(".hud-notice").forEach((n) => n.remove());
    cosmetic.forEach((a) => a.cancel());
    cosmetic.clear();
    rewards.forEach((finish) => finish());
    rewards.clear();
    rewardHoldUntil = 0;
    el("burst").textContent = "";
    scene.stopEffects();
  }
  store.onBusyChange = syncSaving;
  const activity = new GameplayActivityCoordinator(
    () => {
      running = true;
      playCapture.setActive(
        !inLesson() && store.state.game.status === "playing",
      );
      performanceCapture.setActive(true);
      root.classList.remove("effects-paused");
      queueRewardWarmup();
      haptics.setActive(
        store.state.settings.haptics !== false &&
          !store.state.settings.calm &&
          !matchMedia("(prefers-reduced-motion: reduce)").matches,
      );
      audioFocus.setActive(audio.audible);
      ads.setActive(!inLesson() && store.state.game.status === "playing");
      analytics.setActive(
        !inLesson() && store.state.game.status === "playing",
        store.state,
      );
      bannerWatch?.update();
      scene.preview(hintMove(), true, true);
      syncRenderer();
      refreshHintLabel();
      if (resultPending)
        queueMicrotask(() => {
          if (running && resultPending && !dialog.open) beginDefeat();
        });
    },
    () => {
      running = false;
      playCapture.setActive(false);
      analytics.setActive(false, store.state);
      performanceCapture.setActive(false);
      root.classList.add("effects-paused");
      stopPraise();
      atmosphere.set(THEMES[presentationTheme()]!.at, false, scene.calm);
      haptics.setActive(false);
      audioFocus.setActive(false);
      ads.setActive(false);
      bannerWatch?.update();
      clearTimeout(resultTimer);
      cancelDrag();
      cancelHint();
      audio.stop();
      stopCosmetics();
      syncRenderer();
    },
  );
  const adBridge = phoneTrace ? null : nativeAds();
  let bannerWatch: ReturnType<typeof watchBanner> | undefined;
  const ads = new AdsController(
    store,
    adBridge,
    (blocked) => {
      root.inert = blocked;
      dialog.inert = blocked;
      activity.setBlocked("ad", blocked);
      if (blocked) {
        cancelDrag();
        cancelHint();
        audio.stop();
        stopCosmetics();
      }
      bannerWatch?.update();
    },
    () => {
      if (
        !ads.busy &&
        store.state.game.status === "playing" &&
        ["result", "revive"].includes(modal)
      ) {
        resultPending = false;
        clearTimeout(resultTimer);
        close();
      }
      render();
    },
    (message) => toast(message, 6000),
    analytics,
  );
  bannerWatch = watchBanner(
    adBridge,
    el("ad-slot"),
    () => !activity.isBlocked() && !inLesson() && !ads.busy && !document.hidden,
  );
  activity.onBlockedChange(() => bannerWatch?.update());
  void ads.init().then(() => bannerWatch?.update());
  void adBridge?.addListener("geometryChanged", () => {
    cancelDrag();
    bannerWatch?.invalidate();
  });
  void adBridge?.addListener("ready", () => {
    if (["reward", "revive"].includes(modal)) void offerAvailability();
  });
  activity.setGameplayDesired(true);
  installDocumentVisibilityBlocker(activity);
  root.inert = true;
  root.setAttribute("aria-busy", "true");
  scene.onTexturesReady = () => {
    if (scene.textures.exists("vfx-chip") && scene.textures.exists("vfx-flash"))
      festival.setTextures(
        scene.textures.get("vfx-chip").getSourceImage() as HTMLImageElement,
        scene.textures.get("vfx-flash").getSourceImage() as HTMLImageElement,
      );
    scene.game.events.once("postrender", () => {
      rendererReady = true;
      queueRewardWarmup();
      root.inert = ads.busy;
      root.removeAttribute("aria-busy");
      syncRenderer();
      if (!inLesson() && currentGame().status === "over" && !dialog.open)
        void showResult();
    });
  };
  const boardResolution = () =>
    Math.min(
      1024,
      Math.max(
        512,
        Math.ceil(
          (canvasBox.getBoundingClientRect().width *
            Math.min(devicePixelRatio || 1, 3)) /
            64,
        ) * 64,
      ),
    );
  const resolution = boardResolution();
  phaser = new Phaser.Game({
    type: Phaser.AUTO,
    width: resolution,
    height: resolution,
    parent: "board",
    transparent: true,
    scene,
    antialias: true,
    // Edges are already rasterized in textures; avoid MSAA on every high-DPI pixel.
    antialiasGL: false,
    banner: false,
    audio: { noAudio: true },
    // Logical board remains 512; backing pixels follow screen density (cap 1024).
    // ResizeObserver invalidates real size changes instead of polling layout.
    scale: {
      mode: Phaser.Scale.NONE,
      resizeInterval: Number.POSITIVE_INFINITY,
    },
    fps: { target: 60, limit: 60 },
  });
  const canvasResize = new ResizeObserver(() => {
    if (phaser) {
      const size = boardResolution();
      if (phaser.scale.width !== size) {
        phaser.scale.resize(size, size);
        scene.syncResolution();
      }
      phaser.scale.dirty = true;
    }
  });
  canvasResize.observe(canvasBox);
  const unsubscribeResize = () => {
    cancelDrag();
    cancelHint();
    requestAnimationFrame(() => render());
  };
  window.addEventListener("resize", unsubscribeResize);
  window.addEventListener("blur", () => activity.setBlocked("blur", true));
  window.addEventListener("focus", () => activity.setBlocked("blur", false));
  canvasBox.addEventListener(
    "webglcontextlost",
    () => {
      activity.setBlocked("webgl", true);
      toast("Восстанавливаем изображение…");
    },
    true,
  );
  canvasBox.addEventListener(
    "webglcontextrestored",
    () => {
      activity.setBlocked("webgl", false);
      if (el("toast").textContent === "Восстанавливаем изображение…") {
        clearTimeout(toastTimer);
        el("toast").textContent = "";
      }
      render();
    },
    true,
  );
  function toast(message: string, duration = 3500) {
    clearTimeout(toastTimer);
    if (dialog.open) {
      const status = dialog.querySelector<HTMLElement>(".dialog-status");
      if (status) status.textContent = message;
      return;
    }
    el("toast").textContent = message;
    el("toast").classList.toggle("explanation", message.length > 45);
    toastTimer = window.setTimeout(
      () => (el("toast").textContent = ""),
      duration,
    );
  }
  function hintMove() {
    if (inLesson()) return LESSON_MOVES[lessonStep()] ?? null;
    const h = store.state.hint;
    return h?.gameId === store.state.game.gameId &&
      h.revision === store.state.game.revision
      ? h.move
      : null;
  }
  const tileMaterials = new TileMaterialDOM();
  const rewardEmblems = new Map<string, HTMLImageElement>();
  for (const id of ["all-clear", "series"]) {
    const img = new Image();
    img.src = `/assets/rewards/${id}.webp`;
    void img
      .decode()
      .then(() => rewardEmblems.set(id, img))
      .catch(() => {});
  }
  function mini(slot: number, cell: number) {
    const piece = currentGame().tray[slot]!,
      shape = shapeById(piece.shapeId);
    return `<span class="mini-shape" style="grid-template-columns:repeat(${shape.width},${cell}px);grid-template-rows:repeat(${shape.height},${cell}px)">${shape.cells.map(([x, y]) => TILE_MATERIALS.map((material) => `<img draggable="false" alt="" class="mini-cell tile-${material}" style="grid-column:${x + 1};grid-row:${y + 1}" src="${tileURL(COLORS[themeTile(presentationTheme(), piece.color)]!, material)}">`).join("")).join("")}</span>`;
  }
  function render(smoothScore = false) {
    const p = store.state,
      g = currentGame();
    // Read stable tray geometry before score/text/class writes can dirty layout.
    const tray = el("tray"),
      trayWidth = tray.clientWidth,
      trayHeight = tray.clientHeight;
    if (g.gameId !== scoreGame) {
      pendingPoints = 0;
      visibleBestFloor = bestFor(p);
    }
    updateScore(
      g.score - pendingPoints,
      g.gameId,
      smoothScore || pendingPoints > 0,
    );
    paintBest();
    el("hint-count").textContent = String(
      (p.freeDay === dayKey() ? p.freeHints : 3) + p.earnedHints,
    );
    el("tray-progress").textContent =
      `${g.tray.filter((s) => !s.used).length} / 3`;
    const focused = (document.activeElement as HTMLElement)?.dataset?.slot;
    const cell = Math.max(
      7,
      Math.floor(
        Math.min(
          (canvasBox.getBoundingClientRect().width / 8) * 0.48,
          (trayWidth / 3 - 12) / 5,
          (trayHeight - 8) / 5,
        ),
      ),
    );
    const blocked = g.tray.map(
      (s) => !s.used && placements(g.board, shapeById(s.shapeId)).length === 0,
    );
    const hintSlot = hintMove()?.slot;
    el("hint").classList.toggle(
      "depleted",
      Number(el("hint-count").textContent) === 0 && hintSlot === undefined,
    );
    // Preserve surviving images/buttons instead of parsing every base64 tile
    // and rebuilding all three pieces on each placement, focus or setting change.
    for (let i = 0; i < g.tray.length; i++) {
      const s = g.tray[i]!;
      let button = tray.children[i] as HTMLButtonElement | undefined;
      if (!button) {
        button = document.createElement("button");
        button.dataset.slot = String(i);
        tray.append(button);
      }
      if (button.dataset.palette !== String(presentationTheme())) {
        button.querySelectorAll<HTMLImageElement>("img").forEach((img) => {
          const material = TILE_MATERIALS.find((m) =>
            img.classList.contains(`tile-${m}`),
          )!;
          img.src = tileURL(
            COLORS[themeTile(presentationTheme(), s.color)]!,
            material,
          );
        });
        button.dataset.palette = String(presentationTheme());
      }
      button.setAttribute("aria-pressed", String(selected === i));
      button.className = `piece${s.used ? " used" : ""}${blocked[i] ? " unavailable" : ""}${selected === i ? " selected" : ""}${hintSlot === i ? " hinted" : ""}`;
      button.setAttribute(
        "aria-label",
        `Фигура ${i + 1}: ${s.shapeId}${blocked[i] ? ", сейчас нет места" : ""}`,
      );
      button.disabled =
        s.used || g.status === "over" || (inLesson() && i !== hintSlot);
      const visualKey = s.used ? "used" : `${s.shapeId}:${s.color}:${cell}`;
      if (button.dataset.visualKey !== visualKey) {
        button.innerHTML = s.used ? "" : mini(i, cell);
        tileMaterials.sync(button);
        button.dataset.visualKey = visualKey;
      }
    }
    while (tray.children.length > g.tray.length)
      tray.lastElementChild!.remove();
    if (focused !== undefined)
      tray
        .querySelector<HTMLButtonElement>(`[data-slot="${focused}"]`)
        ?.focus({ preventScroll: true });
    audio.enabled = p.settings.sound;
    audio.configure(
      p.settings.musicVolume ?? (p.settings.sound ? 0.35 : 0),
      p.settings.effectsVolume ?? 1,
    );
    audioFocus.setActive(running && audio.audible);
    scene.calm =
      p.settings.calm || matchMedia("(prefers-reduced-motion: reduce)").matches;
    audio.calm = scene.calm;
    haptics.setActive(running && p.settings.haptics !== false && !scene.calm);
    document.documentElement.classList.toggle("calm", scene.calm);
    const visualSeries = visualSeriesFor(g);
    const nextTheme = presentationTheme();
    const nextKey = String(nextTheme);
    audio.setSeries(g.streak);
    atmosphere.set(THEMES[nextTheme]!.at, running, scene.calm);
    scene.setTheme(nextTheme, THEMES[nextTheme]!.accent);
    tileMaterials.set(
      tileMaterialForTheme(nextTheme),
      tileTransitionDuration(scene.calm, nextTheme),
    );
    festival.setPalette(nextTheme);
    if (
      themeGame === g.gameId &&
      themeKey !== nextKey &&
      running &&
      !inLesson()
    ) {
      later(() => {
        presentHudNotice("theme", THEMES[nextTheme]!.name.toUpperCase());
        atmosphere.impulse(1.5);
      }, 450);
    }
    if (themeGame !== g.gameId) {
      lastPraiseMove = -5;
      defeatPlayed = "";
    }
    themeGame = g.gameId;
    themeKey = nextKey;
    themeIndex = nextTheme;
    schedulePraise(g);
    scene.setState(g);
    scene.preview(hintMove(), true, true);
    el("hint").toggleAttribute("disabled", g.status === "over");
    el("play-again").hidden = g.status !== "over";
    el("hint").hidden = true;
    el("lesson").hidden = !inLesson();
    el("lesson-text").textContent = LESSON_TEXT[lessonStep()] ?? "";
    el("lesson-skip").textContent =
      lessonStep() === 3 ? "Начать игру" : "Пропустить";
    root.classList.toggle("learning", inLesson());
    root.classList.toggle("game-over", g.status === "over");
    root.classList.toggle("lesson-ready", lessonStep() === 3);
    el("streak").textContent = g.streak
      ? `Серия ${g.streak}${g.rulesVersion === "grace-v2" ? ` · ${2 - (g.streakMisses ?? 0)} запаса` : ""}`
      : "";
    el("streak").title =
      "Можно сделать два хода без очистки. Третий сбросит серию. Время не ограничено.";
    el("streak").dataset.level = String(Math.min(4, g.streak));
    const comboTitle = g.streak
      ? g.scoringVersion
        ? `СЕРИЯ ${g.streak}`
        : `СЕРИЯ ${g.streak}`
      : "";
    const stock =
      g.rulesVersion === "grace-v2"
        ? Math.max(0, 2 - (g.streakMisses ?? 0))
        : 0;
    const hud = el("combo-hud");
    const changedCombo = hud.dataset.key !== `${g.gameId}:${g.streak}:${stock}`;
    hud.dataset.key = `${g.gameId}:${g.streak}:${stock}`;
    hud.classList.toggle("visible", !!g.streak && !inLesson());
    hud.classList.toggle("urgent", !!g.streak && stock === 0);
    el("combo-title").textContent = comboTitle;
    hud.setAttribute("aria-label", `Серия ${g.streak}. ${stock} хода в запасе`);
    el("combo-stock").textContent = g.streak
      ? stock
        ? `${"●".repeat(stock)}${"○".repeat(2 - stock)}`
        : "○○"
      : "";
    if (changedCombo && g.streak)
      animate(
        hud,
        [
          { transform: "scale(.85)" },
          { transform: "scale(1.06)", offset: 0.45 },
          { transform: "scale(1)" },
        ],
        340,
      );

    el("score").classList.toggle("compact", g.score >= 100000);
    el("caption").textContent = inLesson()
      ? ""
      : g.status === "over"
        ? "Для этих фигур нет места"
        : selected !== null && !drag
          ? "Нажмите на левый верхний угол фигуры на поле"
          : g.moves === 0
            ? "Перенесите фигуру на поле"
            : "";
    ads.setActive(
      running && !inLesson() && store.state.game.status === "playing",
    );
    analytics.setActive(
      running && !inLesson() && store.state.game.status === "playing",
      store.state,
    );
    bannerWatch?.update();
    syncSaving();
  }
  function syncSaving() {
    for (const button of document.querySelectorAll<HTMLButtonElement>(
      "#new-game, #again, #restart, #practice, #lesson-skip, #play-again, #dealer-choice, .setting input",
    ))
      button.disabled = store.busy;
    const status = document.getElementById("save-status");
    if (status)
      status.textContent = store.busy ? "Сохраняем…" : "Партия сохранена";
    el("hint").toggleAttribute(
      "disabled",
      store.busy || currentGame().status === "over",
    );
    refreshHintLabel();
  }
  async function writeFailure(error: unknown, message: string) {
    if (error instanceof SaveConflictError) {
      try {
        const latest = await adapter.load();
        if (latest.profile) {
          cancelDrag();
          cancelHint();
          stopCosmetics();
          store.state = latest.profile;
          recordCelebrated =
            latest.profile.game.score > 0 &&
            latest.profile.game.score >= bestFor(latest.profile);
          resultPending = false;
          clearTimeout(resultTimer);
          render();
          toast(
            "Партия обновлена в другом окне. Загружено сохранённое состояние.",
          );
          return;
        }
      } catch {}
      toast("Сохранение изменилось. Закройте и снова откройте игру.");
      return;
    }
    toast(message);
  }
  function refreshHintLabel() {
    const p = store.state;
    const count = (p.freeDay === dayKey() ? p.freeHints : 3) + p.earnedHints;
    const cached = !inLesson() && hintMove() !== null;
    el("hint-count").textContent = String(count);
    el("hint").classList.toggle("depleted", count === 0 && !cached);
    if (worker || hintSaving) el("hint").setAttribute("aria-busy", "true");
    else el("hint").removeAttribute("aria-busy");
    el("hint-label").textContent = hintSaving
      ? "Сохраняем…"
      : worker
        ? "Ищем ход…"
        : cached
          ? "Показать ход"
          : count === 0
            ? "Ещё подсказки"
            : "Подсказка";
  }
  function cancelHint(reason = "cancelled") {
    clearTimeout(hintTimeout);
    hintTimeout = 0;
    if (worker)
      analytics.track("hint_fail", { gameId: store.state.game.gameId, reason });
    hintGeneration++;
    worker?.terminate();
    worker = null;
    el("hint").removeAttribute("aria-busy");
    refreshHintLabel();
  }
  function clearDragFrame() {
    cancelAnimationFrame(dragFrame);
    dragFrame = 0;
    dragSample = null;
  }
  function cancelDrag() {
    clearDragFrame();
    drag = null;
    currentMove = null;
    selected = null;
    floating.getAnimations().forEach((a) => a.cancel());
    floating.hidden = true;
    el("tray").classList.remove("dragging");
    document.querySelectorAll(".piece.selected").forEach((e) => {
      e.classList.remove("selected");
      e.setAttribute("aria-pressed", "false");
    });
    scene.preview(hintMove(), true, true);
  }
  async function commit(move: Move, revision: number) {
    if (!running || store.busy || movePending) return;
    cancelHint();
    const before = currentGame();
    const practicing = inLesson();
    const praise =
      !practicing && before.moves - lastPraiseMove >= 3
        ? praiseFor(praiseResult, before, move)
        : null;
    stopPraise();
    const expected = LESSON_MOVES[lessonStep()];
    if (
      practicing &&
      (!expected ||
        Object.keys(expected).some(
          (k) => expected[k as keyof Move] !== move[k as keyof Move],
        ))
    ) {
      render();
      toast("Поставьте фигуру в светлый контур");
      return;
    }
    const previousTheme = presentationTheme();
    const previousWardrobe = store.state.wardrobe;
    const previousBest = bestFor(store.state);
    const piece = before.tray[move.slot];
    const placedCells = piece
      ? shapeById(piece.shapeId).cells.map(
          ([x, y]) => (move.y + y) * 8 + move.x + x,
        )
      : [];
    const effectBoard = [...before.board];
    if (piece) for (const i of placedCells) effectBoard[i] = piece.color;
    const outcome: { result: ReturnType<typeof applyMove> } = { result: null };
    if (
      piece &&
      !piece.used &&
      revision === before.revision &&
      fits(before.board, shapeById(piece.shapeId), move.x, move.y)
    ) {
      scene.pendingPlacement(placedCells);
      canvasBox.setAttribute("aria-busy", "true");
    }
    const saveStarted = performance.now();
    movePending = true;
    try {
      const calculated = await moveCalculator.calculate(before, move, revision);
      performanceCapture.record(
        "moveCalculationWallTime",
        performance.now() - saveStarted,
      );
      const storageStarted = performance.now();
      const changed = await store.update((p) => {
        if (
          !practicing &&
          (p.game.gameId !== before.gameId ||
            p.game.revision !== before.revision)
        )
          return null;
        const result = calculated;
        outcome.result = result;
        if (result && practicing)
          return {
            ...p,
            revision: p.revision + 1,
            tutorialStep: lessonStep() + 1,
          };
        return result
          ? {
              ...ads.stamp(p),
              revision: p.revision + 1,
              game: result.state,
              wardrobe: result.allClear ? discoverTheme(p) : p.wardrobe,
              ...recordScore(p, result.state),
              hint: null,
            }
          : null;
      });
      performanceCapture.record(
        "atomicSaveWallTime",
        performance.now() - storageStarted,
      );
      performanceCapture.record(
        "commitIncludingSaveWallTime",
        performance.now() - saveStarted,
      );
      if (!changed) {
        selected = move.slot;
        currentMove = move;
        render();
        scene.preview(move, false);
        audio.play("cancel");
        toast("Здесь не помещается. Выберите другое место");
        return;
      }
      selected = null;
      currentMove = null;
      rejectedDrags = 0;
      const event = outcome.result!;
      if (!practicing) playCapture.record(before, move, event.state);
      const signature = clearSignature(event.cells);
      const revealVariant = (store.state.wardrobe?.discoveries ?? 1) % 3;
      const newRecord =
        !practicing &&
        !recordCelebrated &&
        previousBest > 0 &&
        event.state.score > previousBest;
      performanceCapture.markPlacement(
        event.lines,
        event.state.streak,
        event.allClear,
        scene.calm,
        performanceCapture.enabled && event.allClear
          ? {
              before,
              move,
              expectedScore: event.state.score,
              rows: signature.rows,
              columns: signature.cols,
              beforeTheme: previousTheme,
              afterTheme: store.state.wardrobe?.selected ?? 0,
              beforeWardrobe: previousWardrobe,
              afterWardrobe: store.state.wardrobe,
              revealVariant,
              newRecord,
              settings: store.state.settings,
            }
          : undefined,
      );
      if (newRecord) recordCelebrated = true;
      const deferred =
        running && !scene.calm
          ? event.lines
            ? event.points - placedCells.length
            : event.seriesBonus
          : 0;
      atmosphere.origin(canvasBox.getBoundingClientRect(), placedCells);
      pendingPoints += deferred;
      if (event.allClear && running && !scene.calm) {
        heldTheme = previousTheme;
        const generation = ++themeRevealGeneration;
        later(() => {
          if (generation !== themeRevealGeneration) return;
          heldTheme = null;
          render(running);
        }, 320);
      }
      performanceCapture.measure("placementRender", () => render(running));
      if (running) {
        if (event.finishedStreak > 0) {
          if (event.seriesBonus) {
            presentReward(
              "series",
              `СЕРИЯ ${event.finishedStreak} ЗАВЕРШЕНА!`,
              event.seriesBonus,
              { x: 50, y: 32 },
              deferred ? event.seriesBonus : 0,
              event.finishedStreak,
            );
            haptics.pulse(
              "series",
              Math.min(8, Math.ceil(event.finishedStreak / 3)),
            );
            if (!scene.calm)
              festival.burst(
                canvasBox.getBoundingClientRect(),
                placedCells,
                2,
                false,
                true,
                undefined,
                48,
              );
          } else
            presentHudNotice(
              "series-end",
              `Серия ${event.finishedStreak} завершена`,
            );
          audio.play("seriesEnd", event.finishedStreak, event.seriesBonus);
        }
        atmosphere.impulse(
          event.allClear
            ? 3
            : event.lines
              ? 1 + Math.min(1, event.state.streak / 10)
              : 0.15,
        );
        // Ranking describes the move before commit. A terminal outcome must
        // not congratulate the player; the earned series bonus above still pays.
        if (praise && event.state.status === "playing") {
          lastPraiseMove = before.moves;
          scene.praise(placedCells, praise === "excellent");
          if (!event.lines) {
            presentReward(
              "praise",
              praise === "excellent" ? "Отличный ход!" : "Хороший ход!",
              0,
              { x: 50, y: 35 },
            );
            audio.play("praise", event.state.streak);
            haptics.pulse("clear", praise === "excellent" ? 2 : 1);
          }
        }
        if (event.lines) {
          const glow = el("clear-glow");
          glow.getAnimations().forEach((a) => a.cancel());
          // Rasterize the glow once; animate composited opacity/scale instead
          // of repainting an expanding blur around the live WebGL canvas.
          glow.style.boxShadow = `0 0 ${24 + Math.min(35, event.state.streak * 3)}px 9px ${THEMES[store.state.wardrobe?.selected ?? 0]!.accent}`;
          animate(
            glow,
            [
              { opacity: 0, transform: "scale(.98)" },
              { opacity: 1, transform: "scale(1)", offset: 0.18 },
              { opacity: 0, transform: "scale(1.04)" },
            ],
            event.allClear ? 1900 : 1200,
          );
        }
        if (before.tray.filter((s) => s.used).length === 2)
          document.querySelectorAll(".piece .mini-shape").forEach((e, i) =>
            animate(
              e,
              [
                {
                  opacity: 0,
                  transform: "translateY(24px) rotate(-8deg) scale(.4)",
                },
                {
                  opacity: 1,
                  transform: "translateY(-6px) rotate(3deg) scale(1.12)",
                  offset: 0.65,
                },
                { opacity: 1, transform: "none" },
              ],
              360,
              i * 55,
            ),
          );
        scene.impact(
          placedCells,
          event.cells,
          effectBoard,
          event.lines,
          event.allClear,
        );
        haptics.pulse(
          event.lines
            ? signature.kind === "single"
              ? "clear"
              : signature.kind
            : "place",
          clearHapticLevel(event.lines, event.state.streak),
        );
        if (event.lines && !scene.calm) {
          festival.burst(
            canvasBox.getBoundingClientRect(),
            event.cells,
            event.lines,
            false,
            false,
            effectBoard,
          );
          animate(
            canvasBox.querySelector("canvas")!,
            [
              { transform: "translate(0,0)" },
              {
                transform: `translate(${Math.min(5, event.lines * 2)}px,3px)`,
                offset: 0.2,
              },
              { transform: "translate(-3px,-2px)", offset: 0.45 },
              { transform: "translate(1px,0)", offset: 0.7 },
              { transform: "none" },
            ],
            220,
          );
        }
        audio.play(
          event.allClear
            ? "allClear"
            : newRecord && event.lines < 2
              ? "record"
              : signature.kind === "cross"
                ? "cross"
                : signature.kind === "quad"
                  ? "quad"
                  : event.lines >= 3
                    ? "mega"
                    : event.lines > 1
                      ? "combo"
                      : event.lines
                        ? "clear"
                        : "place",
          event.state.streak,
          event.points,
          scene.intensity,
        );
        const rows = Array.from({ length: 8 }, (_, y) => y).filter((y) =>
          Array.from({ length: 8 }, (_, x) => y * 8 + x).every((i) =>
            event.cells.includes(i),
          ),
        );
        const cols = Array.from({ length: 8 }, (_, x) => x).filter((x) =>
          Array.from({ length: 8 }, (_, y) => y * 8 + x).every((i) =>
            event.cells.includes(i),
          ),
        );
        const anchor = event.lines
          ? {
              x: cols.length ? ((cols[0]! + 0.5) / 8) * 100 : 50,
              y: rows.length ? ((rows[0]! + 0.5) / 8) * 100 : 50,
            }
          : {
              x:
                (placedCells.reduce((sum, i) => sum + (i % 8) + 0.5, 0) /
                  placedCells.length /
                  8) *
                100,
              y:
                (placedCells.reduce(
                  (sum, i) => sum + Math.floor(i / 8) + 0.5,
                  0,
                ) /
                  placedCells.length /
                  8) *
                100,
            };
        const lineName =
          signature.kind === "cross"
            ? `ПЕРЕКРЕСТИЕ · ${event.lines}!`
            : event.lines >= 4
              ? `${event.lines} ЛИНИИ!`
              : event.lines === 3
                ? "ТРОЙНАЯ!"
                : event.lines === 2
                  ? "ДВОЙНАЯ!"
                  : "ЛИНИЯ!";
        if (!event.lines)
          presentReward("place", "", event.points - event.seriesBonus, anchor);
        else {
          const linePoints = event.breakdown.lines + event.breakdown.combo;
          presentReward(
            event.lines >= 2 ? "combo" : "line",
            `${lineName}${event.state.streak > 1 ? (event.state.scoringVersion ? ` ×${comboMultiplier(event.state.streak, event.state.scoringVersion === "festival-v4").toLocaleString("ru")}` : ` · Серия ${event.state.streak}`) : ""}`,
            linePoints,
            anchor,
            deferred ? linePoints : 0,
            event.state.streak,
            event.state.gameId,
          );
          if (event.allClear) {
            later(
              () => {
                presentReward(
                  "all-clear",
                  "Чистое поле!",
                  event.breakdown.empty,
                  { x: 50, y: 52 },
                  deferred ? event.breakdown.empty : 0,
                  event.state.streak,
                  event.state.gameId,
                );
                haptics.pulse(
                  ["empty", "bloom", "rain"][
                    (store.state.wardrobe?.discoveries ?? 1) % 3
                  ]!,
                );
                audio.play("theme", revealVariant);
                if (!scene.calm)
                  festival.burst(
                    canvasBox.getBoundingClientRect(),
                    [],
                    event.lines,
                    true,
                    false,
                    undefined,
                    110,
                    revealVariant,
                  );
              },
              scene.calm ? 0 : 650,
            );
          }
        }
        if (newRecord)
          later(
            () => {
              presentHudNotice("record", "Новый рекорд!");
              haptics.pulse("record");
              if (!scene.calm)
                festival.burst(
                  canvasBox.getBoundingClientRect(),
                  event.cells,
                  1,
                  false,
                  true,
                );
            },
            event.allClear ? 1400 : 600,
          );
        if (newRecord || event.allClear)
          rewardHoldUntil = Math.max(
            rewardHoldUntil,
            performance.now() +
              (scene.calm
                ? 1200
                : newRecord && event.allClear
                  ? 3500
                  : event.allClear
                    ? 2750
                    : 2700),
          );
      }
      el("announce").textContent =
        `Счёт ${event.state.score}. ${event.lines ? "Очищено линий: " + event.lines : ""}`;
      if (event.state.status === "over" && !dialog.open) {
        resultPending = true;
        clearTimeout(resultTimer);
        if (running)
          resultTimer = window.setTimeout(
            () => {
              if (running && resultPending && !dialog.open) beginDefeat();
            },
            Math.max(
              scene.calm ? 220 : event.lines ? 1650 : 700,
              rewardHoldUntil - performance.now(),
            ),
          );
      }
    } catch (error) {
      await writeFailure(
        error,
        "Не удалось сохранить ход. Попробуйте ещё раз.",
      );
      render();
    } finally {
      movePending = false;
      scene.pendingPlacement([]);
      canvasBox.removeAttribute("aria-busy");
    }
  }
  function presentHudNotice(
    tier: "record" | "theme" | "series-end",
    text: string,
  ) {
    if (phoneLayers && diagnosticLayer?.skipRewardDom) return;
    if (phoneLayers) diagnosticRewardDom++;
    const host =
      tier === "record"
        ? document.querySelector(".best")!
        : document.querySelector(".board-wrap")!;
    // One notice per destination; no queue grows during a long series.
    host.querySelector(".hud-notice")?.remove();
    const node = document.createElement("span");
    node.className = "hud-notice";
    node.dataset.tier = tier;
    node.textContent = text;
    node.setAttribute("role", "status");
    host.append(node);
    const duration = tier === "series-end" ? 1400 : 2200;
    animate(
      node,
      [
        { opacity: 0, transform: "translateY(5px) scale(.9)" },
        { opacity: 1, transform: "none", offset: 0.12 },
        { opacity: 1, transform: "none", offset: 0.8 },
        { opacity: 0, transform: "translateY(-5px)" },
      ],
      duration,
    )?.effect?.updateTiming({ easing: "linear" });
    later(() => node.remove(), duration);
  }
  function settleRewardPoints(deferred: number, gameId: string) {
    if (gameId !== currentGame().gameId) return;
    pendingPoints = Math.max(0, pendingPoints - deferred);
    if (deferred)
      updateScore(currentGame().score - pendingPoints, gameId, running);
  }
  function presentReward(
    tier: string,
    praise: string,
    points: number,
    anchor: { x: number; y: number } | null = null,
    deferred = 0,
    streak = 0,
    gameId = currentGame().gameId,
  ) {
    const important =
      tier === "record" || tier === "all-clear" || tier === "series";
    if (phoneLayers && diagnosticLayer?.skipRewardDom) {
      // Keep score arrival and the HUD count-up, while omitting the floating
      // reward DOM and its source/destination flashes. Mechanics already saved.
      if (deferred)
        later(
          () => settleRewardPoints(deferred, gameId),
          important ? 700 : 580,
        );
      return;
    }
    if (phoneLayers) diagnosticRewardDom++;
    if (tier !== "place")
      for (const old of rewards.keys()) old.classList.add("yield-to-drag");
    const node = document.createElement("span");
    node.className = "reward-event";
    node.dataset.tier = tier;
    const development = labelDevelopment(streak);
    node.dataset.step = String(development.step);
    node.style.left = `${Math.max(27, Math.min(73, anchor?.x ?? 50))}%`;
    node.style.top = `${Math.max(15, Math.min(82, anchor?.y ?? 48))}%`;
    const label = document.createElement("span");
    label.className = "reward-praise";
    label.textContent = praise;
    if (important) {
      label.textContent = "";
      Array.from(praise).forEach((letter, i) => {
        const span = document.createElement("i");
        span.textContent = letter;
        span.style.setProperty("--letter", String(i));
        label.append(span);
      });
    }
    const amount = document.createElement("span");
    amount.className = "reward-points";
    amount.textContent = points ? `+${deferred || points}` : "";
    if (tier === "all-clear" || (tier === "series" && streak >= 10)) {
      const source = rewardEmblems.get(
        tier === "all-clear" ? "all-clear" : "series",
      );
      if (source) {
        const img = source.cloneNode() as HTMLImageElement;
        img.className = "reward-emblem";
        img.alt = "";
        node.append(img);
      }
    }
    node.append(amount, label);
    // Important all-clear owns the foreground, after the line has had time to read.
    if (tier === "all-clear")
      for (const old of rewards.keys()) {
        if (old.dataset.tier === "all-clear") continue;
        // The line already delivered its points. Hand the foreground over,
        // rather than keeping two large competing headlines for two seconds.
        if (scene.calm) rewards.get(old)?.();
        else {
          animate(old, [{ opacity: 1 }, { opacity: 0 }], 160);
          later(() => rewards.get(old)?.(), 160);
        }
      }
    el("burst").append(node);
    const boardBox = rewardAnchor.getBoundingClientRect();
    label.style.fontSize = `${Math.min(important ? 42 : 38, boardBox.width * (important ? 0.13 : 0.09 * development.size))}px`;
    const naturalWidth = label.getBoundingClientRect().width;
    const maxLabelWidth = Math.max(1, (boardBox.width - 32) / 1.2);
    if (naturalWidth > maxLabelWidth)
      label.style.fontSize = `${(parseFloat(label.style.fontSize) * maxLabelWidth) / naturalWidth}px`;
    const bounds = node.getBoundingClientRect();
    const insetX = Math.min(
      50,
      ((bounds.width * 0.68 + 12) / boardBox.width) * 100,
    );
    const insetY = ((bounds.height * 0.75 + 24) / boardBox.height) * 100;
    node.style.left = `${Math.max(insetX, Math.min(100 - insetX, anchor?.x ?? 50))}%`;
    const candidates = [
      anchor?.y ?? 48,
      (anchor?.y ?? 48) + 24,
      (anchor?.y ?? 48) - 24,
    ].map((y) => Math.max(insetY, Math.min(100 - insetY, y)));
    const top =
      candidates.find((y) =>
        [...rewards.keys()].every(
          (other) => Math.abs(parseFloat(other.style.top) - y) > 20,
        ),
      ) ?? candidates[0]!;
    node.style.top = `${top}%`;
    el("burst").dataset.tier = tier;
    const duration = scene.calm
      ? important
        ? 1100
        : 300
      : tier === "place"
        ? 420
        : important
          ? 2100
          : tier === "chain"
            ? 1200
            : 1650 + development.hold;
    if (tier === "combo")
      node.dataset.signature = praise.startsWith("ПЕРЕКРЕСТИЕ")
        ? "cross"
        : "lanes";
    const finishLabel = rewardLabels.prepare(label, important && !scene.calm);
    const finishAmount = rewardLabels.prepare(amount, false);
    if (important)
      rewardHoldUntil = Math.max(rewardHoldUntil, performance.now() + duration);
    const timerIds: number[] = [];
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      settleRewardPoints(deferred, gameId);
    };
    const finish = () => {
      timerIds.forEach(clearTimeout);
      settle();
      finishLabel();
      finishAmount();
      node.getAnimations({ subtree: true }).forEach((a) => a.cancel());
      node.remove();
      rewards.delete(node);
    };
    rewards.set(node, finish);
    if (rewards.size > 3) {
      const disposable =
        [...rewards.keys()].find((n) => n.dataset.tier === "place") ??
        [...rewards.keys()].find((n) => n.dataset.tier !== "all-clear") ??
        rewards.keys().next().value;
      if (disposable) rewards.get(disposable)?.();
    }
    const labelAnimation = animate(
      label,
      [
        { opacity: 0, transform: "translateY(22px) rotate(-7deg) scale(.3)" },
        {
          opacity: 1,
          transform: `translateY(-5px) rotate(3deg) scale(${important ? 1.2 : Math.min(1.16, 1.05 + development.step * 0.015)})`,
          offset: 0.1,
        },
        { opacity: 1, transform: "none", offset: 0.7 },
        { opacity: 0, transform: "translateY(-14px) scale(.96)" },
      ],
      duration,
    );
    labelAnimation?.effect?.updateTiming({ easing: "linear" });
    animate(
      amount,
      [
        { opacity: 0, transform: "scale(.7)" },
        { opacity: 1, transform: "scale(1.12)", offset: 0.6 },
        { opacity: 1, transform: "scale(1)" },
      ],
      220,
    );
    if (deferred)
      timerIds.push(
        window.setTimeout(
          () => {
            const a = amount.getBoundingClientRect(),
              target = el("score").getBoundingClientRect();
            const dx = target.left + target.width / 2 - a.left - a.width / 2;
            const dy = target.top + target.height / 2 - a.top - a.height / 2;
            animate(
              amount,
              [
                { opacity: 1, transform: "translate(0,0) scale(1)" },
                {
                  opacity: 1,
                  transform: `translate(${dx * 0.3}px,${dy * 0.55 - 20}px) scale(.9)`,
                  offset: 0.55,
                },
                {
                  opacity: 0,
                  transform: `translate(${dx}px,${dy}px) scale(.35)`,
                },
              ],
              300,
            )?.effect?.updateTiming({ easing: "ease-in" });
            timerIds.push(
              window.setTimeout(() => {
                settle();
                amount.style.opacity = "0";
                if (running && gameId === currentGame().gameId) {
                  audio.play(
                    "score",
                    Math.max(streak, currentGame().streak),
                    points,
                    scene.intensity,
                  );
                  animate(
                    el("score"),
                    [
                      { textShadow: "0 0 18px #8edaff" },
                      { textShadow: "0 2px 2px #00000026" },
                    ],
                    600,
                  );
                  animate(
                    el("score"),
                    [
                      { transform: "scale(1)" },
                      { transform: "scale(1.12)", offset: 0.3 },
                      { transform: "scale(1)" },
                    ],
                    260,
                  );
                }
              }, 300),
            );
          },
          important ? 400 : 280,
        ),
      );
    timerIds.push(window.setTimeout(finish, duration));
  }
  function locate(event: PointerEvent, slot: number, touch: boolean): Move {
    const rect = drag?.rect ?? canvasBox.getBoundingClientRect(),
      cell = rect.width / 8,
      shape = shapeById(currentGame().tray[slot]!.shapeId);
    const left = event.clientX - (shape.width * cell) / 2,
      top =
        event.clientY - (touch ? shape.height + 1.2 : shape.height / 2) * cell;
    floating.style.translate = `${left}px ${top}px`;
    return {
      slot,
      x: Math.round((left - rect.left) / cell),
      y: Math.round((top - rect.top) / cell),
    };
  }
  // A multi-touch sequence is cancelled until every finger is lifted.
  // Capture phase runs before either tray or board can start a new action.
  const touches = new Set<number>();
  let multiTouch = false;
  window.addEventListener(
    "pointerdown",
    (event) => {
      if (event.pointerType !== "touch") return;
      touches.add(event.pointerId);
      if (touches.size > 1) {
        multiTouch = true;
        cancelDrag();
      }
    },
    true,
  );
  const endTouch = (event: PointerEvent) => {
    touches.delete(event.pointerId);
    if (!touches.size) multiTouch = false;
  };
  window.addEventListener("pointerup", endTouch, true);
  window.addEventListener("pointercancel", endTouch, true);
  window.addEventListener("blur", () => {
    touches.clear();
    multiTouch = false;
  });
  el("tray").addEventListener("pointerdown", (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>(
      "[data-slot]",
    );
    if (
      multiTouch ||
      !button ||
      button.disabled ||
      !running ||
      drag ||
      store.busy ||
      movePending ||
      event.button !== 0
    )
      return;
    event.preventDefault();
    el("tray").setPointerCapture(event.pointerId);
    cancelHint();
    selected = Number(button.dataset.slot);
    for (const element of el("tray").querySelectorAll<HTMLElement>(
      "[data-slot]",
    )) {
      element.classList.toggle(
        "selected",
        Number(element.dataset.slot) === selected,
      );
      element.setAttribute(
        "aria-pressed",
        String(Number(element.dataset.slot) === selected),
      );
    }
    if (button.classList.contains("unavailable"))
      toast("Сейчас не помещается. Освободите место другой фигурой.", 5000);
    const rect = canvasBox.getBoundingClientRect();
    floating.getAnimations().forEach((a) => a.cancel());
    floating.style.left = "0px";
    floating.style.top = "0px";
    floating.innerHTML = mini(selected, rect.width / 8);
    tileMaterials.sync(floating);
    floating.hidden = false;
    el("tray").classList.add("dragging");
    drag = {
      id: event.pointerId,
      slot: selected,
      startX: event.clientX,
      startY: event.clientY,
      revision: currentGame().revision,
      touch: event.pointerType === "touch",
      moved: false,
      rect,
    };
    suspendPraise();
    for (const node of rewards.keys()) node.classList.add("yield-to-drag");
    currentMove = locate(event, selected, drag.touch);
    animate(
      floating,
      [
        { opacity: 0.5, transform: "scale(.7)" },
        { opacity: 1, transform: "scale(1)" },
      ],
      90,
    );
    void audio
      .unlock()
      .then(() => {
        if (running) audio.play("pick");
      })
      .catch(() => {});
  });
  window.addEventListener(
    "pointermove",
    (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      event.preventDefault();
      drag.moved ||=
        Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >
        7;
      dragSample = event;
      if (!dragFrame)
        dragFrame = requestAnimationFrame(() => {
          dragFrame = 0;
          const sample = dragSample;
          dragSample = null;
          if (!drag || !sample) return;
          const next = locate(sample, drag.slot, drag.touch);
          if (
            !currentMove ||
            next.x !== currentMove.x ||
            next.y !== currentMove.y ||
            next.slot !== currentMove.slot
          ) {
            currentMove = next;
            scene.preview(next);
          }
        });
    },
    { passive: false },
  );
  window.addEventListener("pointerup", (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    el("tray").classList.remove("dragging");
    clearDragFrame();
    const previous = drag;
    previous.moved ||=
      Math.hypot(
        event.clientX - previous.startX,
        event.clientY - previous.startY,
      ) > 7;
    const move = locate(event, previous.slot, previous.touch);
    drag = null;
    floating.hidden = true;
    if (previous.moved) {
      selected = null;
      currentMove = null;
      const slot = currentGame().tray[move.slot];
      if (
        slot &&
        fits(currentGame().board, shapeById(slot.shapeId), move.x, move.y)
      )
        void commit(move, previous.revision);
      else {
        const target = el("tray")
          .querySelector(`[data-slot="${previous.slot}"]`)!
          .getBoundingClientRect();
        floating.hidden = false;
        const from = floating.getBoundingClientRect();
        const a = animate(
          floating,
          [
            { transform: "none", opacity: 1 },
            {
              transform: `translate(${target.x + target.width / 2 - from.x - from.width / 2}px,${target.y + target.height / 2 - from.y - from.height / 2}px) scale(.5)`,
              opacity: 0,
            },
          ],
          150,
        );
        if (a) {
          const hide = () => {
            cosmetic.delete(a);
            floating.hidden = true;
          };
          a.onfinish = hide;
          a.oncancel = hide;
        } else floating.hidden = true;
        audio.play("cancel");
        render();
        rejectedDrags++;
        if (rejectedDrags >= 3 && !tapHelpShown) {
          tapHelpShown = true;
          toast(
            "Можно без переноса: выберите фигуру и её левый верхний угол на поле.",
            7000,
          );
        }
      }
    } else {
      render();
      scene.preview(hintMove(), true, true);
    }
  });
  window.addEventListener("pointercancel", () => cancelDrag());
  canvasBox.addEventListener("pointerdown", (event) => {
    if (
      multiTouch ||
      selected === null ||
      drag ||
      !running ||
      event.button !== 0
    )
      return;
    const rect = canvasBox.getBoundingClientRect(),
      cell = rect.width / 8,
      move = {
        slot: selected,
        x: Math.floor((event.clientX - rect.left) / cell),
        y: Math.floor((event.clientY - rect.top) / cell),
      };
    void commit(move, currentGame().revision);
  });
  el("tray").addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const b = (event.target as Element).closest<HTMLButtonElement>(
      "[data-slot]",
    );
    if (b && !b.disabled && selected !== Number(b.dataset.slot)) {
      event.preventDefault();
      event.stopPropagation();
      selected = Number(b.dataset.slot);
      currentMove = { slot: selected, x: 0, y: 0 };
      render();
      scene.preview(currentMove);
      if (b.classList.contains("unavailable"))
        toast("Сейчас не помещается. Освободите место другой фигурой.", 5000);
      void audio.unlock();
    }
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !dialog.open) {
      event.preventDefault();
      back();
      return;
    }
    if (!running || selected === null || !currentMove) return;
    const directions: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const d = directions[event.key];
    if (d) {
      event.preventDefault();
      currentMove = {
        ...currentMove,
        x: Math.max(0, Math.min(7, currentMove.x + d[0])),
        y: Math.max(0, Math.min(7, currentMove.y + d[1])),
      };
      scene.preview(currentMove);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const m = currentMove;
      void commit(m, currentGame().revision);
    }
  });
  el("hint").addEventListener("click", () => {
    if (!running || store.busy || worker || inLesson()) return;
    cancelDrag();
    analytics.track("hint_request", { gameId: store.state.game.gameId });
    const cached = hintMove();
    if (cached) {
      scene.preview(cached, true, true);
      analytics.track("hint_shown", {
        gameId: store.state.game.gameId,
        cached: true,
      });
      toast("Этот вариант уже открыт");
      return;
    }
    const p = store.state;
    if ((p.freeDay === dayKey() ? p.freeHints : 3) + p.earnedHints <= 0) {
      analytics.track("hint_fail", {
        gameId: p.game.gameId,
        reason: "no_credit",
      });
      showRewardHints();
      return;
    }
    const generation = ++hintGeneration;
    const snapshot = structuredClone(p.game);
    stopPraise();
    let hintWorker: Worker;
    try {
      hintWorker = new Worker(
        new URL("./game/hint.worker.ts", import.meta.url),
        {
          type: "module",
        },
      );
    } catch {
      toast("Не получилось рассчитать подсказку. Кредит сохранён.");
      return;
    }
    worker = hintWorker;
    el("hint").setAttribute("aria-busy", "true");
    el("hint-label").textContent = "Ищем ход…";
    const failHint = () => {
      if (worker !== hintWorker || generation !== hintGeneration) return;
      cancelHint("worker");
      toast("Не получилось рассчитать подсказку. Кредит сохранён.");
    };
    hintWorker.onerror = failHint;
    hintWorker.onmessageerror = failHint;
    hintTimeout = window.setTimeout(failHint, 5000);
    hintWorker.onmessage = async (event: MessageEvent<HintResult>) => {
      if (worker !== hintWorker || generation !== hintGeneration) return;
      clearTimeout(hintTimeout);
      hintTimeout = 0;
      hintWorker.terminate();
      worker = null;
      if (!running) {
        refreshHintLabel();
        return;
      }
      const r = event.data;
      if (!r.move) {
        analytics.track("hint_fail", {
          gameId: snapshot.gameId,
          reason: "no_move",
        });
        refreshHintLabel();
        toast("Для оставшихся фигур нет места");
        return;
      }
      hintSaving = true;
      refreshHintLabel();
      try {
        const changed = await store.update((current) =>
          generation === hintGeneration && running
            ? withHint(current, r.gameId, r.revision, r.move!, dayKey())
            : null,
        );
        if (changed) {
          render();
          if (running) {
            analytics.track("hint_shown", { gameId: r.gameId, cached: false });
            toast(
              r.lines
                ? `Этот ход очистит линий: ${r.lines}`
                : "Попробуйте поставить фигуру по контуру",
            );
            void audio
              .unlock()
              .then(() => {
                if (running) audio.play("hint");
              })
              .catch(() => {});
          }
        }
      } catch (error) {
        analytics.track("hint_fail", { gameId: r.gameId, reason: "save" });
        await writeFailure(
          error,
          "Не удалось сохранить подсказку. Кредит не списан.",
        );
      } finally {
        hintSaving = false;
        syncSaving();
      }
    };
    try {
      hintWorker.postMessage(snapshot);
    } catch {
      failHint();
    }
  });
  function open(content: string, type: string) {
    modal = type;
    dialog.classList.remove("result-celebrate");
    dialog.dataset.kind = type;
    activity.setBlocked("dialog", true);
    dialog.innerHTML = content;
    structureDialog();
    dialog.showModal();
    animate(
      dialog,
      [
        { opacity: 0, transform: "translateY(12px) scale(.97)" },
        { opacity: 1, transform: "none" },
      ],
      180,
    );
    syncSaving();
  }
  function structureDialog() {
    const nodes = [...dialog.children];
    dialog.replaceChildren();
    const body = document.createElement("div"),
      actions = document.createElement("div");
    body.className = "dialog-body";
    actions.className = "dialog-actions";
    nodes.forEach((n) =>
      (n.tagName === "BUTTON" || n.classList.contains("pause-links")
        ? actions
        : body
      ).append(n),
    );
    const status = document.createElement("p");
    status.className = "dialog-status";
    status.setAttribute("role", "alert");
    actions.prepend(status);
    dialog.append(body, actions);
    dialog.scrollTop = 0;
  }
  function close() {
    if (ads.busy) return;
    dialog.close();
    modal = "";
    activity.setBlocked("dialog", false);
    render();
  }
  function back() {
    if (ads.busy) return;
    if (dialog.open) {
      if (modal === "result") return;
      if (modal === "revive") {
        void declineRevive();
        return;
      }
      if (modal === "rules" || modal === "restart") {
        dialog.close();
        showPause();
      } else close();
    } else if (resultPending) showResult();
    else showPause();
  }
  function savedReviveButton() {
    return store.state.ads?.intents.some((i) => i.status === "available")
      ? '<button class="secondary" id="saved-revive">Второй шанс в предыдущей партии</button>'
      : "";
  }
  function wireSavedRevive() {
    dialog
      .querySelector<HTMLButtonElement>("#saved-revive")
      ?.addEventListener("click", () => {
        const intent = store.state.ads?.intents.find(
          (i) => i.status === "available",
        );
        if (!intent) return;
        open(
          '<h2 id="dialog-title">Вернуться к предыдущей партии?</h2><p>Полученный второй шанс сохранён. Он заменит текущую партию. Рекорд и подсказки останутся.</p><button class="primary" id="claim-revive">Вернуться</button><button class="secondary" id="cancel-claim">Продолжить текущую</button>',
          "claim",
        );
        el("cancel-claim").onclick = close;
        el("claim-revive").onclick = async () => {
          try {
            if (await store.update((p) => claimRevive(p, intent.id))) {
              resultPending = false;
              clearTimeout(resultTimer);
              close();
              render();
            }
          } catch (e) {
            await writeFailure(
              e,
              "Не удалось восстановить партию. Второй шанс сохранён.",
            );
          }
        };
      });
  }
  async function offerAvailability() {
    const button = dialog.querySelector<HTMLButtonElement>("#watch-reward");
    const status = dialog.querySelector<HTMLElement>("#reward-status");
    if (!button || !status) return;
    // The initial choice is available even while the SDK is still loading.
    if (modal === "revive" && !store.state.game.reviveOffer?.accepted) return;
    const ready = await ads.ready();
    if (!button.isConnected) return;
    button.disabled = !ready;
    if (status.textContent?.startsWith("Проверяем"))
      status.textContent = ready
        ? ""
        : "Реклама сейчас недоступна. Можно продолжить без неё.";
    ads.preload();
  }
  function rewardButton(kind: "hints" | "revive") {
    el("watch-reward").onclick = () => void performReward(kind);
    void offerAvailability();
  }
  async function performReward(kind: "hints" | "revive") {
    if (ads.busy) return;
    const result = await ads.rewarded(kind);
    if (result === "rewarded") {
      resultPending = false;
      clearTimeout(resultTimer);
      close();
      render();
      if (kind === "revive" && !scene.calm) {
        animate(
          canvasBox,
          [
            { opacity: 0.5, transform: "scale(.98)" },
            { opacity: 1, transform: "scale(1)" },
          ],
          320,
        );
        audio.play("praise", currentGame().streak);
        haptics.pulse("record");
      }
      toast(kind === "hints" ? "Добавлены 3 подсказки" : "Второй шанс получен");
    } else {
      const status = dialog.querySelector<HTMLElement>("#reward-status");
      if (status)
        status.textContent =
          result === "closed"
            ? "Просмотр не подтверждён. Награда не начислена."
            : "Реклама недоступна или показ прерван. Игра сохранена.";
      void offerAvailability();
    }
  }
  function showRewardHints() {
    open(
      '<h2 id="dialog-title">Нужны подсказки?</h2><p>На сегодня бесплатные подсказки закончились. Завтра будут ещё три.</p><p>За просмотр рекламы получите 3 подсказки. Используйте их в любой партии.</p><p id="reward-status" role="status">Проверяем доступность…</p><button class="primary" id="watch-reward" disabled>Посмотреть рекламу — получить 3 подсказки</button><button class="secondary" id="reward-back">Продолжить без рекламы</button>',
      "reward",
    );
    el("reward-back").onclick = close;
    rewardButton("hints");
  }
  async function declineRevive() {
    if (ads.busy || store.busy) return;
    try {
      if (
        !(await store.update((p) => ({
          ...p,
          revision: p.revision + 1,
          game: {
            ...p.game,
            reviveOffer: {
              deadline: p.game.reviveOffer?.deadline ?? Date.now(),
              accepted: false,
              expired: true,
            },
          },
        })))
      )
        return;
      clearInterval(reviveTimer);
      stopReviveClock();
      dialog.close();
      void finishResult();
    } catch (error) {
      await writeFailure(
        error,
        "Не удалось сохранить отказ. Попробуйте ещё раз.",
      );
    }
  }
  function positionRevive() {
    if (modal !== "revive" || !dialog.open) return;
    const r = canvasBox.getBoundingClientRect();
    dialog.style.setProperty("--revive-x", `${r.left + r.width / 2}px`);
    dialog.style.setProperty("--revive-y", `${r.top + r.height * 0.26}px`);
    dialog.style.setProperty(
      "--revive-size",
      `${Math.min(170, r.width * 0.43)}px`,
    );
    dialog.style.setProperty(
      "--revive-button-y",
      `${r.top + r.height * 0.82}px`,
    );
  }
  window.addEventListener("resize", () =>
    requestAnimationFrame(positionRevive),
  );
  function showRevive() {
    const plan = revivePlan(store.state.game);
    if (!plan) return;
    clearTimeout(resultTimer);
    resultPending = false;
    const accepted = !!store.state.game.reviveOffer?.accepted;
    open(
      `<h2 id="dialog-title" class="sr-only">Второй шанс</h2>
      <div id="revive-clock" class="revive-clock" ${accepted ? "hidden" : ""} role="timer" aria-label="Время на решение"><svg class="clock-ring" viewBox="0 0 120 120" aria-hidden="true"><circle class="clock-track" cx="60" cy="60" r="53"/><circle class="clock-progress" cx="60" cy="60" r="53" pathLength="100"/></svg><strong id="revive-countdown">5</strong></div>
      <p id="reward-status" role="status">${accepted ? "Можно повторить показ рекламы" : ""}</p>
      <button class="primary" id="watch-reward" aria-label="Посмотреть рекламу и продолжить"><svg viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M3 8h26v21H3zM4 2l24-2 1 5L5 7z"/><path fill="#239b19" d="m13 13 10 6-10 6z"/></svg>Продолжить</button>`,
      "revive",
    );
    positionRevive();
    stopReviveClock();
    if (!accepted)
      stopReviveClock = presentReviveClock(
        el("revive-clock"),
        store.state.game.reviveOffer!.deadline,
      );
    el("watch-reward").onclick = () => void acceptRevive();
    ads.preload();
  }
  let rememberedMusicVolume = Math.round(
    (store.state.settings.musicVolume || 0.12) * 100,
  );
  function showPause() {
    if (dialog.open) return;
    if (resultPending) {
      showResult();
      return;
    }
    open(
      `<h2 id="dialog-title">Пауза</h2><p id="save-status" role="status">Партия сохранена</p><label class="setting">Звуковые эффекты<input id="sound" type="checkbox" ${store.state.settings.sound ? "checked" : ""}></label><label class="setting audio-level">Музыка<input id="musicVolume" type="range" min="0" max="100" step="5" aria-label="Громкость музыки" value="${Math.round((store.state.settings.musicVolume ?? (store.state.settings.sound ? 0.35 : 0)) * 100)}"></label><label class="setting audio-level">Громкость эффектов<input id="effectsVolume" type="range" min="0" max="100" step="5" aria-label="Громкость эффектов" value="${Math.round((store.state.settings.effectsVolume ?? 1) * 100)}"></label><label class="setting">Вибрация<input id="haptics" type="checkbox" ${store.state.settings.haptics !== false ? "checked" : ""}></label><label class="setting">Спокойные эффекты<small>Без вибрации и активных анимаций</small><input id="calm" type="checkbox" ${store.state.settings.calm ? "checked" : ""}></label><button class="primary" id="resume">Продолжить</button><div class="pause-tools"><button class="secondary" id="menu-hint">Подсказка</button><button class="secondary" id="themes">Оформление</button><a class="secondary" href="?mode=adventure">Приключение</a></div><div class="pause-links"><button class="secondary" id="rules">Как играть</button><button class="secondary" id="restart">Новая партия</button></div><details class="diagnostics"><summary>Диагностика</summary><p>В замер входят плавность, оформление и расположение фигур при полной очистке.</p><button class="secondary" id="perf-start">${performanceCapture.enabled ? "Начать замер заново" : "Записать плавность игры"}</button><button class="secondary" id="perf-export">Выгрузить замер</button><a class="primary" id="clear-layers" href="?clearTrace=layers">Проверить слои · около 90 секунд</a><a class="secondary" id="clear-trace" href="?clearTrace=1">Проверить очистку · около 15 секунд</a><a class="secondary" id="clear-benchmark" href="diagnostics/clear.html">Автозамер очистки · около 70 секунд</a></details><div>${savedReviveButton()}</div>`,
      "pause",
    );
    const body = dialog.querySelector(".dialog-body")!;
    const quick = document.createElement("div");
    quick.className = "quick-settings";
    for (const key of ["sound", "haptics"]) {
      const label = el(key).closest("label")!;
      label.classList.add("quick-setting");
      quick.append(label);
    }
    const music = document.createElement("label");
    music.className = "setting quick-setting";
    music.innerHTML = `Музыка<input id="music-toggle" type="checkbox" ${(store.state.settings.musicVolume ?? 0) > 0 ? "checked" : ""}>`;
    quick.insertBefore(music, quick.lastChild);
    const quickIcons = {
      sound:
        '<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
      "music-toggle":
        '<path d="M9 17V5l11-2v12M9 8l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="17" cy="16" rx="3" ry="2"/>',
      haptics:
        '<rect x="8" y="3" width="8" height="18" rx="2"/><path d="m4 7-2 3 2 4-2 3m18-10 2 3-2 4 2 3"/>',
    };
    for (const [id, paths] of Object.entries(quickIcons)) {
      const input = quick.querySelector<HTMLInputElement>(`#${id}`)!,
        label = input.closest("label")!;
      label.replaceChildren();
      label.insertAdjacentHTML(
        "beforeend",
        `<svg viewBox="0 0 24 24" aria-hidden="true">${paths}</svg><span>${id === "sound" ? "Звук" : id === "haptics" ? "Вибрация" : "Музыка"}</span>`,
      );
      label.append(input);
    }
    const details = document.createElement("details");
    details.className = "advanced-settings";
    details.innerHTML = "<summary>Ещё настройки</summary>";
    for (const key of ["musicVolume", "effectsVolume", "calm"])
      details.append(el(key).closest("label")!);
    const diagnostics = dialog.querySelector<HTMLElement>(".diagnostics")!;
    diagnostics.hidden =
      !import.meta.env.DEV && !APP_VERSION.endsWith("-preview");
    details.append(diagnostics);
    body.insertBefore(quick, el("save-status").nextSibling);
    body.append(details);
    const captureUI = document.createElement("details");
    captureUI.className = "diagnostics";
    captureUI.innerHTML = `<summary>Запись партии для разбора</summary><p>Только ходы и время активной игры. Ничего не отправляется автоматически. Выгрузите запись до закрытия игры.</p><p id="play-capture-status" role="status"></p><button id="play-capture-toggle" class="secondary"></button><button id="play-capture-export" class="secondary">Выгрузить запись партии</button><button id="play-capture-clear" class="secondary">Удалить запись</button>`;
    details.append(captureUI);
    const updateCapture = () => {
      el("play-capture-status").textContent =
        `${playCapture.enabled ? "Запись идёт" : playCapture.status === "limit" ? "Достигнут лимит записи" : playCapture.hasData ? "Запись остановлена" : "Запись выключена"} · ходов: ${playCapture.count}`;
      el("play-capture-toggle").textContent = playCapture.enabled
        ? "Остановить запись"
        : playCapture.hasData
          ? "Продолжить запись"
          : "Начать запись";
      el<HTMLButtonElement>("play-capture-toggle").disabled =
        playCapture.status === "limit";
      el<HTMLButtonElement>("play-capture-export").disabled =
        !playCapture.hasData;
      el<HTMLButtonElement>("play-capture-clear").disabled =
        !playCapture.hasData;
    };
    updateCapture();
    el("play-capture-toggle").onclick = () => {
      if (playCapture.enabled) playCapture.stop();
      else playCapture.start(store.state.game, !!store.state.hint);
      updateCapture();
    };
    el("play-capture-clear").onclick = () => {
      playCapture.clear();
      updateCapture();
    };
    el("play-capture-export").onclick = () => {
      playCapture.stop();
      updateCapture();
      const record = playCapture.snapshot();
      void sharePlayRecord(record)
        .then(() => {
          exportedPlayEvents = record.events.length;
        })
        .catch(() =>
          toast(
            "Не удалось выгрузить запись. Она сохранена до закрытия игры — попробуйте ещё раз.",
          ),
        );
    };

    el("music-toggle").onchange = () => {
      const range = el<HTMLInputElement>("musicVolume");
      if (Number(range.value) > 0) rememberedMusicVolume = Number(range.value);
      range.value = el<HTMLInputElement>("music-toggle").checked
        ? String(rememberedMusicVolume)
        : "0";
      range.dispatchEvent(new Event("change"));
    };
    el("resume").onclick = close;
    el("menu-hint").textContent =
      `${el("hint-label").textContent} · ${el("hint-count").textContent}`;
    el("menu-hint").onclick = () => {
      close();
      el("hint").click();
    };
    el("themes").onclick = showThemes;
    el("perf-start").onclick = () => {
      performanceExported = false;
      performanceCapture.start(readRenderInfo(phaser!));
      close();
      toast(
        "Запись включена. После нескольких ходов выгрузите замер из паузы.",
        5000,
      );
    };
    el("perf-export").onclick = () =>
      void performanceCapture
        .export(analytics.snapshot())
        .then(() => {
          performanceExported = true;
        })
        .catch(() => toast("Не удалось выгрузить замер. Попробуйте ещё раз."));
    const protectDiagnostic = (event: MouseEvent) => {
      const message =
        performanceCapture.enabled ||
        (!performanceExported && performanceCapture.snapshot().sampleCount > 0)
          ? "Сначала выгрузите текущий замер плавности"
          : playCapture.hasData &&
              playCapture.snapshot().events.length !== exportedPlayEvents
            ? "Сначала выгрузите или удалите запись партии"
            : "";
      if (message) {
        event.preventDefault();
        dialog.querySelector<HTMLElement>(".dialog-status")!.textContent =
          message;
      }
    };
    el("clear-benchmark").onclick = protectDiagnostic;
    el("clear-trace").onclick = protectDiagnostic;
    el("clear-layers").onclick = protectDiagnostic;
    el("rules").onclick = showRules;
    el("restart").onclick = confirmRestart;
    wireSavedRevive();
    ads.preload();
    for (const key of [
      "sound",
      "calm",
      "haptics",
      "musicVolume",
      "effectsVolume",
    ] as const)
      el<HTMLInputElement>(key).onchange = async (event) => {
        const target = event.target as HTMLInputElement;
        const value =
          target.type === "range" ? Number(target.value) / 100 : target.checked;
        dialog.querySelector<HTMLElement>(".dialog-status")!.textContent = "";
        try {
          for (const input of dialog.querySelectorAll<HTMLInputElement>(
            ".setting input",
          ))
            input.disabled = true;
          const changed = await store.update((p) => ({
            ...p,
            revision: p.revision + 1,
            settings: {
              ...p.settings,
              musicVolume:
                p.settings.musicVolume ?? (p.settings.sound ? 0.35 : 0),
              effectsVolume: p.settings.effectsVolume ?? 1,
              [key]: value,
            },
          }));
          if (!changed) toast("Дождитесь сохранения и повторите изменение");
          render();
        } catch (error) {
          await writeFailure(error, "Настройка не сохранена");
        } finally {
          const musicToggle =
            dialog.querySelector<HTMLInputElement>("#music-toggle");
          if (musicToggle) {
            musicToggle.disabled = false;
            musicToggle.checked = (store.state.settings.musicVolume ?? 0) > 0;
          }
          for (const setting of [
            "sound",
            "calm",
            "haptics",
            "musicVolume",
            "effectsVolume",
          ] as const) {
            const input = dialog.querySelector<HTMLInputElement>(`#${setting}`);
            if (input) {
              if (setting === "musicVolume" || setting === "effectsVolume")
                input.value = String(
                  Math.round(
                    (store.state.settings[setting] ??
                      (setting === "effectsVolume"
                        ? 1
                        : store.state.settings.sound
                          ? 0.35
                          : 0)) * 100,
                  ),
                );
              else input.checked = store.state.settings[setting] ?? true;
              input.disabled = false;
            }
          }
        }
      };
  }
  function showThemes() {
    const w = store.state.wardrobe ?? {
      selected: 0,
      unlocked: [0],
      discoveries: 0,
    };
    dialog.innerHTML = `<h2 id="dialog-title">Оформление</h2><p>Выберите любое оформление. Полная очистка поля по-прежнему меняет тему автоматически.</p><div class="theme-collection">${THEMES.map((theme, i) => `<button class="secondary" data-theme="${i}" aria-pressed="${w.selected === i}" style="background:${theme.bg};color:${theme.ink}"><span class="theme-preview" aria-hidden="true" style="background:#${theme.board.toString(16).padStart(6, "0")}">${Array.from({ length: 12 }, (_, cell) => `<i>${[0, 1, 5, 6, 8, 9, 10].includes(cell) ? `<img alt="" loading="lazy" draggable="false" src="${tileURL(COLORS[themeTile(i, (cell % 3) + 1)]!, tileMaterialForTheme(i))}">` : ""}</i>`).join("")}</span><span class="theme-name">${theme.name}${w.selected === i ? " ✓" : ""}</span></button>`).join("")}</div><button id="back-themes" class="primary">Назад</button>`;
    structureDialog();
    dialog.querySelectorAll<HTMLButtonElement>("[data-theme]").forEach(
      (button) =>
        (button.onclick = async () => {
          try {
            await store.update((p) => ({
              ...p,
              revision: p.revision + 1,
              wardrobe: {
                ...(p.wardrobe ?? w),
                selected: Number(button.dataset.theme),
                unlocked: [
                  ...new Set([
                    ...(p.wardrobe ?? w).unlocked,
                    Number(button.dataset.theme),
                  ]),
                ],
              },
            }));
            render();
            showThemes();
          } catch (error) {
            await writeFailure(error, "Оформление не сохранено");
          }
        }),
    );
    el("back-themes").onclick = () => {
      dialog.close();
      showPause();
    };
  }
  function showRules() {
    modal = "rules";
    dialog.dataset.kind = "rules";
    dialog.innerHTML = `<h2 id="dialog-title">Как играть</h2><p>Перенесите фигуру на свободные клетки. Полные строки и столбцы исчезают одновременно.</p><p>Используйте все три фигуры — появятся следующие. Очистки увеличивают серию. Поворота и отмены хода нет.</p><details class="diagnostics"><summary>Очки и подсказки</summary><p>${currentGame().scoringVersion ? `Клетка — 1 очко. Линии за один ход: 100 / 300 / 600 / 1000 за одну / две / три / четыре. Пересечения считаются вместе. Комбо умножает очки линий: ×1 → ×1,5 → ×2 → ×3 → ×4 → ×5. ${currentGame().scoringVersion === "festival-v4" ? "Далее: серия 8 — ×6, 10 — ×8, 13 — ×10, 16 — ×12, 20 — ×15; затем +1 к множителю каждые 3 очистки. " : ""}Чистое поле: отдельно +1000.` : "Каждая клетка фигуры — 1 очко. Одна линия добавляет 10, две одновременно — 40, три — 90. Например, фигура из четырёх клеток с одной линией даёт 14 очков."}</p><p>${currentGame().scoringVersion ? "" : "За вторую очистку в серии — ещё 5 очков за каждую линию, за третью — ещё 10."} ${currentGame().rulesVersion === "grace-v2" ? "Между очистками можно сделать два подготовительных хода. Третий ход без очистки сбросит серию. Время размышления не ограничено." : "В этой сохранённой партии действуют старые правила: ход без очистки сбрасывает серию. Новая партия разрешает два подготовительных хода."} ${currentGame().scoringVersion ? "" : "Полностью пустое поле даёт дополнительно 100 очков."}</p><p>Подсказки: 3 бесплатных использования в день. Открытый вариант можно показывать повторно бесплатно, пока вы не сделали ход. Неиспользованные ежедневные подсказки не накапливаются.</p></details><p>${currentGame().rulesVersion === "grace-v2" ? "Между очистками есть два подготовительных хода. Третий ход без очистки завершает серию. Время не ограничено." : "Ход без очистки завершает серию."}</p><p>Можно выбрать фигуру и нажать на её верхнюю левую клетку на поле. С клавиатуры: Enter на фигуре, стрелки, Enter для установки.</p><button class="primary" id="back-pause">Понятно</button><button class="secondary" id="practice">Попробовать на поле</button>`;
    structureDialog();
    el("practice").onclick = async () => {
      if (store.busy) return;
      try {
        if (
          await store.update((p) => ({
            ...p,
            revision: p.revision + 1,
            tutorialStep: 0,
          }))
        ) {
          close();
        }
      } catch (error) {
        await writeFailure(
          error,
          "Не удалось сохранить обучение. Попробуйте ещё раз.",
        );
      }
    };
    el("back-pause").onclick = () => {
      dialog.close();
      showPause();
    };
  }
  function confirmRestart() {
    modal = "restart";
    dialog.dataset.kind = "restart";
    dialog.innerHTML = `<h2 id="dialog-title">Начать заново?</h2><p>Текущая партия завершится. Рекорд и подсказки сохранятся.${currentGame().scoringVersion === "festival-v4" ? "" : " В новой партии — развитие комбо без потолка ×5 и отдельный рекорд."}</p><details class="diagnostics"><summary>Экспериментальная выдача</summary><label class="dealer-choice">Выдача в новой партии<select id="dealer-choice"><option value="flow-v4">Новая выдача</option><option value="initial-v1">Обычная</option><option value="assist-v1">С умеренной помощью</option></select></label><p class="dealer-note">Новая выдача подбирает сочетания фигур для последовательных очисток. Обычная и умеренная оставлены для сравнения.</p></details><button class="primary" id="new-game">Новая партия</button><button class="secondary" id="keep-game">Продолжить текущую</button>`;
    structureDialog();
    syncSaving();
    el<HTMLSelectElement>("dealer-choice").value = "flow-v4";
    el("new-game").onclick = () =>
      void restart(
        el<HTMLSelectElement>("dealer-choice").value as DealerVersion,
      );
    el("keep-game").onclick = close;
  }
  async function restart(dealer: DealerVersion = "flow-v4") {
    if (ads.busy || store.busy || movePending) return;
    const status = dialog.querySelector<HTMLElement>(".dialog-status");
    if (status) status.textContent = "";
    try {
      const nextGame = fresh(dealer);
      const changed =
        store.state.game.status === "over"
          ? await ads.betweenGames(nextGame)
          : await store.update((p) => ({
              ...ads.stamp(p),
              revision: p.revision + 1,
              game: nextGame,
              tutorialStep: 4,
              hint: null,
            }));
      if (changed) {
        recordCelebrated = false;
        resultPending = false;
        clearTimeout(resultTimer);
        stopCosmetics();
        dialog.close();
        modal = "";
        activity.setBlocked("dialog", false);
        render();
      }
    } catch (error) {
      await writeFailure(
        error,
        "Не удалось сохранить новую партию. Предыдущая сохранена.",
      );
    }
  }
  function beginDefeat() {
    const defeatKey = `${currentGame().gameId}:${currentGame().reviveUsed ? "revived" : "initial"}`;
    if (defeatPlayed === defeatKey || scene.calm) {
      showResult();
      return;
    }
    defeatPlayed = defeatKey;
    const record =
      currentGame().score > 0 && currentGame().score >= bestFor(store.state);
    const finalDefeat = !revivePlan(currentGame());
    // A record must not soften the final loss. Move the existing field as one
    // surface; no additional particles, textures or full-field light layers.
    scene.defeat(record && !finalDefeat);
    if (finalDefeat)
      animate(
        canvasBox,
        [
          { transform: "translateY(0) scale(1)" },
          { transform: "translateY(7px) scale(.985)", offset: 0.16 },
          { transform: "translateY(-3px) scale(1.005)", offset: 0.4 },
          { transform: "translateY(2px) scale(.997)", offset: 0.65 },
          { transform: "translateY(0) scale(1)" },
        ],
        620,
      );
    document
      .querySelectorAll(".piece")
      .forEach((e) =>
        animate(
          e,
          [
            { transform: "rotate(0deg)" },
            { transform: "rotate(-6deg)", offset: 0.25 },
            { transform: "rotate(5deg)", offset: 0.6 },
            { transform: "rotate(0deg)" },
          ],
          480,
        ),
      );
    if (!record) audio.play("defeat");
    haptics.pulse(record ? "record" : "defeat");
    resultTimer = window.setTimeout(() => {
      if (running && resultPending && !dialog.open) showResult();
    }, 750);
  }
  let reviveTimer = 0;
  let stopReviveClock = () => {};
  let openingResult = false;
  async function showResult() {
    if (dialog.open || openingResult) return;
    openingResult = true;
    try {
      const game = store.state.game;
      if (revivePlan(game) && !game.reviveOffer) {
        await store.update((p) =>
          p.game.gameId !== game.gameId
            ? p
            : {
                ...p,
                revision: p.revision + 1,
                game: startReviveOffer(p.game, Date.now()),
              },
        );
      }
      if (revivePlan(store.state.game) && !store.state.game.reviveOffer) {
        resultPending = true;
        resultTimer = window.setTimeout(() => void showResult(), 100);
        return;
      }
      const expired = expireReviveOffer(store.state.game, Date.now());
      if (expired !== store.state.game)
        await store.update((p) => ({
          ...p,
          revision: p.revision + 1,
          game: expireReviveOffer(p.game, Date.now()),
        }));
      clearInterval(reviveTimer);
      stopReviveClock();
      if (revivePlan(store.state.game)) showRevive();
      else void finishResult();
      const gameId = store.state.game.gameId;
      const tick = async () => {
        const g = store.state.game,
          offer = g.reviveOffer;
        if (
          g.gameId !== gameId ||
          !offer ||
          offer.accepted ||
          offer.expired ||
          g.status !== "over"
        ) {
          clearInterval(reviveTimer);
          stopReviveClock();
          return;
        }
        const remaining = Math.max(0, offer.deadline - Date.now());
        const button = dialog.querySelector<HTMLButtonElement>("#watch-reward");
        if (button) {
          const count = dialog.querySelector<HTMLElement>("#revive-countdown");
          if (
            count &&
            count.textContent !== String(Math.ceil(remaining / 1000))
          ) {
            count.textContent = String(Math.ceil(remaining / 1000));
            if (!document.hidden)
              animate(
                count,
                [{ transform: "scale(1.18)" }, { transform: "scale(1)" }],
                remaining < 1100 ? 280 : 180,
              );
          }
          button.disabled = remaining <= 0 || store.busy;
        }
        if (!remaining && !store.busy) {
          try {
            await store.update((p) => ({
              ...p,
              revision: p.revision + 1,
              game: expireReviveOffer(p.game, Date.now()),
            }));
            if (
              modal === "revive" &&
              dialog.open &&
              store.state.game.reviveOffer?.expired
            ) {
              dialog.close();
              void finishResult();
            }
          } catch {
            /* Retry durable expiration; the deadline still forbids accepting. */
          }
        }
      };
      reviveTimer = window.setInterval(() => void tick(), 100);
      void tick();
    } catch (error) {
      await writeFailure(
        error,
        "Не удалось сохранить предложение второго шанса. Попробуйте ещё раз.",
      );
    } finally {
      openingResult = false;
    }
  }
  async function acceptRevive() {
    if (store.busy || ads.busy) return;
    const now = Date.now();
    try {
      const changed = await store.update((p) => ({
        ...p,
        revision: p.revision + 1,
        game: acceptReviveOffer(p.game, now),
      }));
      if (!changed) return;
      if (store.state.game.reviveOffer?.accepted) {
        clearInterval(reviveTimer);
        stopReviveClock();
        el("revive-clock").hidden = true;
        el("reward-status").textContent = "Подготавливаем рекламу…";
        el<HTMLButtonElement>("watch-reward").disabled = true;
        await performReward("revive");
      } else {
        dialog.close();
        void showResult();
      }
    } catch (error) {
      await writeFailure(
        error,
        "Не удалось сохранить выбор. Попробуйте ещё раз.",
      );
    }
  }
  let finishingResult = false;
  async function finishResult() {
    if (finishingResult || store.state.game.status !== "over") return;
    finishingResult = true;
    try {
      if (await ads.finishGame()) {
        if (store.state.game.status === "over") renderResult();
        else {
          close();
          render();
        }
      } else resultTimer = window.setTimeout(() => void finishResult(), 100);
    } catch (error) {
      await writeFailure(
        error,
        "Не удалось сохранить результат. Повторяем сохранение…",
      );
      resultTimer = window.setTimeout(() => void finishResult(), 1500);
    } finally {
      finishingResult = false;
    }
  }
  function renderResult() {
    clearTimeout(resultTimer);
    resultPending = false;
    if (dialog.open) return;
    const record =
      store.state.game.score > 0 &&
      store.state.game.score >= bestFor(store.state);
    open(
      `<h2 id="dialog-title" class="result-heading">${record ? "Новый рекорд!" : "Ещё одну?"}</h2>
      <div class="result-total"><span>Счёт</span><strong class="result-score">${store.state.game.score.toLocaleString("ru")}</strong></div>
      <div class="result-record"><span>Рекорд</span><strong>${bestFor(store.state).toLocaleString("ru")}</strong></div>
      <button class="primary" id="again" aria-label="Новая партия"><svg viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M9 3a2 2 0 0 0-3 2v22a2 2 0 0 0 3 2l19-11a2 2 0 0 0 0-4z"/></svg></button>`,
      "result",
    );
    audio.menuOnly = true;
    audioFocus.setActive(audio.audible && !document.hidden);
    if (!document.hidden) void audio.unlock();
    haptics.setActive(
      !document.hidden && store.state.settings.haptics !== false && !scene.calm,
    );
    const endResult = presentResult(
      dialog,
      store.state.game.score,
      scene.calm,
      (step) => audio.play("count", step, store.state.game.score),
      (celebrate) => {
        if (celebrate && record) {
          haptics.pulse("record");
          dialog.classList.add("result-celebrate");
        }
        if (celebrate) {
          audio.play(
            record ? "record" : "score",
            currentGame().streak,
            store.state.game.score,
          );
          resultFeedbackTimer = window.setTimeout(() => {
            audio.menuOnly = false;
            audioFocus.setActive(false);
            audio.stop();
            haptics.setActive(false);
          }, 650);
        } else {
          audio.menuOnly = false;
          audioFocus.setActive(false);
          audio.stop();
          haptics.setActive(false);
        }
      },
    );
    finishResultPresentation = () => {
      endResult();
      clearTimeout(resultFeedbackTimer);
      audio.menuOnly = false;
      audioFocus.setActive(false);
      audio.stop();
      haptics.setActive(false);
    };
    el("again").onclick = () => {
      finishResultPresentation();
      void restart();
    };
    ads.preload();
  }
  el("lesson-skip").onclick = async () => {
    if (store.busy) return;
    try {
      if (
        await store.update(
          (p) => ({
            ...p,
            revision: p.revision + 1,
            tutorialStep: 4,
          }),
          "tutorial_skip",
        )
      ) {
        cancelDrag();
        stopCosmetics();
        render();
        toast("Подсказки: 3 в день. Повтор открытого хода бесплатный.", 6500);
      }
    } catch (error) {
      await writeFailure(error, "Не удалось сохранить. Попробуйте ещё раз.");
    }
  };
  el("pause").onclick = showPause;
  el("play-again").onclick = () => void restart();
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    back();
  });
  if (Capacitor.isNativePlatform()) {
    const native = registerPlugin<{
      addListener(
        name: string,
        listener: (data: { isActive?: boolean }) => void,
      ): Promise<{ remove(): Promise<void> }>;
    }>("App");
    void native
      .addListener("backButton", back)
      .catch(() => toast("Системная кнопка «Назад» пока недоступна"));
    void native
      .addListener("appStateChange", (data) => {
        if (data.isActive === false) finishResultPresentation();
        activity.setBlocked("native", data.isActive === false);
        if (data.isActive) {
          void ads.recover();
          ads.preload();
          bannerWatch?.update();
        }
      })
      .catch(() => {});
  }
  render();
  if (traceModule) {
    await traceModule.installPhoneClear({
      ready: () => rendererReady,
      context: () => readRenderInfo(phaser!),
      configure: (condition) => {
        diagnosticLayer = condition;
        scene.setDiagnosticProfile({
          cachedBorder: true,
          hideInk: condition.hideInk,
          hideVfx: condition.hideVfx,
        });
        atmosphere.setDiagnosticDisabled(condition.skipAtmosphere);
        festival.setDiagnosticDisabled(condition.skipFestival);
        festival.setDiagnosticSeed(0x5120cafe);
      },
      beginSample: () => {
        rewardLabels.beginSample();
        if (!phoneLayers) return;
        diagnosticRewardDom = 0;
        scene.beginDiagnosticSample();
        atmosphere.beginDiagnosticSample();
        festival.beginDiagnosticSample();
      },
      reset: async () => {
        await store.waitIdle();
        cancelDrag();
        cancelHint();
        stopPraise();
        stopCosmetics();
        await store.update((p) => traceModule.fixtureProfile(p.revision + 1));
        recordCelebrated = false;
        lastPraiseMove = -5;
        themeGame = "";
        themeKey = "";
        render();
        if (phoneLayers) atmosphere.resetDiagnosticPresentation();
      },
      commit: async () => {
        await commit(traceModule.phoneFixture.move, currentGame().revision);
        if (currentGame().score !== traceModule.phoneFixture.expectedScore)
          throw Error("Diagnostic move did not commit");
      },
      state: () => ({
        game: currentGame(),
        wardrobe: store.state.wardrobe,
        rewardRasters: rewardLabels.snapshot(),
        ...(phoneLayers
          ? {
              proof: {
                renderedTheme: presentationTheme(),
                savedTheme: store.state.wardrobe?.selected ?? 0,
                score: currentGame().score,
                boardEmpty: currentGame().board.every((n) => n === 0),
                rewardDomCreated: diagnosticRewardDom,
                shownScore: Math.round(scoreShown),
                pendingPoints,
                scene: scene.diagnosticSnapshot(),
                atmosphere: atmosphere.diagnosticSnapshot(),
                festival: festival.diagnosticSnapshot(),
              },
            }
          : {}),
      }),
      pause: (paused) => activity.setBlocked("clear-trace", paused),
    });
  }
  if (loaded.recovered) toast("Восстановлена предыдущая целая копия партии.");
  if (
    import.meta.env.DEV &&
    new URLSearchParams(location.search).has("themeSeries")
  ) {
    const select = document.createElement("select");
    select.id = "theme-preview";
    select.setAttribute("aria-label", "Отладочный просмотр тем");
    select.style.cssText =
      "position:fixed;bottom:5px;left:5px;z-index:99;max-width:220px;font:12px sans-serif";
    select.innerHTML =
      THEMES.map(
        (t) => `<option value="${t.at}">${t.at} · ${t.name}</option>`,
      ).join("") + `<option value="125">125 · Призма II</option>`;
    select.value =
      new URLSearchParams(location.search).get("themeSeries") || "0";
    select.onchange = () => {
      const url = new URL(location.href);
      url.searchParams.set("themeSeries", select.value);
      history.replaceState(null, "", url);
      render();
    };
    document.body.append(select);
  }
  if (!inLesson() && initial.game.status === "over" && rendererReady)
    void showResult();
  window.addEventListener("pageshow", () =>
    activity.setBlocked("pagehide", false),
  );
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && modal === "result") finishResultPresentation();
  });
  window.addEventListener("pagehide", () => {
    cancelRewardWarmup?.();
    cancelRewardWarmup = null;
    activity.setBlocked("pagehide", true);
    cancelDrag();
    cancelHint();
    audio.stop();
    stopCosmetics();
  });
  if (import.meta.hot)
    import.meta.hot.dispose(() => {
      cancelRewardWarmup?.();
      cancelRewardWarmup = null;
      clearInterval(reviveTimer);
      stopReviveClock();
      analytics.dispose();
      void ads.dispose();
      bannerWatch?.dispose();
      phaser?.loop.wake();
      phaser?.destroy(true);
      cancelHint();
      window.removeEventListener("resize", unsubscribeResize);
      canvasResize.disconnect();
    });
}
void (
  new URLSearchParams(location.search).get("mode") === "adventure"
    ? import("./adventure/view").then((m) => m.startCampaign())
    : start()
).catch((error) => {
  console.error("Boot failed", error);
  const damaged = error instanceof DamagedSaveError;
  root.classList.add("boot-screen");
  root.innerHTML = `<div class="boot"><span class="boot-mark" aria-hidden="true">▦</span><h2>${damaged ? "Не удалось восстановить партию" : "Не удалось открыть игру"}</h2><p>${damaged ? "Основное сохранение и резервная копия повреждены. Можно повторить загрузку или начать заново. Повреждённые записи останутся в архиве на этом устройстве." : "Не удалось прочитать сохранение. Данные не удалены. Закройте другие окна игры и повторите загрузку."}</p><button class="primary" id="retry">Повторить</button>${damaged ? '<button class="secondary" id="recover">Начать заново</button>' : ""}<p id="recovery-status" role="alert"></p></div>`;
  document.getElementById("retry")!.onclick = () => location.reload();
  const recovery = document.getElementById("recover");
  if (recovery)
    recovery.onclick = () => {
      const box = root.querySelector(".boot")!;
      box.innerHTML =
        '<h2>Начать с чистого поля?</h2><p>Партия, рекорд и настройки будут сброшены. Повреждённые записи сохранятся отдельно, но игра не сможет восстановить их автоматически.</p><button class="primary" id="confirm-recovery">Сбросить и начать</button><button class="secondary" id="cancel-recovery">Назад</button><p id="recovery-status" role="alert"></p>';
      document.getElementById("cancel-recovery")!.onclick = () =>
        location.reload();
      document.getElementById("confirm-recovery")!.onclick = async () => {
        const buttons = box.querySelectorAll<HTMLButtonElement>("button");
        buttons.forEach((b) => (b.disabled = true));
        try {
          await new IndexedSave().recoverDamaged(createProfile(fresh()));
          location.reload();
        } catch (error) {
          document.getElementById("recovery-status")!.textContent =
            error instanceof SaveConflictError
              ? "Сохранение уже изменилось. Нажмите «Назад», чтобы загрузить его."
              : "Не удалось записать новую партию. Исходные данные сохранены. Попробуйте ещё раз.";
          buttons.forEach((b) => (b.disabled = false));
        }
      };
    };
});
