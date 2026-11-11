/* REXONANCE SKIN (owner, 2026-11-11: the suit-up 「ナノテクのように滑らかで
   緻密に」). The armour no longer arrives as plates and tiles: it grows from
   the reactor as one continuous front of liquid nanite metal that runs over
   the torso, down the limbs to the hands and feet, along the tail and the
   ribbons, and last of all rises from the neck and closes over the face.
   Behind the front, four bands a few tens of pixels deep travel with it:

     the lip      dark chrome with a white-hot leading edge;
     the fibres   striations along the flow, still unpainted metal;
     the cells    a hexagonal micro-tessellation whose cells click solid one
                  by one and take the art's colour, while the panel lines
                  light and cool;
     the armour   the art itself (its lights still held, as the call keeps
                  them, until the suit is whole).

   The front is a comparison against a field baked once from the art: the
   geodesic distance inside the armour's silhouette from the reactor (and the
   delayed satellite seeds at the driver, the shoulders and the knees), in
   regions taken from the suit's own plates so the helmet is last, with a
   fingered edge (noise) and veins that race ahead down each limb. One
   fragment shader draws it on a figure-sized WebGL canvas: one quad a frame,
   whatever the device. Droplets skim just ahead of the front and are drawn
   back into it; nothing flies anywhere else.

   Everything is closed-form in the two fronts the caller passes (the body's
   and the head's), so the entry plays it on the call's clock and the scroll
   scene scrubs it both ways. This module imports nothing and is fetched on
   its own, lazily, only where Rexonance's suit-up plays; without WebGL (or
   if anything here fails) the classic nanite engines play instead. */

/** The bands' depth in field units (wider reads as a cross-fade). */
export const SKIN_BAND = 0.06;
/** A texel is finished armour this many bands behind the front. */
export const SKIN_BANDS = 5;
/** The front's value once every texel is finished. */
export const SKIN_WHOLE = 1 + (SKIN_BANDS + 0.4) * SKIN_BAND;

/* ---------------- the device budget ---------------- */

export type SkinBudget = {
  /** Droplet samples over the whole armour (about a tenth are live at once:
   * 600 on a desktop, 250 on a phone). */
  samples: number;
  /** The highest backing-store ratio of the skin's canvas. */
  ratio: number;
};

type BudgetEnvironment = {
  navigator?: { deviceMemory?: number; hardwareConcurrency?: number };
  matchMedia?: (query: string) => { matches: boolean };
  innerWidth?: number;
  innerHeight?: number;
};

/** The skin's budget by device; none under reduced motion. */
export function skinBudget(environment: BudgetEnvironment = globalThis): SkinBudget | null {
  const media = (query: string) => Boolean(environment.matchMedia?.(query).matches);
  if (media("(prefers-reduced-motion: reduce)")) return null;
  if (!media("(pointer: coarse), (any-pointer: coarse)")) return { samples: 6000, ratio: 2 };
  const memory = environment.navigator?.deviceMemory;
  const cores = environment.navigator?.hardwareConcurrency ?? 0;
  if ((memory !== undefined && memory <= 4) || (cores > 0 && cores <= 4))
    return { samples: 1200, ratio: 1.5 };
  const short = Math.min(environment.innerWidth || 0, environment.innerHeight || 0);
  return short >= 700 ? { samples: 3600, ratio: 2 } : { samples: 2500, ratio: 2 };
}

/** The canvas's quality at each of the crescendo governor's levels. */
export const SKIN_QUALITY = [1, 1, 0.75, 0.55] as const;

/* ---------------- the field's picture ---------------- */

/** The baked field (scripts/build-rexonance-skin.mjs): an opaque RGB
 * picture, R the field, G the veins, B the armour's mask (128 the body, 255
 * the head; rexonance-suit-skin-field.ts SKIN_MASK). */
export const REXONANCE_SKIN_FIELD = "/rexonance-skin-20261111/field.png";

export type SkinField = {
  w: number;
  h: number;
  /** Droplet samples by field value, the body's then the head's: x, y
   * (cells), the field, the flow's direction x, y, a seed. */
  samples: Float32Array;
  bodySamples: number;
  headSamples: number;
};
export const SKIN_SAMPLE = 6;

