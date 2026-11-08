import Phaser from "phaser";
(window as any).probeAdditiveAlpha = async (mode: string) => {
  const parent = document.createElement("div");
  document.body.append(parent);
  let resolve!: (pixels: number[]) => void;
  const result = new Promise<number[]>((r) => {
    resolve = r;
  });
  class Probe extends Phaser.Scene {
    create() {
      this.add.rectangle(0, 0, 64, 64, 0xff0000, 0.5).setOrigin(0);
      if (mode !== "none") {
        const texture = this.textures.createCanvas("transparent-pixel", 2, 2)!;
        texture.refresh();
        const renderer = this.game
          .renderer as Phaser.Renderer.WebGL.WebGLRenderer;
        const gl = renderer.gl;
        const blend =
          mode === "legacy"
            ? Phaser.BlendModes.ADD
            : renderer.addBlendMode(
                [gl.ONE, gl.ONE, gl.ONE, gl.ONE],
                gl.FUNC_ADD,
              );
        this.add
          .image(0, 0, "transparent-pixel")
          .setOrigin(0)
          .setDisplaySize(64, 64)
          .setBlendMode(blend);
      }
      this.game.events.once("postrender", () => {
        const gl = (this.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer)
          .gl;
        const pixel = new Uint8Array(4);
        gl.readPixels(32, 32, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        this.game.loop.sleep();
        resolve(Array.from(pixel));
      });
    }
  }
  new Phaser.Game({
    type: Phaser.WEBGL,
    width: 64,
    height: 64,
    parent,
    transparent: true,
    antialiasGL: false,
    banner: false,
    audio: { noAudio: true },
    scene: Probe,
  });
  return result;
};
