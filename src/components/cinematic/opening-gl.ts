// A small WebGL 1 kit for the opening's two full-quad shaders (the logo burn
// and the ENTER THE WORLD dive). It follows RISING THE WORLD's renderer
// (src/components/world/rising-fire.ts): resized ImageBitmaps (1-3 ms uploads
// instead of a main-thread decode), KHR_parallel_shader_compile polled once a
// frame, a resolution-first quality ladder, and loseContext() on dispose.
// Loaded with import() from the title, so the first paint does not carry it.
import NOISE_SOURCE from "./opening-noise.glsl?raw";

export type GlImage = {
  source: TexImageSource;
  width: number;
  height: number;
};

const VERTEX_SOURCE = "attribute vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }";

// Resolution first (a canvas resize, no recompile); fewer octaves and blur
// taps only as the last resorts.
export const OPENING_LADDER = [
  { scale: 1.0, octaves: 4, taps: 8 },
  { scale: 0.82, octaves: 4, taps: 8 },
  { scale: 0.68, octaves: 4, taps: 8 },
  { scale: 0.56, octaves: 4, taps: 8 },
  { scale: 0.46, octaves: 3, taps: 6 },
  { scale: 0.38, octaves: 2, taps: 4 },
] as const;

/**
 * Fetches `src` (normally from the HTTP cache: the page's <img> layers load
 * the same URL) and prepares it as an ImageBitmap of at most `maxWidth`
 * pixels, decoded off the main thread and premultiplied, so the upload is a
 * copy. Falls back to an <img>, which the upload then premultiplies.
 */
export async function loadGlImage(
  src: string,
  natural: { width: number; height: number },
  maxWidth: number,
): Promise<GlImage> {
  const ratio = Math.min(1, maxWidth / natural.width);
  const width = Math.max(1, Math.round(natural.width * ratio));
  const height = Math.max(1, Math.round(natural.height * ratio));
  try {
    const response = await fetch(src);
    if (!response.ok) throw new Error(`opening-art ${response.status}`);
    const blob = await response.blob();
    const options: ImageBitmapOptions = { premultiplyAlpha: "premultiply" };
    if (ratio < 1) {
      options.resizeWidth = width;
      options.resizeHeight = height;
      options.resizeQuality = "low"; // "medium" mipmaps on the main thread
    }
    const bitmap = await createImageBitmap(blob, options);
    return { source: bitmap, width: bitmap.width, height: bitmap.height };
  } catch {
    const image = new Image();
    image.decoding = "async";
    image.src = src;
    await image.decode();
    return { source: image, width: image.naturalWidth, height: image.naturalHeight };
  }
}

export function closeGlImage(image: GlImage | null | undefined) {
  if (image && typeof ImageBitmap !== "undefined" && image.source instanceof ImageBitmap) {
    image.source.close();
  }
}

export type ShaderPassOptions = {
  /** Premultiplied transparent canvas over the page (burn) or opaque (dive). */
  alpha: boolean;
  fragment: string;
  uniforms: readonly string[];
  textures: Record<string, GlImage>;
  /** Render pixels per frame at rung 0 (the ladder scales from there). */
  budget: number;
  /** The device-pixel ratio used at most. */
  dprCap: number;
  startRung: number;
};

/** One full-screen triangle and one fragment shader on a canvas. */
export class ShaderPass {
  readonly canvas: HTMLCanvasElement;
  rung: number;
  size = { width: 0, height: 0, scale: 0, rung: 0 };
  private gl: WebGLRenderingContext | null;
  private readonly options: ShaderPassOptions;
  private readonly parallel: { COMPLETION_STATUS_KHR: number } | null;
  private readonly buffer: WebGLBuffer | null;
  private readonly textures: { name: string; texture: WebGLTexture | null }[] = [];
  private program: WebGLProgram | null = null;
  private locations = new Map<string, WebGLUniformLocation | null>();
  private compiling: Promise<void> | null = null;
  private cssSize = { width: 0, height: 0 };