const hash2 = (x: number, y: number) => {
  const h = Math.imul(Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263), 1274126177) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
};

/** The droplets' samples from the field picture's pixels (RGBA, w x h): a
 * share of the armour's cells, `budget` in all, each with the flow's
 * direction there (the field's gradient), sorted by field value. */
export function skinSamples(
  rgba: Uint8ClampedArray | Uint8Array,
  w: number,
  h: number,
  budget: number,
): SkinField {
  const size = w * h;
  const part = (i: number) => (rgba[i * 4 + 2] === 255 ? 2 : rgba[i * 4 + 2] === 128 ? 1 : 0);
  const pick = (want: number, count: number) => {
    let total = 0;
    for (let i = 0; i < size; i += 1) if (part(i) === want) total += 1;
    const share = total ? Math.min(1, count / total) : 0;
    const rows: number[][] = [];
    for (let i = 0; i < size; i += 1) {
      if (part(i) !== want) continue;
      const x = i % w;
      const y = (i - x) / w;
      if (hash2(x + 31, y + 57) >= share) continue;
      const at = (dx: number, dy: number) => {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) return rgba[i * 4];
        const j = ny * w + nx;
        return part(j) === want ? rgba[j * 4] : rgba[i * 4];
      };
      const gx = at(2, 0) - at(-2, 0);
      const gy = at(0, 2) - at(0, -2);
      const length = Math.hypot(gx, gy);
      rows.push([
        x + 0.5,
        y + 0.5,
        rgba[i * 4] / 255,
        length > 0 ? gx / length : 0,
        length > 0 ? gy / length : 1,
        hash2(x + 3, y + 11),
      ]);
    }
    rows.sort((a, b) => a[2] - b[2]);
    return rows;
  };
  const headBudget = Math.round(budget * 0.18);
  const body = pick(1, budget - headBudget);
  const crown = pick(2, headBudget);
  const samples = new Float32Array((body.length + crown.length) * SKIN_SAMPLE);
  body.forEach((row, n) => samples.set(row, n * SKIN_SAMPLE));
  crown.forEach((row, n) => samples.set(row, (body.length + n) * SKIN_SAMPLE));
  return { w, h, samples, bodySamples: body.length, headSamples: crown.length };
}

/* ---------------- the two clocks ---------------- */

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

export type SkinFrame = {
  /** The body's and the head's fronts (0 → SKIN_WHOLE). */
  body: number;
  head: number;
  /** The skin's own opacity, and the classic engines' under it. */
  alpha: number;
  classic: number;
  /** Whether anything of the skin is on screen. */
  on: boolean;
};
export const createSkinFrame = (): SkinFrame => ({
  body: 0,
  head: 0,
  alpha: 0,
  classic: 1,
  on: false,
});

/** The body's front: fast off the chest, easing as it reaches the hands and
 * feet, never linear and never stepped; then the bands' flush. */
const bodyFront = (u: number, ease: number) => SKIN_WHOLE * (1 - Math.pow(1 - clamp01(u), ease));
/** The head's: the skull rises (ease in and out), the face closes. */
const headFront = (u: number) => {
  const k = clamp01(u);
  return SKIN_WHOLE * (k * k * (3 - 2 * k) * 0.72 + k * 0.28);
};

export type SkinTimeline = {
  /** The body's front runs over [from, to]; the head's over [from, to]. */
  body: readonly [number, number];
  head: readonly [number, number];
  /** The body's ease-out (1: linear; the call's is steeper than the
   * scroll's, whose reader sets the pace). */
  ease: number;
  /** The classic engines leave over `leave` and are back over `back`; the
   * skin is gone by the end of `fade`. */
  leave: readonly [number, number];
  back: readonly [number, number];
  fade: readonly [number, number];
};

/** The entry, in the call's canonical ms: the fire's burst (420) is the
 * trigger, the helmet's clamp (1890) the close, the light (1980) after it. */
