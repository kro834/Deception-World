// WebGL renderer for the RISING THE WORLD sequence: a dive into the key
// visual, a burn front that eats it from below, rising flames and embers, and
// the Rexonance art showing through the ash once the title has cut in.
// Everything is one full-screen fragment shader at a capped resolution; the
// context exists only while the dialog is open and is lost on dispose.

export type RisingFrame = {
  time: number;
  alpha: number;
  dive: number;
  arrive: number;
  burn: number;
  heat: number;
  cut: number;
  settle: number;
};

const VERTEX = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const FRAGMENT = (octaves: number) => `
precision mediump float;
#define OCTAVES ${octaves}
varying vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform float uAlpha;
uniform float uDive;
uniform float uArrive;
uniform float uBurn;
uniform float uHeat;
uniform float uCut;
uniform float uSettle;
uniform sampler2D uWorld;
uniform sampler2D uNext;
uniform float uWorldAspect;
uniform float uNextAspect;
uniform float uHasWorld;
uniform float uHasNext;

float hash(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < OCTAVES; i++) {
    value += amplitude * noise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    amplitude *= 0.5;
  }
  return value;
}

vec2 coverUv(vec2 uv, float imageAspect, float viewAspect) {
  vec2 s = viewAspect > imageAspect
    ? vec2(1.0, imageAspect / viewAspect)
    : vec2(viewAspect / imageAspect, 1.0);
  return (uv - 0.5) * s + 0.5;
}

void main() {
  vec2 uv = vUv;
  float aspect = uRes.x / uRes.y;
  vec2 centred = (uv - 0.5) * vec2(aspect, 1.0);
  float radius = length(centred);
  float angle = atan(centred.y, centred.x);
  float t = uTime;

  // Heat haze bends the world while it burns.
  vec2 haze = vec2(
    fbm(uv * 7.0 + vec2(0.0, -t * 1.4)) - 0.5,
    fbm(uv * 6.0 + vec2(3.1, -t * 1.1)) - 0.5
  ) * 0.018 * uHeat;

  // Dive: a plunge toward the centre of the key visual, smeared radially.
  float zoom = 1.0 + 5.0 * uDive * uDive * uDive;
  vec2 dir = uv - 0.5;
  vec3 world = vec3(0.0);
  for (int k = 0; k < 4; k++) {
    float smear = float(k) * 0.03 * uDive;
    world += texture2D(uWorld, coverUv((uv - dir * smear - 0.5) / zoom + 0.5 + haze, uWorldAspect, aspect)).rgb;
  }
  world *= 0.25;
  world = mix(vec3(0.02, 0.03, 0.06), world, uHasWorld);

  vec3 col = world * (0.62 + 0.38 * (1.0 - uDive));

  // Speed streaks race outward during the dive.
  float streak = pow(noise(vec2(angle * 38.0, radius * 3.0 - t * 9.0)), 10.0) * smoothstep(0.08, 0.7, radius);
  col += vec3(0.72, 0.9, 1.0) * streak * uDive * 2.2;

  // Arrival: a short exposure lift as the camera passes into the world.
  col *= 1.0 + uArrive * 0.8;

  // The burn front rises from below, broken up by noise.
  float n = fbm(uv * vec2(2.4 * aspect, 3.0) + vec2(0.0, -t * 0.12));
  float front = uv.y * 0.55 + n * 0.75;
  float level = uBurn * 1.45;
  float burnt = smoothstep(front - 0.015, front + 0.015, level);
  float rim = smoothstep(front - 0.13, front, level) - burnt;
  vec3 next = texture2D(uNext, coverUv(uv + haze * 0.5, uNextAspect, aspect)).rgb * uHasNext;
  vec3 ash = vec3(0.045, 0.012, 0.01);
  vec3 revealed = mix(ash, next * vec3(1.05, 0.5, 0.38) * 0.85, uCut * 0.9);
  col = mix(col * mix(vec3(1.0), vec3(0.95, 0.52, 0.42), clamp(uBurn * 1.3, 0.0, 1.0)), revealed, burnt);
  col += vec3(1.0, 0.34, 0.05) * rim * 2.4;

  // Flames climb as the heat builds, then sink back to embers.
  vec2 fp = vec2(uv.x * aspect * 2.2, uv.y * 1.7 - t * 1.05);
  float fold = fbm(fp + vec2(fbm(fp * 1.6 + vec2(0.0, -t * 0.6)), 0.0));
  float height = mix(0.15, 1.05, uHeat) * (1.0 - uSettle * 0.72);
  float flame = fold * 1.35 - uv.y / max(height, 0.05) * 0.9;
  float flameMask = smoothstep(0.0, 0.55, flame) * uHeat;
  vec3 fire = mix(vec3(0.42, 0.02, 0.0), vec3(1.0, 0.4, 0.05), smoothstep(0.1, 0.6, flame));
  fire = mix(fire, vec3(1.0, 0.86, 0.52), smoothstep(0.55, 0.95, flame));
  col = mix(col, fire, flameMask);

  // Embers drift upward.
  float embers = 0.0;
  for (int layer = 0; layer < 2; layer++) {
    float l = float(layer);
    vec2 g = vec2(uv.x * aspect, uv.y) * (14.0 + l * 9.0) + vec2(l * 3.7, -t * (1.6 + l * 0.9));
    vec2 cell = floor(g);
    float seed = hash(cell + l);
    vec2 pos = fract(g) - 0.5 + (vec2(hash(cell + 3.1), hash(cell + 7.7)) - 0.5) * 0.6;
    embers += smoothstep(0.09, 0.0, length(pos)) * step(0.82, seed);
  }
  col += vec3(1.0, 0.52, 0.14) * embers * uHeat * 1.3;

  // When the title cuts in, everything but the flames drops into shadow.
  col *= 1.0 - uCut * 0.38 * (1.0 - flameMask);
  col *= 1.0 - smoothstep(0.55, 1.25, radius) * 0.72;
  col = 1.0 - exp(-col * 1.35);
  gl_FragColor = vec4(col * uAlpha, uAlpha);
}`;

