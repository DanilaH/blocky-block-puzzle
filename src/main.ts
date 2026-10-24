import Phaser from "phaser";
import { Capacitor, registerPlugin } from "@capacitor/core";
import "./style.css";
import { BoardScene } from "./game/BoardScene";
import { COLORS, tileURL } from "./game/tiles";
import { GameAudio } from "./game/audio";
import {
  applyMove,
  fits,
  newGame,
  shapeById,
  type Move,
  type GameState,
} from "./core/rules";
import { createProfile, dayKey, withHint, type Profile } from "./core/profile";
import { IndexedSave, ProfileStore } from "./platform/save";
import {
  GameplayActivityCoordinator,
  installDocumentVisibilityBlocker,
} from "./vendor/mini-games-kit/activity";
import type { HintResult } from "./core/hints";

const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
const pauseIcon = svg('<path d="M8 5v14M16 5v14"/>');
const bulb = svg(
  '<path d="M9 18h6m-5 3h4M8 14a6 6 0 1 1 8 0c-1 1-1 2-1 2H9s0-1-1-2Z"/>',
);
const crown = svg('<path d="m3 6 4 5 5-7 5 7 4-5-2 12H5Z"/>');
const root = document.querySelector<HTMLDivElement>("#app")!;
const seed = () => crypto.getRandomValues(new Uint32Array(1))[0]!;
const fresh = () => newGame(seed(), crypto.randomUUID());
async function start() {
  const adapter = new IndexedSave();
  const loaded = await adapter.load();
  const initial = loaded.profile ?? createProfile(fresh());
  if (!loaded.profile) await adapter.write(initial);
  const store = new ProfileStore(initial, adapter),
    audio = new GameAudio(),
    scene = new BoardScene();
  root.innerHTML = `<main class="shell"><header class="topbar"><div class="brand"><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>blocky</div><button class="icon" id="pause" aria-label="Пауза">${pauseIcon}</button></header><div class="play-layout"><section class="board-column"><div class="board-wrap"><div id="board" role="img" aria-label="Игровое поле 8 на 8"></div></div><div class="board-caption"><span id="caption"></span><span class="toast" id="toast" role="status"></span></div></section><aside class="side"><section class="score-panel"><div><div class="sr-only">Ваш счёт</div><div class="score" id="score">0</div></div><div class="best">${crown}<span><span class="sr-only">Рекорд </span><b id="best">0</b></span></div><div class="reward-line"><span id="streak"></span><span class="burst" id="burst" aria-hidden="true"></span></div></section><section class="tray-area"><div class="tray-label"><span>Следующие фигуры</span><span id="tray-progress">3 / 3</span></div><div class="tray" id="tray" aria-label="Доступные фигуры"></div></section><section class="hint-area"><button class="hint" id="hint">${bulb}<span id="hint-label">Подсказка</span><span class="hint-count" id="hint-count">3</span></button><button class="hint" id="play-again" hidden>Ещё раз</button></section></aside></div></main><div class="ad-slot" id="ad-slot" aria-hidden="true"></div><div class="floating" id="floating" hidden></div><dialog id="dialog" aria-labelledby="dialog-title"></dialog><span id="announce" class="sr-only" aria-live="polite"></span>`;
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
    } | null = null;
  let currentMove: Move | null = null,
    worker: Worker | null = null,
    hintGeneration = 0,
    toastTimer = 0,
    burstTimer = 0,
    modal = "";
  let running = false;
  let recordCelebrated =
    initial.game.score > 0 && initial.game.score >= initial.best;
  let lastPraise = -Infinity;
  let resultTimer = 0,
    resultPending = false;
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
    cosmetic.forEach((a) => a.cancel());
    cosmetic.clear();
    clearTimeout(burstTimer);
    el("burst").textContent = "";
    scene.stopEffects();
  }
  const activity = new GameplayActivityCoordinator(
    () => {
      running = true;
      if (resultPending)
        queueMicrotask(() => {
          if (running && resultPending && !dialog.open) showResult();
        });
    },
    () => {
      running = false;
      clearTimeout(resultTimer);
      cancelDrag();
      cancelHint();
      audio.stop();
      stopCosmetics();
    },
  );
  activity.setGameplayDesired(true);
  installDocumentVisibilityBlocker(activity);
  const phaser = new Phaser.Game({
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
    fps: { target: 60 },
  });
  const unsubscribeResize = () => {
    cancelDrag();
    cancelHint();
    requestAnimationFrame(render);
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
      render();
    },
    true,
  );
  function toast(message: string) {
    clearTimeout(toastTimer);
    if (dialog.open) {
      const status = dialog.querySelector<HTMLElement>(".dialog-status");
      if (status) status.textContent = message;
      return;
    }
    el("toast").textContent = message;
    toastTimer = window.setTimeout(() => (el("toast").textContent = ""), 3500);
  }
  function hintMove() {
    const h = store.state.hint;
    return h?.gameId === store.state.game.gameId &&
      h.revision === store.state.game.revision
      ? h.move
      : null;
  }
  function mini(slot: number, cell: number) {
    const piece = store.state.game.tray[slot]!,
      shape = shapeById(piece.shapeId);
    return `<span class="mini-shape" style="grid-template-columns:repeat(${shape.width},${cell}px);grid-template-rows:repeat(${shape.height},${cell}px)">${shape.cells.map(([x, y]) => `<img draggable="false" alt="" class="mini-cell" style="grid-column:${x + 1};grid-row:${y + 1}" src="${tileURL(COLORS[piece.color]!)}">`).join("")}</span>`;
  }
  function render() {
    const p = store.state,
      g = p.game;
    el("score").textContent = g.score.toLocaleString("ru");
    el("best").textContent = p.best.toLocaleString("ru");
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
    const hintSlot = hintMove()?.slot;
    el("hint").classList.toggle(
      "depleted",
      Number(el("hint-count").textContent) === 0 && hintSlot === undefined,
    );
    tray.innerHTML = g.tray
      .map(
        (s, i) =>
          `<button class="piece${s.used ? " used" : ""}${selected === i ? " selected" : ""}${hintSlot === i ? " hinted" : ""}" data-slot="${i}" aria-label="Фигура ${i + 1}: ${s.shapeId}" ${s.used || g.status === "over" ? "disabled" : ""}>${s.used ? "" : mini(i, cell)}</button>`,
      )
      .join("");
    if (focused !== undefined)
      tray
        .querySelector<HTMLButtonElement>(`[data-slot="${focused}"]`)
        ?.focus({ preventScroll: true });
    audio.enabled = p.settings.sound;
    scene.calm =
      p.settings.calm || matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.documentElement.classList.toggle("calm", scene.calm);
    scene.setState(g);
    scene.preview(hintMove(), true, true);
    el("hint").toggleAttribute("disabled", g.status === "over");
    el("play-again").hidden = g.status !== "over";
    el("hint").hidden = g.status === "over";
    el("streak").textContent = g.streak > 1 ? `Серия ×${g.streak}` : "";
    el("score").classList.toggle("compact", g.score >= 100000);
    el("caption").textContent =
      g.status === "over"
        ? "Для этих фигур нет места"
        : g.moves === 0
          ? "Перенесите фигуру на поле"
          : "";
    el("hint-label").textContent = worker
      ? "Ищем ход…"
      : Number(el("hint-count").textContent) === 0
        ? "Подсказки завтра"
        : "Подсказка";
  }
  function cancelHint() {
    hintGeneration++;
    worker?.terminate();
    worker = null;
    el("hint").removeAttribute("aria-busy");
    el("hint-label").textContent = "Подсказка";
  }
  function cancelDrag() {
    drag = null;
    currentMove = null;
    selected = null;
    floating.getAnimations().forEach((a) => a.cancel());
    floating.hidden = true;
    el("tray").classList.remove("dragging");
    document
      .querySelectorAll(".piece.selected")
      .forEach((e) => e.classList.remove("selected"));
    scene.preview(hintMove(), true, true);
  }
  async function commit(move: Move, revision: number) {
    if (!running || store.busy) return;
    cancelHint();
    const before = store.state.game;
    const previousBest = store.state.best;
    const piece = before.tray[move.slot];
    const placedCells = piece
      ? shapeById(piece.shapeId).cells.map(
          ([x, y]) => (move.y + y) * 8 + move.x + x,
        )
      : [];
    const effectBoard = [...before.board];
    if (piece) for (const i of placedCells) effectBoard[i] = piece.color;
    const outcome: { result: ReturnType<typeof applyMove> } = { result: null };
    try {
      const changed = await store.update((p) => {
        const result = applyMove(p.game, move, revision);
        outcome.result = result;
        return result
          ? {
              ...p,
              revision: p.revision + 1,
              game: result.state,
              best: Math.max(p.best, result.state.score),
              hint: null,
            }
          : null;
      });
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
      const event = outcome.result!;
      const newRecord =
        !recordCelebrated &&
        previousBest > 0 &&
        event.state.score > previousBest;
      if (newRecord) recordCelebrated = true;
      render();
      if (running) {
        if (before.tray.filter((s) => s.used).length === 2)
          document.querySelectorAll(".piece .mini-shape").forEach((e, i) =>
            animate(
              e,
              [
                { opacity: 0, transform: "translateY(10px) scale(.7)" },
                { opacity: 1, transform: "none" },
              ],
              180,
              i * 35,
            ),
          );
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
        );
        scene.impact(
          placedCells,
          event.cells,
          effectBoard,
          event.lines,
          event.allClear,
        );
        animate(
          el("score"),
          [
            { transform: "scale(1)" },
            { transform: "scale(1.07)" },
            { transform: "scale(1)" },
          ],
          200,
        );
        const praise = event.allClear
          ? "Чистое поле!"
          : newRecord
            ? "Новый рекорд!"
            : event.lines >= 3
              ? `Отлично! ×${event.lines}`
              : event.lines === 2
                ? "Комбо ×2"
                : "";
        clearTimeout(burstTimer);
        el("burst")
          .getAnimations()
          .forEach((a) => a.cancel());
        const showPraise =
          praise &&
          (newRecord ||
            event.allClear ||
            performance.now() - lastPraise > 2000);
        el("burst").textContent =
          `${showPraise ? praise + "  " : ""}+${event.points}`;
        if (praise && performance.now() - lastPraise > 2000)
          lastPraise = performance.now();
        animate(
          el("burst"),
          [
            { opacity: 0, transform: "translateY(6px) scale(.85)" },
            { opacity: 1, transform: "none", offset: 0.18 },
            { opacity: 1, offset: 0.75 },
            { opacity: 0, transform: "translateY(-4px)" },
          ],
          900,
        );
        burstTimer = window.setTimeout(
          () => (el("burst").textContent = ""),
          950,
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
              if (running && resultPending && !dialog.open) showResult();
            },
            scene.calm ? 220 : 700,
          );
      }
    } catch {
      toast("Не удалось сохранить ход. Попробуйте ещё раз.");
      render();
    }
  }
  function locate(event: PointerEvent, slot: number, touch: boolean): Move {
    const rect = canvasBox.getBoundingClientRect(),
      cell = rect.width / 8,
      shape = shapeById(store.state.game.tray[slot]!.shapeId);
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
    floating.style.left = `${left}px`;
    floating.style.top = `${top}px`;
    return {
      slot,
      x: Math.round((left - rect.left) / cell),
      y: Math.round((top - rect.top) / cell),
    };
  }
  el("tray").addEventListener("pointerdown", (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>(
      "[data-slot]",
    );
    if (
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
    render();
    const rect = canvasBox.getBoundingClientRect();
    floating.getAnimations().forEach((a) => a.cancel());
    floating.innerHTML = mini(selected, rect.width / 8);
    floating.hidden = false;
    el("tray").classList.add("dragging");
    drag = {
      id: event.pointerId,
      slot: selected,
      startX: event.clientX,
      startY: event.clientY,
      revision: store.state.game.revision,
      touch: event.pointerType === "touch",
      moved: false,
    };
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
      currentMove = locate(event, drag.slot, drag.touch);
      scene.preview(currentMove);
    },
    { passive: false },
  );
  window.addEventListener("pointerup", (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    el("tray").classList.remove("dragging");
    const previous = drag;
    const move = locate(event, previous.slot, previous.touch);
    drag = null;
    floating.hidden = true;
    if (previous.moved) {
      selected = null;
      currentMove = null;
      const slot = store.state.game.tray[move.slot];
      if (
        slot &&
        fits(store.state.game.board, shapeById(slot.shapeId), move.x, move.y)
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
      }
    } else {
      render();
      scene.preview(hintMove(), true, true);
    }
  });
  window.addEventListener("pointercancel", () => cancelDrag());
  canvasBox.addEventListener("pointerdown", (event) => {
    if (selected === null || drag || !running || event.button !== 0) return;
    const rect = canvasBox.getBoundingClientRect(),
      cell = rect.width / 8,
      move = {
        slot: selected,
        x: Math.floor((event.clientX - rect.left) / cell),
        y: Math.floor((event.clientY - rect.top) / cell),
      };
    void commit(move, store.state.game.revision);
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
      void commit(m, store.state.game.revision);
    }
  });
  el("hint").addEventListener("click", () => {
    if (!running || store.busy || worker) return;
    cancelDrag();
    const cached = hintMove();
    if (cached) {
      scene.preview(cached, true, true);
      toast("Этот вариант уже открыт");
      return;
    }
    const p = store.state;
    if ((p.freeDay === dayKey() ? p.freeHints : 3) + p.earnedHints <= 0) {
      toast("На сегодня подсказки закончились. Завтра будут ещё три.");
      return;
    }
    const generation = ++hintGeneration;
    const snapshot = structuredClone(p.game);
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
      el("hint").removeAttribute("aria-busy");
      if (generation !== hintGeneration || !running) return;
      const r = event.data;
      if (!r.move) {
        toast("Для оставшихся фигур нет места");
        return;
      }
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
      } catch {
        toast("Не удалось сохранить подсказку. Кредит не списан.");
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
    dialog.close();
    modal = "";
    activity.setBlocked("dialog", false);
    render();
  }
  function back() {
    if (dialog.open) {
      if (modal === "rules" || modal === "restart") {
        dialog.close();
        showPause();
      } else close();
    } else if (resultPending) showResult();
    else showPause();
  }
  function showPause() {
    if (dialog.open) return;
    if (resultPending) {
      showResult();
      return;
    }
    open(
      `<h2 id="dialog-title">Пауза</h2><p>Партия сохранена</p><label class="setting">Звуковые эффекты<input id="sound" type="checkbox" ${store.state.settings.sound ? "checked" : ""}></label><label class="setting">Спокойные эффекты<input id="calm" type="checkbox" ${store.state.settings.calm ? "checked" : ""}></label><button class="primary" id="resume">Продолжить</button><button class="secondary" id="rules">Как играть</button><button class="secondary" id="restart">Новая партия</button>`,
      "pause",
    );
    el("resume").onclick = close;
    el("rules").onclick = showRules;
    el("restart").onclick = confirmRestart;
    for (const key of ["sound", "calm"] as const)
      el<HTMLInputElement>(key).onchange = async (event) => {
        const value = (event.target as HTMLInputElement).checked;
        dialog.querySelector<HTMLElement>(".dialog-status")!.textContent = "";
        try {
          await store.update((p) => ({
            ...p,
            revision: p.revision + 1,
            settings: { ...p.settings, [key]: value },
          }));
          render();
        } catch {
          toast("Настройка не сохранена");
          (event.target as HTMLInputElement).checked =
            store.state.settings[key];
        }
      };
  }
  function showRules() {
    modal = "rules";
    dialog.dataset.kind = "rules";
    dialog.innerHTML = `<h2 id="dialog-title">Как играть</h2><p>Перенесите фигуру на свободные клетки. Полные строки и столбцы исчезают одновременно.</p><p>Используйте все три фигуры — появятся следующие. Очистки подряд увеличивают серию. Поворота и отмены хода нет.</p><p>Можно выбрать фигуру и нажать на её верхнюю левую клетку на поле. С клавиатуры: Enter на фигуре, стрелки, Enter для установки.</p><button class="primary" id="back-pause">Понятно</button>`;
    structureDialog();
    el("back-pause").onclick = () => {
      dialog.close();
      showPause();
    };
  }
  function confirmRestart() {
    modal = "restart";
    dialog.dataset.kind = "restart";
    dialog.innerHTML = `<h2 id="dialog-title">Начать заново?</h2><p>Текущая партия завершится. Рекорд и оставшиеся подсказки сохранятся.</p><button class="primary" id="new-game">Новая партия</button><button class="secondary" id="keep-game">Продолжить текущую</button>`;
    structureDialog();
    el("new-game").onclick = () => void restart();
    el("keep-game").onclick = close;
  }
  async function restart() {
    const status = dialog.querySelector<HTMLElement>(".dialog-status");
    if (status) status.textContent = "";
    try {
      const changed = await store.update((p) => ({
        ...p,
        revision: p.revision + 1,
        game: fresh(),
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
    } catch {
      toast("Не удалось сохранить новую партию. Предыдущая сохранена.");
    }
  }
  function showResult() {
    clearTimeout(resultTimer);
    resultPending = false;
    if (dialog.open) return;
    const bestFinish =
      store.state.game.score > 0 && store.state.game.score >= store.state.best;
    open(
      `<div class="result-heading">${bestFinish ? crown + "Лучший результат" : "Партия завершена"}</div><h2 id="dialog-title" class="result-score">${store.state.game.score.toLocaleString("ru")}</h2><div class="score-title">очков</div><div class="result-best">${crown} Рекорд ${store.state.best.toLocaleString("ru")}</div><p>Для оставшихся фигур нет места.</p><button class="primary" id="again">Ещё раз</button><button class="secondary" id="look-board">Посмотреть поле</button>`,
      "result",
    );
    el("again").onclick = () => void restart();
    el("look-board").onclick = close;
  }
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
      .addListener("appStateChange", (data) =>
        activity.setBlocked("native", data.isActive === false),
      )
      .catch(() => {});
  }
  render();
  if (loaded.recovered) toast("Восстановлена предыдущая целая копия партии.");
  if (initial.game.status === "over") showResult();
  window.addEventListener("pagehide", () => {
    cancelDrag();
    cancelHint();
    audio.stop();
    stopCosmetics();
  });
  if (import.meta.hot)
    import.meta.hot.dispose(() => {
      phaser.destroy(true);
      cancelHint();
      window.removeEventListener("resize", unsubscribeResize);
    });
}
void start().catch((error) => {
  console.error("Boot failed", error);
  root.innerHTML =
    '<div class="boot"><h2>Не удалось открыть игру</h2><p>Данные не удалены. Закройте другие вкладки игры и попробуйте снова.</p><button class="primary" id="retry">Повторить</button></div>';
  document.getElementById("retry")!.onclick = () => location.reload();
});