export const SKIN_ENTRY: SkinTimeline = {
  body: [470, 1600],
  head: [1380, 1880],
  ease: 2,
  leave: [470, 600],
  back: [1880, 1900],
  fade: [1900, 1975],
};
/** The scroll scene, in its progress: after the fire's end (0.14), closed
 * before the seal (0.86) and the light (0.9). */
export const SKIN_SCROLL: SkinTimeline = {
  body: [0.15, 0.66],
  head: [0.6, 0.852],
  ease: 1.3,
  leave: [0.15, 0.165],
  back: [0.853, 0.858],
  fade: [0.858, 0.872],
};

const spanOf = (x: number, [from, to]: readonly [number, number]) =>
  clamp01((x - from) / (to - from));

/** The skin at clock x (the entry's canonical ms or the scroll's progress).
 * Monotone and continuous in x, so a reversed clock retreats over the same
 * frames. */
export function skinFrame(out: SkinFrame, timeline: SkinTimeline, x: number) {
  out.body = bodyFront(spanOf(x, timeline.body), timeline.ease);
  out.head = headFront(spanOf(x, timeline.head));
  out.alpha =
    smooth(
      spanOf(x, [
        timeline.leave[0],
        timeline.leave[0] + (timeline.leave[1] - timeline.leave[0]) * 0.4,
      ]),
    ) *
    (1 - smooth(spanOf(x, timeline.fade)));
  out.classic = 1 - smooth(spanOf(x, timeline.leave)) * (1 - smooth(spanOf(x, timeline.back)));
  out.on = x > timeline.leave[0] && x < timeline.fade[1];
  return out;
}

/* ---------------- the droplets ---------------- */

/** How far ahead of the front a droplet shows, and how far behind it is
 * drawn back in (bands). */
const DROPLET_AHEAD = 1.1;
const DROPLET_BEHIND = 0.5;

/** Draws the droplets at the two fronts into a 2D context in figure space
 * (`cell`: figure px per field cell). Each skims ahead of the lip along the
 * flow and is drawn back into the surface: matter conserved, no sparks. */
export function drawSkinDroplets(
  context: CanvasRenderingContext2D,
  field: SkinField,
  frame: SkinFrame,
  cell: number,
  now: number,
  px: number,
  share = 1,
) {
  const s = field.samples;
  const pass = (first: number, count: number, front: number) => {
    if (front <= 0 || front >= SKIN_WHOLE || !count) return;
    const low = front - DROPLET_BEHIND * SKIN_BAND;
    const high = front + DROPLET_AHEAD * SKIN_BAND;
    // The first sample at or after `low`.
    let a = 0;
    let b = count;
    while (a < b) {
      const m = (a + b) >> 1;
      if (s[(first + m) * SKIN_SAMPLE + 2] < low) a = m + 1;
      else b = m;
    }
    context.beginPath();
    let bright = false;
    for (let n = a; n < count; n += 1) {
      const o = (first + n) * SKIN_SAMPLE;
      const t = s[o + 2];
      if (t > high) break;
      const seed = s[o + 5];
      if (seed > share) continue;
      // -DROPLET_AHEAD (far ahead) … 0 (the lip) … DROPLET_BEHIND (absorbed).
      const k = (front - t) / SKIN_BAND;
      const life = (k + DROPLET_AHEAD) / (DROPLET_AHEAD + DROPLET_BEHIND);
      // It leaves the lip, leads it, and is drawn back in.
      const lead = Math.sin(Math.PI * Math.min(1, life * 1.15)) * (7 + 13 * seed);
      const sway = Math.sin(now * 0.006 + seed * 40) * 2.2;
      const x = s[o] * cell + s[o + 3] * lead - s[o + 4] * sway;
      const y = s[o + 1] * cell + s[o + 4] * lead + s[o + 3] * sway;
      const size = (1 + 1.6 * seed) * px * (0.6 + 0.4 * Math.sin(Math.PI * life));
      context.rect(x - size / 2, y - size / 2, size, size);
      bright = true;
    }
    if (bright) context.fill();
  };
  context.fillStyle = `rgb(226 240 250 / ${(0.9 * frame.alpha).toFixed(3)})`;
  pass(0, field.bodySamples, frame.body);
  pass(field.bodySamples, field.headSamples, frame.head);
}