type Uniforms = Record<
  | "uRes"
  | "uTime"
  | "uAlpha"
  | "uDive"
  | "uArrive"
  | "uBurn"
  | "uHeat"
  | "uCut"
  | "uSettle"
  | "uWorld"
  | "uNext"
  | "uWorldAspect"
  | "uNextAspect"
  | "uHasWorld"
  | "uHasNext",
  WebGLUniformLocation | null
>;

export type RisingFireProfile = { scale: number; octaves: number };

/** Same budget family as the opening dive canvas: small screens and coarse
 * pointers draw far fewer pixels, and the shader drops an octave. */
export function selectRisingFireProfile(width: number, height: number): RisingFireProfile {
  const device = navigator as Navigator & { deviceMemory?: number };
  const coarse = window.matchMedia("(any-pointer: coarse)").matches;
  const compact = coarse || width < 760;
  const lowPower =
    (device.hardwareConcurrency || 8) <= 4 ||
    (device.deviceMemory !== undefined && device.deviceMemory <= 4);
  const maxPixels = compact ? 520_000 : lowPower ? 900_000 : 1_600_000;
  const budget = Math.sqrt(maxPixels / Math.max(1, width * height));
  const cap = compact ? 1 : 1.25;
  const scale = Math.max(0.45, Math.min(window.devicePixelRatio || 1, cap, budget));
  return { scale, octaves: compact || lowPower ? 4 : 5 };
}

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function blankTexture(gl: WebGLRenderingContext) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([4, 8, 15, 255]),
  );
  return texture;
}

export class RisingFire {
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private buffer: WebGLBuffer | null;
  private uniforms: Uniforms;
  private textures: [WebGLTexture | null, WebGLTexture | null];
  private aspects: [number, number] = [1, 1];
  private loaded: [number, number] = [0, 0];
  private canvas: HTMLCanvasElement;
  private scale: number;

