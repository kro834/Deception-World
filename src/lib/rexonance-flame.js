// The fire of the transformation (owner, 2026-10-21): a translucent,
// emissive medium conforming to the undersuit. It kindles at the soles,
// climbs the figure as an irregular engulf front until the whole undersuit
// is covered, turns from sooty forest green to complete combustion as it
// nears its end, detonates (爆散) into incandescent fragments that cool into
// the nanites, and is gone before the suit-up proceeds. Nothing is a sprite:
// the WebGL kernel (src/lib/rexonance-fire) advects turbulence upward
// through a distance field of the body; a CPU kernel of the same maths is
// the fallback and the unit tests' oracle. Every frame is a closed-form
// function of (phase, seed); the clock only flickers, so scrubbing is exact.
import {
  NANITE_FIRE_FRAGMENTS,
  NANITE_FIRE_PHASES,
  paintBodySilhouette,
} from "./rexonance-ignition.js";
import {
  FIELD_BODY,
  FIELD_H,
  FIELD_W,
  FIRE_RECT,
  buildFireField,
} from "./rexonance-fire/fire-field.js";
import { buildNoiseTable } from "./rexonance-fire/fire-noise.js";
import {
  FRAGMENT_STRIDE,
  POSE_BURST,
  POSE_COVER,
  POSE_MIX,
  POSE_SLOTS,
  poseFire,
  poseFragments,
} from "./rexonance-fire/fire-pose.js";
import {
  createFireRenderer,
  drawFireLayer,
  drawFireSparks,
  fireRendererReady,
  releaseFireRenderer,
  uploadFireField,
  uploadFireNoise,
} from "./rexonance-fire/fire-renderer.js";
import {
  RASTER_H,
  RASTER_TOUCH_H,
  RASTER_TOUCH_W,
  RASTER_W,
  rasterFire,
} from "./rexonance-fire/fire-raster.js";

/** The Blender atlas of the previous fire stays published (its manifest
 * and deployment hashes are pinned elsewhere); this fire no longer samples
 * it, so no 4 MiB sheet is fetched or decoded for the suit-up. */
export const NANITE_FLAME_ATLAS = Object.freeze({
  src: "/rexonance-flame-natural-20261019/flame.webp",
  width: 1024,
  height: 1024,
  columns: 8,
  rows: 4,
  frames: 32,
  tileWidth: 128,
  tileHeight: 256,
  fps: 16,
});

/** Backing resolution of the GPU fire (two layers stacked), per tier. */
export const NANITE_FIRE_BACKING = Object.freeze({
  width: 512,
  height: 800,
  touchWidth: 320,
  touchHeight: 500,
});
const RETRY_AFTER = 30000;
const RETENTION_MS = 1000;
const ROUTES = /^\/(world|rexonance-saga)\/?$/;

let environment = globalThis;
let coarse = false;
let noise = null;
let field = null;
let fieldSource = null;
let sprites = null;
let spritesAttempted = false;
// GPU path: one offscreen canvas holding the back layer above the front.
let glCanvas = null;
let gl = null;
let renderer = null;
let glLost = false;
let glFailedAt = -Infinity;
let glWidth = 0;
let glHeight = 0;
// CPU fallback: two small straight-alpha images, one per layer.
let rasterBack = null;
let rasterFront = null;
let rasterBackContext = null;
let rasterFrontContext = null;
let rasterBackPixels = null;
let rasterFrontPixels = null;
let rasterW = 0;
let rasterH = 0;
let rasterFailedAt = -Infinity;
// The frame cache: both layers of one (phase, clock, strength, tier).
const POSE = new Float64Array(POSE_SLOTS);
const FRAGMENTS = new Float32Array(NANITE_FIRE_FRAGMENTS * FRAGMENT_STRIDE);
let frameMode = 0;
let framePhase = NaN;
let frameClock = NaN;
let frameStrength = NaN;
let frameDetail = -1;
let lastDrawAt = -Infinity;
let retentionTimer = 0;
let listening = false;

export const naniteFlameReady = () => noise !== null;

const clamp = (n) => Math.min(1, Math.max(0, n));
const now = () => (environment.performance?.now ? environment.performance.now() : Date.now());