  /** Throws when WebGL is unavailable or software-only; the caller goes CSS. */
  constructor(canvas: HTMLCanvasElement, options: ShaderPassOptions) {
    this.canvas = canvas;
    this.options = options;
    this.rung = options.startRung;
    const gl = canvas.getContext("webgl", {
      alpha: options.alpha,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      // "default" avoids the dual-GPU switch hitch on Macs.
      powerPreference: "default",
      // Software GL (SwiftShader) would run the shader on the CPU.
      failIfMajorPerformanceCaveat: true,
    });
    if (!gl) throw new Error("no-webgl");
    this.gl = gl;
    this.parallel = gl.getExtension("KHR_parallel_shader_compile") as {
      COMPLETION_STATUS_KHR: number;
    } | null;
    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    // ImageBitmaps carry their own (premultiplied) alpha and ignore these;
    // an <img> fallback is premultiplied by the upload, like the bitmaps.
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    for (const [name, image] of Object.entries(options.textures)) {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image.source);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.textures.push({ name, texture });
    }
  }

  get lost() {
    return !this.gl || this.gl.isContextLost();
  }

  get ready() {
    return Boolean(this.gl && this.program);
  }

  /** Compiles the current rung. With KHR_parallel_shader_compile the wait never blocks. */
  async compile() {
    const gl = this.gl;
    if (!gl) throw new Error("disposed");
    const quality = OPENING_LADDER[this.rung];
    const shader = (type: number, source: string) => {
      const created = gl.createShader(type)!;
      gl.shaderSource(created, source);
      gl.compileShader(created);
      return created;
    };
    const vertex = shader(gl.VERTEX_SHADER, VERTEX_SOURCE);
    const fragment = shader(
      gl.FRAGMENT_SHADER,
      `#define OCTAVES ${quality.octaves}\n#define BLUR_TAPS ${quality.taps}\n${NOISE_SOURCE}\n${this.options.fragment}`,
    );
    const program = gl.createProgram()!;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.bindAttribLocation(program, 0, "aPos");
    gl.linkProgram(program);
    if (this.parallel) {
      while (
        this.gl === gl &&
        !gl.isContextLost() &&
        !gl.getProgramParameter(program, this.parallel.COMPLETION_STATUS_KHR)
      ) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
    }
    if (this.gl !== gl || gl.isContextLost()) throw new Error("context-lost");
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program) || gl.getShaderInfoLog(fragment) || "link";
      gl.deleteProgram(program);
      throw new Error(log);
    }
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (this.program) gl.deleteProgram(this.program);
    this.program = program;
    gl.useProgram(program);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.locations = new Map(
      this.options.uniforms.map((name) => [name, gl.getUniformLocation(program, name)]),
    );
    this.textures.forEach(({ name, texture }, unit) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(gl.getUniformLocation(program, name), unit);
    });
    if (this.cssSize.width) this.resize(this.cssSize.width, this.cssSize.height);
  }

  /** Sizes the drawing buffer for a canvas of this CSS size; returns the buffer size. */
  resize(cssWidth: number, cssHeight: number) {
    this.cssSize = { width: Math.max(1, cssWidth), height: Math.max(1, cssHeight) };
    const gl = this.gl;
    if (!gl) return this.size;
    const { budget, dprCap } = this.options;
    const ratio = Math.min(dprCap, Math.max(1, window.devicePixelRatio || 1));
    const area = this.cssSize.width * this.cssSize.height * ratio * ratio;
    const scale = ratio * Math.min(1, Math.sqrt(budget / area)) * OPENING_LADDER[this.rung].scale;
    const width = Math.max(32, Math.round(this.cssSize.width * scale));
    const height = Math.max(32, Math.round(this.cssSize.height * scale));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    this.size = { width, height, scale: Number(scale.toFixed(3)), rung: this.rung };
    if (this.program) this.set("uRes", width, height);
    return this.size;
  }

  set(name: string, ...values: number[]) {
    const gl = this.gl;
    if (!gl || !this.program) return;
    const at = this.locations.get(name) ?? null;
    if (!at) return;
    if (values.length === 1) gl.uniform1f(at, values[0]);
    else if (values.length === 2) gl.uniform2f(at, values[0], values[1]);
    else if (values.length === 3) gl.uniform3f(at, values[0], values[1], values[2]);
    else gl.uniform4f(at, values[0], values[1], values[2], values[3]);
  }

  draw() {
    const gl = this.gl;
    if (!gl || !this.program) return;
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Steps down the ladder. A recompile runs in the background; the old program keeps drawing. */
  degrade(onResized?: () => void) {
    if (!this.gl || this.compiling || this.rung >= OPENING_LADDER.length - 1) return false;
    const from = OPENING_LADDER[this.rung];
    this.rung += 1;
    const to = OPENING_LADDER[this.rung];
    if (from.octaves === to.octaves && from.taps === to.taps) {
      this.resize(this.cssSize.width, this.cssSize.height);
      onResized?.();
      return true;
    }
    this.compiling = this.compile()
      .then(() => onResized?.())
      .catch(() => undefined)
      .finally(() => {
        this.compiling = null;
      });
    return true;
  }

  /** Frees GPU memory now rather than at GC, and leaves a 1x1 canvas. */
  dispose() {
    const gl = this.gl;
    if (!gl) return;
    this.gl = null;
    if (!gl.isContextLost()) {
      for (const { texture } of this.textures) gl.deleteTexture(texture);
      gl.deleteBuffer(this.buffer);
      if (this.program) gl.deleteProgram(this.program);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
    this.program = null;
    this.canvas.width = 1;
    this.canvas.height = 1;
  }
}

/**
 * Adaptive quality: the median draw interval over the last 24 draws against
 * the draw cadence (frames per draw x the measured rAF interval), so neither a
 * 90/120 Hz panel nor a 30 Hz battery-saver cap walks the ladder down for
 * nothing. Returns true when it stepped down.
 */
export function shouldDegrade(
  drawTimes: number[],
  cadenceMs: number | null,
  framesPerDraw: number,
) {
  if (drawTimes.length < 30 || drawTimes.length % 24) return false;
  const recent = drawTimes
    .slice(-24)
    .map((time, index, list) => (index ? time - list[index - 1] : 0))
    .slice(1)
    .sort((a, b) => a - b);
  const median = recent[Math.floor(recent.length / 2)];
  const expected = (cadenceMs ?? 1000 / 60) * framesPerDraw;
  return median > Math.max(20.5, expected * 1.35);
}
