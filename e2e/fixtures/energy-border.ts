import Phaser from "phaser";
import { SpriteInk } from "../../src/game/sprite-ink";

(window as any).drawBorder = async (
  cached: boolean,
  renderer: string,
  energy: number,
  resolution: number,
  washAlpha?: number,
) => {
  const parent = document.createElement("div");
  parent.id = cached ? "cached" : "original";
  document.body.append(parent);
  let ready!: () => void;
  const promise = new Promise<void>((r) => (ready = r));
  class BorderScene extends Phaser.Scene {
    create() {
      this.cameras.main.setZoom(resolution / 512).centerOn(256, 256);
      const ink = new SpriteInk(this, 1, washAlpha !== undefined && cached);
      if (cached) ink.energyBorder(energy);
      else
        for (let ring = 0; ring < 4; ring++) {
          ink.lineStyle(2 + ring * 4, 0xffd67b, energy * (0.24 - ring * 0.05));
          ink.strokeRoundedRect(3, 3, 506, 506, 8);
        }
      if (washAlpha !== undefined) {
        ink.fillStyle(0xffeb8a, washAlpha).fillRect(0, 0, 512, 512);
        ink
          .lineStyle(3, 0xffe2a0, 0.85)
          .strokeRoundedRect(10, 10, 492, 492, 12);
        ink.fillStyle(0x4279ed, 0.4).fillRect(100, 100, 90, 70);
        ink.fillStyle(0xffeb8a, washAlpha / 2).fillRect(0, 0, 512, 512);
        ink.lineStyle(4, 0xffffff, 0.5).strokeRoundedRect(130, 130, 62, 62, 5);
        ink.setVisible(false).setVisible(true);
      }
      this.game.events.once("postrender", () => {
        this.game.loop.sleep();
        ready();
      });
    }
  }
  new Phaser.Game({
    type: renderer === "canvas" ? Phaser.CANVAS : Phaser.WEBGL,
    parent: parent.id,
    width: resolution,
    height: resolution,
    backgroundColor: "#182c45",
    scene: BorderScene,
    audio: { noAudio: true },
    banner: false,
    antialias: true,
    antialiasGL: false,
  });
  await promise;
  return parent.id;
};