/** Local, non-blocking warm-up: builds the shared noise table and the small
 * glow sprites. No network request: the fire is procedural. The renderer's
 * GPU objects are created lazily on the first frame and released when the
 * page hides or leaves the World/Rexonance routes. */
export function warmNaniteFlame(env = globalThis) {
  const document = env.document;
  const connection = env.navigator?.connection;
  if (
    !document?.createElement ||
    document.hidden ||
    document.documentElement?.dataset?.worldEffects === "economy" ||
    connection?.saveData ||
    /^(slow-)?2g$/.test(connection?.effectiveType || "") ||
    env.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
    env.matchMedia?.("(forced-colors: active)").matches
  )
    return Promise.resolve(false);
  environment = env;
  // Re-evaluate the input tier on a return visit too.
  const touch = Boolean(env.matchMedia?.("(pointer: coarse), (any-pointer: coarse)").matches);
  if (touch !== coarse) {
    coarse = touch;
    releaseBodyFlame();
  }
  if (!listening && typeof env.addEventListener === "function") {
    listening = true;
    env.addEventListener("pagehide", releaseBodyFlame);
  }
  // The tables are built off the mounting task (idle, else a timeout); a
  // frame that arrives first builds them itself.
  if (noise && field) return Promise.resolve(true);
  return new Promise((resolve) => {
    const build = () => {
      try {
        prepare();
      } catch {
        /* A failed sprite canvas still leaves the procedural fire. */
      }
      resolve(noise !== null);
    };
    if (typeof env.requestIdleCallback === "function")
      env.requestIdleCallback(build, { timeout: 500 });
    else if (typeof env.setTimeout === "function") env.setTimeout(build, 0);
    else build();
  });
}

// Guarded, one-time resources (never per frame): the noise table, the glow
// sprite sheet and, if no undersuit was prepared, the authored silhouette.
function prepare() {
  if (!noise) noise = buildNoiseTable();
  if (!sprites && !spritesAttempted) {
    spritesAttempted = true;
    sprites = makeSprites();
  }
  if (!field) {
    const alpha = new Uint8Array(FIELD_W * FIELD_H);
    paintBodySilhouette(
      alpha,
      FIELD_W,
      FIELD_H,
      FIELD_BODY.x,
      FIELD_BODY.y,
      FIELD_BODY.width,
      FIELD_BODY.height,
    );
    const bytes = new Uint8Array(FIELD_W * FIELD_H * 4);
    if (buildFireField(alpha, FIELD_W, FIELD_H, bytes)) {
      field = bytes;
      fieldSource = null;
    }
  }
  return noise !== null && field !== null;
}

// Four radial glows on one small sheet: the reactor's green and blue
// light, and the white-cyan and pink of an airborne spark.
const SPRITE = 64;
const SPRITE_BLUE = 1;
const SPRITE_WHITE = 2;
const SPRITE_PINK = 3;
function makeSprites() {
  const document = environment.document;
  if (!document?.createElement) return null;
  const canvas = document.createElement("canvas");
  canvas.width = SPRITE * 4;
  canvas.height = SPRITE;
  const c = canvas.getContext("2d");
  if (!c?.createRadialGradient) return null;
  const glows = [
    ["rgb(176 255 134 / 0.7)", "rgb(60 190 72 / 0.34)", "rgb(16 96 40 / 0.12)", "rgb(8 60 30 / 0)"],
    [
      "rgb(150 212 255 / 0.56)",
      "rgb(66 134 255 / 0.32)",
      "rgb(104 84 226 / 0.14)",
      "rgb(140 80 204 / 0)",
    ],
    [
      "rgb(246 252 255 / 1)",
      "rgb(190 240 255 / 0.7)",
      "rgb(120 200 255 / 0.2)",
      "rgb(90 160 255 / 0)",
    ],
    [
      "rgb(255 220 244 / 0.9)",
      "rgb(255 143 216 / 0.5)",
      "rgb(200 100 200 / 0.14)",
      "rgb(160 80 190 / 0)",
    ],
  ];
  for (let i = 0; i < 4; i += 1) {
    const cx = i * SPRITE + SPRITE / 2;
    const gradient = c.createRadialGradient(cx, SPRITE / 2, 0, cx, SPRITE / 2, SPRITE / 2);
    gradient.addColorStop(0, glows[i][0]);
    gradient.addColorStop(0.24, glows[i][1]);
    gradient.addColorStop(0.58, glows[i][2]);
    gradient.addColorStop(1, glows[i][3]);
    c.fillStyle = gradient;
    c.fillRect(i * SPRITE, 0, SPRITE, SPRITE);
  }
  return canvas;
}

