import Phaser from "phaser";

// Study only. Preserve transparent FX blending, then fill the bed underneath.
export class BoardBedStudy {
  readonly enabled: boolean;
  private board: HTMLElement;
  private color?: Phaser.GameObjects.Rectangle;
  private mask?: Phaser.GameObjects.Image;
  private active = false;
  private owned = false;
  private motion?: Animation;
  private duration = 1000;
  private mode = -1;
  private ownsTexture = false;
  private readonly key = "study-bed-well-mask";
  private frames = 0;
  private activations = 0;
  private completions = 0;
  private handoffs = 0;
  private initMs = 0;
  constructor(private scene: Phaser.Scene) {
    this.board = scene.game.canvas.parentElement!;
    this.enabled = scene.game.renderer.type === Phaser.WEBGL;
    if (!this.enabled) return;
    const begin = performance.now();
    this.ownsTexture = !scene.textures.exists(this.key);
    if (this.ownsTexture) {
      // Same 8x8 SVG wells as arcade.css, rasterized once at the board cap.
      const source = document.createElement("canvas");
      source.width = source.height = 1024;
      const g = source.getContext("2d")!;
      g.fillStyle = "rgba(0,0,0,0.066666667)";
      for (let i = 0; i < 64; i++) {
        g.beginPath();
        g.roundRect(
          (i % 8) * 128 + 2,
          Math.floor(i / 8) * 128 + 2,
          124,
          124,
          6,
        );
        g.fill();
      }
      scene.textures.addCanvas(this.key, source);
    }
    this.mask = scene.add
      .image(0, 0, this.key)
      .setOrigin(0)
      .setDisplaySize(512, 512)
      .setDepth(99999)
      .setVisible(false);
    this.color = scene.add
      .rectangle(0, 0, 512, 512, 0)
      .setOrigin(0)
      .setDepth(100000)
      .setVisible(false);
    this.bind();
    this.board.style.transition = "none";
    scene.game.canvas.addEventListener("webglcontextrestored", this.bind);
    scene.events.once("shutdown", () => this.destroy());
    this.initMs = performance.now() - begin;
  }
  private bind = () => {
    const renderer = this.scene.game
        .renderer as Phaser.Renderer.WebGL.WebGLRenderer,
      gl = renderer.gl;
    // 4.2.1 addBlendMode returns the preceding index; the new table slot is exact.
    this.mode = renderer.blendModes.length;
    renderer.addBlendMode([gl.ONE_MINUS_DST_ALPHA, gl.ONE], gl.FUNC_ADD);
    this.mask!.setBlendMode(this.mode);
    this.color!.setBlendMode(this.mode);
  };
  start(from: number, duration: number) {
    if (this.enabled) {
      if (this.owned) {
        this.hide();
        this.css(from);
        getComputedStyle(this.board).backgroundColor;
      }
      this.owned = false;
      this.duration = duration;
      this.active = true;
      this.activations++;
    }
  }
  paint(color: number, progress: number, target: number) {
    if (!this.enabled || !this.active) return;
    if (progress < 1) {
      const moving =
        this.motion &&
        (this.motion.pending ||
          this.motion.effect?.getComputedTiming().progress !== null);
      if (moving) {
        if (this.owned) {
          this.hide();
          this.css(color);
          getComputedStyle(this.board).backgroundColor;
          this.board.style.transition = `background-color ${Math.max(0, (1 - progress) * this.duration)}ms linear`;
          this.board.style.backgroundColor =
            "#" + target.toString(16).padStart(6, "0");
          this.owned = false;
          this.handoffs++;
        }
        return;
      }
      this.motion = undefined;
      if (!this.owned) {
        this.css(color);
        this.owned = true;
      }
      this.frames++;
      this.mask!.visible = this.color!.visible = true;
      if (this.color!.fillColor !== color) this.color!.setFillStyle(color);
    } else {
      this.active = false;
      this.owned = false;
      this.motion = undefined;
      this.completions++;
      this.hide();
      this.css(target);
    }
  }
  stopAt(color: number) {
    if (this.enabled && this.active) {
      this.handoffs++;
      this.owned = false;
      this.hide();
      this.css(color);
    }
  }
  observeAnimation(animation: Animation) {
    this.motion = animation;
  }
  private hide() {
    this.mask!.visible = this.color!.visible = false;
  }
  private css(color: number) {
    this.board.style.transition = "none";
    this.board.style.backgroundColor =
      "#" + color.toString(16).padStart(6, "0");
  }
  resetSample() {
    this.frames = this.activations = this.completions = this.handoffs = 0;
  }
  snapshot() {
    return {
      enabled: this.enabled,
      active: this.active,
      owned: this.owned,
      visible: this.color?.visible ?? false,
      maskVisible: this.mask?.visible ?? false,
      frames: this.frames,
      activations: this.activations,
      completions: this.completions,
      handoffs: this.handoffs,
      initMs: this.initMs,
      maskBytes: this.enabled ? 1024 * 1024 * 4 : 0,
      blendMode: this.mode,
    };
  }
  private destroy() {
    if (!this.enabled) return;
    this.scene.game.canvas.removeEventListener(
      "webglcontextrestored",
      this.bind,
    );
    this.mask?.destroy();
    this.color?.destroy();
    if (this.ownsTexture) this.scene.textures.remove(this.key);
  }
}
