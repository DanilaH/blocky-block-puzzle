import Phaser from "phaser";
import { SpriteInk } from "../../src/game/sprite-ink";

(window as any).drawBorder = async (
  cached: boolean,
  renderer: string,
  energy: number,
  resolution: number,
) => {
  const parent = document.createElement("div");
  parent.id = cached ? "cached" : "original";
  document.body.append(parent);
  let ready!: () => void;
  const promise = new Promise<void>((r) => (ready = r));
  class BorderScene extends Phaser.Scene {
    create() {
      this.cameras.main.setZoom(resolution / 512).centerOn(256, 256);
      const ink = new SpriteInk(this, 1);
      if (cached) ink.energyBorder(energy);
      else
        for (let ring = 0; ring < 4; ring++) {
          ink.lineStyle(2 + ring * 4, 0xffd67b, energy * (0.24 - ring * 0.05));
          ink.strokeRoundedRect(3, 3, 506, 506, 8);
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