/** Builds the body field from the undersuit's alpha silhouette (any image
 * the scenes pass, at the shared 571×1040 registration). Retained until a
 * different source arrives; the GPU copy follows the renderer's lifetime. */
export function prepareBodyFlame(source, size, env = environment) {
  if (!source || !size?.width || !size?.height || !env.document?.createElement) return false;
  if (fieldSource === source && field) return true;
  try {
    const canvas = env.document.createElement("canvas");
    canvas.width = FIELD_W;
    canvas.height = FIELD_H;
    const c = canvas.getContext("2d", { willReadFrequently: true });
    if (!c?.drawImage || !c.getImageData) return false;
    c.clearRect(0, 0, FIELD_W, FIELD_H);
    c.drawImage(source, FIELD_BODY.x, FIELD_BODY.y, FIELD_BODY.width, FIELD_BODY.height);
    const data = c.getImageData(0, 0, FIELD_W, FIELD_H).data;
    const alpha = new Uint8Array(FIELD_W * FIELD_H);
    for (let i = 0; i < alpha.length; i += 1) alpha[i] = data[i * 4 + 3];
    const bytes = new Uint8Array(FIELD_W * FIELD_H * 4);
    if (!buildFireField(alpha, FIELD_W, FIELD_H, bytes)) return false;
    field = bytes;
    fieldSource = source;
    frameMode = 0;
    if (renderer && !glLost) uploadFireField(renderer, field);
    return true;
  } catch {
    // A blocked/low-memory canvas keeps the authored silhouette's fire.
    return false;
  }
}

function onContextLost(event) {
  if (event?.preventDefault) event.preventDefault();
  glLost = true;
  frameMode = 0;
}
function onContextRestored() {
  // Rebuild lazily on the next frame; the CPU field and noise are retained.
  glLost = false;
  releaseRenderer();
}
function releaseRenderer() {
  if (renderer) releaseFireRenderer(renderer);
  renderer = null;
  frameMode = 0;
}

// Guarded, one-time GPU setup: a failure or a lost context leaves the CPU
// kernel drawing, and is retried only after the documented cooldown.
function prepareRenderer() {
  if (renderer) return fireRendererReady(renderer) && !glLost;
  if (glLost) return false;
  if (now() - glFailedAt < RETRY_AFTER) return false;
  const document = environment.document;
  if (!document?.createElement) return false;
  try {
    const width = coarse ? NANITE_FIRE_BACKING.touchWidth : NANITE_FIRE_BACKING.width;
    const height = coarse ? NANITE_FIRE_BACKING.touchHeight : NANITE_FIRE_BACKING.height;
    if (!glCanvas || glWidth !== width || glHeight !== height) {
      if (glCanvas) {
        glCanvas.removeEventListener?.("webglcontextlost", onContextLost);
        glCanvas.removeEventListener?.("webglcontextrestored", onContextRestored);
      }
      glCanvas = document.createElement("canvas");
      glCanvas.width = width;
      glCanvas.height = height * 2;
      if (glCanvas.dataset) glCanvas.dataset.rexonanceFire = "body";
      glWidth = width;
      glHeight = height;
      gl = null;
    }
    if (!gl) {
      const attributes = {
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        preserveDrawingBuffer: true,
        powerPreference: "low-power",
      };
      gl = glCanvas.getContext("webgl2", attributes) || glCanvas.getContext("webgl", attributes);
      if (gl && typeof gl.createShader === "function") {
        glCanvas.addEventListener?.("webglcontextlost", onContextLost, false);
        glCanvas.addEventListener?.("webglcontextrestored", onContextRestored, false);
      } else gl = null;
    }
    renderer = gl ? createFireRenderer(gl) : null;
    if (!renderer) {
      glFailedAt = now();
      return false;
    }
    uploadFireNoise(renderer, noise);
    uploadFireField(renderer, field);
    return true;
  } catch {
    glFailedAt = now();
    renderer = null;
    return false;
  }
}

