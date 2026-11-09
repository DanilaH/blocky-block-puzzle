import type Phaser from "phaser";
type Matrix = [number, number, number, number, number, number];
type State = { matrix: Matrix; alpha: number };
type Atlas = { key: string; width: number; height: number };
// Minimal Canvas-style quad producer. Phaser owns buffers, shaders and textures.
export class NativeMeshCanvas {
  readonly canvas: HTMLCanvasElement;
  private state: State = { matrix: [1, 0, 0, 1, 0, 0], alpha: 1 };
  private stack: State[] = [];
  private atlases = new Map<ImageBitmap, Atlas>();
  private meshes: Phaser.GameObjects.Mesh2D[] = [];
  private cursor = 0;
  private frames = 0;
  private submittedQuads = 0;
  private preparationMs = 0;
  constructor(
    private scene: Phaser.Scene,
    private ratio: () => number,
  ) {
    this.canvas = scene.game.canvas;
  }
  get globalAlpha() {
    return this.state.alpha;
  }
  set globalAlpha(value: number) {
    this.state.alpha = value;
  }
  set globalCompositeOperation(value: string) {
    if (value !== "source-over") throw Error("native-mesh-composite:" + value);
  }
  save() {
    this.stack.push({
      matrix: [...this.state.matrix],
      alpha: this.state.alpha,
    });
  }
  restore() {
    this.state = this.stack.pop()!;
  }
  transform(a: number, b: number, c: number, d: number, e: number, f: number) {
    const [x, y, z, w, u, v] = this.state.matrix;
    this.state.matrix = [
      x * a + z * b,
      y * a + w * b,
      x * c + z * d,
      y * c + w * d,
      x * e + z * f + u,
      y * e + w * f + v,
    ];
  }
  translate(x: number, y: number) {
    this.transform(1, 0, 0, 1, x, y);
  }
  scale(x: number, y: number) {
    this.transform(x, 0, 0, y, 0, 0);
  }
  rotate(r: number) {
    this.transform(Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0);
  }
  begin() {
    this.cursor = 0;
    this.state = { matrix: [1, 0, 0, 1, 0, 0], alpha: 1 };
    this.stack = [];
    for (const mesh of this.meshes) mesh.visible = false;
  }
  drawImage(image: ImageBitmap, ...args: number[]) {
    if (this.state.alpha === 0) return;
    let atlas = this.atlases.get(image);
    if (!atlas) {
      const begin = performance.now(),
        key = `study-native-atlas-${this.atlases.size}`;
      const source = document.createElement("canvas");
      source.width = image.width;
      source.height = image.height;
      source.getContext("2d")!.drawImage(image, 0, 0);
      this.scene.textures.addCanvas(key, source);
      atlas = { key, width: image.width, height: image.height };
      this.atlases.set(image, atlas);
      this.preparationMs += performance.now() - begin;
    }
    const [sx, sy, sw, sh, dx, dy, dw, dh] =
      args.length === 8 ? args : [0, 0, image.width, image.height, ...args];
    let mesh = this.meshes[this.cursor++];
    if (!mesh) {
      mesh = this.scene.add.mesh2d(
        0,
        0,
        atlas.key,
        new Array(16).fill(0),
        [0, 3, 1, 0, 3, 1, 2, 0],
      );
      mesh.setOrigin(0, 0).setSize(this.canvas.width, this.canvas.height);
      mesh.indicesOrdered = mesh.indices;
      mesh.setUseOrderedIndices(true);
      mesh.flipV=true;
      this.meshes.push(mesh);
    } else if (mesh.texture.key !== atlas.key) mesh.setTexture(atlas.key);
    const m = this.state.matrix,
      r = this.ratio(),
      v = mesh.vertices;
    const corners = [
      [dx!, dy!, sx!, sy!],
      [dx! + dw!, dy!, sx! + sw!, sy!],
      [dx! + dw!, dy! + dh!, sx! + sw!, sy! + sh!],
      [dx!, dy! + dh!, sx!, sy! + sh!],
    ];
    for (let i = 0; i < 4; i++) {
      const [x, y, u, t] = corners[i]!;
      v[i * 4] = (m[0] * x! + m[2] * y! + m[4]) * r;
      v[i * 4 + 1] = (m[1] * x! + m[3] * y! + m[5]) * r;
      v[i * 4 + 2] = u! / atlas.width;
      v[i * 4 + 3] = t! / atlas.height;
    }
    mesh.setAlpha(this.state.alpha);
    mesh.visible = true;
    this.submittedQuads++;
  }
  end() {
    this.frames++;
  }
  snapshot() {
    const renderer = this.scene.game
      .renderer as Phaser.Renderer.WebGL.WebGLRenderer;
    return {
      nativeBatch: true,
      sharedContext: true,
      frames: this.frames,
      submittedQuads: this.submittedQuads,
      activeQuads: this.cursor,
      meshPool: this.meshes.length,
      uploads: this.atlases.size,
      preparationMs: this.preparationMs,
      textures: this.atlases.size,
      textureBytes: [...this.atlases.values()].reduce(
        (s, a) => s + a.width * a.height * 4,
        0,
      ),
      backing: [this.canvas.width, this.canvas.height],
      contextLost: renderer.gl.isContextLost(),
      glError: renderer.gl.getError(),
    };
  }
}