/* ---------------- the shader ---------------- */

const VERTEX = `attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = vec2(aPosition.x * 0.5 + 0.5, 0.5 - aPosition.y * 0.5);
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const FRAGMENT = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vUv;
uniform sampler2D uArt;
uniform sampler2D uField;
uniform sampler2D uBase;
uniform vec2 uFront;
uniform vec2 uFigure;
uniform vec2 uCell;
uniform float uTime;
uniform float uAlpha;
uniform float uBase01;
uniform float uHex;
const float BAND = ${SKIN_BAND.toFixed(3)};
const vec3 ICE = vec3(0.59, 0.925, 1.0);
const vec3 PINK = vec3(1.0, 0.56, 0.85);
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
// The armour with its lights held: ice and pink light stands cold and dim.
vec3 held(vec3 c) {
  float hi = max(c.r, max(c.g, c.b));
  float lo = min(c.r, min(c.g, c.b));
  float sat = hi - lo;
  float gold = step(c.b, c.g) * step(c.g, c.r);
  float lit = smoothstep(0.16, 0.42, sat) * (1.0 - gold) * smoothstep(0.3, 0.6, hi);
  vec3 cold = vec3(luma(c)) * vec3(0.5, 0.56, 0.66);
  return mix(c, cold, lit * 0.86);
}
void main() {
  vec4 base = uBase01 > 0.0 ? texture2D(uBase, vUv) * uBase01 : vec4(0.0);
  vec4 art = texture2D(uArt, vUv);
  vec4 fld = texture2D(uField, vUv);
  // Blue: the head from 224 up (its dilated edge and itself), the body below.
  float front = mix(uFront.x, uFront.y, step(0.69, fld.b));
  float a = (front - fld.r) / BAND;
  if (art.a < 0.004 || a < -0.6) {
    gl_FragColor = base * uAlpha;
    return;
  }
  vec3 colour = art.rgb / max(art.a, 0.001);
  vec3 armour = held(colour);
  float light = luma(colour);
  vec2 p = vUv * uFigure;
  // The flow's direction: the field's gradient.
  vec2 g = vec2(
    texture2D(uField, vUv + vec2(uCell.x, 0.0)).r - texture2D(uField, vUv - vec2(uCell.x, 0.0)).r,
    texture2D(uField, vUv + vec2(0.0, uCell.y)).r - texture2D(uField, vUv - vec2(0.0, uCell.y)).r);
  vec2 flow = length(g) > 0.0005 ? normalize(g) : vec2(0.0, 1.0);
  if (a < 0.0) {
    // The lip's shadow, just ahead of it.
    float shade = smoothstep(-0.6, 0.0, a);
    gl_FragColor = vec4(base.rgb * (1.0 - 0.5 * shade * art.a), max(base.a, 0.42 * shade * art.a)) * uAlpha;
    return;
  }
  // Liquid chrome: a raised bead, lit from the upper left, with the room's
  // reflection sliding over it.
  float bead = cos(clamp(a, 0.0, 1.0) * 3.14159);
  float facing = 0.5 + 0.5 * bead * dot(flow, normalize(vec2(-0.5, -0.8)));
  float room = 0.5 + 0.5 * sin(p.y * 0.11 + p.x * 0.05 + uTime * 2.6 + fld.r * 40.0);
  vec3 chrome = mix(vec3(0.085, 0.095, 0.115), vec3(0.6, 0.64, 0.68), facing * (0.55 + 0.45 * room));
  chrome = mix(chrome, chrome * (0.6 + 0.9 * light), 0.5);
  // The fibres: striations along the flow.
  float stripe = smoothstep(0.4, 0.5, abs(fract(dot(p, vec2(-flow.y, flow.x)) * 0.33) - 0.5) * 2.0);
  vec3 fibre = mix(vec3(0.1, 0.11, 0.13), vec3(light) * vec3(0.8, 0.87, 0.95), 0.42) * (0.66 + 0.5 * stripe);
  fibre += ICE * 0.1 * fld.g;
  vec3 metal = mix(chrome, fibre, smoothstep(0.8, 1.5, a));
  // The cells: a hexagonal micro-tessellation, each cell clicking solid on
  // its own threshold and taking the art's colour.
  vec2 hs = vec2(1.0, 1.7320508);
  vec2 hp = p / uHex;
  vec4 hc = floor(vec4(hp, hp - vec2(0.5, 1.0)) / hs.xyxy) + 0.5;
  vec4 hh = vec4(hp - hc.xy * hs, hp - (hc.zw + 0.5) * hs);
  vec4 cell = dot(hh.xy, hh.xy) < dot(hh.zw, hh.zw) ? vec4(hh.xy, hc.xy) : vec4(hh.zw, hc.zw + 0.5);
  vec2 q = abs(cell.xy);
  float rim = max(dot(q, hs * 0.5), q.x);
  float threshold = hash(cell.zw);
  float k = (a - 2.4) / 2.5;
  float age = (k - threshold * 0.82) / 0.18;
  float solid = step(0.0, age);
  float paint = smoothstep(0.0, 1.0, age);
  float tilt = hash(cell.zw + 7.31) - 0.5;
  vec3 facet = metal * (0.9 + 0.7 * tilt) + vec3(0.07, 0.09, 0.11);
  float tess = smoothstep(1.7, 2.4, a);
  float edge = smoothstep(0.4, 0.5, rim);
  // Still liquid: the tessellation shows through as facets and dark seams.
  vec3 liquid = mix(metal, facet, 0.5 * tess);
  liquid = mix(liquid, liquid * 0.5, edge * tess * 0.7);
  vec3 celled = mix(facet, armour * (1.0 + 0.1 * tilt * (1.0 - smoothstep(1.0, 3.0, age))), paint);
  // The click: a brightness pop that decays.
  celled += (0.35 * exp(-max(age, 0.0) * 2.6)) * mix(vec3(0.8, 0.9, 1.0), armour, 0.4);
  // The cells' seams, until the paint has set.
  celled = mix(celled, celled * 0.42 + ICE * 0.12, edge * (1.0 - smoothstep(0.6, 2.4, age)));
  vec3 outc = mix(liquid, celled, solid);
  // The panel lines draw in as the cells set, light, and cool.
  float glow = smoothstep(3.0, 4.2, a) * (1.0 - smoothstep(4.8, 7.5, a));
  if (glow > 0.01) {
    vec2 e = 1.2 / uFigure;
    float lx = luma(texture2D(uArt, vUv + vec2(e.x, 0.0)).rgb) - luma(texture2D(uArt, vUv - vec2(e.x, 0.0)).rgb);
    float ly = luma(texture2D(uArt, vUv + vec2(0.0, e.y)).rgb) - luma(texture2D(uArt, vUv - vec2(0.0, e.y)).rgb);
    float line = smoothstep(0.1, 0.42, length(vec2(lx, ly)));
    outc += mix(ICE, vec3(1.0), 0.35) * line * glow * 0.75;
  }
  // The lip: white-hot at the very edge.
  float lip = 1.0 - smoothstep(0.0, 0.2, a);
  outc += vec3(0.91, 0.95, 1.0) * lip * 0.95;
  outc += mix(ICE, PINK, hash(floor(p / 9.0))) * lip * 0.22;
  // The veins, bright while liquid.
  outc += vec3(0.8, 0.9, 1.0) * fld.g * (1.0 - smoothstep(0.3, 1.6, a)) * 0.5;
  float alpha = art.a * smoothstep(0.0, 0.06, a);
  gl_FragColor = vec4(outc * alpha + base.rgb * (1.0 - alpha), alpha + base.a * (1.0 - alpha)) * uAlpha;
}`;

