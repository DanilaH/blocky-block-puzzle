// Experimental quad renderer. No frame-by-frame Canvas2D backing-store upload.
// This intentionally supports only the baked reward sprites used by this study.
type Matrix = [number, number, number, number, number, number];
type State = { matrix: Matrix; alpha: number };
type Texture = { handle: WebGLTexture; width: number; height: number };
type SharedContext = {
  canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext;
  pixelRatio: () => number;
};
export class SpriteGpu {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private buffer: WebGLBuffer;
  private size: WebGLUniformLocation;
  private textures = new Map<ImageBitmap, Texture>();
  private state: State = { matrix: [1, 0, 0, 1, 0, 0], alpha: 1 };
  private stack: State[] = [];
  private vertices: number[] = [];
  private runs: { texture: Texture; start: number; count: number }[] = [];
  frames = 0;
  uploads = 0;
  uploadMs = 0;
  draws = 0;
  initMs = 0;
  constructor(
    before: HTMLCanvasElement,
    private shared?: SharedContext,
  ) {
    const init = performance.now();
    this.canvas = shared?.canvas ?? document.createElement("canvas");
    if (!shared) {
      this.canvas.className = "study-gpu-rewards";
      this.canvas.setAttribute("aria-hidden", "true");
      this.canvas.style.cssText =
        "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:19";
      before.before(this.canvas);
    }
    const gl =
      shared?.gl ??
      this.canvas.getContext("webgl", {
        alpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: true,
      });
    if (!gl) throw Error("study-webgl-unavailable");
    this.gl = gl;
    const shader = (type: number, source: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, source);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
        throw Error(gl.getShaderInfoLog(s) ?? "shader");
      return s;
    };
    this.program = gl.createProgram()!;
    gl.attachShader(
      this.program,
      shader(
        gl.VERTEX_SHADER,
        `
      attribute vec2 position; attribute vec2 uv; attribute float alpha;
      uniform vec2 size; varying vec2 texcoord; varying float opacity;
      void main(){gl_Position=vec4(position.x/size.x*2.-1.,1.-position.y/size.y*2.,0.,1.);texcoord=uv;opacity=alpha;}`,
      ),
    );
    gl.attachShader(
      this.program,
      shader(
        gl.FRAGMENT_SHADER,
        `
      precision mediump float; uniform sampler2D image; varying vec2 texcoord; varying float opacity;
      void main(){gl_FragColor=texture2D(image,texcoord)*opacity;}`,
      ),
    );
    gl.linkProgram(this.program);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS))
      throw Error(gl.getProgramInfoLog(this.program) ?? "link");
    gl.useProgram(this.program);
    this.size = gl.getUniformLocation(this.program, "size")!;
    this.buffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    for (const [name, count, offset] of [
      ["position", 2, 0],
      ["uv", 2, 8],
      ["alpha", 1, 16],
    ] as const) {
      const a = gl.getAttribLocation(this.program, name);
      gl.enableVertexAttribArray(a);
      gl.vertexAttribPointer(a, count, gl.FLOAT, false, 20, offset);
    }
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
    this.initMs = performance.now() - init;
  }
  snapshot() {
    return {
      frames: this.frames,
      sharedContext: !!this.shared,
      initMs: this.initMs,
      uploads: this.uploads,
      uploadMs: this.uploadMs,
      drawCalls: this.draws,
      textures: this.textures.size,
      textureBytes: [...this.textures.values()].reduce(
        (n, t) => n + t.width * t.height * 4,
        0,
      ),
      backing: [this.canvas.width, this.canvas.height],
      contextLost: this.gl.isContextLost(),
      glError: this.gl.getError(),
    };
  }
  get globalAlpha() {
    return this.state.alpha;
  }
  set globalAlpha(a: number) {
    this.state.alpha = a;
  }
  set globalCompositeOperation(value: string) {
    if (value !== "source-over") throw Error("study-gpu-composite:" + value);
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
    if (!this.shared) {
      const ratio = Math.min(3, devicePixelRatio),
        w = Math.round(innerWidth * ratio),
        h = Math.round(innerHeight * ratio);
      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = w;
        this.canvas.height = h;
      }
      this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    }
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.activeTexture(gl.TEXTURE0);
    this.state = { matrix: [1, 0, 0, 1, 0, 0], alpha: 1 };
    this.stack = [];
    this.vertices = [];
    this.runs = [];
  }
  clear() {
    if (!this.shared) this.begin();
  }
  drawImage(image: ImageBitmap, ...args: number[]) {
    const gl = this.gl;
    let texture = this.textures.get(image);
    if (!texture) {
      const start = performance.now(),
        handle = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, handle);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        image,
      );
      texture = { handle, width: image.width, height: image.height };
      this.textures.set(image, texture);
      this.uploads++;
      this.uploadMs += performance.now() - start;
    }
    const [sx, sy, sw, sh, dx, dy, dw, dh] =
      args.length === 8 ? args : [0, 0, image.width, image.height, ...args];
    const m = this.state.matrix,
      p = (x: number, y: number) => [
        m[0] * x + m[2] * y + m[4],
        m[1] * x + m[3] * y + m[5],
      ];
    const a = p(dx!, dy!),
      b = p(dx! + dw!, dy!),
      c = p(dx! + dw!, dy! + dh!),
      d = p(dx!, dy! + dh!);
    const uv = [
      sx! / texture.width,
      sy! / texture.height,
      (sx! + sw!) / texture.width,
      (sy! + sh!) / texture.height,
    ];
    const start = this.vertices.length / 5;
    for (const [point, u, v] of [
      [a, uv[0], uv[1]],
      [b, uv[2], uv[1]],
      [c, uv[2], uv[3]],
      [a, uv[0], uv[1]],
      [c, uv[2], uv[3]],
      [d, uv[0], uv[3]],
    ] as const)
      this.vertices.push(point[0]!, point[1]!, u!, v!, this.state.alpha);
    const last = this.runs.at(-1);
    if (last?.texture === texture) last.count += 6;
    else this.runs.push({ texture, start, count: 6 });
  }
  end() {
    const gl = this.gl;
    gl.useProgram(this.program);
    const ratio = this.shared?.pixelRatio();
    gl.uniform2f(
      this.size,
      ratio ? this.canvas.width / ratio : innerWidth,
      ratio ? this.canvas.height / ratio : innerHeight,
    );
    gl.uniform1i(gl.getUniformLocation(this.program, "image"), 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    for (const [name, count, offset] of [
      ["position", 2, 0],
      ["uv", 2, 8],
      ["alpha", 1, 16],
    ] as const) {
      const a = gl.getAttribLocation(this.program, name);
      gl.enableVertexAttribArray(a);
      gl.vertexAttribPointer(a, count, gl.FLOAT, false, 20, offset);
    }
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array(this.vertices),
      gl.STREAM_DRAW,
    );
    for (const r of this.runs) {
      gl.bindTexture(gl.TEXTURE_2D, r.texture.handle);
      gl.drawArrays(gl.TRIANGLES, r.start, r.count);
      this.draws++;
    }
    this.frames++;
  }
}
