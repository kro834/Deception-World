/* RESONANCE FIELD: the WebGL layer. Tens of thousands of nanites on the
   field's helical lines, drawn as light trails with depth, behind the 2D
   scene (the back canvas: the lines passing behind the body) and, on fine
   pointers, in front of it (the front canvas; with one canvas only, it
   draws every side). One static vertex buffer (16 bytes a vertex, 4
   vertices a particle: its helix seeds and its birth — the burst fragment's
   handoff position and velocity), one index buffer and one draw call a
   canvas; the vertex shader computes every pose closed-form from the
   score's state and per-particle hashes (field-pose.js is its reference),
   so a frame depends only on the clock and the visit's take.

   Contracts: feature-detected (webgl2, then webgl), never on the startup
   path; a failed context, compile, link or a lost context leaves the 2D
   scene as it is; resources are released on route leave, on hidden and at
   the call's end (loseContext, zero-sized canvases, elements removed);
   no per-frame allocation; the draw count is a prefix of the hash-shuffled
   buffer, so a governor can lower it without changing any pose. No three.js:
   the cinema-polish record keeps the startup free of a 3D dependency, and
   this layer is a few hundred lines. The fragment stage declares no uniform:
   a highp/mediump mismatch on a shared uniform fails the link on real
   drivers. */

import { FIELD_BIRTH, FIELD_SHAPE, fieldFragment, fieldSeeds, FIELD_SEEDS } from "./field-pose.js";
import { FIELD_STATE } from "./field-score.js";

export const FIELD_GL = Object.freeze({
  /** Particles on fine pointers and on touch screens (Uint16 indices: at
   * most 16,384). */
  count: Object.freeze({ fine: 12000, coarse: 3000 }),
  /** The backing store's share of the device ratio (soft glows need less). */
  resolution: Object.freeze({ fine: 0.7, coarse: 0.5 }),
  maxRatio: 2,
  maxCount: 16384,
  bytesPerVertex: 16,
  verticesPerParticle: 4,
  indicesPerParticle: 6,
  /** Nothing meets a straight cut: trails fade within this of an edge (CSS px). */
  edgeFade: 28,
  /** A particle's half-width at size 1 (figure heights), and its floor (px). */
  width: 0.0026,
  minWidth: 0.8,
  /** A particle's alpha at light 1, by pointer (fewer particles, brighter). */
  alpha: Object.freeze({ fine: 0.15, coarse: 0.34 }),
});

/** The sparks' tones (sRGB 0..1): the cooled fragments' cyan rgb(150 236
 * 255) and pink rgb(255 143 216), and white; the palette lead by take sets
 * the thresholds the shader picks with. */
export const FIELD_TONES = Object.freeze({
  ice: Object.freeze([0.59, 0.93, 1]),
  pink: Object.freeze([1, 0.56, 0.85]),
  white: Object.freeze([0.96, 0.98, 1]),
  /** Palette thresholds [ice below, pink below; white above], by lead. */
  leads: Object.freeze([
    Object.freeze([0.56, 0.8]),
    Object.freeze([0.26, 0.74]),
    Object.freeze([0.32, 0.52]),
  ]),
});

const P = FIELD_SHAPE;
const B = FIELD_BIRTH;
const f = (value) => (Number.isInteger(value) ? `${value}.0` : String(value));
const vec3 = (values) => values.map(f).join(", ");

