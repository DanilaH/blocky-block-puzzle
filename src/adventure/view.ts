import Phaser from "phaser";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { BoardScene } from "../game/BoardScene";
import { GameAudio } from "../game/audio";
import { GameHaptics, clearHapticLevel } from "../platform/haptics";
import { AudioFocus, nativeAudioFocus } from "../platform/audio-focus";
import { IndexedSave, ProfileStore } from "../platform/save";
import { createProfile, dayKey } from "../core/profile";
import { newGame, shapeById, type GameState, type Move } from "../core/rules";
import { tileURL, COLORS } from "../game/tiles";
import {
  GameplayActivityCoordinator,
  installDocumentVisibilityBlocker,
} from "../vendor/mini-games-kit/activity";
import { LEVELS, levelFor } from "./levels";
import {
  canPlace,
  emptyCampaign,
  occupied,
  step,
  type Attempt,
  type Events,
  type GoalKind,
  type CampaignHint,
} from "./core";
import { beginLevel, acceptMove, acceptHint } from "./save";
import "./view.css";
const names = { gem: "Кристаллы", key: "Ключи", ice: "Лёд" };
const icon = (kind: string) =>
  kind === "ice"
    ? '<span class="ice-icon">❄</span>'
    : `<img src="/adventure/${kind}.webp" alt="" draggable="false">`;
