// RISING THE WORLD: the WebGL renderer. One full-screen fragment shader draws
// the dive, the burn, the flames, the smoke and the sparks (rising.frag.glsl),
// reading its turbulence from a small tileable noise texture that a second
// shader bakes once per run (rising-noise.frag.glsl). This module is loaded
// with import() from the gate, so the World bundle does not carry it.
import FRAGMENT_SOURCE from "./rising.frag.glsl?raw";
import NOISE_SOURCE from "./rising-noise.frag.glsl?raw";
import {
  RISING_COMPACT_PIXEL_BUDGET,
  RISING_WIDE_PIXEL_BUDGET,
  RISING_WORLD_FOCUS,
  RISING_WORLD_POSITION,
  risingStartRung,
  risingUniformsAt,
} from "./rising-timing";

export type RisingImage = {
  source: TexImageSource;
  aspect: number;
};

export type RisingAssets = {
  world: RisingImage;
  rider: RisingImage;
};

const VERTEX_SOURCE = "attribute vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }";

const UNIFORM_NAMES = [
  "uRes",
  "uTime",
  "uZoom",
  "uArrive",
  "uOpen",
  "uBlur",
  "uDive",
  "uWarp",
  "uBurn",
  "uFlame",
  "uShock",
  "uReveal",
  "uHeat",
  "uWorldScale",
  "uRiderScale",
  "uFrame",
  "uFocus",
  "uWorld",
  "uRider",
  "uNoise",
] as const;

type UniformName = (typeof UNIFORM_NAMES)[number];

// Resolution first (a canvas resize, no recompile); then the last resorts
// drop whole layers (rising.frag.glsl): octaves 3 loses the smoke detail and
// self-shadow, the ash, the haze, the large blisters, the second spark layer
// and the drifting embers; octaves 2 also the smoke, the sparks, the small
// flame eddies, the crack breaks and the ember specks. Fewer blur taps with
// them. Compact screens within budget start on rung 0, the rest on rung 1
// (risingStartRung).
export const RISING_LADDER = [
  { scale: 1.0, octaves: 4, taps: 8 },
  { scale: 0.75, octaves: 4, taps: 8 },
  { scale: 0.62, octaves: 4, taps: 8 },
  { scale: 0.5, octaves: 4, taps: 8 },
  { scale: 0.42, octaves: 3, taps: 6 },
  { scale: 0.36, octaves: 2, taps: 4 },
] as const;

// The baked noise tile: power of two (REPEAT and mipmaps in WebGL 1), 256 KB.
const NOISE_SIZE = 256;

/**
 * A resized ImageBitmap: uploads in 1-3 ms instead of 20-90 ms. The source is
 * a Blob, which is decoded on a decoder thread; the bilinear ("low") resize is
 * the only main-thread work (<2 ms at 1x). An <img> source would be decoded
 * and resized synchronously on the main thread (about 100 ms for the poster at
 * 4x CPU), in the middle of the reader's scroll towards the gate.
 */
async function loadBitmap(src: string, maxSide: number): Promise<RisingImage> {
  const image = new Image();
  image.decoding = "async";
  image.src = src;
  await image.decode(); // natural size; decoded off the main thread
  const ratio = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * ratio));
  const height = Math.max(1, Math.round(image.naturalHeight * ratio));
  try {
    // HTTP cache: the finale backdrop and the world-enter assets load the same files.
    const response = await fetch(image.currentSrc || src);
    if (!response.ok) throw new Error(`rising-art ${response.status}`);
    const bitmap = await createImageBitmap(await response.blob(), {
      resizeWidth: width,
      resizeHeight: height,
      resizeQuality: "low", // "medium" mipmaps on the main thread: ~27 ms at 4x CPU
    });
    return { source: bitmap, aspect: width / height };
  } catch {
    return { source: image, aspect: image.naturalWidth / image.naturalHeight };
  }
}

let prepared: Promise<RisingAssets> | null = null;
let preparedKey = "";
let preparedValue: RisingAssets | null = null;

/** Idempotent. Called when the gate nears the viewport and again on pointerdown/focus. */
export function prepareRisingAssets(world: string, rider: string) {
  const key = `${world}|${rider}`;
  if (!prepared || preparedKey !== key) {
    preparedKey = key;
    preparedValue = null;
    const pending: Promise<RisingAssets> = Promise.all([
      loadBitmap(world, 1024),
      loadBitmap(rider, 768),
    ]).then(
      ([worldImage, riderImage]) => {
        const assets = { world: worldImage, rider: riderImage };
        if (prepared === pending) preparedValue = assets;
        return assets;
      },
      (error: unknown) => {
        if (prepared === pending) prepared = null;
        throw error;
      },
    );
    prepared = pending;
  }
  return prepared;
}

/** The prepared assets if they are already decoded, without waiting. */
export function preparedRisingAssets(world: string, rider: string) {
  return preparedKey === `${world}|${rider}` ? preparedValue : null;
}