export const FIELD_VERTEX_SHADER = `
precision highp float;
attribute vec4 aSeed;
attribute vec4 aKind;
attribute vec4 aBirth;
uniform float uS;
uniform float uWake;
uniform float uWakeRate;
uniform float uCharge;
uniform float uTight;
uniform float uCollapse;
uniform float uDetonate;
uniform vec4 uAttract;
uniform vec4 uImpulse[4];
uniform float uImpulses;
uniform vec4 uTake;
uniform float uPhase;
uniform float uSide;
uniform vec3 uView;
uniform vec2 uSize;
uniform vec2 uTone;
uniform float uPixel;
uniform float uAlpha;
uniform float uEdge;
varying vec2 vLocal;
varying float vLen;
varying float vW;
varying vec4 vColor;
const float TAU = 6.283185307179586;
const float RW = ${f(P.radiusWide)};
const float RT = ${f(P.radiusTight)};
const float ASPECT = ${f(P.aspect)};
const float ORBITS = ${f(P.orbits)};
const float SPREAD = ${f(P.spreadBase)};
const float WOBBLE = ${f(P.wobble)};
const float PUSH = ${f(P.push)};
const float REACH = ${f(P.pushReach)};
const float THROW = ${f(P.throw)};
const float STREAK = ${f(P.streak)};
const float MARKER = ${f(P.marker)};
const float BOKEH = ${f(P.bokeh)};
const float BOKEHDIM = ${f(P.bokehDim)};
const float PACK = ${f(P.pack)};
const float FLASHGAIN = ${f(P.flashGain)};
const float STAGGER = ${f(B.stagger)};
const float DRIFT = ${f(B.drift)};
const float DRAG = ${f(B.drag)};
const float SWEEP0 = ${f(B.sweep[0])};
const float SWEEP1 = ${f(B.sweep[1])};
const float HEAT = ${f(B.heat)};
const float GLOW = ${f(B.glow)};
const float FRINGE = ${f(1 - B.fringeShare)};
vec3 pose(float s, float wk, float a0, float r0, float yp, float spd, float pick, float arm, vec4 birth, out float light, out float flash, out float heat) {
  float theta = a0 * TAU + uPhase + uTake.y * TAU * ORBITS * spd * s + arm * TAU / uTake.x + uTake.z * (yp - 0.5) * 2.0;
  float rho = r0 * (RW + (RT - RW) * uTight);
  rho *= 1.0 - uCollapse * 0.96;
  if (uDetonate > 0.0) rho = r0 * (0.04 + THROW * (1.0 - (1.0 - uDetonate) * (1.0 - uDetonate)));
  float cs = cos(theta);
  float sn = sin(theta);
  float z = rho * sn;
  float spreadY = SPREAD + uAttract.w;
  float x = uAttract.x + rho * cs * ASPECT + (pick - 0.5) * uAttract.z * 2.0 * (1.0 - uTight * 0.6) * (1.0 - uCollapse);
  float y = uAttract.y + (yp - 0.5) * spreadY * (1.0 - uCollapse) + WOBBLE * sin(theta * 0.5 + yp * TAU) + uTake.w * z * (1.0 - uCollapse);
  // Its birth: a burst fragment flying out under drag, cooling, swept
  // onto its line by the wake's end; before its birth, nothing.
  float stagger = fract(a0 * 13.0 + yp * 7.0) * STAGGER;
  float born = wk >= 1.0 ? 1.0 : step(stagger, wk);
  float tau = wk >= 1.0 ? 1.0 : born * clamp((wk - stagger) / (1.0 - stagger), 0.0, 1.0);
  heat = 0.0;
  if (tau < 1.0) {
    float flight = (1.0 - exp(-DRAG * tau)) / DRAG * DRIFT;
    vec2 b = birth.xy + birth.zw * flight;
    float sweep = smoothstep(SWEEP0, SWEEP1, tau);
    x = mix(b.x, x, sweep);
    y = mix(b.y, y, sweep);
    z = mix(0.02, z, sweep);
    heat = 1.0 - smoothstep(0.0, HEAT, tau);
  }
  flash = 0.0;
  for (int k = 0; k < 4; k++) {
    if (float(k) < uImpulses) {
      vec4 im = uImpulse[k];
      float dx = x - im.x;
      float dy = y - im.y;
      float d = sqrt(dx * dx + dy * dy);
      float near = exp(-d * d / (2.0 * REACH * REACH));
      float age = im.z;
      float fl = age * exp(-4.0 * age) * 4.0 * (1.0 - age);
      float push = PUSH * im.w * fl * near;
      float inv = 1.0 / max(d, 0.03);
      x += dx * inv * push;
      y += dy * inv * push;
      if (age < 0.2) flash += (1.0 - age / 0.2) * im.w * near;
    }
  }
  float depth = max(0.0, -z);
  light = born * uCharge * (0.55 + 0.45 * spd) * (1.0 - BOKEHDIM * depth) * (1.0 - PACK * uTight) * (1.0 + FLASHGAIN * flash) * (1.0 + GLOW * heat);
  return vec3(x, y, z);
}
void main() {
  float a0 = aSeed.x;
  float r0 = 0.3 + 0.7 * aSeed.y;
  float yp = aSeed.z;
  float spd = 0.55 + 0.9 * aSeed.w;
  float pick = aKind.x;
  float arm = floor(aKind.y * 255.0 + 0.5);
  float kind = floor(aKind.z * 255.0 + 0.5);
  float corner = mod(kind, 4.0);
  float marker = step(4.0, kind);
  float size = 0.6 + aKind.w;
  vec4 birth = vec4(aBirth.xy * 2.0 - 0.5, aBirth.zw * 4.0 - 2.0);
  float light;
  float flash;
  float heat;
  vec3 p1 = pose(uS, uWake, a0, r0, yp, spd, pick, arm, birth, light, flash, heat);
  float light0;
  float flash0;
  float heat0;
  float streak = STREAK * mix(1.0, MARKER, marker);
  vec3 p0 = pose(uS - streak, uWake - streak * uWakeRate, a0, r0, yp, spd, pick, arm, birth, light0, flash0, heat0);
  float vis = uSide == 0.0 ? 1.0 : (uSide > 0.0 ? step(0.0, p1.z) : step(p1.z, -0.000001));
  vis *= step(0.0001, light);
  vec2 s1 = uView.yz + p1.xy * uView.x;
  vec2 s0 = uView.yz + p0.xy * uView.x;
  vec2 d = s1 - s0;
  float len = length(d);
  vec2 dir = len > 0.0001 ? d / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  float depth = max(0.0, -p1.z);
  float w = max(uPixel * size * (1.0 + BOKEH * depth) * (1.0 + 0.6 * flash + 0.5 * heat), ${f(FIELD_GL.minWidth)});
  float along = corner < 2.0 ? 0.0 : 1.0;
  float across = mod(corner, 2.0) * 2.0 - 1.0;
  float ahead = along * 2.0 - 1.0;
  vec2 pos = mix(s0, s1, along) + dir * ahead * w + nrm * across * w;
  vLocal = vec2(along * len + ahead * w, across * w);
  vLen = len;
  vW = w;
  // Nothing meets a straight cut: a trail fades within uEdge of the edges
  // (per vertex: a trail is a few pixels across).
  vec2 e = min(pos, uSize - pos);
  float edge = clamp(min(e.x, e.y) / uEdge, 0.0, 1.0);
  edge *= edge * (3.0 - 2.0 * edge);
  float a = light * uAlpha * vis * edge;
  vec3 tone = pick < uTone.x ? vec3(${vec3(FIELD_TONES.ice)}) : (pick < uTone.y ? vec3(${vec3(FIELD_TONES.pink)}) : vec3(${vec3(FIELD_TONES.white)}));
  // Hot, it is the combustion's pale cyan (a pink-violet fringe on a few).
  vec3 hot = pick > FRINGE ? vec3(${vec3(B.fringe)}) : vec3(${vec3(B.hot)});
  tone = mix(tone, hot, heat);
  vColor = vec4(tone * a, a);
  vec2 clip = (pos / uSize) * 2.0 - 1.0;
  gl_Position = vis > 0.5 ? vec4(clip.x, -clip.y, 0.0, 1.0) : vec4(-4.0, -4.0, 0.0, 1.0);
}
`;