function presentation(a: Attempt): GameState {
  return {
    gameId: a.id,
    revision: a.revision,
    board: occupied(a),
    tray: a.tray,
    score: a.score,
    streak: a.streak,
    moves: a.moves,
    rngState: 1,
    dealerVersion: "initial-v1",
    status: a.status === "lost" ? "over" : "playing",
    reviveUsed: false,
    assisted: false,
    dealerFallbacks: 0,
  };
}
export async function startCampaign() {
  const adapter = new IndexedSave(),
    loaded = await adapter.load();
  const initial =
    loaded.profile ?? createProfile(newGame(123, crypto.randomUUID()));
  if (!loaded.profile) await adapter.write(initial);
  const store = new ProfileStore(initial, adapter),
    root = document.querySelector<HTMLElement>("#app")!;
  document.body.classList.add("adventure-mode");
  root.innerHTML = `<main class="adventure"><header class="adv-header"><button id="adv-back" aria-label="К выбору режима">‹</button><div><small>ПРИКЛЮЧЕНИЕ · ГЛАВА 1</small><strong id="adv-title">Кристальная бухта</strong></div><button id="adv-pause" aria-label="Настройки и пауза">Ⅱ</button></header><section id="adv-chapter"></section><section id="adv-play" hidden><div class="adv-goals" id="adv-goals" aria-live="polite"></div><div class="adv-layout"><div class="adv-field-column"><div class="adv-board-wrap"><div id="adv-board" aria-label="Поле 8 на 8"></div><div id="adv-objects" aria-hidden="true"></div><div id="adv-input" role="group" aria-label="Клетки поля"></div></div><div class="adv-series" id="adv-series"></div></div><aside class="adv-controls"><p id="adv-lesson"></p><div id="adv-tray" class="adv-tray"></div><div class="adv-tools"><button id="adv-hint">Подсказать</button><span id="adv-stock"></span></div><p id="adv-status" role="status"></p></aside></div></section><div id="adv-result" hidden></div></main><div id="adv-fx" aria-hidden="true"></div><div id="adv-ghost" hidden></div><dialog id="adv-dialog"></dialog>`;
  const el = <T extends HTMLElement = HTMLElement>(id: string) =>
    document.getElementById(id) as T;
  const scene = new BoardScene(),
    audio = new GameAudio(),
    haptics = new GameHaptics();
  const focus = new AudioFocus(nativeAudioFocus(), (v) => audio.setAllowed(v));
  audio.beforeUnlock = () => focus.request();
  let running = false,
    ready = false,
    playing = false,
    selected: number | null = null,
    job: Worker | null = null,
    generation = 0;
  let drag: {
    id: number;
    slot: number;
    x: number;
    y: number;
    moved: boolean;
    rect: DOMRect;
  } | null = null;
  const animations = new Set<Animation>();
  const dialog = el<HTMLDialogElement>("adv-dialog");
  const cancelHint = () => {
    generation++;
    job?.terminate();
    job = null;
  };
  const cancelDrag = () => {
    drag = null;
    el("adv-ghost").hidden = true;
    scene.preview(null);
  };
  const activity = new GameplayActivityCoordinator(
    () => {
      running = true;
      focus.setActive(audio.audible);
      haptics.setActive(store.state.settings.haptics !== false && !scene.calm);
      if (ready) game.loop.wake();
    },
    () => {
      running = false;
      cancelDrag();
      cancelHint();
      audio.stop();
      focus.setActive(false);
      haptics.setActive(false);
      for (const a of animations) a.cancel();
      animations.clear();
      el("adv-fx").replaceChildren();
      if (ready) {
        scene.stopEffects();
        game.loop.sleep();
      }
    },
  );
  const configure = () => {
    const s = store.state.settings;
    scene.calm =
      s.calm || matchMedia("(prefers-reduced-motion: reduce)").matches;
    audio.calm = scene.calm;
    audio.enabled = s.sound;
    audio.configure(
      s.musicVolume ?? (s.sound ? 0.35 : 0),
      s.effectsVolume ?? 1,
    );
    haptics.setActive(running && s.haptics !== false && !scene.calm);
    document.body.classList.toggle("adv-calm", scene.calm);
  };
  configure();
  const assets = ["cove", "gem", "key", "locked", "open"].map(
    (n) =>
      new Promise<void>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve();
        i.onerror = () => reject(Error(`Asset ${n}`));
        i.src = `/adventure/${n}.webp`;
      }),
  );
  scene.onTexturesReady = () => {
    ready = true;
    renderAttempt();
    if (!running) game.loop.sleep();
  };
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    width: 512,
    height: 512,
    parent: "adv-board",
    transparent: true,
    scene,
    antialias: true,
    banner: false,
    audio: { noAudio: true },
    scale: { mode: Phaser.Scale.NONE, resizeInterval: Infinity },
    fps: { target: 60, limit: 60 },
  });
  const resize = new ResizeObserver(() => {
    game.scale.dirty = true;
    cancelDrag();
  });
  resize.observe(el("adv-board"));
  installDocumentVisibilityBlocker(activity);
  window.addEventListener("blur", () => activity.setBlocked("blur", true));
  window.addEventListener("focus", () => activity.setBlocked("blur", false));
  window.addEventListener("pagehide", () =>
    activity.setBlocked("pagehide", true),
  );
  window.addEventListener("pageshow", () =>
    activity.setBlocked("pagehide", false),
  );
  if (Capacitor.isNativePlatform()) {
    void App.addListener("appStateChange", (s) =>
      activity.setBlocked("native", !s.isActive),
    );
    void App.addListener("backButton", () => {
      if (dialog.open) closeDialog();
      else if (playing) chapter();
      else location.assign(location.pathname);
    });
  }
  el("adv-board").addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    activity.setBlocked("webgl", true);
  });
  el("adv-board").addEventListener("webglcontextrestored", () =>
    activity.setBlocked("webgl", false),
  );
  const report = (message: string) => {
    el("adv-status").textContent = message;
  };
  function animate(node: HTMLElement, frames: Keyframe[], duration: number) {
    if (scene.calm) return;
    const a = node.animate(frames, {
      duration,
      easing: "cubic-bezier(.2,.7,.3,1)",
      fill: "both",
    });
    animations.add(a);
    a.onfinish = () => {
      animations.delete(a);
      node.remove();
    };
    a.oncancel = () => node.remove();
  }
  function label(text: string, cell: number, kind = "reward") {
    const labels = el("adv-fx").querySelectorAll(".adv-reward");
    if (labels.length >= 2) labels[0]!.remove();
    if (el("adv-fx").childElementCount > 36) return;
    const rect = el("adv-board").getBoundingClientRect(),
      n = document.createElement("strong");
    n.className = `adv-reward ${kind}`;
    n.textContent = text;
    n.style.left = `${rect.left + rect.width / 2}px`;
    n.style.top = `${rect.top + ((Math.floor(cell / 8) + 0.5) * rect.height) / 8}px`;
    el("adv-fx").append(n);
    if (scene.calm) {
      n.remove();
      report(text);
      return;
    }
    animate(
      n,
      [
        { opacity: 0, transform: "translate(-50%,15px) scale(.65)" },
        {
          opacity: 1,
          transform: "translate(-50%,-8px) scale(1.12)",
          offset: 0.15,
        },
        {
          opacity: 1,
          transform: "translate(-50%,-18px) scale(1)",
          offset: 0.75,
        },
        { opacity: 0, transform: "translate(-50%,-42px) scale(.95)" },
      ],
      2100,
    );
  }
  function fly(kind: string, cell: number, toCell?: number) {
    if (scene.calm || el("adv-fx").childElementCount > 32) return;
    const r = el("adv-board").getBoundingClientRect(),
      target =
        toCell === undefined ? el("adv-goals").getBoundingClientRect() : r;
    const x = r.left + (((cell % 8) + 0.5) * r.width) / 8,
      y = r.top + ((Math.floor(cell / 8) + 0.5) * r.height) / 8;
    const tx =
        toCell === undefined
          ? target.left + target.width / 2
          : r.left + (((toCell % 8) + 0.5) * r.width) / 8,
      ty =
        toCell === undefined
          ? target.top + target.height / 2
          : r.top + ((Math.floor(toCell / 8) + 0.5) * r.height) / 8;
    const n = document.createElement("div");
    n.className = "adv-fly";
    n.innerHTML = icon(kind);
    n.style.left = `${x}px`;
    n.style.top = `${y}px`;
    el("adv-fx").append(n);
    animate(
      n,
      [
        { transform: "translate(-50%,-50%) scale(.8)", opacity: 1 },
        {
          transform: "translate(-50%,-100%) scale(1.5)",
          opacity: 1,
          offset: 0.2,
        },
        {
          transform: `translate(calc(-50% + ${tx - x}px),calc(-50% + ${ty - y}px)) scale(.45)`,
          opacity: 0,
        },
      ],
      850,
    );
  }
  function iceBurst(cells: number[]) {
    if (scene.calm) return;
    const r = el("adv-board").getBoundingClientRect();
    for (const [j, cell] of cells.slice(0, 6).entries())
      for (let k = 0; k < 3; k++) {
        if (el("adv-fx").childElementCount >= 36) return;
        const n = document.createElement("i");
        n.className = "adv-shard";
        n.style.left = `${r.left + (((cell % 8) + 0.5) * r.width) / 8}px`;
        n.style.top = `${r.top + ((Math.floor(cell / 8) + 0.5) * r.height) / 8}px`;
        el("adv-fx").append(n);
        const dx = (k - 1) * 42 + j * 3,
          dy = -24 - k * 15;
        animate(
          n,
          [
            { opacity: 1, transform: "scale(1.2)" },
            {
              opacity: 1,
              transform: `translate(${dx}px,${dy}px) rotate(${k * 95}deg)`,
              offset: 0.45,
            },
            {
              opacity: 0,
              transform: `translate(${dx * 1.7}px,${45 + k * 8}px) rotate(${k * 160 + 70}deg) scale(.3)`,
            },
          ],
          650,
        );
      }
  }
  function effects(a: Attempt, e: Events) {
    if (!running || !ready) return;
    scene.impact(e.placed, e.cleared, e.board, e.lines, a.status === "won");
    audio.setSeries(a.streak);
    iceBurst(e.cracked);
    audio.play(
      e.lines ? (a.streak > 1 ? "combo" : "clear") : "place",
      a.streak,
      a.score,
      Math.min(1, a.streak / 8),
    );
    const kind =
      a.status === "won"
        ? "victory"
        : e.unlocked.length
          ? "unlock"
          : e.cracked.length
            ? "ice"
            : e.collected.length
              ? "collect"
              : e.lines
                ? "clear"
                : "place";
    haptics.pulse(kind, clearHapticLevel(e.lines, a.streak));
    if (["victory", "unlock", "ice", "collect"].includes(kind))
      audio.play(kind as "victory" | "unlock" | "ice" | "collect", a.streak);
    for (const o of e.collected.slice(0, 8))
      fly(
        o.kind === "lock" ? "gem" : o.kind,
        o.cell,
        o.kind === "key" ? e.unlocked[0] : undefined,
      );
    for (const cell of e.unlocked) {
      const n = el("adv-objects").children[cell] as HTMLElement;
      const unlockAnimation = n.animate(
        [
          { transform: "scale(.7) rotate(-10deg)" },
          { transform: "scale(1.35) rotate(7deg)" },
          { transform: "none" },
        ],
        { duration: scene.calm ? 0 : 600 },
      );
      animations.add(unlockAnimation);
      unlockAnimation.onfinish = () => animations.delete(unlockAnimation);
    }
    if (e.cracked.length)
      label(
        e.cracked.some((c) => a.ice[c]) ? "ЕЩЁ ОДИН СЛОЙ!" : "ЛЁД РАСКОЛОТ!",
        e.cracked[0]!,
        "ice",
      );
    else if (e.unlocked.length) label("СУНДУК ОТКРЫТ!", e.unlocked[0]!);
    else if (e.collected.length)
      label(`+${e.collected.length} В ЦЕЛЬ!`, e.collected[0]!.cell);
    else if (e.lines)
      label(a.streak > 1 ? `СЕРИЯ ${a.streak}!` : "ОТЛИЧНО!", e.cleared[0]!);
    if (a.status === "won") {
      label("СОКРОВИЩА ТВОИ!", 27, "victory");
      for (let i = 0; i < 12; i++) fly("gem", (i * 13) % 64);
    }
    if (a.status === "lost") {
      scene.defeat(false);
      audio.play("defeat");
      haptics.pulse("defeat");
      label("ПОПРОБУЕМ ЕЩЁ?", 35);
    }
  }
  function chapter() {
    window.scrollTo(0, 0);
    cancelHint();
    cancelDrag();
    selected = null;
    playing = false;
    activity.setGameplayDesired(false);
    el("adv-play").hidden = true;
    el("adv-result").hidden = true;
    el("adv-chapter").hidden = false;
    el("adv-title").textContent = "Кристальная бухта";
    const c = store.state.campaign ?? emptyCampaign(),
      active = c.active;
    el("adv-chapter").innerHTML =
      `<div class="adv-picture" role="img" aria-label="Кристальная бухта: открыто ${c.completed.length} из 5 частей"><img src="/adventure/cove.webp" alt="Маяк в кристальной бухте">${LEVELS.map((l, i) => `<span class="picture-cover ${c.completed.includes(l.id) ? "revealed" : ""}" style="left:${i * 20}%">${i + 1}</span>`).join("")}</div><div class="adv-chapter-copy"><small>СОБЕРИ КАРТИНКУ</small><h1>Свет кристальной бухты</h1><p>${c.completed.length === 5 ? "Бухта открыта! Все пять уровней пройдены. Можно переиграть любимые." : `Открыто ${c.completed.length} из 5 частей. Каждый уровень возвращает бухте немного света.`}</p></div>${active?.status === "playing" ? `<button class="adv-primary" id="adv-continue">Продолжить · ${levelFor(active.levelId).title}</button>` : ""}<div class="adv-levels">${LEVELS.map((l, i) => `<button data-level="${l.id}" ${i > 0 && !c.completed.includes(LEVELS[i - 1]!.id) ? "disabled" : ""}><span>${c.completed.includes(l.id) ? "✓" : i + 1}</span><b>${l.title}</b><small>${c.completed.includes(l.id) ? "Ещё раз" : i > c.completed.length ? "Закрыт" : "Играть"}</small></button>`).join("")}</div><a class="adv-classic" href="${location.pathname}">← Классика · партия сохранена</a>`;
    el("adv-continue")?.addEventListener("click", showAttempt);
    for (const b of el("adv-chapter").querySelectorAll<HTMLButtonElement>(
      "[data-level]",
    ))
      b.onclick = () => {
        if (
          store.state.campaign?.active?.status === "playing" &&
          store.state.campaign.active.moves > 0
        ) {
          openDialog(
            `<h2>Начать уровень заново?</h2><p>Текущая попытка кампании будет заменена. Собранная картинка и Классика сохранятся.</p><button id="adv-confirm">Начать</button><button id="adv-dismiss">Отмена</button>`,
          );
          el("adv-confirm").onclick = () => {
            closeDialog();
            void launch(b.dataset.level!);
          };
        } else void launch(b.dataset.level!);
      };
  }
  async function launch(id: string) {
    activity.setGameplayDesired(false);
    cancelHint();
    cancelDrag();
    for (const a of animations) a.cancel();
    animations.clear();
    el("adv-fx").replaceChildren();
    try {
      await store.waitIdle();
      if (
        await store.update(
          (p) => beginLevel(p, id, crypto.randomUUID()),
          "campaign-start",
        )
      )
        showAttempt();
    } catch {
      openDialog(
        '<h2>Не удалось сохранить</h2><p>Попытка не заменена. Повтори запуск уровня.</p><button id="adv-dismiss">Понятно</button>',
      );
    }
  }
  function showAttempt() {
    window.scrollTo(0, 0);
    playing = true;
    el("adv-chapter").hidden = true;
    el("adv-play").hidden = false;
    configure();
    activity.setGameplayDesired(true);
    renderAttempt();
    void audio.unlock();
  }
  function renderAttempt() {
    const a = store.state.campaign?.active;
    if (!a) return;
    const l = levelFor(a.levelId, a.levelVersion);
    el("adv-title").textContent = `${LEVELS.indexOf(l) + 1}. ${l.title}`;
    el("adv-goals").innerHTML = Object.entries(l.goals)
      .map(
        ([k, v]) =>
          `<div class="adv-goal ${a.collected[k as GoalKind] >= v! ? "done" : ""}" aria-label="${names[k as GoalKind]}: осталось ${Math.max(0, v! - a.collected[k as GoalKind])}">${icon(k)}<span><small>${names[k as GoalKind]}</small><b>${Math.max(0, v! - a.collected[k as GoalKind]) || "✓"}</b></span></div>`,
      )
      .join("");
    el("adv-lesson").textContent = l.lesson;
    el("adv-series").textContent = a.streak
      ? `Серия ${a.streak} · ${3 - a.misses} ${3 - a.misses === 1 ? "ход" : "хода"} до сброса`
      : "Собирай цели, заполняя линии";
    el("adv-stock").textContent =
      `Набор ${a.nextTray} / ${l.trays.length} · ${a.score} очк.`;
    const free = store.state.freeDay === dayKey() ? store.state.freeHints : 3;
    el("adv-hint").textContent =
      `Подсказать · ${free + store.state.earnedHints}`;
    el("adv-objects").innerHTML = Array.from({ length: 64 }, (_, i) => {
      const o = a.objects.find((o) => o.cell === i),
        hp = a.ice[i]!;
      return `<div class="adv-object ${hp ? "frozen" : ""} ${hp === 1 ? "cracked" : ""}" ${hp ? `data-layers="${hp}"` : ""}>${o ? icon(o.kind === "lock" ? (o.open ? "open" : "locked") : o.kind) : ""}</div>`;
    }).join("");
    el("adv-tray").innerHTML = a.tray
      .map((s, i) => {
        const sh = shapeById(s.shapeId);
        return `<button data-slot="${i}" class="adv-piece ${selected === i ? "selected" : ""}" ${s.used || a.status !== "playing" ? "disabled" : ""} aria-label="Фигура ${i + 1}, ${sh.cells.length} клеток"><span style="width:${sh.width * 26}px;height:${sh.height * 26}px">${sh.cells.map(([x, y], j) => `<i style="left:${x * 26}px;top:${y * 26}px;background-image:url('${tileURL(COLORS[s.color]!)}')">${s.items?.find((o) => o.offset === j) ? icon(s.items.find((o) => o.offset === j)!.kind) : ""}</i>`).join("")}</span></button>`;
      })
      .join("");
    for (const b of el("adv-tray").querySelectorAll<HTMLButtonElement>(
      "[data-slot]",
    )) {
      b.onpointerdown = (e) => beginDrag(e, Number(b.dataset.slot));
      b.onclick = (e) => {
        if ((e as PointerEvent).detail === 0) {
          selected = Number(b.dataset.slot);
          renderAttempt();
        }
      };
    }
    if (ready) {
      scene.setTheme(0, "#ffb847");
      scene.setState(presentation(a));
      const h = store.state.campaign?.hint;
      if (h) scene.preview(h.move, true, true);
      else if (a.moves === 0) scene.preview(l.solution[0]!, true, true);
    }
    el("adv-result").hidden = a.status === "playing";
    if (a.status !== "playing") {
      const won = a.status === "won",
        idx = LEVELS.indexOf(l),
        next = LEVELS[idx + 1];
      el("adv-result").innerHTML =
        `<div class="adv-result-card ${won ? "won" : "lost"}"><strong>${won ? "Уровень пройден!" : "Ещё одна попытка?"}</strong>${won ? '<img class="adv-win-picture" src="/adventure/cove.webp" alt="Новая часть Кристальной бухты">' : ""}<p>${won ? (next ? "Часть картинки уже сохранена." : "Все пять частей открыты. Бухта сияет!") : a.reason === "exhausted" ? "Фигуры закончились. Попробуй другой порядок." : "Эти фигуры больше не помещаются. Цели и фигуры можно спланировать иначе."}</p>${won && next ? '<button class="adv-primary" id="adv-next">Следующий уровень →</button>' : ""}${!won ? '<button class="adv-primary" id="adv-retry">Попробовать снова</button>' : ""}<button id="adv-map">К картинке</button></div>`;
      el("adv-next")?.addEventListener("click", () => void launch(next!.id));
      el("adv-retry")?.addEventListener("click", () => void launch(l.id));
      el("adv-map").onclick = chapter;
    }
  }
  async function placeMove(m: Move) {
    const a = store.state.campaign?.active;
    if (!running || !ready || !a || store.busy) return;
    const r = step(levelFor(a.levelId, a.levelVersion), a, m);
    if (!r) {
      audio.play("cancel");
      report("Здесь фигура не помещается. Выбери другое место.");
      return;
    }
    cancelHint();
    selected = null;
    try {
      if (
        await store.update(
          (p) => acceptMove(p, a.id, a.revision, m),
          "campaign-move",
        )
      ) {
        renderAttempt();
        report(r.event.collected.length ? "Цель ближе!" : "");
        effects(r.state, r.event);
      }
    } catch {
      report("Не удалось сохранить ход. Поле не изменено — попробуй ещё раз.");
      renderAttempt();
    }
  }
  function sample(e: PointerEvent) {
    if (!drag) return null;
    const a = store.state.campaign!.active!,
      s = a.tray[drag.slot]!,
      sh = shapeById(s.shapeId),
      r = drag.rect;
    const m = {
      slot: drag.slot,
      x: Math.round(((e.clientX - r.left) / r.width) * 8 - sh.width / 2),
      y: Math.round(
        ((e.clientY - r.top - (e.pointerType === "touch" ? 50 : 0)) /
          r.height) *
          8 -
          sh.height / 2,
      ),
    };
    return m;
  }
  function beginDrag(e: PointerEvent, slot: number) {
    if (!running || !ready || store.busy || drag) return;
    const a = store.state.campaign?.active;
    if (!a || a.status !== "playing" || a.tray[slot]!.used) return;
    e.preventDefault();
    cancelHint();
    selected = slot;
    drag = {
      id: e.pointerId,
      slot,
      x: e.clientX,
      y: e.clientY,
      moved: false,
      rect: el("adv-board").getBoundingClientRect(),
    };
    void audio.unlock();
    audio.play("pick");
    const g = el("adv-ghost");
    g.innerHTML = (e.currentTarget as HTMLElement).innerHTML;
    g.hidden = false;
    g.style.transform = `translate(${e.clientX}px,${e.clientY - 50}px)`;
    for (const b of el("adv-tray").children)
      b.classList.toggle(
        "selected",
        (b as HTMLElement).dataset.slot === String(slot),
      );
  }
  window.addEventListener(
    "pointermove",
    (e) => {
      if (!drag || drag.id !== e.pointerId) return;
      e.preventDefault();
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 7)
        drag.moved = true;
      el("adv-ghost").style.transform =
        `translate(${e.clientX}px,${e.clientY - 50}px)`;
      const m = sample(e);
      if (m) scene.preview(m, canPlace(store.state.campaign!.active!, m));
    },
    { passive: false },
  );
  window.addEventListener("pointerup", (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const moved = drag.moved,
      m = sample(e);
    cancelDrag();
    if (moved && m) void placeMove(m);
  });
  window.addEventListener("pointercancel", cancelDrag);
  el("adv-input").innerHTML = Array.from(
    { length: 64 },
    (_, i) =>
      `<button data-cell="${i}" aria-label="Строка ${Math.floor(i / 8) + 1}, столбец ${(i % 8) + 1}"></button>`,
  ).join("");
  for (const b of el("adv-input").querySelectorAll<HTMLButtonElement>("button"))
    b.onclick = () => {
      if (selected !== null) {
        const cell = Number(b.dataset.cell);
        void placeMove({
          slot: selected,
          x: cell % 8,
          y: Math.floor(cell / 8),
        });
      } else report("Выбери фигуру снизу или перетащи её на поле.");
    };
  el("adv-hint").onclick = () => {
    const a = store.state.campaign?.active;
    if (!running || !a || a.status !== "playing" || job || store.busy) return;
    const cached = store.state.campaign?.hint;
    if (cached) {
      scene.preview(cached.move, true, true);
      report("Контур показывает рекомендуемое место.");
      return;
    }
    if (
      !(store.state.freeDay === dayKey() ? store.state.freeHints : 3) &&
      !store.state.earnedHints
    ) {
      report(
        "На сегодня бесплатные подсказки закончились. Завтра будут ещё три.",
      );
      return;
    }
    const request = {
        mode: "adventure" as const,
        attemptId: a.id,
        levelId: a.levelId,
        levelVersion: a.levelVersion,
        revision: a.revision,
      },
      token = ++generation;
    const worker = new Worker(new URL("./hint.worker.ts", import.meta.url), {
      type: "module",
    });
    job = worker;
    report("Ищем ход к цели…");
    worker.onmessage = async ({
      data,
    }: {
      data: Omit<CampaignHint, "source">;
    }) => {
      worker.terminate();
      if (job !== worker || generation !== token || !running) return;
      job = null;
      try {
        if (
          data.move &&
          (await store.update((p) => acceptHint(p, data), "campaign-hint"))
        ) {
          if (generation === token && running) {
            scene.preview(data.move, true, true);
            selected = data.move.slot;
            report("Рекомендуемый ход: приблизит к цели.");
          }
        }
      } catch {
        report("Подсказка не списана: не удалось сохранить.");
      }
    };
    worker.onerror = () => {
      cancelHint();
      report("Не удалось рассчитать подсказку. Можно повторить.");
    };
    worker.postMessage({ request, state: a });
  };
  function openDialog(html: string) {
    cancelDrag();
    cancelHint();
    activity.setBlocked("dialog", true);
    dialog.innerHTML = html;
    dialog.showModal();
    el("adv-dismiss")?.addEventListener("click", closeDialog);
  }
  function closeDialog() {
    dialog.close();
    activity.setBlocked("dialog", false);
    configure();
  }
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    closeDialog();
  });
  el("adv-pause").onclick = () => {
    const s = store.state.settings;
    openDialog(
      `<h2>Пауза</h2><p>Прогресс сохранён</p><label>Музыка<input id="adv-music" type="range" min="0" max="100" value="${Math.round((s.musicVolume ?? 0.35) * 100)}"></label><label>Эффекты<input id="adv-sound" type="checkbox" ${s.sound ? "checked" : ""}></label><label>Вибрация<input id="adv-haptics" type="checkbox" ${s.haptics !== false ? "checked" : ""}></label><label>Спокойные эффекты<input id="adv-calm" type="checkbox" ${s.calm ? "checked" : ""}></label><p id="adv-settings-status" role="status"></p><button id="adv-dismiss">Продолжить</button><button id="adv-chapter-button">К главе</button>`,
    );
    el("adv-chapter-button").onclick = () => {
      closeDialog();
      chapter();
    };
    for (const [id, key] of [
      ["adv-music", "musicVolume"],
      ["adv-sound", "sound"],
      ["adv-haptics", "haptics"],
      ["adv-calm", "calm"],
    ] as const)
      el<HTMLInputElement>(id).onchange = async () => {
        const input = el<HTMLInputElement>(id),
          value =
            key === "musicVolume" ? Number(input.value) / 100 : input.checked;
        try {
          await store.waitIdle();
          await store.update((p) => ({
            ...p,
            revision: p.revision + 1,
            settings: { ...p.settings, [key]: value },
          }));
          configure();
        } catch {
          el("adv-settings-status").textContent =
            "Не удалось сохранить настройку.";
          input.checked = Boolean(store.state.settings[key]);
        }
      };
  };
  el("adv-back").onclick = () => {
    if (playing) chapter();
    else location.assign(location.pathname);
  };
  await Promise.all(assets);
  chapter();
  if (import.meta.env.DEV)
    (window as any).__adventure = {
      store,
      showAttempt,
      chapter,
      launch,
      levels: LEVELS,
    };
}