/**
 * Closes the prepared bitmaps (about 4.6 MB decoded) when the gate unmounts;
 * the next approach prepares them again. A prepare still in flight goes stale
 * (prepared !== pending) and its bitmaps are left to GC, since a run may be
 * awaiting that promise. Primed renderers have already uploaded their textures.
 */
export function releaseRisingAssets() {
  const value = preparedValue;
  prepared = null;
  preparedKey = "";
  preparedValue = null;
  for (const image of value ? [value.world, value.rider] : []) {
    if (typeof ImageBitmap !== "undefined" && image.source instanceof ImageBitmap) {
      image.source.close();
    }
  }
}

export type FireRendererOptions = {
  assets: RisingAssets;
  compact: boolean;
};

export class FireRenderer {
  readonly canvas: HTMLCanvasElement;
  rung: number;
  size: { width: number; height: number; scale: number; rung: number };
  private gl: WebGLRenderingContext | null;
  private readonly parallel: { COMPLETION_STATUS_KHR: number } | null;
  private readonly compact: boolean;
  private readonly buffer: WebGLBuffer | null;
  private readonly worldTexture: WebGLTexture | null;
  private readonly riderTexture: WebGLTexture | null;
  private readonly noiseTexture: WebGLTexture | null;
  private noiseBaked = false;
  private readonly worldAspect: number;
  private readonly riderAspect: number;
  private program: WebGLProgram | null = null;
  private locations: Partial<Record<UniformName, WebGLUniformLocation | null>> = {};
  private compiling: Promise<void> | null = null;

