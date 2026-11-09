import Phaser from "phaser";
import { SpriteGpu } from "./sprite-gpu";
import type { BoardScene } from "../../game/BoardScene";

// Study only. Reuses the actual game's renderer through Phaser's Extern contract.
export class PhaserForeground {
  ready = false;
  gpu?: SpriteGpu;
  private ratio = 1;
  private viewport = { x: 0, y: 0, side: 512, cssSide: 512 };
  private extern?: Phaser.GameObjects.Extern;
  private overlay?: Phaser.Scene;
  private redraws = 0;
  private originalCanvas: number[] = [];
  private errors: string[] = [];
  constructor(
    private game: Phaser.Game,
    private boardScene: BoardScene,
    private board: HTMLElement,
    private active: () => boolean,
    private paint: (g: CanvasRenderingContext2D) => void,
    private offset: () => { x: number; y: number },
  ) {
    game.events.once("postrender", () => this.setup());
  }
  private setup() {
    const game = this.game;
    if (game.renderer.type !== Phaser.WEBGL)
      throw Error("shared-study-requires-webgl");
    this.originalCanvas = [game.canvas.width, game.canvas.height];
    game.canvas.classList.add("study-shared-canvas");
    game.canvas.style.setProperty("position", "fixed");
    game.canvas.style.setProperty("left", "0");
    game.canvas.style.setProperty("top", "0");
    game.canvas.style.setProperty("z-index", "19");
    game.canvas.style.setProperty("pointer-events", "none");
    this.boardScene.syncResolution = () => this.applyViewport();
    const manager = this;
    class Overlay extends Phaser.Scene {
      constructor() {
        super({ key: "study-shared-foreground" });
      }
      create() {
        manager.overlay = this;
        const extern = this.add.extern();
        extern.visible = false;
        manager.extern = extern;
        extern.render = (renderer: any, context: any) => {
          // Extern yields and rebinds Phaser GL state around this callback.
          renderer.glWrapper.updateBindingsFramebuffer(
            { bindings: { framebuffer: context.framebuffer } },
            true,
          );
          manager.gpu ??= new SpriteGpu(game.canvas, {
            canvas: game.canvas,
            gl: renderer.gl,
            pixelRatio: () => manager.ratio,
          });
          manager.gpu.begin();
          manager.paint(manager.gpu as unknown as CanvasRenderingContext2D);
          manager.gpu.end();
        };
        manager.ready = true;
        manager.resize();
      }
    }
    game.scene.add("study-shared-foreground", new Overlay(), true);
    game.events.on("prerender", this.beforeFrame, this);
    game.canvas.addEventListener("webglcontextlost", () => {
      this.gpu = undefined;
    });
    game.canvas.addEventListener("webglcontextrestored", () => {
      this.gpu = undefined;
    });
    this.resize();
  }
  private beforeFrame() {
    if (this.extern) this.extern.visible = this.active();
    this.applyViewport();
  }
  private applyViewport() {
    const v = this.viewport,
      p = this.offset(),
      camera = this.boardScene.cameras.main;
    camera
      .setViewport(v.x, v.y, v.side, v.side)
      .setZoom(v.side / 512)
      .centerOn(256 - (p.x * 512) / v.cssSide, 256 - (p.y * 512) / v.cssSide);
  }
  resize() {
    if (
      !this.game.isBooted ||
      !this.game.canvas.classList.contains("study-shared-canvas")
    )
      return;
    const r = this.board.getBoundingClientRect();
    const side = Math.min(
      1024,
      Math.max(
        512,
        Math.ceil((r.width * Math.min(devicePixelRatio || 1, 3)) / 64) * 64,
      ),
    );
    this.ratio = side / r.width;
    this.viewport = {
      x: r.left * this.ratio,
      y: r.top * this.ratio,
      side,
      cssSide: r.width,
    };
    const w = Math.ceil(innerWidth * this.ratio),
      h = Math.ceil(innerHeight * this.ratio);
    if (this.game.scale.width !== w || this.game.scale.height !== h)
      this.game.scale.resize(w, h);
    this.game.canvas.style.setProperty(
      "width",
      `${w / this.ratio}px`,
      "important",
    );
    this.game.canvas.style.setProperty(
      "height",
      `${h / this.ratio}px`,
      "important",
    );
    this.overlay?.cameras.main.setViewport(0, 0, w, h);
    this.applyViewport();
  }
  redraw() {
    if (!this.ready || (this.game.renderer as any).contextLost) return;
    this.beforeFrame();
    this.game.renderer.preRender();
    this.game.scene.render(this.game.renderer);
    this.game.renderer.postRender();
    this.redraws++;
  }
  hideBoard() {
    this.boardScene.cameras.main.visible = false;
  }
  snapshot() {
    const renderer = this.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
    return {
      ready: this.ready,
      originalCanvas: this.originalCanvas,
      canvasIsGameCanvas: !this.gpu || this.gpu.canvas === this.game.canvas,
      sharedContext: true,
      backing: [this.game.canvas.width, this.game.canvas.height],
      viewport: { ...this.viewport },
      pixelRatio: this.ratio,
      redraws: this.redraws,
      errors: [...this.errors],
      gpu: this.gpu?.snapshot(),
    };
  }
}