export const FIELD_FRAGMENT_SHADER = `
precision mediump float;
varying vec2 vLocal;
varying float vLen;
varying float vW;
varying vec4 vColor;
void main() {
  float x = clamp(vLocal.x, 0.0, vLen);
  float d = length(vec2(vLocal.x - x, vLocal.y)) / max(vW, 0.001);
  float core = 1.0 - clamp(d, 0.0, 1.0);
  core *= core;
  float taper = vLen > 0.001 ? mix(0.2, 1.0, clamp(x / vLen, 0.0, 1.0)) : 1.0;
  gl_FragColor = vColor * (core * taper);
}
`;

const u16 = (value) => Math.max(0, Math.min(65535, Math.round(value * 65535)));

/** The vertex bytes of `count` particles (4 vertices each, 16 bytes a
 * vertex: a0, r0, yp, spd; pick, arm, corner + 4 × marker, size; then the
 * birth as four 16-bit words — x, y over [-0.5, 1.5), vx, vy over [-2, 2)),
 * each birth from `fragment(index, out)`. */
export function fieldVertexBytes(count, arms, fragment = fieldFragment) {
  const G = FIELD_GL;
  const S = FIELD_SEEDS;
  const bytes = new Uint8Array(count * G.verticesPerParticle * G.bytesPerVertex);
  const words = new Uint16Array(bytes.buffer);
  const seeds = new Float64Array(S.LENGTH);
  for (let i = 0; i < count; i += 1) {
    fieldSeeds(i, arms, seeds, fragment);
    const a0 = Math.round(seeds[S.A0] * 255);
    const r0 = Math.round(((seeds[S.R0] - 0.3) / 0.7) * 255);
    const yp = Math.round(seeds[S.YP] * 255);
    const spd = Math.round(((seeds[S.SPD] - 0.55) / 0.9) * 255);
    const pick = Math.round(seeds[S.PICK] * 255);
    const arm = seeds[S.ARM];
    const size = Math.round((seeds[S.SIZE] - 0.6) * 255);
    const marker = seeds[S.MARKER] ? 4 : 0;
    const bx = u16((seeds[S.BX] + 0.5) / 2);
    const by = u16((seeds[S.BY] + 0.5) / 2);
    const bvx = u16((seeds[S.BVX] + 2) / 4);
    const bvy = u16((seeds[S.BVY] + 2) / 4);
    for (let c = 0; c < 4; c += 1) {
      const v = i * 4 + c;
      const o = v * G.bytesPerVertex;
      bytes[o] = a0;
      bytes[o + 1] = r0;
      bytes[o + 2] = yp;
      bytes[o + 3] = spd;
      bytes[o + 4] = pick;
      bytes[o + 5] = arm;
      bytes[o + 6] = c + marker;
      bytes[o + 7] = size;
      const w = v * (G.bytesPerVertex / 2) + 4;
      words[w] = bx;
      words[w + 1] = by;
      words[w + 2] = bvx;
      words[w + 3] = bvy;
    }
  }
  return bytes;
}

