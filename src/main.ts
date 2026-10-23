import Phaser from "phaser";
import { Capacitor, registerPlugin } from "@capacitor/core";
import "./style.css";
import { BoardScene, COLORS } from "./game/BoardScene";
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
  root.innerHTML = `<main class="shell"><header class="topbar"><div class="brand"><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>blocky<span class="mode"> / classic</span></div><button class="icon" id="pause" aria-label="Пауза">${pauseIcon}</button></header><div class="play-layout"><section class="board-column"><div class="board-wrap"><div id="board" role="img" aria-label="Игровое поле 8 на 8"></div><div class="burst" id="burst" aria-hidden="true"></div></div><div class="board-caption"><span class="dot"></span><span id="caption">Собирайте полные строки и столбцы</span></div></section><aside class="side"><section class="score-panel"><div><div class="score-title">Ваш счёт</div><div class="score" id="score">0</div></div><div class="best">${crown}<span>Рекорд <b id="best">0</b></span></div></section><section class="tray-area"><div class="tray-label"><span>Следующие фигуры</span><span id="tray-progress">3 / 3</span></div><div class="tray" id="tray" aria-label="Доступные фигуры"></div></section><section class="hint-area"><button class="hint" id="hint">${bulb}<span>Подсказка</span><span class="hint-count" id="hint-count">3</span></button><p class="hint-note">Вариант хода для текущих фигур</p></section><div class="footer-note">8 × 8 · БЕЗ ОГРАНИЧЕНИЯ ВРЕМЕНИ</div></aside></div></main><div class="ad-slot" id="ad-slot" aria-hidden="true"></div><div class="toast" id="toast" role="status"></div><div class="floating" id="floating" hidden></div><dialog id="dialog" aria-labelledby="dialog-title"></dialog><span id="announce" class="sr-only" aria-live="polite"></span>`;
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
  const activity = new GameplayActivityCoordinator(
    () => {
      running = true;
    },
    () => {
      running = false;
      cancelDrag();
      cancelHint();
      audio.stop();
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
    const s = store.state.game.tray[slot]!,
      shape = shapeById(s.shapeId),
      color = "#" + COLORS[s.color]!.toString(16).padStart(6, "0");
    return `<span class="mini-shape" style="grid-template-columns:repeat(${shape.width},${cell}px);grid-template-rows:repeat(${shape.height},${cell}px)">${shape.cells.map(([x, y]) => `<i class="mini-cell" style="grid-column:${x + 1};grid-row:${y + 1};background:${color}"></i>`).join("")}</span>`;
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
    tray.innerHTML = g.tray
      .map(
        (s, i) =>
          `<button class="piece${s.used ? " used" : ""}${selected === i ? " selected" : ""}" data-slot="${i}" aria-label="Фигура ${i + 1}: ${s.shapeId}" ${s.used ? "disabled" : ""}>${s.used ? "" : mini(i, Math.min(15, Math.floor((tray.clientWidth / 3 - 20) / 5)))}</button>`,
      )
      .join("");
    audio.enabled = p.settings.sound;
    scene.calm = p.settings.calm;
    scene.setState(g);
    scene.preview(hintMove());
    el("hint").toggleAttribute("disabled", g.status === "over");
    el("caption").textContent =
      g.streak > 1
        ? `Серия ${g.streak} · продолжайте очистки`
        : "Собирайте полные строки и столбцы";
  }
  function cancelHint() {
    hintGeneration++;
    worker?.terminate();
    worker = null;
    el("hint").removeAttribute("aria-busy");
  }
  function cancelDrag() {
    drag = null;
    currentMove = null;
    selected = null;
    floating.hidden = true;
    document
      .querySelectorAll(".piece.selected")
      .forEach((e) => e.classList.remove("selected"));
    scene.preview(hintMove());
  }
  async function commit(move: Move, revision: number) {
    if (!running || store.busy) return;
    cancelHint();
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
      if (!changed) return;
      const event = outcome.result!;
      render();
      if (running) {
        audio.play(
          event.lines > 1 ? "combo" : event.lines ? "clear" : "place",
          event.state.streak,
        );
        scene.flash(event.cells, 0xc7f7de);
        if (event.lines) {
          const burst = el("burst");
          clearTimeout(burstTimer);
          burst.innerHTML = event.allClear
            ? `Чистое поле<small>+${event.points}</small>`
            : event.lines > 1
              ? `Комбо ×${event.lines}<small>+${event.points}</small>`
              : `+${event.points}`;
          burstTimer = window.setTimeout(() => (burst.textContent = ""), 700);
        }
      }
      el("announce").textContent =
        `Счёт ${event.state.score}. ${event.lines ? "Очищено линий: " + event.lines : ""}`;
      if (event.state.status === "over" && !dialog.open) showResult();
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
        event.clientY - (touch ? shape.height + 1.2 : shape.height / 2) * cell;
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
    floating.innerHTML = mini(selected, rect.width / 8 - 2);
    floating.hidden = false;
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
        render();
      }
    } else {
      scene.preview(hintMove());
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
    selected = null;
    void commit(move, store.state.game.revision);
  });
  el("tray").addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const b = (event.target as Element).closest<HTMLButtonElement>(
      "[data-slot]",
    );
    if (b && !b.disabled) {
      event.preventDefault();
      selected = Number(b.dataset.slot);
      currentMove = { slot: selected, x: 0, y: 0 };
      scene.preview(currentMove);
    }
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !dialog.open) {
      event.preventDefault();
      showPause();
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
      cancelDrag();
      void commit(m, store.state.game.revision);
    }
  });
  el("hint").addEventListener("click", () => {
    if (!running || store.busy || worker) return;
    cancelDrag();
    const cached = hintMove();
    if (cached) {
      scene.preview(cached);
      toast("Этот вариант уже открыт");
      return;
    }
    const p = store.state;
    if ((p.freeDay === dayKey() ? p.freeHints : 3) + p.earnedHints <= 0) {
      toast(
        "На сегодня подсказки закончились. Реклама в этой сборке ещё не подключена.",
      );
      return;
    }
    const generation = ++hintGeneration;
    const snapshot = structuredClone(p.game);
    worker = new Worker(new URL("./game/hint.worker.ts", import.meta.url), {
      type: "module",
    });
    el("hint").setAttribute("aria-busy", "true");
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
    activity.setBlocked("dialog", true);
    dialog.innerHTML = content;
    dialog.showModal();
  }
  function close() {
    dialog.close();
    modal = "";
    activity.setBlocked("dialog", false);
    render();
    if (store.state.game.status === "over") showResult();
  }
  function showPause() {
    if (dialog.open) return;
    open(
      `<div class="score-title">Classic · пауза</div><h2 id="dialog-title">Можно не спешить</h2><p>Партия сохранена. Продолжите с того же места.</p><label class="setting">Звуковые эффекты<input id="sound" type="checkbox" ${store.state.settings.sound ? "checked" : ""}></label><label class="setting">Спокойные эффекты<input id="calm" type="checkbox" ${store.state.settings.calm ? "checked" : ""}></label><button class="primary" id="resume">Продолжить</button><button class="secondary" id="rules">Как играть</button><button class="secondary" id="restart">Новая партия</button>`,
      "pause",
    );
    el("resume").onclick = close;
    el("rules").onclick = showRules;
    el("restart").onclick = confirmRestart;
    for (const key of ["sound", "calm"] as const)
      el<HTMLInputElement>(key).onchange = async (event) => {
        const value = (event.target as HTMLInputElement).checked;
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
    dialog.innerHTML = `<h2 id="dialog-title">Как играть</h2><p>Перенесите фигуру на свободные клетки. Полные строки и столбцы исчезают одновременно.</p><p>Используйте все три фигуры — появятся следующие. Очистки подряд увеличивают серию. Поворота и отмены хода нет.</p><p>Можно выбрать фигуру и нажать на её верхнюю левую клетку на поле. С клавиатуры: Enter на фигуре, стрелки, Enter для установки.</p><button class="primary" id="back-pause">Понятно</button>`;
    el("back-pause").onclick = () => {
      dialog.close();
      showPause();
    };
  }
  function confirmRestart() {
    dialog.innerHTML = `<h2 id="dialog-title">Начать заново?</h2><p>Текущая партия завершится. Рекорд и оставшиеся подсказки сохранятся.</p><button class="primary" id="new-game">Новая партия</button><button class="secondary" id="keep-game">Продолжить текущую</button>`;
    el("new-game").onclick = () => void restart();
    el("keep-game").onclick = close;
  }
  async function restart() {
    try {
      const changed = await store.update((p) => ({
        ...p,
        revision: p.revision + 1,
        game: fresh(),
        hint: null,
      }));
      if (changed) {
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
    open(
      `<div class="score-title">Партия завершена</div><h2 id="dialog-title">${store.state.game.score.toLocaleString("ru")} очков</h2><p>Для оставшихся фигур нет места. Попробуем ещё?</p><button class="primary" id="again">Ещё раз</button><button class="secondary" id="look-board">Посмотреть поле</button>`,
      "result",
    );
    el("again").onclick = () => void restart();
    el("look-board").onclick = () => {
      dialog.close();
      modal = "";
      activity.setBlocked("dialog", false);
    };
  }
  el("pause").onclick = showPause;
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    if (modal === "result") {
      dialog.close();
      modal = "";
      activity.setBlocked("dialog", false);
    } else close();
  });
  if (Capacitor.isNativePlatform()) {
    const native = registerPlugin<{
      addListener(
        name: string,
        listener: (data: { isActive?: boolean }) => void,
      ): Promise<{ remove(): Promise<void> }>;
    }>("App");
    void native
      .addListener("backButton", () => {
        if (dialog.open) close();
        else showPause();
      })
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
