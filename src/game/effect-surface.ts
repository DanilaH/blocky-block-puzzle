/** The small drawing vocabulary used by Atmosphere and Festival. Simulation,
 * timing and painter order stay with those effects; this is only their surface.
 * Images are packed/uploaded at preparation time, never drawn through Canvas2D
 * or uploaded again on each animation frame. */
export type EffectPainter = Pick<
  CanvasRenderingContext2D,
  | "globalAlpha"
  | "globalCompositeOperation"
  | "fillStyle"
  | "strokeStyle"
  | "lineWidth"
  | "lineDashOffset"
  | "translate"
  | "rotate"
  | "save"
  | "restore"
  | "clearRect"
  | "fillRect"
  | "strokeRect"
  | "beginPath"
  | "moveTo"
  | "lineTo"
  | "closePath"
  | "arc"
  | "ellipse"
  | "fill"
  | "stroke"
  | "setLineDash"
> & {
  setTransform(
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ): void;
  drawImage(
    image: CanvasImageSource,
    x: number,
    y: number,
    w: number,
    h: number,
  ): void;
  prepareImages(images: CanvasImageSource[]): void;
  present(): void;
};
type Point = [number, number];
const WHITE = [1, 1, 1];
type State = {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
  alpha: number;
  fill: string | CanvasGradient | CanvasPattern;
  stroke: string | CanvasGradient | CanvasPattern;
  width: number;
  blend: GlobalCompositeOperation;
  dash: number[];
  offset: number;
};
type Region = { u: number; v: number; w: number; h: number };
const surfaceStats = new WeakMap<
  HTMLCanvasElement,
  { draws: number; uploads: number }
>();
export function effectSurfaceInfo(canvas: HTMLCanvasElement) {
  return {
    renderer: canvas.dataset.effectRenderer ?? "canvas2d",
    ...surfaceStats.get(canvas),
  };
}
const initial = (): State => ({
  a: 1,
  b: 0,
  c: 0,
  d: 1,
  e: 0,
  f: 0,
  alpha: 1,
  fill: "#000000",
  stroke: "#000000",
  width: 1,
  blend: "source-over",
  dash: [],
  offset: 0,
});
const vertexSource = `
attribute vec2 position;
attribute vec2 uv;
attribute vec4 color;
uniform vec2 size;
varying vec2 texCoord;
varying vec4 tint;
void main() {
  gl_Position = vec4(position.x / size.x * 2.0 - 1.0,
                     1.0 - position.y / size.y * 2.0, 0.0, 1.0);
  texCoord = uv;
  tint = color;
}`;
const fragmentSource = `
precision mediump float;
uniform sampler2D atlas;
varying vec2 texCoord;
varying vec4 tint;
void main() { gl_FragColor = texture2D(atlas, texCoord) * tint; }
`;