/** Two triangles a particle. */
export function fieldIndices(count) {
  const indices = new Uint16Array(count * FIELD_GL.indicesPerParticle);
  for (let i = 0; i < count; i += 1) {
    const v = i * 4;
    const o = i * 6;
    indices[o] = v;
    indices[o + 1] = v + 1;
    indices[o + 2] = v + 2;
    indices[o + 3] = v + 1;
    indices[o + 4] = v + 3;
    indices[o + 5] = v + 2;
  }
  return indices;
}

const ATTRIBUTES = {
  alpha: true,
  antialias: false,
  depth: false,
  stencil: false,
  premultipliedAlpha: true,
  preserveDrawingBuffer: false,
  powerPreference: "default",
};

/** A real WebGL context on this canvas, or null (a missing API, a refused
 * context, or a stand-in that is not WebGL at all). */
export function fieldContext(canvas) {
  if (!canvas || typeof canvas.getContext !== "function") return null;
  let gl = null;
  try {
    gl = canvas.getContext("webgl2", ATTRIBUTES) || canvas.getContext("webgl", ATTRIBUTES);
  } catch {
    return null;
  }
  if (!gl || typeof gl.getParameter !== "function" || typeof gl.createShader !== "function")
    return null;
  try {
    if (typeof gl.getParameter(gl.VERSION) !== "string") return null;
  } catch {
    return null;
  }
  return gl;
}

const UNIFORMS = [
  "uS",
  "uWake",
  "uWakeRate",
  "uCharge",
  "uTight",
  "uCollapse",
  "uDetonate",
  "uAttract",
  "uImpulse",
  "uImpulses",
  "uTake",
  "uPhase",
  "uSide",
  "uView",
  "uSize",
  "uTone",
  "uPixel",
  "uAlpha",
  "uEdge",
];

