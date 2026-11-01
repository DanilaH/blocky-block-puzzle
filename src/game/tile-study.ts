import { TileMaterialBlend } from "./tile-material";
import Phaser from "phaser";
import { COLORS } from "./tiles";
import { TILE_MATERIALS, type TileMaterial } from "./tile-study-config";
export { TILE_STUDY } from "./tile-study-config";

/** Fixed startup allocation; only visible material layers enter the render list.
 * A second boundary samples the current blend, so even a reset cannot pop. */
export class TileStudySprites {
  private pools: Phaser.GameObjects.Image[][];
  private cursor = [0, 0, 0];
  private previous = [0, 0, 0];
  private blend = new TileMaterialBlend();
  private opacity = [1, 0, 0];
  constructor(private scene: Phaser.Scene) {
    this.pools = TILE_MATERIALS.map((material) =>
      Array.from({ length: 256 }, () =>
        scene.add
          .image(0, 0, `study-${material}-1`)
          .setDepth(0.5)
          .setVisible(false),
      ),
    );
  }
  setMaterial(material: TileMaterial, now: number, duration: number) {
    this.blend.set(material, now, duration);
  }
  begin() {
    const layers = this.blend.sample(performance.now());
    this.opacity[1] = layers[0]!;
    this.opacity[2] = layers[1]!;
    this.cursor.fill(0);
  }
  tile(x: number, y: number, color: number, alpha: number, scale: number) {
    for (let layer = 0; layer < 3; layer++) {
      const opacity = this.opacity[layer]!;
      if (
        !opacity ||
        (layer < 2 && this.opacity[2] === 1) ||
        (layer === 0 && this.opacity[1] === 1)
      )
        continue;
      const index = this.cursor[layer]!;
      if (index >= 256) continue;
      const s = this.pools[layer]![index]!;
      this.cursor[layer] = index + 1;
      const key = `study-${TILE_MATERIALS[layer]}-${COLORS.indexOf(color)}`;
      if (s.texture.key !== key) s.setTexture(key);
      s.setVisible(true)
        .setPosition(x + 32, y + 32)
        .setDisplaySize(64 * scale, 64 * scale)
        .setAlpha(alpha * opacity);
    }
  }
  end() {
    for (let layer = 0; layer < 3; layer++) {
      for (let i = this.cursor[layer]!; i < this.previous[layer]!; i++)
        this.pools[layer]![i]!.setVisible(false);
      this.previous[layer] = this.cursor[layer]!;
    }
  }
  destroy() {
    this.pools.forEach((pool) => pool.forEach((sprite) => sprite.destroy()));
    this.pools = [];
  }
}