// Guarded, one-time CPU fallback surfaces.
function prepareRaster() {
  if (rasterBackContext) return true;
  if (now() - rasterFailedAt < RETRY_AFTER) return false;
  const document = environment.document;
  if (!document?.createElement) return false;
  try {
    rasterW = coarse ? RASTER_TOUCH_W : RASTER_W;
    rasterH = coarse ? RASTER_TOUCH_H : RASTER_H;
    const back = document.createElement("canvas");
    const front = document.createElement("canvas");
    back.width = front.width = rasterW;
    back.height = front.height = rasterH;
    if (back.dataset) back.dataset.rexonanceFire = "back";
    if (front.dataset) front.dataset.rexonanceFire = "front";
    const b = back.getContext("2d");
    const f = front.getContext("2d");
    if (!b?.createImageData || !f?.putImageData) {
      rasterFailedAt = now();
      return false;
    }
    rasterBackPixels = b.createImageData(rasterW, rasterH);
    rasterFrontPixels = f.createImageData(rasterW, rasterH);
    rasterBack = back;
    rasterFront = front;
    rasterBackContext = b;
    rasterFrontContext = f;
    return true;
  } catch {
    rasterFailedAt = now();
    return false;
  }
}

/** Frees the GPU objects and fallback surfaces (the CPU field and noise
 * stay, so a return visit rebuilds in one frame). Called on pagehide, when
 * the page hides or leaves the World/Rexonance routes, and by callers that
 * composite the fire themselves. */
export function releaseBodyFlame() {
  releaseRenderer();
  if (glCanvas) {
    glCanvas.removeEventListener?.("webglcontextlost", onContextLost);
    glCanvas.removeEventListener?.("webglcontextrestored", onContextRestored);
    const lose = gl?.getExtension?.("WEBGL_lose_context");
    if (lose && !glLost) lose.loseContext();
    glCanvas.width = glCanvas.height = 0;
  }
  glCanvas = null;
  gl = null;
  glLost = false;
  glWidth = glHeight = 0;
  if (rasterBack) rasterBack.width = rasterBack.height = 0;
  if (rasterFront) rasterFront.width = rasterFront.height = 0;
  rasterBack = rasterFront = rasterBackContext = rasterFrontContext = null;
  rasterBackPixels = rasterFrontPixels = null;
  frameMode = 0;
  if (retentionTimer) environment.clearTimeout?.(retentionTimer);
  retentionTimer = 0;
}

function checkRetention() {
  retentionTimer = 0;
  if (!renderer && !rasterBackContext) return;
  const document = environment.document;
  const away =
    !document ||
    document.hidden ||
    (environment.location?.pathname !== undefined && !ROUTES.test(environment.location.pathname));
  if (away && now() - lastDrawAt >= RETENTION_MS) releaseBodyFlame();
  else if (environment.setTimeout)
    retentionTimer = environment.setTimeout(checkRetention, RETENTION_MS);
}
function touchRetention() {
  lastDrawAt = now();
  if (!retentionTimer && environment.setTimeout)
    retentionTimer = environment.setTimeout(checkRetention, RETENTION_MS);
}

const valid = (strength, clock, scale) =>
  Number.isFinite(strength) &&
  strength > 0 &&
  Number.isFinite(clock) &&
  Number.isFinite(scale) &&
  scale > 0;