// One canvas: its context, program and buffers. Rebuilt after a restore.
function createSurface(canvas, side, count, arms, fragment) {
  const gl = fieldContext(canvas);
  if (!gl) return null;
  const surface = {
    canvas,
    gl,
    side,
    lost: false,
    program: null,
    vertices: null,
    indices: null,
    location: {},
    width: 0,
    height: 0,
    onLost: null,
    onRestored: null,
    ready: false,
  };
  const compile = (type, source) => {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("field: shader unavailable");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      throw new Error("field: shader compilation failed");
    }
    return shader;
  };
  const build = () => {
    surface.ready = false;
    const vertex = compile(gl.VERTEX_SHADER, FIELD_VERTEX_SHADER);
    const fragmentShader = compile(gl.FRAGMENT_SHADER, FIELD_FRAGMENT_SHADER);
    const program = gl.createProgram();
    if (!program) throw new Error("field: program unavailable");
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragmentShader);
    gl.bindAttribLocation(program, 0, "aSeed");
    gl.bindAttribLocation(program, 1, "aKind");
    gl.bindAttribLocation(program, 2, "aBirth");
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragmentShader);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      throw new Error("field: program link failed");
    }
    surface.program = program;
    for (const name of UNIFORMS) surface.location[name] = gl.getUniformLocation(program, name);
    const vertices = gl.createBuffer();
    const indices = gl.createBuffer();
    if (!vertices || !indices) throw new Error("field: buffer unavailable");
    const stride = FIELD_GL.bytesPerVertex;
    gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
    gl.bufferData(gl.ARRAY_BUFFER, fieldVertexBytes(count, arms, fragment), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, fieldIndices(count), gl.STATIC_DRAW);
    surface.vertices = vertices;
    surface.indices = indices;
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.UNSIGNED_BYTE, true, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.UNSIGNED_BYTE, true, stride, 4);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.UNSIGNED_SHORT, true, stride, 8);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.clearColor(0, 0, 0, 0);
    surface.ready = true;
  };
  surface.onLost = (event) => {
    event?.preventDefault?.();
    surface.lost = true;
    surface.ready = false;
    surface.program = surface.vertices = surface.indices = null;
  };
  surface.onRestored = () => {
    surface.lost = false;
    try {
      build();
    } catch {
      surface.ready = false;
    }
  };
  canvas.addEventListener?.("webglcontextlost", surface.onLost, false);
  canvas.addEventListener?.("webglcontextrestored", surface.onRestored, false);
  try {
    build();
  } catch {
    releaseSurface(surface);
    return null;
  }
  return surface;
}

function releaseSurface(surface) {
  const { gl, canvas } = surface;
  canvas.removeEventListener?.("webglcontextlost", surface.onLost, false);
  canvas.removeEventListener?.("webglcontextrestored", surface.onRestored, false);
  try {
    if (!surface.lost) {
      if (surface.vertices) gl.deleteBuffer(surface.vertices);
      if (surface.indices) gl.deleteBuffer(surface.indices);
      if (surface.program) gl.deleteProgram(surface.program);
      gl.getExtension?.("WEBGL_lose_context")?.loseContext?.();
    }
  } catch {
    // A context already gone has nothing to release.
  }
  surface.program = surface.vertices = surface.indices = null;
  surface.ready = false;
  canvas.width = canvas.height = 0;
  canvas.remove?.();
}

/**
 * The layer: a back canvas (and, on fine pointers, a front one), each with
 * its own context. `document.createElement` makes the canvases; the caller
 * places them. `fragment(index, out)` gives each particle's birth (the
 * burst fragment's handoff: x, y figure heights; vx, vy per wake); the
 * model fragment by default. Null when WebGL is unavailable.
 */