  static create(canvas: HTMLCanvasElement, profile: RisingFireProfile): RisingFire | null {
    let gl: WebGLRenderingContext | null = null;
    try {
      gl = canvas.getContext("webgl", {
        alpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: true,
        preserveDrawingBuffer: false,
        powerPreference: "high-performance",
      });
    } catch {
      gl = null;
    }
    if (!gl) return null;
    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT(profile.octaves));
    if (!vertex || !fragment) return null;
    const program = gl.createProgram();
    if (!program) return null;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
    return new RisingFire(gl, program, canvas, profile.scale);
  }

  private constructor(
    gl: WebGLRenderingContext,
    program: WebGLProgram,
    canvas: HTMLCanvasElement,
    scale: number,
  ) {
    this.gl = gl;
    this.program = program;
    this.canvas = canvas;
    this.scale = scale;
    gl.useProgram(program);
    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const names = [
      "uRes",
      "uTime",
      "uAlpha",
      "uDive",
      "uArrive",
      "uBurn",
      "uHeat",
      "uCut",
      "uSettle",
      "uWorld",
      "uNext",
      "uWorldAspect",
      "uNextAspect",
      "uHasWorld",
      "uHasNext",
    ] as const;
    this.uniforms = Object.fromEntries(
      names.map((name) => [name, gl.getUniformLocation(program, name)]),
    ) as Uniforms;
    this.textures = [blankTexture(gl), blankTexture(gl)];
    for (const texture of this.textures) {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    this.resize();
  }

  /** Uploads a decoded image as the world (0) or the revealed art (1). */
  setImage(slot: 0 | 1, image: HTMLImageElement) {
    const gl = this.gl;
    if (!image.naturalWidth) return;
    gl.bindTexture(gl.TEXTURE_2D, this.textures[slot]);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    this.aspects[slot] = image.naturalWidth / image.naturalHeight;
    this.loaded[slot] = 1;
  }

  resize() {
    const width = Math.max(1, Math.round(this.canvas.clientWidth * this.scale));
    const height = Math.max(1, Math.round(this.canvas.clientHeight * this.scale));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.gl.viewport(0, 0, width, height);
  }

  render(frame: RisingFrame) {
    const gl = this.gl;
    const u = this.uniforms;
    gl.useProgram(this.program);
    gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(u.uTime, frame.time);
    gl.uniform1f(u.uAlpha, frame.alpha);
    gl.uniform1f(u.uDive, frame.dive);
    gl.uniform1f(u.uArrive, frame.arrive);
    gl.uniform1f(u.uBurn, frame.burn);
    gl.uniform1f(u.uHeat, frame.heat);
    gl.uniform1f(u.uCut, frame.cut);
    gl.uniform1f(u.uSettle, frame.settle);
    gl.uniform1f(u.uWorldAspect, this.aspects[0]);
    gl.uniform1f(u.uNextAspect, this.aspects[1]);
    gl.uniform1f(u.uHasWorld, this.loaded[0]);
    gl.uniform1f(u.uHasNext, this.loaded[1]);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.textures[0]);
    gl.uniform1i(u.uWorld, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.textures[1]);
    gl.uniform1i(u.uNext, 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose() {
    const gl = this.gl;
    for (const texture of this.textures) gl.deleteTexture(texture);
    gl.deleteBuffer(this.buffer);
    gl.deleteProgram(this.program);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const easeIn = (value: number) => value * value * value;
const easeOut = (value: number) => 1 - (1 - value) ** 3;

/** Timings in seconds. The title cuts in at CUT; the fire settles by END. */
export const RISING_TIMING = {
  diveEnd: 1.45,
  cut: 4.3,
  controls: 5.1,
  end: 11,
} as const;

export function risingFrameAt(time: number): RisingFrame {
  const { diveEnd, cut, end } = RISING_TIMING;
  return {
    time,
    alpha: easeOut(clamp01(time / 0.35)),
    dive: time < diveEnd ? easeIn(clamp01(time / diveEnd)) : 0,
    arrive: time >= diveEnd ? Math.max(0, 1 - (time - diveEnd) / 0.45) : 0,
    burn: easeOut(clamp01((time - diveEnd - 0.1) / 3.6)),
    heat: easeOut(clamp01((time - diveEnd + 0.1) / 1.8)),
    cut: time >= cut ? 1 : 0,
    settle: easeOut(clamp01((time - 7) / (end - 7))),
  };
}