class GpuEffectPainter implements EffectPainter {
  private state = initial();
  private stack: State[] = [];
  private depth = 0;
  private points: Point[] = [];
  private closed = false;
  private vertices = new Float32Array(32768);
  private cursor = 0;
  private program!: WebGLProgram;
  private buffer!: WebGLBuffer;
  private texture!: WebGLTexture;
  private size!: WebGLUniformLocation;
  private regions = new Map<CanvasImageSource, Region>();
  private sources: CanvasImageSource[] = [];
  private atlas!: HTMLCanvasElement;
  private white: Region = { u: 0, v: 0, w: 0, h: 0 };
  private colors = new Map<string, [number, number, number]>();
  private lost = false;
  private blend: GlobalCompositeOperation = "source-over";
  private draws = 0;
  private stats = { draws: 0, uploads: 0 };
  constructor(
    private canvas: HTMLCanvasElement,
    private gl: WebGLRenderingContext,
  ) {
    surfaceStats.set(canvas, this.stats);
    this.initialize();
    this.prepareImages([]);
    canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      this.lost = true;
      this.cursor = 0;
      canvas.dataset.effectRenderer = "webgl-lost";
    });
    canvas.addEventListener("webglcontextrestored", () => {
      this.lost = false;
      this.initialize();
      this.upload();
      canvas.dataset.effectRenderer = "webgl";
    });
    canvas.dataset.effectRenderer = "webgl";
  }
  private initialize() {
    const gl = this.gl;
    const shaders: WebGLShader[] = [];
    try {
      for (const [type, source] of [
        [gl.VERTEX_SHADER, vertexSource],
        [gl.FRAGMENT_SHADER, fragmentSource],
      ] as const) {
        const shader = gl.createShader(type);
        if (!shader) throw Error("Effect shader allocation failed");
        shaders.push(shader);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
          throw Error("Effect shader compilation failed");
      }
      const program = gl.createProgram();
      if (!program) throw Error("Effect program allocation failed");
      this.program = program;
      shaders.forEach((shader) => gl.attachShader(program, shader));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw Error("Effect program link failed");
    } finally {
      shaders.forEach((shader) => gl.deleteShader(shader));
    }
    this.buffer = gl.createBuffer()!;
    this.texture = gl.createTexture()!;
    if (!this.buffer || !this.texture)
      throw Error("Effect buffer allocation failed");
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.vertices.byteLength, gl.DYNAMIC_DRAW);
    for (const [name, width, offset] of [
      ["position", 2, 0],
      ["uv", 2, 8],
      ["color", 4, 16],
    ] as const) {
      const location = gl.getAttribLocation(this.program, name);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, width, gl.FLOAT, false, 32, offset);
    }
    this.size = gl.getUniformLocation(this.program, "size")!;
    gl.uniform1i(gl.getUniformLocation(this.program, "atlas"), 0);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.applyBlend();
  }
  private upload() {
    if (this.lost) return;
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      this.atlas,
    );
    this.stats.uploads++;
  }
  prepareImages(images: CanvasImageSource[]) {
    this.flush();
    this.sources = [...new Set(images)];
    const placements: {
      image: CanvasImageSource;
      x: number;
      y: number;
      w: number;
      h: number;
    }[] = [];
    let x = 8,
      y = 0,
      row = 8;
    for (const image of this.sources) {
      const source = image as HTMLImageElement;
      const w = source.naturalWidth || source.width,
        h = source.naturalHeight || source.height;
      if (!w || !h || w > 1020 || h > 1020)
        throw Error("Unsupported effect texture size");
      if (x + w + 4 > 1024) {
        x = 0;
        y += row;
        row = 0;
      }
      placements.push({ image, x: x + 2, y: y + 2, w, h });
      x += w + 4;
      row = Math.max(row, h + 4);
    }
    const height = 2 ** Math.ceil(Math.log2(Math.max(8, y + row)));
    if (height > 2048) throw Error("Effect atlas exceeds its bounded capacity");
    const atlas = document.createElement("canvas");
    atlas.width = 1024;
    atlas.height = height;
    const context = atlas.getContext("2d")!;
    context.fillStyle = "white";
    context.fillRect(0, 0, 4, 4);
    this.white = { u: 2 / atlas.width, v: 2 / height, w: 0, h: 0 };
    this.regions.clear();
    for (const p of placements) {
      context.drawImage(p.image, p.x, p.y, p.w, p.h);
      this.regions.set(p.image, {
        u: p.x / atlas.width,
        v: p.y / height,
        w: p.w / atlas.width,
        h: p.h / height,
      });
    }
    this.atlas = atlas;
    this.upload();
  }
  get globalAlpha() {
    return this.state.alpha;
  }
  set globalAlpha(value: number) {
    if (value >= 0 && value <= 1) this.state.alpha = value;
  }
  get fillStyle() {
    return this.state.fill;
  }
  set fillStyle(value: string | CanvasGradient | CanvasPattern) {
    this.state.fill = value;
  }
  get strokeStyle() {
    return this.state.stroke;
  }
  set strokeStyle(value: string | CanvasGradient | CanvasPattern) {
    this.state.stroke = value;
  }
  get lineWidth() {
    return this.state.width;
  }
  set lineWidth(value: number) {
    this.state.width = value;
  }
  get lineDashOffset() {
    return this.state.offset;
  }
  set lineDashOffset(value: number) {
    this.state.offset = value;
  }
  get globalCompositeOperation() {
    return this.state.blend;
  }
  set globalCompositeOperation(value: GlobalCompositeOperation) {
    if (value !== "source-over" && value !== "screen")
      throw Error("Unsupported effect blend");
    if (this.state.blend !== value) {
      this.flush();
      this.state.blend = value;
      this.blend = value;
      this.applyBlend();
    }
  }
  private applyBlend() {
    if (!this.lost)
      this.gl.blendFuncSeparate(
        this.gl.ONE,
        this.blend === "screen"
          ? this.gl.ONE_MINUS_SRC_COLOR
          : this.gl.ONE_MINUS_SRC_ALPHA,
        this.gl.ONE,
        this.gl.ONE_MINUS_SRC_ALPHA,
      );
  }
  setTransform(
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ) {
    Object.assign(this.state, { a, b, c, d, e, f });
  }
  translate(x: number, y: number) {
    const s = this.state;
    s.e += s.a * x + s.c * y;
    s.f += s.b * x + s.d * y;
  }
  rotate(angle: number) {
    const s = this.state,
      c = Math.cos(angle),
      n = Math.sin(angle);
    const { a, b, c: sc, d } = s;
    s.a = a * c + sc * n;
    s.b = b * c + d * n;
    s.c = sc * c - a * n;
    s.d = d * c - b * n;
  }
  save() {
    const saved =
      this.stack[this.depth] ?? (this.stack[this.depth] = initial());
    Object.assign(saved, this.state);
    this.depth++;
  }
  restore() {
    if (!this.depth) return;
    const saved = this.stack[--this.depth]!;
    this.globalCompositeOperation = saved.blend;
    Object.assign(this.state, saved);
  }
  clearRect(_x: number, _y: number, _w: number, _h: number) {
    // Both effects clear their entire surface, including stop/pause/resize.
    this.cursor = this.draws = 0;
    if (!this.lost) {
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      this.gl.uniform2f(this.size, this.canvas.width, this.canvas.height);
      this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    }
  }
  private color(style: string | CanvasGradient | CanvasPattern) {
    if (typeof style !== "string")
      throw Error("Effect gradients are not supported");
    let color = this.colors.get(style);
    if (!color) {
      const values = style.startsWith("rgb")
        ? style.match(/[\d.]+/g)!.map(Number)
        : style === "white"
          ? [255, 255, 255]
          : [
              parseInt(style.slice(1, 3), 16),
              parseInt(style.slice(3, 5), 16),
              parseInt(style.slice(5, 7), 16),
            ];
      color = [values[0]! / 255, values[1]! / 255, values[2]! / 255];
      // Prism colors change over time; keep this cache bounded.
      if (this.colors.size >= 256) this.colors.clear();
      this.colors.set(style, color);
    }
    return color;
  }
  private vertex(x: number, y: number, u: number, v: number, color: number[]) {
    if (this.cursor + 8 > this.vertices.length) this.flush();
    const s = this.state,
      a = s.alpha,
      i = this.cursor,
      out = this.vertices;
    out[i] = s.a * x + s.c * y + s.e;
    out[i + 1] = s.b * x + s.d * y + s.f;
    out[i + 2] = u;
    out[i + 3] = v;
    out[i + 4] = color[0]! * a;
    out[i + 5] = color[1]! * a;
    out[i + 6] = color[2]! * a;
    out[i + 7] = a;
    this.cursor += 8;
  }
  private triangle(a: Point, b: Point, c: Point, color: number[]) {
    // Reserve whole triangles: a batch boundary must never split a primitive.
    if (this.cursor + 24 > this.vertices.length) this.flush();
    this.vertex(a[0], a[1], this.white.u, this.white.v, color);
    this.vertex(b[0], b[1], this.white.u, this.white.v, color);
    this.vertex(c[0], c[1], this.white.u, this.white.v, color);
  }
  fillRect(x: number, y: number, w: number, h: number) {
    const color = this.color(this.state.fill);
    this.triangle([x, y], [x + w, y], [x, y + h], color);
    this.triangle([x + w, y], [x + w, y + h], [x, y + h], color);
  }
  drawImage(
    image: CanvasImageSource,
    x: number,
    y: number,
    w: number,
    h: number,
  ) {
    const r = this.regions.get(image);
    if (!r) throw Error("Effect texture was not prepared before drawing");
    if (this.cursor + 48 > this.vertices.length) this.flush();
    // No per-sprite arrays in the animation hot path.
    this.vertex(x, y, r.u, r.v, WHITE);
    this.vertex(x + w, y, r.u + r.w, r.v, WHITE);
    this.vertex(x, y + h, r.u, r.v + r.h, WHITE);
    this.vertex(x + w, y, r.u + r.w, r.v, WHITE);
    this.vertex(x + w, y + h, r.u + r.w, r.v + r.h, WHITE);
    this.vertex(x, y + h, r.u, r.v + r.h, WHITE);
  }
  beginPath() {
    this.points = [];
    this.closed = false;
  }
  moveTo(x: number, y: number) {
    this.points.push([x, y]);
  }
  lineTo(x: number, y: number) {
    this.points.push([x, y]);
  }
  closePath() {
    this.closed = true;
  }
  arc(
    x: number,
    y: number,
    radius: number,
    start: number,
    end: number,
    counterclockwise = false,
  ) {
    this.ellipse(x, y, radius, radius, 0, start, end, counterclockwise);
  }
  ellipse(
    x: number,
    y: number,
    rx: number,
    ry: number,
    rotation: number,
    start: number,
    end: number,
    counterclockwise = false,
  ) {
    let span = end - start;
    if (counterclockwise && span > 0) span -= Math.PI * 2;
    if (!counterclockwise && span < 0) span += Math.PI * 2;
    span = Math.max(-Math.PI * 2, Math.min(Math.PI * 2, span));
    const scale = Math.hypot(this.state.a, this.state.b);
    const steps = Math.max(
      8,
      Math.min(
        512,
        Math.ceil(Math.abs(span) * Math.sqrt(Math.max(rx, ry) * scale * 2)),
      ),
    );
    const c = Math.cos(rotation),
      s = Math.sin(rotation);
    for (let i = 0; i <= steps; i++) {
      const angle = start + (span * i) / steps,
        px = Math.cos(angle) * rx,
        py = Math.sin(angle) * ry;
      this.points.push([x + px * c - py * s, y + px * s + py * c]);
    }
  }
  fill() {
    if (this.points.length < 3) return;
    const center: Point = [0, 0],
      color = this.color(this.state.fill);
    for (const p of this.points) {
      center[0] += p[0] / this.points.length;
      center[1] += p[1] / this.points.length;
    }
    // These effects use convex polygons, circles and centre-visible stars only.
    for (let i = 0; i < this.points.length; i++)
      this.triangle(
        center,
        this.points[i]!,
        this.points[(i + 1) % this.points.length]!,
        color,
      );
  }
  setLineDash(segments: number[]) {
    this.state.dash = segments;
  }
  strokeRect(x: number, y: number, w: number, h: number) {
    const old = this.points,
      closed = this.closed;
    this.points = [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ];
    this.closed = true;
    this.stroke();
    this.points = old;
    this.closed = closed;
  }
  stroke() {
    if (this.points.length < 2) return;
    if (this.points.length === 2 && !this.closed && !this.state.dash.length) {
      const a = this.points[0]!,
        b = this.points[1]!;
      const dx = b[0] - a[0],
        dy = b[1] - a[1],
        length = Math.hypot(dx, dy);
      if (!length) return;
      const x = ((-dy / length) * this.state.width) / 2,
        y = ((dx / length) * this.state.width) / 2;
      const color = this.color(this.state.stroke),
        { u, v } = this.white;
      if (this.cursor + 48 > this.vertices.length) this.flush();
      this.vertex(a[0] + x, a[1] + y, u, v, color);
      this.vertex(a[0] - x, a[1] - y, u, v, color);
      this.vertex(b[0] + x, b[1] + y, u, v, color);
      this.vertex(a[0] - x, a[1] - y, u, v, color);
      this.vertex(b[0] - x, b[1] - y, u, v, color);
      this.vertex(b[0] + x, b[1] + y, u, v, color);
      return;
    }
    const points = [...this.points];
    if (this.closed) points.push(points[0]!);
    const color = this.color(this.state.stroke),
      half = this.state.width / 2;
    const dash = this.state.dash,
      cycle = dash.reduce((a, b) => a + b, 0);
    if (!cycle) {
      // Shared miter vertices avoid gaps and double-blended seams at every arc
      // segment. Native GL lineWidth is not portable beyond one physical pixel.
      const closed =
        this.closed ||
        Math.hypot(
          points[0]![0] - points.at(-1)![0],
          points[0]![1] - points.at(-1)![1],
        ) < 0.00001;
      if (closed) points.pop();
      const offsets = points.map((point, i) => {
        const previous = points[i ? i - 1 : closed ? points.length - 1 : 0]!;
        const next = points[i < points.length - 1 ? i + 1 : closed ? 0 : i]!;
        const direction = (a: Point, b: Point): Point => {
          const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
          return length
            ? [-(b[1] - a[1]) / length, (b[0] - a[0]) / length]
            : [0, 0];
        };
        let before = direction(previous, point),
          after = direction(point, next);
        if (!closed && i === 0) before = after;
        if (!closed && i === points.length - 1) after = before;
        const mx = before[0] + after[0],
          my = before[1] + after[1];
        const dot = mx * after[0] + my * after[1];
        const factor =
          Math.abs(dot) > 0.00001 ? Math.min(half / dot, half * 10) : 0;
        return [mx * factor, my * factor] as Point;
      });
      const segments = closed ? points.length : points.length - 1;
      for (let i = 0; i < segments; i++) {
        const next = (i + 1) % points.length,
          p = points[i]!,
          q = points[next]!,
          a = offsets[i]!,
          b = offsets[next]!;
        this.triangle(
          [p[0] + a[0], p[1] + a[1]],
          [p[0] - a[0], p[1] - a[1]],
          [q[0] + b[0], q[1] + b[1]],
          color,
        );
        this.triangle(
          [p[0] - a[0], p[1] - a[1]],
          [q[0] - b[0], q[1] - b[1]],
          [q[0] + b[0], q[1] + b[1]],
          color,
        );
      }
      return;
    }
    let distance = this.state.offset;
    for (let i = 1; i < points.length; i++) {
      const p = points[i - 1]!,
        q = points[i]!,
        dx = q[0] - p[0],
        dy = q[1] - p[1],
        length = Math.hypot(dx, dy);
      if (!length) continue;
      const nx = (-dy / length) * half,
        ny = (dx / length) * half;
      let along = 0;
      while (along < length) {
        let count = length - along,
          paint = true;
        if (cycle > 0) {
          let phase = ((distance % cycle) + cycle) % cycle,
            index = 0;
          while (index < dash.length - 1 && phase >= dash[index]!)
            phase -= dash[index++]!;
          count = Math.min(count, Math.max(0.00001, dash[index]! - phase));
          paint = index % 2 === 0;
        }
        if (paint) {
          const ax = p[0] + (dx * along) / length,
            ay = p[1] + (dy * along) / length;
          const bx = p[0] + (dx * (along + count)) / length,
            by = p[1] + (dy * (along + count)) / length;
          this.triangle(
            [ax + nx, ay + ny],
            [ax - nx, ay - ny],
            [bx + nx, by + ny],
            color,
          );
          this.triangle(
            [ax - nx, ay - ny],
            [bx - nx, by - ny],
            [bx + nx, by + ny],
            color,
          );
        }
        along += count;
        distance += count;
      }
    }
  }
  private flush() {
    if (this.cursor && !this.lost) {
      this.gl.bufferSubData(
        this.gl.ARRAY_BUFFER,
        0,
        this.vertices.subarray(0, this.cursor),
      );
      this.gl.drawArrays(this.gl.TRIANGLES, 0, this.cursor / 8);
      this.draws++;
    }
    this.cursor = 0;
  }
  present() {
    this.flush();
    this.stats.draws = this.draws;
  }
}

export function createEffectSurface(layer: "ambient" | "festival"): {
  canvas: HTMLCanvasElement;
  painter: EffectPainter;
} {
  let canvas = document.createElement("canvas");
  let gl: WebGLRenderingContext | null = null;
  try {
    if (layer === "festival")
      gl = canvas.getContext("webgl", {
        alpha: true,
        premultipliedAlpha: true,
        antialias: true,
        depth: false,
        stencil: false,
      });
    if (gl) return { canvas, painter: new GpuEffectPainter(canvas, gl) };
  } catch {
    // A rejected context/shader must not stop the game. A canvas whose context
    // type was fixed to WebGL cannot be reused for Canvas2D.
  }
  gl?.getExtension("WEBGL_lose_context")?.loseContext();
  canvas = document.createElement("canvas");
  const painter = Object.assign(canvas.getContext("2d")!, {
    prepareImages: () => {},
    present: () => {},
  });
  canvas.dataset.effectRenderer = "canvas2d";
  return { canvas, painter };
}