export function createFieldLayer({
  document: doc = globalThis.document,
  coarse = false,
  take,
  count = null,
  front = !coarse,
  className = "",
  fragment = fieldFragment,
} = {}) {
  if (!doc || typeof doc.createElement !== "function" || !take) return null;
  const G = FIELD_GL;
  const n = Math.max(64, Math.min(G.maxCount, count ?? (coarse ? G.count.coarse : G.count.fine)));
  const surfaces = [];
  const make = (side) => {
    let canvas;
    try {
      canvas = doc.createElement("canvas");
    } catch {
      return null;
    }
    if (!canvas) return null;
    if (className) canvas.className = `${className} is-${side > 0 ? "front" : "back"}`;
    if (canvas.dataset) canvas.dataset.side = side > 0 ? "front" : "back";
    const surface = createSurface(canvas, side, n, take.arms, fragment);
    if (!surface) {
      canvas.width = canvas.height = 0;
      return null;
    }
    return surface;
  };
  const back = make(-1);
  if (!back) return null;
  surfaces.push(back);
  if (front) {
    const near = make(1);
    if (near) surfaces.push(near);
  }
  // One canvas alone draws every side.
  if (surfaces.length === 1) back.side = 0;
  const tone = FIELD_TONES.leads[Math.min(2, Math.max(0, take.palette | 0))];
  const alpha = coarse ? G.alpha.coarse : G.alpha.fine;
  const resolution = coarse ? G.resolution.coarse : G.resolution.fine;
  let ratio = 1;
  let cssWidth = 0;
  let cssHeight = 0;
  let released = false;
  const impulses = new Float32Array(16);
  const F = FIELD_STATE;
  const layer = {
    canvases: surfaces.map((surface) => surface.canvas),
    count: n,
    get lost() {
      return surfaces.every((surface) => surface.lost);
    },
    get ready() {
      return !released && surfaces.some((surface) => surface.ready);
    },
    /** The canvases' CSS size and the device ratio: sizes the backing. */
    resize(width, height, devicePixelRatio = 1) {
      if (released || !(width > 0) || !(height > 0)) return;
      cssWidth = width;
      cssHeight = height;
      ratio = Math.min(G.maxRatio, Math.max(0.5, devicePixelRatio || 1)) * resolution;
      const w = Math.max(1, Math.round(width * ratio));
      const h = Math.max(1, Math.round(height * ratio));
      for (const surface of surfaces) {
        if (surface.canvas.width !== w) surface.canvas.width = w;
        if (surface.canvas.height !== h) surface.canvas.height = h;
        surface.width = w;
        surface.height = h;
      }
    },
    /**
     * Draws the field at `state` for the figure drawn at `scale` CSS px per
     * figure px from (`x`, `y`) CSS px in the canvases' box; `height` is the
     * figure's height in figure px; `quality` (0..1) draws a prefix.
     */
    render(state, scale, x, y, height, quality = 1) {
      if (released || !cssWidth || !cssHeight) return 0;
      const visible = Math.max(0, Math.min(n, Math.floor(n * (quality > 0 ? quality : 0))));
      const charge = state[F.CHARGE];
      let drawn = 0;
      const count = Math.min(F.MAX_IMPULSES, state[F.IMPULSES] | 0);
      for (let k = 0; k < F.MAX_IMPULSES; k += 1) {
        const o = F.IMPULSE + k * F.IMPULSE_STRIDE;
        impulses[k * 4] = state[o] / height;
        impulses[k * 4 + 1] = state[o + 1] / height;
        impulses[k * 4 + 2] = state[o + 2];
        impulses[k * 4 + 3] = state[o + 3];
      }
      for (const surface of surfaces) {
        if (!surface.ready || surface.lost) continue;
        const { gl, location: L } = surface;
        gl.viewport(0, 0, surface.width, surface.height);
        gl.clear(gl.COLOR_BUFFER_BIT);
        if (!(charge > 0) || !visible) continue;
        gl.useProgram(surface.program);
        gl.uniform1f(L.uS, state[F.S]);
        gl.uniform1f(L.uWake, state[F.WAKE]);
        gl.uniform1f(L.uWakeRate, state[F.WAKE_RATE]);
        gl.uniform1f(L.uCharge, charge);
        gl.uniform1f(L.uTight, state[F.TIGHT]);
        gl.uniform1f(L.uCollapse, state[F.COLLAPSE]);
        gl.uniform1f(L.uDetonate, state[F.DETONATE]);
        gl.uniform4f(
          L.uAttract,
          state[F.AX] / height,
          state[F.AY] / height,
          state[F.SPREAD_X] / height,
          state[F.SPREAD_Y] / height,
        );
        gl.uniform4fv(L.uImpulse, impulses);
        gl.uniform1f(L.uImpulses, count);
        gl.uniform4f(L.uTake, take.arms, take.hand, take.twist, take.tilt);
        gl.uniform1f(L.uPhase, take.phase);
        gl.uniform1f(L.uSide, surface.side);
        const unit = scale * height * ratio;
        gl.uniform3f(L.uView, unit, x * ratio, y * ratio);
        gl.uniform2f(L.uSize, surface.width, surface.height);
        gl.uniform2f(L.uTone, tone[0], tone[1]);
        gl.uniform1f(L.uPixel, unit * G.width);
        gl.uniform1f(L.uAlpha, alpha);
        gl.uniform1f(L.uEdge, G.edgeFade * ratio);
        gl.drawElements(gl.TRIANGLES, visible * G.indicesPerParticle, gl.UNSIGNED_SHORT, 0);
        drawn += visible;
      }
      return drawn;
    },
    /** Clears both canvases (nothing drawn). */
    clear() {
      if (released) return;
      for (const surface of surfaces) {
        if (!surface.ready || surface.lost) continue;
        surface.gl.viewport(0, 0, surface.width, surface.height);
        surface.gl.clear(surface.gl.COLOR_BUFFER_BIT);
      }
    },
    release() {
      if (released) return;
      released = true;
      for (const surface of surfaces) releaseSurface(surface);
      surfaces.length = 0;
    },
  };
  return layer;
}