// Renders both layers of one frame into the retained surfaces, once per
// distinct (phase, clock, strength, tier); the front draw reuses them.
function renderFrame(phase, strength, clock) {
  const detail = coarse ? 0 : 1;
  if (
    frameMode &&
    framePhase === phase &&
    frameClock === clock &&
    frameStrength === strength &&
    frameDetail === detail
  )
    return frameMode;
  poseFire(phase, strength, clock, detail, POSE);
  poseFragments(phase, FIRE_RECT, FRAGMENTS);
  frameMode = 0;
  if (prepareRenderer()) {
    gl.disable(gl.SCISSOR_TEST);
    gl.viewport(0, 0, glWidth, glHeight * 2);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    drawFireLayer(renderer, POSE, 0, 0, glHeight, glWidth, glHeight);
    drawFireLayer(renderer, POSE, 1, 0, 0, glWidth, glHeight);
    drawFireSparks(renderer, POSE, FRAGMENTS, NANITE_FIRE_FRAGMENTS, 0, 0, glWidth, glHeight);
    frameMode = 1;
  } else if (prepareRaster()) {
    rasterFire(POSE, field, noise, rasterW, rasterH, rasterBackPixels.data, rasterFrontPixels.data);
    rasterBackContext.putImageData(rasterBackPixels, 0, 0);
    rasterFrontContext.putImageData(rasterFrontPixels, 0, 0);
    frameMode = 2;
  }
  if (frameMode) {
    framePhase = phase;
    frameClock = clock;
    frameStrength = strength;
    frameDetail = detail;
    touchRetention();
  }
  return frameMode;
}

// The CPU fallback's burst fragments: straight-alpha sparks in the heat
// ramp's tones, stretched by their speed. Colours are prebuilt bands.
const HEAT_CSS = [
  "rgb(205 110 182)",
  "rgb(255 143 216)",
  "rgb(230 190 240)",
  "rgb(150 236 255)",
  "rgb(190 245 255)",
  "rgb(240 250 255)",
];
function paintRasterSparks(context, W, H, strength) {
  const step = coarse ? 2 : 1;
  for (let i = 0; i < NANITE_FIRE_FRAGMENTS; i += step) {
    const k = i * FRAGMENT_STRIDE;
    const heat = FRAGMENTS[k + 2];
    if (heat <= 0) continue;
    const x = (FIRE_RECT.x + FRAGMENTS[k] * FIRE_RECT.width) * W;
    const y = (FIRE_RECT.y + FRAGMENTS[k + 1] * FIRE_RECT.height) * H;
    const size = FRAGMENTS[k + 3] * W;
    const speed = Math.sqrt(
      FRAGMENTS[k + 4] * FRAGMENTS[k + 4] + FRAGMENTS[k + 5] * FRAGMENTS[k + 5],
    );
    const stretch = 1 + Math.min(2, speed * 0.0007);
    context.fillStyle = HEAT_CSS[Math.min(5, Math.floor(heat * 6))];
    context.globalAlpha = Math.pow(heat, 0.6) * strength;
    context.fillRect(x - size / 2, y - (size * stretch) / 2, size, size * stretch);
  }
}

/** Back/front sample the same frame of the body fire. Phase is the shared
 * ignition clock, not wall-clock history; an omitted phase lets strength
 * stand for how far along a full torch is (legacy callers). */
export function drawBodyFlame(context, size, strength, clock, scale = 1, layer = "all", phase = 0) {
  if (Number.isFinite(phase) && phase >= NANITE_FIRE_PHASES.flameEnd) return;
  if (
    !valid(strength, clock, scale) ||
    !size ||
    !Number.isFinite(size.width) ||
    size.width <= 0 ||
    !Number.isFinite(size.height) ||
    size.height <= 0 ||
    !prepare()
  )
    return;
  if (layer === "all") {
    drawBodyFlame(context, size, strength, clock, scale, "back", phase);
    drawBodyFlame(context, size, strength, clock, scale, "front", phase);
    return;
  }
  const W = size.width;
  const H = size.height;
  const power = clamp(strength);
  const progress =
    Number.isFinite(phase) && phase > 0 ? phase : NANITE_FIRE_PHASES.burstStart * power;
  const mode = renderFrame(progress, power, clock);
  if (!mode) return;
  const back = layer === "back";
  context.save();
  try {
    if (scale !== 1) context.scale(scale, scale);
    context.globalCompositeOperation = "source-over";
    context.globalAlpha = 1;
    const dx = FIRE_RECT.x * W;
    const dy = FIRE_RECT.y * H;
    const dw = FIRE_RECT.width * W;
    const dh = FIRE_RECT.height * H;
    if (mode === 1)
      context.drawImage(glCanvas, 0, back ? 0 : glHeight, glWidth, glHeight, dx, dy, dw, dh);
    else {
      context.drawImage(back ? rasterBack : rasterFront, dx, dy, dw, dh);
      if (!back) {
        context.globalCompositeOperation = "lighter";
        paintRasterSparks(context, W, H, power);
      }
    }
  } finally {
    context.restore();
  }
}