  /** Throws when WebGL is unavailable or software-only; the caller goes calm. */
  constructor(canvas: HTMLCanvasElement, { assets, compact }: FireRendererOptions) {
    this.canvas = canvas;
    this.compact = compact;
    // Window size: the canvas may still be detached (primed at pointerdown).
    this.rung = risingStartRung(compact, window.innerWidth, window.innerHeight);
    this.size = { width: 0, height: 0, scale: 0, rung: this.rung };
    const gl = canvas.getContext("webgl", {
      // Opaque: an alpha canvas over the page forces blending on Android.
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      // "default" avoids the dual-GPU switch hitch on Macs.
      powerPreference: "default",
      // Software GL (SwiftShader) would run the whole shader on the CPU.
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
    this.worldTexture = this.texture(assets.world.source);
    this.riderTexture = this.texture(assets.rider.source);
    this.noiseTexture = this.noiseTarget();
    this.worldAspect = assets.world.aspect;
    this.riderAspect = assets.rider.aspect;
  }

  get lost() {
    return !this.gl || this.gl.isContextLost();
  }

  private texture(source: TexImageSource) {
    const gl = this.gl!;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    // Top-down (ImageBitmap ignores UNPACK_FLIP_Y_WEBGL); the shader flips V.
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  }

  /** The noise tile's storage: rendered into by the bake, then mipmapped. */
  private noiseTarget() {
    const gl = this.gl!;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    // RGBA / UNSIGNED_BYTE: the one colour attachment WebGL 1 guarantees complete.
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      NOISE_SIZE,
      NOISE_SIZE,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    return texture;
  }

  /**
   * Draws the noise tile once (about 65k pixels) and mipmaps it, so the flames
   * sampled far below texel size stay smooth instead of shimmering.
   */
  private bakeNoise(program: WebGLProgram) {
    const gl = this.gl!;
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.noiseTexture,
      0,
    );
    gl.useProgram(program);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.uniform1f(gl.getUniformLocation(program, "uSize"), NOISE_SIZE);
    gl.viewport(0, 0, NOISE_SIZE, NOISE_SIZE);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(framebuffer);
    gl.bindTexture(gl.TEXTURE_2D, this.noiseTexture);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.deleteProgram(program);
    this.noiseBaked = true;
  }

  /**
   * Compiles the current rung (and, the first time, the noise bake). With
   * KHR_parallel_shader_compile the wait never blocks.
   */
  async compile() {
    const gl = this.gl;
    if (!gl) throw new Error("disposed");
    const quality = RISING_LADDER[this.rung];
    const link = (source: string) => {
      const shader = (type: number, text: string) => {
        const created = gl.createShader(type)!;
        gl.shaderSource(created, text);
        gl.compileShader(created);
        return created;
      };
      const vertex = shader(gl.VERTEX_SHADER, VERTEX_SOURCE);
      const fragment = shader(gl.FRAGMENT_SHADER, source);
      const program = gl.createProgram()!;
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.bindAttribLocation(program, 0, "aPos");
      gl.linkProgram(program);
      return { program, vertex, fragment };
    };
    const main = link(
      `#define OCTAVES ${quality.octaves}\n#define BLUR_TAPS ${quality.taps}\n${FRAGMENT_SOURCE}`,
    );
    const bake = this.noiseBaked ? null : link(NOISE_SOURCE);
    const linked = [main, ...(bake ? [bake] : [])];
    if (this.parallel) {
      const status = this.parallel.COMPLETION_STATUS_KHR;
      while (
        this.gl === gl &&
        !gl.isContextLost() &&
        !linked.every(({ program }) => gl.getProgramParameter(program, status))
      ) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
    }
    if (this.gl !== gl || gl.isContextLost()) throw new Error("context-lost");
    for (const { program, fragment } of linked) {
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(program) || gl.getShaderInfoLog(fragment) || "link";
        for (const entry of linked) gl.deleteProgram(entry.program);
        throw new Error(log);
      }
    }
    for (const { vertex, fragment } of linked) {
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    if (bake) this.bakeNoise(bake.program);
    const program = main.program;
    if (this.program) gl.deleteProgram(this.program);
    this.program = program;
    gl.useProgram(program);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.locations = Object.fromEntries(
      UNIFORM_NAMES.map((name) => [name, gl.getUniformLocation(program, name)]),
    );
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.worldTexture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.riderTexture);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.noiseTexture);
    gl.uniform1i(this.locations.uWorld ?? null, 0);
    gl.uniform1i(this.locations.uRider ?? null, 1);
    gl.uniform1i(this.locations.uNoise ?? null, 2);
    this.resize();
  }

  resize() {
    const gl = this.gl;
    if (!gl || !this.program) return;
    const rect = this.canvas.getBoundingClientRect();
    const cssWidth = Math.max(1, rect.width || window.innerWidth);
    const cssHeight = Math.max(1, rect.height || window.innerHeight);
    const budget = this.compact ? RISING_COMPACT_PIXEL_BUDGET : RISING_WIDE_PIXEL_BUDGET;
    const budgetScale = Math.min(1, Math.sqrt(budget / (cssWidth * cssHeight)));
    const scale = budgetScale * RISING_LADDER[this.rung].scale;
    const width = Math.max(64, Math.round(cssWidth * scale));
    const height = Math.max(64, Math.round(cssHeight * scale));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    const screen = width / height;
    const cover = (aspect: number): [number, number] =>
      screen > aspect ? [1, aspect / screen] : [screen / aspect, 1];
    const worldScale = cover(this.worldAspect);
    // The centre of the crop that object-fit: cover with RISING_WORLD_POSITION
    // shows (the portal and calm images), in the shader's y-up image space.
    const [px, py] = RISING_WORLD_POSITION;
    const frame: [number, number] = [
      px * (1 - worldScale[0]) + worldScale[0] / 2,
      1 - (py * (1 - worldScale[1]) + worldScale[1] / 2),
    ];
    // The rider is fitted by height on landscape screens (never cropped to the chest).
    const riderScale: [number, number] =
      screen > this.riderAspect ? [screen / this.riderAspect, 1] : cover(this.riderAspect);
    const at = this.locations;
    gl.uniform2f(at.uRes ?? null, width, height);
    gl.uniform2f(at.uWorldScale ?? null, worldScale[0], worldScale[1]);
    gl.uniform2f(at.uRiderScale ?? null, riderScale[0], riderScale[1]);
    gl.uniform2f(at.uFrame ?? null, frame[0], frame[1]);
    gl.uniform2f(at.uFocus ?? null, RISING_WORLD_FOCUS[0], RISING_WORLD_FOCUS[1]);
    this.size = { width, height, scale: Number(scale.toFixed(3)), rung: this.rung };
  }

  /** Steps down the ladder. A recompile runs in the background; the old program keeps drawing. */
  degrade() {
    if (!this.gl || this.compiling || this.rung >= RISING_LADDER.length - 1) return false;
    const from = RISING_LADDER[this.rung];
    this.rung += 1;
    const to = RISING_LADDER[this.rung];
    if (from.octaves === to.octaves && from.taps === to.taps) {
      this.resize();
      return true;
    }
    this.compiling = this.compile()
      .catch(() => undefined)
      .finally(() => {
        this.compiling = null;
      });
    return true;
  }

  render(T: number) {
    const gl = this.gl;
    if (!gl || !this.program) return;
    const uniforms = risingUniformsAt(T);
    const at = this.locations;
    gl.uniform1f(at.uTime ?? null, T);
    for (const name of Object.keys(uniforms) as (keyof typeof uniforms)[]) {
      gl.uniform1f(at[name] ?? null, uniforms[name]);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Frees GPU memory now rather than at GC, and leaves a 1x1 canvas. */
  dispose() {
    const gl = this.gl;
    if (!gl) return;
    this.gl = null;
    if (!gl.isContextLost()) {
      gl.deleteTexture(this.worldTexture);
      gl.deleteTexture(this.riderTexture);
      gl.deleteTexture(this.noiseTexture);
      gl.deleteBuffer(this.buffer);
      if (this.program) gl.deleteProgram(this.program);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
    this.program = null;
    this.canvas.width = 1;
    this.canvas.height = 1;
  }
}
