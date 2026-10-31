import { performanceCapture } from "./platform/performance";
import { Atmosphere } from "./game/atmosphere";
import { THEMES, themeFor, themeAccent } from "./game/themes";
import { praiseFor, type PraiseResult } from "./core/praise";
import { Festival } from "./game/festival";
import { GameHaptics } from "./platform/haptics";
import { comboMultiplier } from "./core/scoring";
import { bestFor, recordScore } from "./core/profile";
import { AudioFocus, nativeAudioFocus } from "./platform/audio-focus";
import { AdsController, nativeAds, watchBanner } from "./platform/ads";
import { claimRevive, revivePlan } from "./core/monetization";
import Phaser from "phaser";
import { Capacitor, registerPlugin } from "@capacitor/core";
import "./style.css";
import "./enamel.css";
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
const pauseIcon = svg('<path d="M8 5v14M16 5v14"/>');
const bulb = svg(
  '<path d="M9 18h6m-5 3h4M8 14a6 6 0 1 1 8 0c-1 1-1 2-1 2H9s0-1-1-2Z"/>',
);
const crown = svg('<path d="m3 6 4 5 5-7 5 7 4-5-2 12H5Z"/>');
const root = document.querySelector<HTMLDivElement>("#app")!;
const seed = () => crypto.getRandomValues(new Uint32Array(1))[0]!;
const fresh = (dealer: DealerVersion = "initial-v1") => ({
  ...newGame(seed(), crypto.randomUUID(), dealer),
  scoringVersion: "festival-v3" as const,
});
async function start() {
  const adapter = new IndexedSave();
  const loaded = await adapter.load();
  const initial = loaded.profile ?? createProfile(fresh());
  if (!loaded.profile) await adapter.write(initial);
  const store = new ProfileStore(initial, adapter),
    audio = new GameAudio(),
    scene = new BoardScene();
  const atmosphere = new Atmosphere();
  const festival = new Festival(),
    haptics = new GameHaptics();
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
  root.innerHTML = `<main class="shell"><header class="topbar"><div class="brand"><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>blocky</div><button class="icon" id="pause" aria-label="Пауза">${pauseIcon}</button></header><div class="play-layout"><section class="board-column"><div class="board-wrap"><div class="combo-hud" id="combo-hud" aria-live="polite"><strong id="combo-title"></strong><span id="combo-stock"></span></div><div class="clear-glow" id="clear-glow" aria-hidden="true"></div><div id="board" role="img" aria-label="Игровое поле 8 на 8"></div></div><div class="board-caption"><span id="caption"></span><span class="toast" id="toast" role="status"></span></div></section><aside class="side"><section class="score-panel"><span class="lesson-heading">Обучение</span><div><div class="sr-only">Ваш счёт</div><div class="score" id="score">0</div></div><div class="best">${crown}<span><span class="sr-only">Рекорд </span><b id="best">0</b></span></div><div class="reward-line"><span id="streak"></span><span class="burst" id="burst" aria-hidden="true"></span></div></section><section class="tray-area"><div class="tray-label"><span>Следующие фигуры</span><span id="tray-progress">3 / 3</span></div><div class="tray" id="tray" aria-label="Доступные фигуры"></div></section><section class="hint-area"><div id="lesson" hidden><p id="lesson-text" role="status"></p><button id="lesson-skip" class="lesson-skip">Пропустить</button></div><button class="hint" id="hint">${bulb}<span id="hint-label">Подсказка</span><span class="hint-count" id="hint-count">3</span></button><button class="hint" id="play-again" hidden>Ещё раз</button></section></aside></div></main><div class="ad-slot" id="ad-slot" aria-hidden="true"></div><div class="floating" id="floating" hidden></div><dialog id="dialog" aria-labelledby="dialog-title"></dialog><span id="announce" class="sr-only" aria-live="polite"></span>`;
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
  let rejectedDrags = 0;
  let tapHelpShown = false;
  let running = false;
  let phaser: Phaser.Game | null = null;
  let rendererReady = false;
  function syncRenderer() {
    if (!phaser || !rendererReady) return;
    const debugSeries = import.meta.env.DEV
      ? Number(new URLSearchParams(location.search).get("themeSeries"))
      : 0;
    atmosphere.set(
      debugSeries > 0 ? debugSeries : currentGame().streak,
      running,
      scene.calm,
    );
    if (running) schedulePraise(currentGame());
    if (running) phaser.loop.wake();
    else phaser.loop.sleep();
  }
  let recordCelebrated =
    initial.game.score > 0 && initial.game.score >= bestFor(initial);
  let rewardHoldUntil = 0;
  let pendingPoints = 0;
  const rewards = new Map<HTMLElement, () => void>();
  let resultTimer = 0,
    resultPending = false;
  let scoreFrame = 0,
    scoreShown = initial.game.score,
    scoreTarget = initial.game.score;
  let scoreGame = initial.game.gameId;
  const rewardAnchor = document.createElement("div");
  rewardAnchor.className = "board-reward";
  document.querySelector(".board-wrap")!.append(rewardAnchor);
  rewardAnchor.append(el("burst"));
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
    };
    if (!smooth || scene.calm || !sameGame || value <= from) {
      paint(value);
      return;
    }
    const start = performance.now(),
      duration = Math.min(260, 130 + Math.log2(value - from + 1) * 10);
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
    festivalTimers.forEach(clearTimeout);
    festivalTimers.clear();
    festival.stop();
    cancelAnimationFrame(scoreFrame);
    scoreFrame = 0;
    pendingPoints = 0;
    scoreTarget = currentGame().score;
    scoreShown = scoreTarget;
    el("score").textContent = scoreTarget.toLocaleString("ru");
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
      performanceCapture.setActive(true);
      root.classList.remove("effects-paused");
      haptics.setActive(
        store.state.settings.haptics !== false &&
          !store.state.settings.calm &&
          !matchMedia("(prefers-reduced-motion: reduce)").matches,
      );
      audioFocus.setActive(store.state.settings.sound);
      ads.setActive(!inLesson() && store.state.game.status === "playing");
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
      performanceCapture.setActive(false);
      root.classList.add("effects-paused");
      stopPraise();
      atmosphere.set(currentGame().streak, false, scene.calm);
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
  const adBridge = nativeAds();
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
    root.inert = ads.busy;
    root.removeAttribute("aria-busy");
    if (scene.textures.exists("vfx-chip") && scene.textures.exists("vfx-flash"))
      festival.setTextures(
        scene.textures.get("vfx-chip").getSourceImage() as HTMLImageElement,
        scene.textures.get("vfx-flash").getSourceImage() as HTMLImageElement,
      );
    scene.game.events.once("postrender", () => {
      rendererReady = true;
      syncRenderer();
    });
  };
  phaser = new Phaser.Game({
    type: Phaser.AUTO,
    width: 512,
    height: 512,
    parent: "board",
    transparent: true,
    scene,
    antialias: true,
    banner: false,
    audio: { noAudio: true },
    scale: { mode: Phaser.Scale.NONE },
    fps: { target: 60, limit: 60 },
  });
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
  function mini(slot: number, cell: number) {
    const piece = currentGame().tray[slot]!,
      shape = shapeById(piece.shapeId);
    return `<span class="mini-shape" style="grid-template-columns:repeat(${shape.width},${cell}px);grid-template-rows:repeat(${shape.height},${cell}px)">${shape.cells.map(([x, y]) => `<img draggable="false" alt="" class="mini-cell" style="grid-column:${x + 1};grid-row:${y + 1}" src="${tileURL(COLORS[piece.color]!)}">`).join("")}</span>`;
  }
  function render(smoothScore = false) {
    const p = store.state,
      g = currentGame();
    if (g.gameId !== scoreGame) pendingPoints = 0;
    updateScore(
      g.score - pendingPoints,
      g.gameId,
      smoothScore || pendingPoints > 0,
    );
    el("best").textContent = bestFor(p).toLocaleString("ru");
    el("hint-count").textContent = String(
      (p.freeDay === dayKey() ? p.freeHints : 3) + p.earnedHints,
    );
    el("tray-progress").textContent =
      `${g.tray.filter((s) => !s.used).length} / 3`;
    const tray = el("tray");
    const focused = (document.activeElement as HTMLElement)?.dataset?.slot;
    const shapes = g.tray.map((s) => shapeById(s.shapeId));
    const cell = Math.max(
      7,
      Math.floor(
        Math.min(
          38,
          (tray.clientWidth / 3 - 12) /
            Math.max(1, ...shapes.map((s) => s.width)),
          (tray.clientHeight - 8) / Math.max(1, ...shapes.map((s) => s.height)),
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
    audioFocus.setActive(running && p.settings.sound);
    scene.calm =
      p.settings.calm || matchMedia("(prefers-reduced-motion: reduce)").matches;
    audio.calm = scene.calm;
    haptics.setActive(running && p.settings.haptics !== false && !scene.calm);
    document.documentElement.classList.toggle("calm", scene.calm);
    const debugSeries = import.meta.env.DEV
      ? Number(new URLSearchParams(location.search).get("themeSeries"))
      : 0;
    const visualSeries = debugSeries > 0 ? debugSeries : g.streak;
    atmosphere.set(visualSeries, running, scene.calm);
    scene.setTheme(themeFor(visualSeries), themeAccent(visualSeries));
    const nextTheme = themeFor(visualSeries),
      nextKey = `${nextTheme}:${visualSeries >= 100 ? Math.floor((visualSeries - 100) / 25) : 0}`;
    if (
      themeGame === g.gameId &&
      themeKey !== nextKey &&
      nextTheme > 0 &&
      running &&
      !inLesson()
    ) {
      const from = themeIndex;
      later(
        () => {
          presentReward(
            "theme",
            `СЕРИЯ ${visualSeries} · ${THEMES[nextTheme]!.name.toUpperCase()}`,
            0,
            { x: 50, y: 20 },
          );
          audio.play("theme", g.streak);
          atmosphere.impulse(1.5);
        },
        from < nextTheme ? 300 : 0,
      );
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
    el("hint").hidden = g.status === "over" || inLesson();
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
        ? `СЕРИЯ ${g.streak} · ×${comboMultiplier(g.streak).toLocaleString("ru")}`
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
    el("combo-stock").textContent = g.streak
      ? stock
        ? `${"●".repeat(stock)}${"○".repeat(2 - stock)}  ${stock === 2 ? "2 хода в запасе" : "1 ход в запасе"}`
        : "Очисти линию следующим ходом"
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
        : g.moves === 0
          ? "Перенесите фигуру на поле"
          : "";
    ads.setActive(
      running && !inLesson() && store.state.game.status === "playing",
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
  function cancelHint() {
    hintGeneration++;
    worker?.terminate();
    worker = null;
    el("hint").removeAttribute("aria-busy");
    refreshHintLabel();
  }
  let dragFrame = 0;
  let dragSample: PointerEvent | null = null;
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
    if (!running || store.busy) return;
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
    try {
      const changed = await store.update((p) => {
        const result = performanceCapture.measure("applyMove", () =>
          applyMove(before, move, revision),
        );
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
              ...recordScore(p, result.state),
              hint: null,
            }
          : null;
      });
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
      const newRecord =
        !practicing &&
        !recordCelebrated &&
        previousBest > 0 &&
        event.state.score > previousBest;
      if (newRecord) recordCelebrated = true;
      const deferred =
        running && !scene.calm && event.lines
          ? event.points - placedCells.length
          : 0;
      atmosphere.origin(canvasBox.getBoundingClientRect(), placedCells);
      pendingPoints += deferred;
      render(running);
      if (running) {
        atmosphere.impulse(
          event.allClear
            ? 3
            : event.lines
              ? 1 + Math.min(1, event.state.streak / 10)
              : 0.15,
        );
        if (praise) {
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
          glow.style.boxShadow = `0 0 ${24 + Math.min(35, event.state.streak * 3)}px 9px ${themeAccent(event.state.streak)}`;
          animate(
            glow,
            [
              { opacity: 0, transform: "scale(.98)" },
              { opacity: 1, transform: "scale(1)", offset: 0.18 },
              { opacity: 0, transform: "scale(1.04)" },
            ],
            event.allClear ? 1900 : 1200,
          );
          if (event.state.streak >= 6)
            festival.burst(
              canvasBox.getBoundingClientRect(),
              event.cells,
              1,
              true,
              false,
              undefined,
              64,
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
          event.lines ? "clear" : "place",
          Math.max(event.lines, Math.min(5, event.state.streak)),
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
            : newRecord
              ? "record"
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
          : null;
        const lineName =
          event.lines >= 4
            ? `${event.lines} ЛИНИИ!`
            : event.lines === 3
              ? "ТРОЙНАЯ!"
              : event.lines === 2
                ? "ДВОЙНАЯ!"
                : "ЛИНИЯ!";
        if (!event.lines) presentReward("place", "", event.points, anchor);
        else {
          const linePoints = event.breakdown.lines + event.breakdown.combo;
          presentReward(
            event.lines >= 2 ? "combo" : "line",
            praise
              ? `${lineName} ${praise === "excellent" ? "Отлично!" : "Хорошо!"}`
              : lineName,
            linePoints,
            anchor,
            deferred ? linePoints : 0,
            event.state.streak,
            event.state.gameId,
          );
          if (event.state.streak > 1)
            later(
              () =>
                presentReward(
                  "chain",
                  event.state.scoringVersion
                    ? `КОМБО ×${comboMultiplier(event.state.streak).toLocaleString("ru")}`
                    : `СЕРИЯ ${event.state.streak}`,
                  0,
                  { x: 50, y: 30 },
                ),
              140,
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
                haptics.pulse("empty");
                if (!scene.calm)
                  festival.burst(
                    canvasBox.getBoundingClientRect(),
                    [],
                    event.lines,
                    true,
                  );
              },
              scene.calm ? 0 : 650,
            );
          }
        }
        if (newRecord)
          later(
            () => {
              presentReward("record", "Новый рекорд!", 0, { x: 50, y: 32 });
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
      scene.pendingPlacement([]);
      canvasBox.removeAttribute("aria-busy");
    }
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
    const important = tier === "record" || tier === "all-clear";
    const node = document.createElement("span");
    node.className = "reward-event";
    node.dataset.tier = tier;
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
    node.append(label, amount);
    for (const old of rewards.keys()) {
      old.style.opacity = ".35";
      old.style.translate = "0 -18px";
    }
    el("burst").append(node);
    const boardBox = rewardAnchor.getBoundingClientRect();
    label.style.fontSize = `${Math.min(important ? 38 : 36, boardBox.width * (important ? 0.09 : 0.1))}px`;
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
            : 1250;
    if (important)
      rewardHoldUntil = Math.max(rewardHoldUntil, performance.now() + duration);
    const timerIds: number[] = [];
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      if (gameId !== currentGame().gameId) return;
      pendingPoints = Math.max(0, pendingPoints - deferred);
      if (deferred)
        updateScore(currentGame().score - pendingPoints, gameId, running);
    };
    const finish = () => {
      timerIds.forEach(clearTimeout);
      settle();
      node.getAnimations({ subtree: true }).forEach((a) => a.cancel());
      node.remove();
      rewards.delete(node);
    };
    rewards.set(node, finish);
    if (rewards.size > 3) rewards.values().next().value?.();
    const labelAnimation = animate(
      label,
      [
        { opacity: 0, transform: "translateY(22px) rotate(-7deg) scale(.3)" },
        {
          opacity: 1,
          transform: "translateY(-5px) rotate(3deg) scale(1.16)",
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
              220,
            )?.effect?.updateTiming({ easing: "ease-in" });
            timerIds.push(
              window.setTimeout(() => {
                settle();
                amount.style.opacity = "0";
                if (running && gameId === currentGame().gameId) {
                  audio.play("score", streak, points, scene.intensity);
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
              }, 220),
            );
          },
          important ? 260 : 140,
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
        event.clientY -
        (touch
          ? shape.height +
            1.2 *
              Math.max(
                0,
                Math.min(1, (rect.bottom - event.clientY) / (2 * cell)),
              )
          : shape.height / 2) *
          cell;
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
    const cached = hintMove();
    if (cached) {
      scene.preview(cached, true, true);
      toast("Этот вариант уже открыт");
      return;
    }
    const p = store.state;
    if ((p.freeDay === dayKey() ? p.freeHints : 3) + p.earnedHints <= 0) {
      showRewardHints();
      return;
    }
    const generation = ++hintGeneration;
    const snapshot = structuredClone(p.game);
    stopPraise();
    worker = new Worker(new URL("./game/hint.worker.ts", import.meta.url), {
      type: "module",
    });
    el("hint").setAttribute("aria-busy", "true");
    el("hint-label").textContent = "Ищем ход…";
    worker.onerror = () => {
      cancelHint();
      toast("Не получилось рассчитать подсказку. Кредит сохранён.");
    };
    worker.onmessage = async (event: MessageEvent<HintResult>) => {
      worker?.terminate();
      worker = null;
      if (generation !== hintGeneration || !running) {
        refreshHintLabel();
        return;
      }
      const r = event.data;
      if (!r.move) {
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
        await writeFailure(
          error,
          "Не удалось сохранить подсказку. Кредит не списан.",
        );
      } finally {
        hintSaving = false;
        syncSaving();
      }
    };
    worker.postMessage(snapshot);
  });
  function open(content: string, type: string) {
    modal = type;
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
    nodes.forEach((n) => (n.tagName === "BUTTON" ? actions : body).append(n));
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
    el("watch-reward").onclick = async () => {
      if (ads.busy) return;
      const result = await ads.rewarded(kind);
      if (result === "rewarded") {
        resultPending = false;
        clearTimeout(resultTimer);
        close();
        render();
        toast(
          kind === "hints" ? "Добавлены 3 подсказки" : "Второй шанс получен",
        );
      } else {
        const status = dialog.querySelector<HTMLElement>("#reward-status");
        if (status)
          status.textContent =
            result === "closed"
              ? "Просмотр не подтверждён. Награда не начислена."
              : "Реклама недоступна или показ прерван. Игра сохранена.";
        void offerAvailability();
      }
    };
    void offerAvailability();
  }
  function showRewardHints() {
    open(
      '<h2 id="dialog-title">Нужны подсказки?</h2><p>На сегодня бесплатные подсказки закончились. Завтра будут ещё три.</p><p>За просмотр рекламы получите 3 подсказки. Используйте их в любой партии.</p><p id="reward-status" role="status">Проверяем доступность…</p><button class="primary" id="watch-reward" disabled>Посмотреть рекламу — получить 3 подсказки</button><button class="secondary" id="reward-back">Продолжить без рекламы</button>',
      "reward",
    );
    el("reward-back").onclick = close;
    rewardButton("hints");
  }
  function showRevive() {
    const plan = revivePlan(store.state.game);
    if (!plan) return;
    const cells = store.state.game.board
      .map(
        (c, i) =>
          `<i class="${i % 8 >= plan.x && i % 8 < plan.x + 3 && Math.floor(i / 8) >= plan.y && Math.floor(i / 8) < plan.y + 3 ? "revive-zone" : ""}" style="--cell-color:${c ? `#${COLORS[c]!.toString(16).padStart(6, "0")}` : "#ded8cb"}"></i>`,
      )
      .join("");
    open(
      `<h2 id="dialog-title">Второй шанс</h2><p>После просмотра очистится выделенный квадрат 3×3. Фигуры и очки сохранятся, серия сбросится. Один раз за партию.</p><div class="revive-map" role="img" aria-label="Очистится квадрат: столбцы ${plan.x + 1}–${plan.x + 3}, строки ${plan.y + 1}–${plan.y + 3}">${cells}</div><p id="reward-status" role="status">Проверяем доступность…</p><button class="primary" id="watch-reward" disabled>Посмотреть рекламу — продолжить</button><button class="secondary" id="finish-game">Закончить</button>`,
      "revive",
    );
    el("finish-game").onclick = () => {
      if (ads.busy) return;
      dialog.close();
      showResult();
    };
    rewardButton("revive");
  }
  function showPause() {
    if (dialog.open) return;
    if (resultPending) {
      showResult();
      return;
    }
    open(
      `<h2 id="dialog-title">Пауза</h2><p id="save-status" role="status">Партия сохранена</p><p class="dealer-note">Выдача: ${currentGame().dealerVersion === "assist-v1" ? "с умеренной помощью" : currentGame().dealerVersion === "solvable-v1" ? "размещаемые тройки" : "обычная"}</p><label class="setting">Звуковые эффекты<input id="sound" type="checkbox" ${store.state.settings.sound ? "checked" : ""}></label><label class="setting">Вибрация<input id="haptics" type="checkbox" ${store.state.settings.haptics !== false ? "checked" : ""}></label><label class="setting">Спокойные эффекты — без вибрации и активных анимаций<input id="calm" type="checkbox" ${store.state.settings.calm ? "checked" : ""}></label><button class="primary" id="resume">Продолжить</button><button class="secondary" id="rules">Как играть</button><button class="secondary" id="restart">Новая партия</button><button class="secondary" id="perf-start">${performanceCapture.enabled ? "Начать замер заново" : "Записать плавность игры"}</button><button class="secondary" id="perf-export">Выгрузить замер</button>${savedReviveButton()}`,
      "pause",
    );
    el("resume").onclick = close;
    el("perf-start").onclick = () => {
      performanceCapture.start();
      close();
      toast(
        "Запись включена. После нескольких ходов выгрузите замер из паузы.",
        5000,
      );
    };
    el("perf-export").onclick = () =>
      void performanceCapture
        .export()
        .catch(() => toast("Не удалось выгрузить замер. Попробуйте ещё раз."));
    el("rules").onclick = showRules;
    el("restart").onclick = confirmRestart;
    wireSavedRevive();
    ads.preload();
    for (const key of ["sound", "calm", "haptics"] as const)
      el<HTMLInputElement>(key).onchange = async (event) => {
        const value = (event.target as HTMLInputElement).checked;
        dialog.querySelector<HTMLElement>(".dialog-status")!.textContent = "";
        try {
          for (const input of dialog.querySelectorAll<HTMLInputElement>(
            ".setting input",
          ))
            input.disabled = true;
          const changed = await store.update((p) => ({
            ...p,
            revision: p.revision + 1,
            settings: { ...p.settings, [key]: value },
          }));
          if (!changed) toast("Дождитесь сохранения и повторите изменение");
          render();
        } catch (error) {
          await writeFailure(error, "Настройка не сохранена");
        } finally {
          for (const setting of ["sound", "calm", "haptics"] as const) {
            const input = dialog.querySelector<HTMLInputElement>(`#${setting}`);
            if (input) {
              input.checked = store.state.settings[setting] ?? true;
              input.disabled = false;
            }
          }
        }
      };
  }
  function showRules() {
    modal = "rules";
    dialog.dataset.kind = "rules";
    dialog.innerHTML = `<h2 id="dialog-title">Как играть</h2><p>Перенесите фигуру на свободные клетки. Полные строки и столбцы исчезают одновременно.</p><p>Используйте все три фигуры — появятся следующие. Очистки увеличивают серию. Поворота и отмены хода нет.</p><p>${currentGame().scoringVersion ? "Клетка — 1 очко. Линии за один ход: 100 / 300 / 600 / 1000 за одну / две / три / четыре. Пересечения считаются вместе. Комбо умножает очки линий: ×1 → ×1,5 → ×2 → ×3 → ×4 → ×5. Чистое поле: отдельно +1000. Рекорд этой шкалы хранится отдельно." : "Каждая клетка фигуры — 1 очко. Одна линия добавляет 10, две одновременно — 40, три — 90. Например, фигура из четырёх клеток с одной линией даёт 14 очков."}</p><p>${currentGame().scoringVersion ? "" : "За вторую очистку в серии — ещё 5 очков за каждую линию, за третью — ещё 10."} ${currentGame().rulesVersion === "grace-v2" ? "Между очистками можно сделать два подготовительных хода. Третий ход без очистки сбросит серию. Время размышления не ограничено." : "В этой сохранённой партии действуют старые правила: ход без очистки сбрасывает серию. Новая партия разрешает два подготовительных хода."} ${currentGame().scoringVersion ? "" : "Полностью пустое поле даёт дополнительно 100 очков."}</p><p>Подсказки: 3 бесплатных использования в день. Открытый вариант можно показывать повторно бесплатно, пока вы не сделали ход. Неиспользованные ежедневные подсказки не накапливаются.</p><p>Можно выбрать фигуру и нажать на её верхнюю левую клетку на поле. С клавиатуры: Enter на фигуре, стрелки, Enter для установки.</p><button class="primary" id="back-pause">Понятно</button><button class="secondary" id="practice">Попробовать на поле</button>`;
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
    dialog.innerHTML = `<h2 id="dialog-title">Начать заново?</h2><p>Текущая партия завершится. Подсказки сохранятся. В новой партии — увеличенные награды за линии и комбо, с отдельным рекордом.</p><label class="dealer-choice">Выдача в новой партии<select id="dealer-choice"><option value="initial-v1">Обычная</option><option value="assist-v1">С умеренной помощью</option></select></label><p class="dealer-note">Тестовое сравнение: помощь иногда предлагает фигуру для очистки линии. Выбор действует на всю новую партию.</p><button class="primary" id="new-game">Новая партия</button><button class="secondary" id="keep-game">Продолжить текущую</button>`;
    structureDialog();
    syncSaving();
    el<HTMLSelectElement>("dealer-choice").value =
      currentGame().dealerVersion === "assist-v1" ? "assist-v1" : "initial-v1";
    el("new-game").onclick = () =>
      void restart(
        el<HTMLSelectElement>("dealer-choice").value === "assist-v1"
          ? "assist-v1"
          : "initial-v1",
      );
    el("keep-game").onclick = close;
  }
  async function restart(dealer: DealerVersion = currentGame().dealerVersion) {
    if (ads.busy || store.busy) return;
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
    if (defeatPlayed === currentGame().gameId || scene.calm) {
      showResult();
      return;
    }
    defeatPlayed = currentGame().gameId;
    const record =
      currentGame().score > 0 && currentGame().score >= bestFor(store.state);
    scene.defeat(record);
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
  function showResult() {
    clearTimeout(resultTimer);
    resultPending = false;
    if (dialog.open) return;
    const bestFinish =
      store.state.game.score > 0 &&
      store.state.game.score >= bestFor(store.state);
    const remaining = store.state.game.tray
      .map((piece, slot) =>
        piece.used
          ? ""
          : `<div class="result-piece" aria-label="Оставшаяся фигура ${slot + 1}">${mini(slot, 16)}</div>`,
      )
      .join("");
    open(
      `<div class="result-heading">${bestFinish ? crown + "Лучший результат" : "Партия завершена"}</div><h2 id="dialog-title" class="result-score">${store.state.game.score.toLocaleString("ru")}</h2><div class="score-title">очков</div><div class="result-summary">Ходов: ${store.state.game.moves}${store.state.game.assisted ? " · С подсказкой" : ""}${store.state.game.reviveUsed ? " · После второго шанса" : ""}</div>${bestFinish ? "" : `<div class="result-best">${crown} Рекорд ${bestFor(store.state).toLocaleString("ru")}</div>`}<p>Для этих фигур нет места:</p><div class="result-pieces">${remaining}</div>${revivePlan(store.state.game) ? `<button class="secondary" id="revive-offer">Второй шанс за рекламу</button>` : ""}<button class="primary" id="again">Ещё раз</button><button class="secondary" id="look-board">Посмотреть поле</button>${savedReviveButton()}`,
      "result",
    );
    dialog.dataset.record = String(bestFinish);
    if (bestFinish)
      animate(
        el("dialog-title"),
        [
          { transform: "scale(.9)", opacity: 0.4 },
          { transform: "scale(1)", opacity: 1 },
        ],
        220,
      );
    el("again").onclick = () => void restart();
    dialog
      .querySelector<HTMLButtonElement>("#revive-offer")
      ?.addEventListener("click", showRevive);
    wireSavedRevive();
    ads.preload();
    el("look-board").onclick = close;
  }
  el("lesson-skip").onclick = async () => {
    if (store.busy) return;
    try {
      if (
        await store.update((p) => ({
          ...p,
          revision: p.revision + 1,
          tutorialStep: 4,
        }))
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
  if (!inLesson() && initial.game.status === "over") showResult();
  window.addEventListener("pageshow", () =>
    activity.setBlocked("pagehide", false),
  );
  window.addEventListener("pagehide", () => {
    activity.setBlocked("pagehide", true);
    cancelDrag();
    cancelHint();
    audio.stop();
    stopCosmetics();
  });
  if (import.meta.hot)
    import.meta.hot.dispose(() => {
      void ads.dispose();
      bannerWatch?.dispose();
      phaser?.loop.wake();
      phaser?.destroy(true);
      cancelHint();
      window.removeEventListener("resize", unsubscribeResize);
    });
}
void start().catch((error) => {
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
