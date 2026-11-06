import Phaser from "phaser";

const KEY = "board-primitives";
const RADII = [0, 1, 4, 5, 6, 8, 12];
const CELL = 80,
  PAD = 10,
  BORDER = 24;
function round(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
/** One startup atlas; every contour is a bounded batch of textured quads. */
export function prepareInk(scene: Phaser.Scene) {
  if (scene.textures.exists(KEY)) return;
  const t = scene.textures.createCanvas(KEY, 960, 800)!;
  const c = t.context;
  let index = 0;
  for (const radius of RADII)
    for (let width = 0; width <= 14; width++) {
      const x = (index % 12) * CELL,
        y = Math.floor(index / 12) * CELL;
      index++;
      c.fillStyle = c.strokeStyle = "white";
      c.lineWidth = width;
      round(c, x + PAD, y + PAD, CELL - PAD * 2, CELL - PAD * 2, radius);
      if (width) c.stroke();
      else c.fill();
      t.add(`${radius}:${width}`, 0, x, y, CELL, CELL);
      const cuts = [0, BORDER, CELL - BORDER, CELL];
      for (let row = 0; row < 3; row++)
        for (let col = 0; col < 3; col++)
          t.add(
            `${radius}:${width}:${row}:${col}`,
            0,
            x + cuts[col]!,
            y + cuts[row]!,
            cuts[col + 1]! - cuts[col]!,
            cuts[row + 1]! - cuts[row]!,
          );
    }
  c.fillStyle = "white";
  c.fillRect(880, 720, 4, 4);
  t.add("pixel", 0, 881, 721, 1, 1);
  c.beginPath();
  c.moveTo(802, 722);
  c.lineTo(862, 722);
  c.lineTo(802, 782);
  c.closePath();
  c.fill();
  t.add("triangle", 0, 802, 722, 60, 60);
  t.refresh();
}
export class SpriteInk {
  private images: Phaser.GameObjects.Image[] = [];
  private imageCursor = 0;
  private fillColor = 0xffffff;
  private fillAlpha = 1;
  private strokeColor = 0xffffff;
  private strokeAlpha = 1;
  private width = 1;
  private visible = true;
  constructor(
    private scene: Phaser.Scene,
    private depth: number,
  ) {
    prepareInk(scene);
    // Allocate common contour capacity at startup, not on the first multi-clear.
    for (let i = 0; i < 256; i++)
      this.images.push(
        scene.add
          .image(0, 0, KEY, "pixel")
          .setOrigin(0)
          .setDepth(depth)
          .setVisible(false),
      );
  }
  clear() {
    this.imageCursor = 0;
    for (const s of this.images) s.setVisible(false);
    return this;
  }
  setVisible(v: boolean) {
    this.visible = v;
    for (let i = 0; i < this.imageCursor; i++) this.images[i]!.setVisible(v);
    return this;
  }
  fillStyle(color: number, alpha = 1) {
    this.fillColor = color;
    this.fillAlpha = alpha;
    return this;
  }
  lineStyle(width: number, color: number, alpha = 1) {
    this.width = width;
    this.strokeColor = color;
    this.strokeAlpha = alpha;
    return this;
  }
  private box(
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    stroke: boolean,
  ) {
    const alpha = stroke ? this.strokeAlpha : this.fillAlpha;
    if (alpha <= 0 || w <= 0 || h <= 0) return this;
    const radius = RADII.reduce((a, b) =>
      Math.abs(b - r) < Math.abs(a - r) ? b : a,
    );
    const width = stroke
      ? Math.max(1, Math.min(14, Math.round(this.width)))
      : 0;
    const frame = `${radius}:${width}`;
    const color = stroke ? this.strokeColor : this.fillColor;
    if (w < 100 && h < 100) {
      return this.image(
        frame,
        x - (PAD * w) / 60,
        y - (PAD * h) / 60,
        (w * 80) / 60,
        (h * 80) / 60,
        color,
        alpha,
      );
    }
    // Large perimeter: nine ordinary atlas quads, keeping corners unscaled.
    const xs = [x - PAD, x - PAD + BORDER, x + w + PAD - BORDER];
    const ys = [y - PAD, y - PAD + BORDER, y + h + PAD - BORDER];
    const ws = [BORDER, w + PAD * 2 - BORDER * 2, BORDER];
    const hs = [BORDER, h + PAD * 2 - BORDER * 2, BORDER];
    for (let row = 0; row < 3; row++)
      for (let col = 0; col < 3; col++) {
        if (stroke && row === 1 && col === 1) continue;
        this.image(
          `${frame}:${row}:${col}`,
          xs[col]!,
          ys[row]!,
          ws[col]!,
          hs[row]!,
          color,
          alpha,
        );
      }
    return this;
  }
  fillRoundedRect(x: number, y: number, w: number, h: number, r: number) {
    return this.box(x, y, w, h, r, false);
  }
  strokeRoundedRect(x: number, y: number, w: number, h: number, r: number) {
    return this.box(x, y, w, h, r, true);
  }
  strokeRect(x: number, y: number, w: number, h: number) {
    return this.box(x, y, w, h, 0, true);
  }
  private image(
    frame: string,
    x: number,
    y: number,
    w: number,
    h: number,
    color: number,
    alpha: number,
    rotation = 0,
  ) {
    if (alpha <= 0 || w <= 0 || h <= 0 || this.imageCursor >= 512) return this;
    let s = this.images[this.imageCursor++];
    if (!s) {
      s = this.scene.add
        .image(0, 0, KEY, frame)
        .setOrigin(0)
        .setDepth(this.depth);
      this.images.push(s);
    }
    if (s.frame.name !== frame) s.setFrame(frame);
    s.setPosition(x, y)
      .setDisplaySize(w, h)
      .setRotation(rotation)
      .setTint(color)
      .setAlpha(alpha)
      .setVisible(this.visible);
    return this;
  }
  fillRect(x: number, y: number, w: number, h: number) {
    return this.image("pixel", x, y, w, h, this.fillColor, this.fillAlpha);
  }
  lineBetween(x: number, y: number, x2: number, y2: number) {
    const angle = Math.atan2(y2 - y, x2 - x);
    return this.image(
      "pixel",
      x + (Math.sin(angle) * this.width) / 2,
      y - (Math.cos(angle) * this.width) / 2,
      Math.hypot(x2 - x, y2 - y),
      this.width,
      this.strokeColor,
      this.strokeAlpha,
      angle,
    );
  }
  fillTriangle(
    x: number,
    y: number,
    x2: number,
    y2: number,
    x3: number,
    y3: number,
  ) {
    return this.image(
      "triangle",
      x,
      y,
      x2 - x,
      y3 - y,
      this.fillColor,
      this.fillAlpha,
    );
  }
  destroy() {
    for (const s of this.images) s.destroy();
    this.images = [];
  }
}

/** Static decoration raster: uploaded only when the board occupancy changes. */
export class RasterInk {
  private texture: Phaser.Textures.CanvasTexture;
  private sprite: Phaser.GameObjects.Image;
  private context: CanvasRenderingContext2D;
  private fillAlpha = 1;
  private strokeAlpha = 1;
  constructor(scene: Phaser.Scene, depth: number) {
    if (scene.textures.exists("board-decoration")) scene.textures.remove("board-decoration");
    this.texture = scene.textures.createCanvas("board-decoration", 512, 512)!;
    this.context = this.texture.context;
    this.sprite = scene.add
      .image(0, 0, "board-decoration")
      .setOrigin(0)
      .setDepth(depth);
  }
  clear() {
    this.context.clearRect(0, 0, 512, 512);
    return this;
  }
  setVisible(visible: boolean) {
    this.sprite.setVisible(visible);
    return this;
  }
  fillStyle(color: number, alpha = 1) {
    this.context.fillStyle = "#" + color.toString(16).padStart(6, "0");
    this.fillAlpha = alpha;
    return this;
  }
  lineStyle(width: number, color: number, alpha = 1) {
    this.context.strokeStyle = "#" + color.toString(16).padStart(6, "0");
    this.context.lineWidth = width;
    this.strokeAlpha = alpha;
    return this;
  }
  lineBetween(x: number, y: number, x2: number, y2: number) {
    const c = this.context;
    c.globalAlpha = this.strokeAlpha;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x2, y2);
    c.stroke();
    return this;
  }
  strokeRoundedRect(x: number, y: number, w: number, h: number, r: number) {
    this.context.globalAlpha = this.strokeAlpha;
    round(this.context, x, y, w, h, r);
    this.context.stroke();
    return this;
  }
  fillRoundedRect(x: number, y: number, w: number, h: number, r: number) {
    this.context.globalAlpha = this.fillAlpha;
    round(this.context, x, y, w, h, r);
    this.context.fill();
    return this;
  }
  flush() {
    this.texture.refresh();
  }
  destroy() {
    this.sprite.destroy();
    this.texture.destroy();
  }
}
