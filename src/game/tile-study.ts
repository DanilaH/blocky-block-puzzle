import Phaser from "phaser";
import { COLORS } from "./tiles";

export { TILE_STUDY } from "./tile-study-config";

/** Preview-only shared material; never changes saved game or cosmetic themes. */
export class TileStudySprites {
  private pool: Phaser.GameObjects.Image[] = [];
  private cursor = 0;
  constructor(private scene: Phaser.Scene) {}
  begin() {
    this.cursor = 0;
  }
  tile(x: number, y: number, color: number, alpha: number, scale: number) {
    if (this.cursor >= 256) return;
    const key = `study-${COLORS.indexOf(color)}`;
    if (!this.scene.textures.exists(key)) return;
    let s = this.pool[this.cursor++];
    if (!s) {
      s = this.scene.add.image(0, 0, key).setDepth(0.5);
      this.pool.push(s);
    }
    s.setTexture(key)
      .setVisible(true)
      .setPosition(x + 32, y + 32)
      .setDisplaySize(64 * scale, 64 * scale)
      .setAlpha(alpha);
  }
  end() {
    for (let i = this.cursor; i < this.pool.length; i++)
      this.pool[i]!.setVisible(false);
  }
  destroy() {
    this.pool.forEach((s) => s.destroy());
    this.pool = [];
  }
}
