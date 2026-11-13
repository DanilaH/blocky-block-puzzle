import type { Atmosphere } from "./atmosphere";
import type { BoardScene } from "./BoardScene";
import { THEMES } from "./themes";

const GRID = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Crect x='1' y='1' width='62' height='62' rx='3' fill='black' fill-opacity='.066666667'/%3E%3C/svg%3E")`;
type Frame = {
  key: string;
  color: string;
  image?: HTMLImageElement | HTMLCanvasElement;
  grid?: boolean;
  stripes?: boolean;
};

/** Two painted surfaces; only the old surface's opacity changes during a fade.
 * Rapid interruptions flatten once into one of two reusable bounded canvases.
 * No frame-by-frame canvas painting or JS animation loop is added. */
export class PreparedSurface {
  private baseFrame: Frame | null = null;
  private overlayFrame: Frame | null = null;
  private effect: Animation | null = null;
  private snapshots: HTMLCanvasElement[] = [];
  private serial = 0;
  transitions = 0;
  flattenings = 0;
  constructor(
    readonly base: HTMLElement,
    readonly overlay: HTMLElement,
    private easing = "linear",
  ) {
    base.classList.add("prepared-surface");
    overlay.classList.add("prepared-surface");
    overlay.hidden = true;
  }
  private mount(node: HTMLElement, frame: Frame) {
    node.style.backgroundColor = frame.color;
    node.style.backgroundImage = frame.grid ? GRID : frame.image ? "none" : "";
    node.style.backgroundSize = frame.grid ? "12.5% 12.5%" : "";
    node.replaceChildren(...(frame.image ? [frame.image] : []));
  }
  private paint(
    g: CanvasRenderingContext2D,
    f: Frame,
    width: number,
    height: number,
  ) {
    g.fillStyle = f.color;
    g.fillRect(0, 0, width, height);
    if (f.image) {
      const iw =
        f.image instanceof HTMLImageElement
          ? f.image.naturalWidth
          : f.image.width;
      const ih =
        f.image instanceof HTMLImageElement
          ? f.image.naturalHeight
          : f.image.height;
      const scale = Math.max(width / iw, height / ih);
      g.drawImage(
        f.image,
        (width - iw * scale) / 2,
        (height - ih * scale) / 2,
        iw * scale,
        ih * scale,
      );
    }
    if (f.grid) {
      g.fillStyle = "rgba(0,0,0,.066666667)";
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 8; x++) {
          g.beginPath();
          g.roundRect(
            ((x + 0.015625) * width) / 8,
            ((y + 0.015625) * height) / 8,
            (62 * width) / 512,
            (62 * height) / 512,
            (3 * width) / 512,
          );
          g.fill();
        }
    } else if (f.stripes && !f.image) {
      // The original faint CSS stripes are decorative, not game geometry.
      g.save();
      g.strokeStyle = "#ffffff02";
      g.lineWidth = 1;
      for (let at = -height; at < width + height; at += 4 * Math.SQRT2) {
        g.beginPath();
        g.moveTo(at, 0);
        g.lineTo(at - height, height);
        g.stroke();
      }
      g.restore();
    }
  }
  private flatten(): Frame {
    const bounds = this.base.getBoundingClientRect();
    const ratio = Math.min(
      devicePixelRatio,
      3,
      Math.sqrt(4_194_304 / Math.max(1, bounds.width * bounds.height)),
    );
    const width = Math.max(1, Math.round(bounds.width * ratio));
    const height = Math.max(1, Math.round(bounds.height * ratio));
    const index = this.overlayFrame?.image === this.snapshots[0] ? 1 : 0;
    const canvas = (this.snapshots[index] ??= document.createElement("canvas"));
    canvas.width = width;
    canvas.height = height;
    const g = canvas.getContext("2d")!;
    this.paint(g, this.baseFrame!, width, height);
    if (this.overlayFrame) {
      const progress = this.effect?.effect?.getComputedTiming().progress ?? 1;
      const alpha = 1 - Number(progress);
      let source = this.overlayFrame.image;
      if (!source) {
        const scratch = (this.snapshots[1 - index] ??=
          document.createElement("canvas"));
        scratch.width = width;
        scratch.height = height;
        this.paint(scratch.getContext("2d")!, this.overlayFrame, width, height);
        source = scratch;
      }
      const iw =
        source instanceof HTMLImageElement ? source.naturalWidth : source.width;
      const ih =
        source instanceof HTMLImageElement
          ? source.naturalHeight
          : source.height;
      const scale = Math.max(width / iw, height / ih);
      g.globalAlpha = alpha;
      g.drawImage(
        source,
        (width - iw * scale) / 2,
        (height - ih * scale) / 2,
        iw * scale,
        ih * scale,
      );
      g.globalAlpha = 1;
    }
    this.flattenings++;
    return {
      key: `snapshot-${++this.serial}`,
      color: "transparent",
      image: canvas,
    };
  }
  private cancelEffect() {
    const effect = this.effect;
    this.effect = null;
    if (effect) {
      effect.onfinish = null;
      effect.cancel();
    }
  }
  set(frame: Frame, duration: number) {
    if (this.baseFrame?.key === frame.key) {
      if (!duration) this.finish();
      return;
    }
    const from = this.effect ? this.flatten() : this.baseFrame;
    this.cancelEffect();
    this.baseFrame = frame;
    this.mount(this.base, frame);
    this.overlayFrame = from;
    if (!from || !duration) {
      this.finish();
      return;
    }
    this.mount(this.overlay, from);
    this.overlay.hidden = false;
    this.overlay.style.opacity = "1";
    this.overlay.style.willChange = "opacity";
    const effect = this.overlay.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration,
      easing: this.easing,
      fill: "forwards",
    });
    this.effect = effect;
    this.transitions++;
    effect.onfinish = () => {
      if (this.effect === effect) this.finish();
    };
  }
  finish() {
    this.cancelEffect();
    this.overlay.hidden = true;
    this.overlay.style.opacity = "0";
    this.overlay.style.removeProperty("will-change");
    this.overlay.replaceChildren();
    this.overlayFrame = null;
    for (const canvas of this.snapshots) canvas.width = canvas.height = 0;
  }
  reset() {
    this.finish();
    this.baseFrame = null;
  }
  snapshot() {
    return {
      target: this.baseFrame?.key,
      active: !!this.effect,
      visibleLayers: this.overlay.hidden ? 1 : 2,
      transitions: this.transitions,
      flattenings: this.flattenings,
      snapshotBuffers: this.snapshots.length,
      snapshotRgbaBytes: this.snapshots.reduce(
        (n, c) => n + c.width * c.height * 4,
        0,
      ),
    };
  }
}