/** The reactor's light: the core takes the fire's colour as the engulf
 * reaches the chest, and flares white at the detonation. Two glow draws. */
export function drawNaniteFlame(context, core, strength, clock, scale = 1) {
  if (
    !valid(strength, clock, scale) ||
    !core ||
    !Number.isFinite(core[0]) ||
    !Number.isFinite(core[1]) ||
    !prepare() ||
    !sprites
  )
    return;
  const power = clamp(strength);
  const cover = POSE[POSE_COVER];
  const mix = POSE[POSE_MIX];
  const burst = POSE[POSE_BURST];
  const reach = clamp((cover - 0.3) / 0.3) * (1 - burst * 0.6);
  if (reach <= 0.001) return;
  const pulse = 0.86 + 0.14 * Math.sin(clock * 9.1) * Math.sin(clock * 5.3 + 0.7);
  const radius = (118 + 60 * burst) * (0.7 + 0.3 * reach);
  const cx = core[0];
  const cy = core[1];
  context.save();
  try {
    if (scale !== 1) context.scale(scale, scale);
    context.globalCompositeOperation = "lighter";
    context.globalAlpha = power * reach * pulse * 0.42 * (1 - mix);
    if (context.globalAlpha > 0.004)
      context.drawImage(
        sprites,
        0,
        0,
        SPRITE,
        SPRITE,
        cx - radius,
        cy - radius,
        radius * 2,
        radius * 2,
      );
    context.globalAlpha = power * reach * pulse * 0.42 * mix;
    if (context.globalAlpha > 0.004)
      context.drawImage(
        sprites,
        SPRITE * SPRITE_BLUE,
        0,
        SPRITE,
        SPRITE,
        cx - radius,
        cy - radius,
        radius * 2,
        radius * 2,
      );
  } finally {
    context.restore();
  }
}

/** A burning fragment carried by the nanite engines: an incandescent spark
 * (pink-violet halo, white-cyan core), never a rotated flame image. Their
 * closed-form trajectory supplies its position; two glow draws at most. */
export function drawNaniteFirebrand(context, x, y, strength, clock, scale = 1) {
  if (
    !valid(strength, clock, scale) ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !prepare() ||
    !sprites
  )
    return;
  const power = clamp(strength);
  const flicker = 0.84 + 0.16 * Math.sin(clock * 37 + x * 0.11 + y * 0.07);
  const halo = (16 + 22 * power) * flicker;
  const core = (6 + 9 * power) * flicker;
  context.save();
  try {
    if (scale !== 1) context.scale(scale, scale);
    context.globalCompositeOperation = "lighter";
    context.globalAlpha = power * 0.7;
    context.drawImage(
      sprites,
      SPRITE * SPRITE_PINK,
      0,
      SPRITE,
      SPRITE,
      x - halo,
      y - halo,
      halo * 2,
      halo * 2,
    );
    context.globalAlpha = power;
    context.drawImage(
      sprites,
      SPRITE * SPRITE_WHITE,
      0,
      SPRITE,
      SPRITE,
      x - core,
      y - core,
      core * 2,
      core * 2,
    );
  } finally {
    context.restore();
  }
}

/** Test and diagnostic access to the retained surfaces and state. */
export function inspectBodyFlame() {
  return {
    mode: frameMode,
    coarse,
    field,
    noise,
    renderer,
    glCanvas,
    glLost,
    rasterBack,
    rasterFront,
    pose: POSE,
    fragments: FRAGMENTS,
    retained: Boolean(renderer || rasterBackContext),
  };
}

/** Owner (2026-10-21, 炎を改善): the hot-cored tongues and sparks this call
 * once added as radial blobs are now part of the body fire itself (its
 * incandescent base, rising tongues and the burst's fragments). Drawing
 * them again would double the light over the same flames, so this stays a
 * no-op with its signature, for the scenes' existing calls. */
export function drawFlameHeat() {}
