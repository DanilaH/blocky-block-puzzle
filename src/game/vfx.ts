import Phaser from "phaser";
import manifest from "./vfx-manifest.json";
export type VfxKind = "flash" | "streak" | "chip" | "ring";
export const VFX_KINDS: VfxKind[] = ["flash", "streak", "chip", "ring"];
export const VFX_LIMIT = 220;

/** Bounded reusable display objects. All textures loaded before Scene.create. */
export class VfxSprites {
  private pool: Phaser.GameObjects.Image[] = [];
  private cursor = 0;
  constructor(private scene: Phaser.Scene) {
    // Allocate once before input unlock, not in the first large clear frame.
    this.pool = Array.from({ length: VFX_LIMIT }, () =>
      scene.add.image(0, 0, "vfx-chip").setDepth(2).setVisible(false));
  }
  begin() {
    this.cursor = 0;
  }
  stamp(
    kind: VfxKind,
    x: number,
    y: number,
    width: number,
    height: number,
    alpha = 1,
    tint = 0xffffff,
    angle = 0,
    additive = true,
  ) {
    if (
      alpha <= 0 ||
      width <= 0 ||
      height <= 0 ||
      this.cursor >= VFX_LIMIT ||
      !this.scene.textures.exists(`vfx-${kind}`)
    )
      return;
    let sprite = this.pool[this.cursor];
    if (!sprite) {
      sprite = this.scene.add.image(0, 0, `vfx-${kind}`).setDepth(2);
      this.pool.push(sprite);
    }
    this.cursor++;
    // Width/height are logical-canvas dimensions; trimming must not shift pivots.
    const f = manifest.assets[kind].frame;
    const sx = width / f.logicalWidth,
      sy = height / f.logicalHeight;
    const dx = (f.x + f.width / 2 - f.logicalWidth / 2) * sx;
    const dy = (f.y + f.height / 2 - f.logicalHeight / 2) * sy;
    // Phaser queues a display-list sort even when setDepth repeats its value.
    const depth = additive ? 3 : 2;
    if (sprite.depth !== depth) sprite.setDepth(depth);
    sprite
      .setTexture(`vfx-${kind}`)
      .setVisible(true)
      .setPosition(
        x + dx * Math.cos(angle) - dy * Math.sin(angle),
        y + dx * Math.sin(angle) + dy * Math.cos(angle),
      )
      .setDisplaySize(f.width * sx, f.height * sy)
      .setRotation(angle)
      .setAlpha(Math.min(1, alpha))
      .setTint(tint)
      .setBlendMode(
        additive ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL,
      );
  }
  end() {
    for (let i = this.cursor; i < this.pool.length; i++)
      this.pool[i]!.setVisible(false);
  }
  clear() {
    this.begin();
    this.end();
  }
  destroy() {
    for (const s of this.pool) s.destroy();
    this.pool = [];
  }
}