export type SurfaceMode = "original" | "flat" | "generated";

async function decoded(src: string, timeoutMs = 2000) {
  const image = new Image();
  let timer = 0;
  try {
    image.src = src;
    await Promise.race([
      image.decode(),
      new Promise<never>((_, reject) => {
        timer = window.setTimeout(
          () => reject(Error("background-timeout")),
          timeoutMs,
        );
      }),
    ]);
    return image;
  } catch {
    image.src = "";
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Installs once per game. Both decoded images are reused across modes; a failed
 * pair falls back to the original renderer, without blocking boot indefinitely. */
export async function installPreparedSurfaces(
  atmosphere: Atmosphere,
  scene: BoardScene,
  requestedMode: SurfaceMode,
) {
  const started = performance.now();
  const backgrounds = [
    ...document.querySelectorAll<HTMLElement>(".world-background"),
  ];
  if (backgrounds.length !== 2)
    throw Error("Expected two existing world backgrounds");
  const [base, overlay] = backgrounds;
  const images = new Map<number, HTMLImageElement>();
  if (requestedMode === "generated") {
    const pair = await Promise.all([
      decoded("/backgrounds/porcelain-v1.webp"),
      decoded("/backgrounds/polar-night-v1.webp"),
    ]);
    if (pair.every(Boolean)) {
      images.set(1, pair[0]!);
      images.set(5, pair[1]!);
    }
  }
  const artReady = images.size === 2;
  const fallbackReason =
    requestedMode === "generated" && !artReady ? "art-unavailable" : null;
  const board = document.querySelector<HTMLElement>("#board")!;
  const a = document.createElement("div"),
    b = document.createElement("div");
  a.className = b.className = "prepared-board-surface";
  board.parentElement!.prepend(a, b);
  for (const layer of [a, b]) {
    layer.setAttribute("aria-hidden", "true");
    layer.style.borderRadius = getComputedStyle(board).borderRadius;
  }
  const page = new PreparedSurface(base!, overlay!, "ease");
  const bed = new PreparedSurface(a, b);
  const pageFrames = THEMES.map(
    (t, i): Frame => ({
      key: String(i),
      color: t.bg,
      image: images.get(i),
      stripes: true,
    }),
  );
  const boardFrames = THEMES.map(
    (t, i): Frame => ({
      key: String(i),
      color: "#" + t.board.toString(16).padStart(6, "0"),
      grid: true,
    }),
  );
  const setPage = (index: number, duration: number) =>
    page.set(pageFrames[index]!, duration);
  const setBoard = (index: number, duration: number) =>
    bed.set(boardFrames[index]!, duration);
  const style = document.createElement("style");
  style.textContent = `
    .prepared-surface[hidden],.prepared-board-surface[hidden]{display:none!important}
    .prepared-surface>img,.prepared-surface>canvas{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none}
    .prepared-surfaces #board[data-static-board=true]{position:relative;background-color:transparent!important;background-image:none!important;transition:none!important}
    .prepared-board-surface{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:0}
    .prepared-surfaces #board>canvas{position:relative;z-index:1}
  `;
  document.head.append(style);
  let mode: SurfaceMode = "original",
    disposed = false;
  const finish = () => {
    page.finish();
    bed.finish();
  };
  function original() {
    atmosphere.preparedBackground = undefined;
    scene.preparedBackground = undefined;
    document.documentElement.classList.remove("prepared-surfaces");
    for (const node of [base!, overlay!]) {
      node.replaceChildren();
      node.hidden = false;
      node.style.backgroundImage = "";
      node.style.backgroundSize = "";
      node.style.backgroundColor =
        THEMES[atmosphere.diagnosticSnapshot().theme]!.bg;
    }
    base!.style.opacity = "1";
    overlay!.style.opacity = "0";
    a.hidden = b.hidden = true;
    board.style.transition = "none";
    board.style.backgroundColor =
      boardFrames[scene.diagnosticSnapshot().theme]!.color;
  }
  function setMode(next: SurfaceMode) {
    if (disposed) return;
    finish();
    original();
    page.reset();
    bed.reset();
    mode = next === "generated" && !artReady ? "original" : next;
    document.documentElement.dataset.themeSurfaces = mode;
    if (mode === "original") return;
    document.documentElement.classList.add("prepared-surfaces");
    a.hidden = false;
    base!.style.opacity = "1";
    atmosphere.preparedBackground = setPage;
    scene.preparedBackground = setBoard;
    // The flat control must not accidentally mount a predecoded art image.
    for (let i = 0; i < pageFrames.length; i++)
      pageFrames[i]!.image = mode === "generated" ? images.get(i) : undefined;
    setPage(atmosphere.diagnosticSnapshot().theme, 0);
    setBoard(scene.diagnosticSnapshot().theme, 0);
  }
  const onResize = () => finish();
  window.addEventListener("resize", onResize);
  board.addEventListener("webglcontextlost", finish, true);
  board.addEventListener("webglcontextrestored", finish, true);
  setMode(requestedMode);
  const initMs = performance.now() - started;
  const state = {
    get mode() {
      return mode;
    },
    ready: true,
    initMs,
    artReady,
    fallbackReason,
    page,
    bed,
    finish,
    setMode,
    snapshot: () => ({
      mode,
      ready: true,
      artReady,
      fallbackReason,
      initMs,
      hooksActive:
        atmosphere.preparedBackground === setPage &&
        scene.preparedBackground === setBoard,
      page: page.snapshot(),
      bed: bed.snapshot(),
      activeImages: document.querySelectorAll(".prepared-surface>img").length,
      decodedArt: images.size,
      decodedArtRgbaEstimate: [...images.values()].reduce(
        (n, i) => n + i.naturalWidth * i.naturalHeight * 4,
        0,
      ),
    }),
    dispose: () => {
      if (disposed) return;
      finish();
      original();
      disposed = true;
      window.removeEventListener("resize", onResize);
      board.removeEventListener("webglcontextlost", finish, true);
      board.removeEventListener("webglcontextrestored", finish, true);
      a.remove();
      b.remove();
      style.remove();
      base!.classList.remove("prepared-surface");
      overlay!.classList.remove("prepared-surface");
      delete document.documentElement.dataset.themeSurfaces;
      for (const image of images.values()) image.src = "";
      images.clear();
    },
  };
  return state;
}
export type PreparedSurfaces = Awaited<
  ReturnType<typeof installPreparedSurfaces>
>;