export type SkinSources = {
  /** The finished figure, what stands under it (the scroll scene), and the
   * field's picture and size. */
  art: TexImageSource;
  base: TexImageSource | null;
  field: TexImageSource;
  fieldSize: readonly [number, number];
};

/** The skin's canvas. Null where WebGL is not to be had. */
export class SkinRenderer {
  private gl: WebGLRenderingContext;
  private canvas: HTMLCanvasElement;
  private program: WebGLProgram;
  private textures: WebGLTexture[] = [];
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private figure: readonly [number, number];
  private hasBase: boolean;
  private scale = 1;
  lost = false;
  private onLost: (event: Event) => void;

  static create(
    canvas: HTMLCanvasElement,
    sources: SkinSources,
    figure: readonly [number, number],
  ) {
    try {
      const gl = canvas.getContext("webgl", {
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: "low-power",
      });
      if (!gl) return null;
      return new SkinRenderer(canvas, gl, sources, figure);
    } catch {
      return null;
    }
  }

  private constructor(
    canvas: HTMLCanvasElement,
    gl: WebGLRenderingContext,
    sources: SkinSources,
    figure: readonly [number, number],
  ) {
    this.canvas = canvas;
    this.gl = gl;
    this.figure = figure;
    this.hasBase = Boolean(sources.base);
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error("shader");
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw new Error(gl.getShaderInfoLog(shader) ?? "compile");
      return shader;
    };
    const program = gl.createProgram();
    if (!program) throw new Error("program");
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(program) ?? "link");
    this.program = program;
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    for (const name of [
      "uArt",
      "uField",
      "uBase",
      "uFront",
      "uFigure",
      "uCell",
      "uTime",
      "uAlpha",
      "uBase01",
      "uHex",
    ])
      this.uniforms[name] = gl.getUniformLocation(program, name);
    const texture = (unit: number, premultiply: boolean, upload: () => void) => {
      const made = gl.createTexture();
      if (!made) throw new Error("texture");
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, made);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiply ? 1 : 0);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      upload();
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.textures.push(made);
    };
    texture(0, true, () =>
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sources.art),
    );
    texture(1, false, () =>
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sources.field),
    );
    const base = sources.base;
    if (base)
      texture(2, true, () =>
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, base),
      );
    gl.uniform1i(this.uniforms.uArt, 0);
    gl.uniform1i(this.uniforms.uField, 1);
    gl.uniform1i(this.uniforms.uBase, base ? 2 : 0);
    gl.uniform2f(this.uniforms.uFigure, figure[0], figure[1]);
    gl.uniform2f(this.uniforms.uCell, 1 / sources.fieldSize[0], 1 / sources.fieldSize[1]);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    this.onLost = (event) => {
      event.preventDefault();
      this.lost = true;
    };
    canvas.addEventListener("webglcontextlost", this.onLost);
  }

  /** The backing store for a box of CSS px: the device's ratio up to
   * `maxRatio`, never past the art's own pixels, times the governor's
   * `quality` (1, or less when frames run long). */
  resize(cssWidth: number, cssHeight: number, ratio: number, maxRatio: number, quality = 1) {
    const k = Math.min(Math.min(ratio, maxRatio), this.figure[0] / Math.max(1, cssWidth)) * quality;
    const width = Math.max(1, Math.round(cssWidth * k));
    const height = Math.max(1, Math.round(cssHeight * k));
    this.scale = width / this.figure[0];
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
  }

  render(frame: SkinFrame, seconds: number, base01: number) {
    const gl = this.gl;
    if (this.lost) return;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    if (!frame.on || frame.alpha <= 0.002) {
      gl.clear(gl.COLOR_BUFFER_BIT);
      return;
    }
    gl.uniform2f(this.uniforms.uFront, frame.body, frame.head);
    gl.uniform1f(this.uniforms.uTime, seconds % 1000);
    gl.uniform1f(this.uniforms.uAlpha, frame.alpha);
    gl.uniform1f(this.uniforms.uBase01, this.hasBase ? base01 : 0);
    // Cells of four backing px across at the least, 8.5 figure px.
    gl.uniform1f(this.uniforms.uHex, Math.max(8.5, 4 / Math.max(0.1, this.scale)));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  clear() {
    if (this.lost) return;
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }

  dispose() {
    this.canvas.removeEventListener("webglcontextlost", this.onLost);
    const gl = this.gl;
    for (const texture of this.textures) gl.deleteTexture(texture);
    this.textures = [];
    gl.deleteProgram(this.program);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    this.canvas.width = 0;
    this.canvas.height = 0;
  }
}
