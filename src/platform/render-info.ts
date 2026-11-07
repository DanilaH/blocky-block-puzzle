import type Phaser from "phaser";
/** Queried once when the user starts recording, outside the measured move. */
export function readRenderInfo(game: Phaser.Game) {
  try {
    const renderer = game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
    const base = {
      canvas: [game.canvas.width, game.canvas.height],
      userAgent: navigator.userAgent,
    };
    const gl = renderer.gl;
    if (!gl) return { ...base, type: "canvas" };
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      ...base,
      type: "webgl",
      renderer: gl.getParameter(
        debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER,
      ),
      vendor: gl.getParameter(debug ? debug.UNMASKED_VENDOR_WEBGL : gl.VENDOR),
      maxTextureUnits: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),
      phaserTextureUnits: renderer.renderNodes.maxParallelTextureUnits,
    };
  } catch {
    return { type: "unavailable" };
  }
}
