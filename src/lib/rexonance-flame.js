// A connected combustion volume, clipped to the real undersuit. The same
// field feeds both nanite engines: a quiet ignition, one explosive front,
// then material shed from that surface. The Blender volume adds turbulent
// detail inside the field, rather than twenty unrelated miniature fires.
import { NANITE_FIRE_PHASES, naniteFlameScatter, sampleFlameBirth } from "./rexonance-ignition.js";
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

let atlas = null;
let pending = null;
let failedAt = -Infinity;
let coarse = false;
const RETRY_AFTER = 30000;

export const naniteFlameReady = () => atlas !== null;

/** Local, non-blocking warm-up: a slow/missing sheet never holds the suit-up.
 * One decoded 4 MiB sheet is retained across World/Rexonance return visits.
 * This deliberately is not a global startup prefetch or a new render loop. */
export function warmNaniteFlame(environment = globalThis) {
  const document = environment.document;
  const connection = environment.navigator?.connection;
  if (
    !document?.createElement ||
    document.hidden ||
    document.documentElement?.dataset?.worldEffects === "economy" ||
    connection?.saveData ||
    /^(slow-)?2g$/.test(connection?.effectiveType || "") ||
    environment.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
    environment.matchMedia?.("(forced-colors: active)").matches
  )
    return Promise.resolve(false);
  // Re-evaluate the input tier on a return visit too: a retained sheet may
  // now be used in a tablet window with a different attached pointer.
  coarse = Boolean(environment.matchMedia?.("(pointer: coarse), (any-pointer: coarse)").matches);
  // Both live engines warm before their first draw. Build the tiny fallback
  // and contact-light canvases now, not inside that first critical frame.
  prepare();
  if (atlas) return Promise.resolve(true);
  if (pending) return pending;
  if (Date.now() - failedAt < RETRY_AFTER) return Promise.resolve(false);
  pending = new Promise((resolve) => {
    const image = document.createElement("img");
    let finished = false;
    const done = (ready) => {
      if (finished) return;
      finished = true;
      image.onload = image.onerror = null;
      if (
        ready &&
        image.naturalWidth === NANITE_FLAME_ATLAS.width &&
        image.naturalHeight === NANITE_FLAME_ATLAS.height
      )
        atlas = image;
      else failedAt = Date.now();
      resolve(atlas !== null);
    };
    image.decoding = "async";
    image.fetchPriority = "low";
    image.onload = () => {
      if (typeof image.decode !== "function") done(true);
      else
        Promise.resolve()
          .then(() => image.decode())
          .then(
            () => done(true),
            () => done(false),
          );
    };
    image.onerror = () => done(false);
    image.src = NANITE_FLAME_ATLAS.src;
  })
    .catch(() => {
      failedAt = Date.now();
      return false;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

const hash = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const clamp = (n) => Math.min(1, Math.max(0, n));
const smooth = (n) => n * n * (3 - 2 * n);
const TAU = Math.PI * 2;

// Immutable seeds: the warmed engines allocate no particle objects,
// gradients or random/hash state in a frame (including reverse scrubbing).
const COUNT = 64;
const SEED = new Float32Array(COUNT * 8);
for (let i = 0; i < SEED.length; i += 1) SEED[i] = hash(i + 0.37);
const SOURCES = new Float32Array(48 * 4);
const sourceScratch = new Float32Array(4);
for (let i = 0; i < 48; i += 1) {
  sampleFlameBirth((i + 0.5) / 48, sourceScratch);
  SOURCES.set(sourceScratch, i * 4);
}

// Three small surfaces (~2.75 MiB), prepared once and retained across calls.
// A source image is already decoded by the suit warm-up: no extra request.
let bodySource = null;
let bodyMask = null;
let bodyField = null;
let bodyFlow = null;
let bodyContext = null;
let maskContext = null;
let fieldClock = -Infinity;
let fieldPower = -1;
let fieldPhase = -1;
const VORTEX_W = 288;
const VORTEX_H = 528;
const FIELD_PAD = 48;
const FIELD_W = VORTEX_W + FIELD_PAD * 2;
const FIELD_H = VORTEX_H + FIELD_PAD * 2;
// Room for a broad, rolling plume outside the figure (not a human cutout).
// Extra transparent padding protects the rotated volume's irregular tips;
// it does not stretch the flame or alter the real body's registration.
const BODY_X = 48 + FIELD_PAD;
const BODY_Y = 28 + FIELD_PAD;
const BODY_W = 192;
const BODY_H = 472;
const VORTEX_STRANDS = 3;
const VORTEX_STEPS = 48;
const VORTEX_STRIDE = 7;
// Crown width depends only on the authored step, not on time or power.
// Bake its exact double values once instead of repeating float helper
// crossings for all three strands on every frame of the extended fire.
const VORTEX_CROWN_WIDTH = new Float64Array(VORTEX_STEPS + 1);
for (let i = 0; i <= VORTEX_STEPS; i += 1)
  VORTEX_CROWN_WIDTH[i] = 1 + 0.35 * smooth(clamp((i / VORTEX_STEPS - 0.65) / 0.25));
// Reused geometry: x/y, transverse normal, thickness, front/back depth,
// local breakup. A whole coil is continuous, never assembled from strips.
const VORTEX = new Float32Array(VORTEX_STRANDS * (VORTEX_STEPS + 1) * VORTEX_STRIDE);
const DENSITY = new Float32Array(64 * 64);
for (let i = 0; i < DENSITY.length; i += 1) DENSITY[i] = hash(i + 51.7);
// The one-time density bake crosses this helper almost a million times.
// Reusable double slots keep its inputs/output out of boxed-number call
// arguments and returns without changing a single density or RGBA value.
const DENSITY_SAMPLE = new Float64Array(3);
const density = (period) => {
  const x = DENSITY_SAMPLE[0];
  const y = DENSITY_SAMPLE[1];
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const u = smooth(x - ix);
  const v = smooth(y - iy);
  const mask = period - 1;
  const x0 = ix & mask;
  const x1 = (ix + 1) & mask;
  const y0 = (iy & mask) * 64;
  const y1 = ((iy + 1) & mask) * 64;
  const a = DENSITY[y0 + x0] + (DENSITY[y0 + x1] - DENSITY[y0 + x0]) * u;
  const b = DENSITY[y1 + x0] + (DENSITY[y1 + x1] - DENSITY[y1 + x0]) * u;
  DENSITY_SAMPLE[2] = a + (b - a) * v;
};

export function prepareBodyFlame(source, size, environment = globalThis) {
  if (!source || !size?.width || !size?.height || !environment.document?.createElement)
    return false;
  if (bodySource === source && bodyField) return true;
  try {
    const mask = environment.document.createElement("canvas");
    const field = environment.document.createElement("canvas");
    const flow = environment.document.createElement("canvas");
    mask.width = field.width = flow.width = FIELD_W;
    mask.height = field.height = flow.height = FIELD_H;
    const m = mask.getContext("2d");
    const c = field.getContext("2d");
    const f = flow.getContext("2d");
    if (!m?.clearRect || !c?.ellipse || !f?.createImageData) return false;
    // Keep the real registration as the low-density interior. The visible
    // outer shape is rebuilt from continuous vortex geometry each frame.
    m.drawImage(source, BODY_X, BODY_Y, BODY_W, BODY_H);
    m.shadowColor = "#fff";
    m.shadowBlur = 12;
    const pixels = f.createImageData(FIELD_W, FIELD_H);
    // Domain-warped, multi-scale density has billows and voids rather than
    // repeating diagonal sine bands. This toroidal sheet is made once.
    for (let y = 0; y < FIELD_H; y += 1) {
      const v = (y / FIELD_H) * 64;
      for (let x = 0; x < FIELD_W; x += 1) {
        const u = (x / FIELD_W) * 64;
        DENSITY_SAMPLE[0] = u * 0.125;
        DENSITY_SAMPLE[1] = v * 0.125;
        density(8);
        const wx = DENSITY_SAMPLE[2] * 10;
        DENSITY_SAMPLE[0] = u * 0.125 + 23;
        DENSITY_SAMPLE[1] = v * 0.125 + 41;
        density(8);
        const wy = DENSITY_SAMPLE[2] * 10;
        DENSITY_SAMPLE[0] = u * 0.5 + wx;
        DENSITY_SAMPLE[1] = v * 0.5 + wy;
        density(32);
        const billow = DENSITY_SAMPLE[2];
        DENSITY_SAMPLE[0] = u + wx * 1.7;
        DENSITY_SAMPLE[1] = v + wy * 1.7;
        density(64);
        const detail = DENSITY_SAMPLE[2];
        const hot = smooth(clamp((billow * 0.72 + detail * 0.28 - 0.17) * 1.6));
        const k = (y * FIELD_W + x) * 4;
        pixels.data[k] = 4 + hot * 65;
        pixels.data[k + 1] = 46 + hot * 160;
        pixels.data[k + 2] = 12 + hot * 54;
        // Empty density really is transparent. The Cycles volume below,
        // not an opaque procedural sheet, carries the luminous boundary.
        pixels.data[k + 3] = Math.pow(clamp((hot - 0.28) / 0.72), 2.4) * 52;
      }
    }
    f.putImageData(pixels, 0, 0);
    bodySource = source;
    bodyMask = mask;
    bodyField = field;
    bodyFlow = flow;
    bodyContext = c;
    maskContext = m;
    fieldClock = -Infinity;
    fieldPhase = -1;
    return true;
  } catch {
    // A blocked/low-memory canvas keeps the safe authored volume fallback.
    return false;
  }
}

let fallback = null;
let heat = null;
let fallbackAttempted = false;
const makeFallback = () => {
  const document = globalThis.document;
  if (!document?.createElement) return null;
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 192;
  const c = canvas.getContext("2d");
  if (!c?.createLinearGradient || !c.bezierCurveTo) return null;
  const colour = c.createLinearGradient(0, 192, 0, 0);
  colour.addColorStop(0, "rgb(156 243 112 / 0)");
  colour.addColorStop(0.13, "rgb(156 243 112 / 0.76)");
  colour.addColorStop(0.2, "rgb(58 180 67 / 0.66)");
  colour.addColorStop(0.6, "rgb(22 101 49 / 0.38)");
  colour.addColorStop(1, "rgb(9 47 27 / 0)");
  c.fillStyle = colour;
  c.beginPath();
  c.moveTo(28, 188);
  c.bezierCurveTo(5, 147, 31, 121, 37, 104);
  c.bezierCurveTo(45, 76, 18, 53, 63, 5);
  c.bezierCurveTo(45, 58, 84, 62, 68, 109);
  c.bezierCurveTo(58, 139, 90, 154, 70, 183);
  c.bezierCurveTo(58, 176, 46, 189, 28, 188);
  c.closePath();
  c.fill();
  const glow = document.createElement("canvas");
  glow.width = glow.height = 64;
  const g = glow.getContext("2d");
  if (g?.createRadialGradient) {
    const gradient = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgb(111 226 94 / 0.5)");
    gradient.addColorStop(0.25, "rgb(30 138 55 / 0.28)");
    gradient.addColorStop(1, "rgb(9 66 35 / 0)");
    g.fillStyle = gradient;
    g.fillRect(0, 0, 64, 64);
    heat = glow;
  }
  return canvas;
};

// Inset half a texel to keep the adjacent atlas tile out of bilinear reads.
// Both frames use the same root/size: interpolation cannot make the fire
// slide across the body or detach at the floor.
const tongue = (c, x, y, width, height, phase, alpha, lean) => {
  if (alpha < 0.002) return;
  c.save();
  try {
    c.translate(x, y);
    c.rotate(lean);
    if (atlas) {
      // The volume's authored root is tile y=248, with 8 px of transparent
      // camera margin below it. Compensate after the half-texel inset so the
      // visible floor flame, not the image rectangle, touches its contact.
      const top = -height + (height * (255.5 - 248)) / 255;
      const time = ((phase % 32) + 32) % 32;
      const first = Math.floor(time);
      const next = (first + 1) % 32;
      const mix = time - first;
      c.globalAlpha = alpha * (1 - mix);
      c.drawImage(
        atlas,
        (first % 8) * 128 + 0.5,
        (first >> 3) * 256 + 0.5,
        127,
        255,
        -width / 2,
        top,
        width,
        height,
      );
      if (mix > 0.001) {
        c.globalAlpha = alpha * mix;
        c.drawImage(
          atlas,
          (next % 8) * 128 + 0.5,
          (next >> 3) * 256 + 0.5,
          127,
          255,
          -width / 2,
          top,
          width,
          height,
        );
      }
    } else if (fallback) {
      c.globalAlpha = alpha * 0.7;
      c.drawImage(fallback, -width / 2, -height, width, height);
    }
  } finally {
    c.restore();
  }
};

const valid = (strength, clock, scale) =>
  Number.isFinite(strength) &&
  strength > 0 &&
  Number.isFinite(clock) &&
  Number.isFinite(scale) &&
  scale > 0;
const prepare = () => {
  // A direct legacy draw can still prepare once without a warm-up. Failed
  // canvas allocation must not throw, or be attempted again on every frame.
  if (!fallback && !fallbackAttempted && globalThis.document?.createElement) {
    fallbackAttempted = true;
    try {
      fallback = makeFallback();
    } catch {
      /* The decoded atlas can still carry the fire. */
    }
  }
  return atlas || fallback;
};

/** Strength is the existing callers' slow kindle/die-down envelope. A calm
 * scroll frame supplies a progress clock; it stays reproducible and still. */
export function drawNaniteFlame(context, core, strength, clock, scale = 1) {
  if (
    !valid(strength, clock, scale) ||
    !core ||
    !Number.isFinite(core[0]) ||
    !Number.isFinite(core[1]) ||
    !prepare()
  )
    return;
  const power = smooth(clamp(strength));
  const cx = core[0];
  const cy = core[1];
  context.save();
  try {
    if (scale !== 1) context.scale(scale, scale);
    // The volume already stores dark/low-density emission. Add its radiance
    // rather than dimming it against the dark stage for a second time.
    context.globalCompositeOperation = "lighter";
    // The reactor remains readable: two faint rim curls join the field,
    // rather than a separate bonfire covering the central mechanism.
    for (let i = 0; i < 2; i += 1) {
      const k = i * 8;
      const angle = SEED[k] * TAU;
      const pulse = 0.84 + 0.16 * Math.sin(clock * (3 + SEED[k + 1]) + i * 2.1);
      tongue(
        context,
        cx + Math.cos(angle) * (27 + 31 * power),
        cy + 20 + Math.sin(angle) * 17,
        (25 + SEED[k + 2] * 25) * 1.65,
        (67 + SEED[k + 3] * 73) * 1.25 * (0.45 + 0.55 * power) * pulse,
        clock * 16 * (0.8 + SEED[k + 4] * 0.35) + SEED[k + 5] * 32,
        power * (0.28 + SEED[k + 6] * 0.12),
        Math.cos(angle) * 0.12,
      );
    }
    if (heat) {
      context.globalCompositeOperation = "lighter";
      context.globalAlpha = power * 0.18;
      context.drawImage(heat, cx - 89, cy - 43, 178, 86);
    }
    // No separately respawning nucleus sparks: the one body-wide scatter
    // and its real nanite engines now own material birth.
  } finally {
    context.restore();
  }
}

/** A real burning fragment, shared with both materialization engines.
 * Their closed-form trajectory supplies its position; this only paints the
 * fire carried by it, at a ceiling of two atlas draws (one cached fallback).
 * No independent particle clock, resource, canvas or allocation is added. */
export function drawNaniteFirebrand(context, x, y, strength, clock, scale = 1) {
  if (!valid(strength, clock, scale) || !Number.isFinite(x) || !Number.isFinite(y) || !prepare())
    return;
  const power = clamp(strength);
  context.save();
  try {
    if (scale !== 1) context.scale(scale, scale);
    context.globalCompositeOperation = "lighter";
    tongue(
      context,
      x,
      y,
      22 + power * 28,
      35 + power * 72,
      clock * 16,
      power,
      Math.sin(clock * 5.3 + x * 0.07) * 0.13,
    );
  } finally {
    context.restore();
  }
}

// Three real projected helices surround the body. Their front/back depth
// travels with a shared angular clock, not with independent per-part roots.
// The burst pulls the same ribbons outward, thins and tears them, then
// clears their centre before the first machine can become visible.
function poseVortex(power, clock, phase) {
  const burst = smooth(
    clamp(
      (phase - NANITE_FIRE_PHASES.burstStart) /
        (NANITE_FIRE_PHASES.burstEnd - NANITE_FIRE_PHASES.burstStart),
    ),
  );
  const spin = clock * 0.55 + TAU * (phase * 1.1 + 1.1 * smooth(clamp((phase - 0.08) / 0.095)));
  for (let strand = 0; strand < VORTEX_STRANDS; strand += 1) {
    const base = strand * (VORTEX_STEPS + 1) * VORTEX_STRIDE;
    for (let i = 0; i <= VORTEX_STEPS; i += 1) {
      const t = i / VORTEX_STEPS;
      const at = base + i * VORTEX_STRIDE;
      const angle =
        spin +
        (strand * TAU) / VORTEX_STRANDS +
        t * TAU * 1.45 +
        Math.sin(t * TAU * 1.3 - clock * 2 + strand) * 0.22;
      const s = Math.sin(angle);
      const c = Math.cos(angle);
      const radius = VORTEX_W * (0.205 + 0.065 * Math.sin(t * Math.PI) + burst * 0.11);
      const split = smooth(clamp((Math.sin(t * TAU * 2.3 + strand * 1.7 - spin) + 0.55) * 1.8));
      const tear = 1 - burst * split * 0.94;
      VORTEX[at] = FIELD_W * 0.5 + radius * c + burst * c * VORTEX_W * 0.045;
      VORTEX[at + 1] =
        FIELD_PAD + VORTEX_H * (0.94 - 0.87 * t) + radius * 0.16 * s - burst * VORTEX_H * 0.025;
      VORTEX[at + 4] =
        VORTEX_W *
        (0.075 + 0.045 * Math.sin(t * Math.PI)) *
        Math.sqrt(Math.max(0.15, Math.sin(t * Math.PI))) *
        // Keep the crown wrapped as the longer-lived vortex turns through
        // other angles; this widens the same irregular volume, not a mask
        // over the face or additional independent head flames.
        VORTEX_CROWN_WIDTH[i] *
        (0.65 + power * 0.35) *
        (1 - burst * 0.65) *
        tear;
      VORTEX[at + 5] = s;
      VORTEX[at + 6] = tear;
    }
    for (let i = 0; i <= VORTEX_STEPS; i += 1) {
      const at = base + i * VORTEX_STRIDE;
      const before = base + Math.max(0, i - 1) * VORTEX_STRIDE;
      const after = base + Math.min(VORTEX_STEPS, i + 1) * VORTEX_STRIDE;
      const dx = VORTEX[after] - VORTEX[before];
      const dy = VORTEX[after + 1] - VORTEX[before + 1];
      const length = Math.hypot(dx, dy) || 1;
      VORTEX[at + 2] = -dy / length;
      VORTEX[at + 3] = dx / length;
    }
  }
}

// Closed, overlapping curved cells form a continuous ribbon; there are no
// displaced source rows or rectangular lower bounds. Side selects depth.
function vortexPath(context, side, clock, phase) {
  const burst = smooth(
    clamp(
      (phase - NANITE_FIRE_PHASES.burstStart) /
        (NANITE_FIRE_PHASES.burstEnd - NANITE_FIRE_PHASES.burstStart),
    ),
  );
  context.beginPath();
  for (let strand = 0; strand < VORTEX_STRANDS; strand += 1) {
    const base = strand * (VORTEX_STEPS + 1) * VORTEX_STRIDE;
    for (let i = 0; i < VORTEX_STEPS; i += 1) {
      const a = base + i * VORTEX_STRIDE;
      const b = a + VORTEX_STRIDE;
      const depth = (VORTEX[a + 5] + VORTEX[b + 5]) * 0.5;
      if (side && depth * side < -0.05) continue;
      if (VORTEX[a + 6] + VORTEX[b + 6] < 0.23) continue;
      const ax = VORTEX[a] + VORTEX[a + 2] * VORTEX[a + 4];
      const ay = VORTEX[a + 1] + VORTEX[a + 3] * VORTEX[a + 4];
      const bx = VORTEX[b] + VORTEX[b + 2] * VORTEX[b + 4];
      const by = VORTEX[b + 1] + VORTEX[b + 3] * VORTEX[b + 4];
      const cx = VORTEX[b] - VORTEX[b + 2] * VORTEX[b + 4];
      const cy = VORTEX[b + 1] - VORTEX[b + 3] * VORTEX[b + 4];
      const dx = VORTEX[a] - VORTEX[a + 2] * VORTEX[a + 4];
      const dy = VORTEX[a + 1] - VORTEX[a + 3] * VORTEX[a + 4];
      context.moveTo(ax, ay);
      context.bezierCurveTo(ax, ay, bx, by, bx, by);
      context.bezierCurveTo(bx, by, cx, cy, cx, cy);
      context.bezierCurveTo(cx, cy, dx, dy, dx, dy);
      context.bezierCurveTo(dx, dy, ax, ay, ax, ay);
      context.closePath();
    }
    // Secondary rolling curls split off the same stream, at two scales.
    for (let branch = 0; branch < 2; branch += 1) {
      const at = base + (12 + branch * 22) * VORTEX_STRIDE;
      if (side && VORTEX[at + 5] * side < 0) continue;
      const turn = clock * 2.1 + strand * 2.3 + branch * 1.7;
      const x = VORTEX[at];
      const y = VORTEX[at + 1];
      const margin = Math.min(x, FIELD_W - x, y, FIELD_H - y);
      const radius = Math.min((10 + branch * 8) * (1 + burst * 0.6), Math.max(0, margin * 0.42));
      const nx = Math.cos(turn);
      const ny = Math.sin(turn);
      const tx = -ny;
      const ty = nx;
      context.moveTo(x - nx * 7, y - ny * 7);
      context.bezierCurveTo(
        x + tx * radius * 2,
        y + ty * radius * 2,
        x + nx * radius * 2 + tx * radius,
        y + ny * radius * 2 + ty * radius,
        x + nx * radius * 1.8,
        y + ny * radius * 1.8,
      );
      context.bezierCurveTo(
        x + nx * radius + tx * radius * 0.4,
        y + ny * radius + ty * radius * 0.4,
        x + tx * radius * 0.5,
        y + ty * radius * 0.5,
        x + nx * 7,
        y + ny * 7,
      );
      context.closePath();
    }
  }
}

function paintBodyField(power, clock, phase) {
  if (!bodyContext || !maskContext || !bodyFlow || !bodyMask || !bodyField) return false;
  if (fieldClock === clock && fieldPower === power && fieldPhase === phase) return true;
  poseVortex(power, clock, phase);
  const burst = smooth(
    clamp(
      (phase - NANITE_FIRE_PHASES.burstStart) /
        (NANITE_FIRE_PHASES.burstEnd - NANITE_FIRE_PHASES.burstStart),
    ),
  );
  const m = maskContext;
  m.save();
  try {
    m.globalCompositeOperation = "source-over";
    m.globalAlpha = 1;
    m.clearRect(0, 0, FIELD_W, FIELD_H);
    // A faint interior joins the wrapping fire before detonation; unlike
    // the former stencil it is gone as the rotating bands fly apart.
    m.globalAlpha = 0.15 * (1 - burst);
    if (m.globalAlpha > 0.001) m.drawImage(bodySource, BODY_X, BODY_Y, BODY_W, BODY_H);
    m.globalAlpha = 1;
    m.fillStyle = "#fff";
    vortexPath(m, 0, clock, phase);
    m.fill();
  } finally {
    m.restore();
  }
  const c = bodyContext;
  const W = FIELD_W;
  const H = FIELD_H;
  c.save();
  try {
    c.globalCompositeOperation = "source-over";
    c.globalAlpha = 1;
    c.clearRect(0, 0, W, H);
    // A single rising combustion front (not a per-part on/off stagger).
    c.beginPath();
    c.ellipse(
      BODY_X + BODY_W * 0.5,
      BODY_Y + BODY_H * 0.34,
      BODY_W * (0.1 + power * 1.8),
      BODY_H * (0.025 + power * 0.94),
      0,
      0,
      TAU,
    );
    c.clip();
    const offset = (((clock * 83) % H) + H) % H;
    c.drawImage(bodyFlow, 0, offset - H, W, H);
    c.drawImage(bodyFlow, 0, offset, W, H);
    c.globalCompositeOperation = "destination-in";
    c.drawImage(bodyMask, 0, 0);
    // Overlapping sheets are texture within the one connected field. The
    // participating-volume detail is still the real Cycles-rendered asset.
    c.globalCompositeOperation = "source-over";
    const volumes = coarse ? 18 : 24;
    for (let i = 0; i < volumes; i += 1) {
      const k = i * 8;
      const strand = i % VORTEX_STRANDS;
      const along = Math.floor(i / VORTEX_STRANDS);
      const step = Math.round((along * VORTEX_STEPS) / (volumes / VORTEX_STRANDS - 1));
      const at = (strand * (VORTEX_STEPS + 1) + step) * VORTEX_STRIDE;
      const angle = Math.atan2(-VORTEX[at + 2], VORTEX[at + 3]) + Math.PI / 2;
      const tearing = VORTEX[at + 6];
      tongue(
        c,
        VORTEX[at],
        VORTEX[at + 1],
        VORTEX_W * (0.36 + SEED[k] * 0.2) * (0.45 + tearing * 0.55),
        VORTEX_H * (0.19 + SEED[k + 1] * 0.09) * (0.5 + tearing * 0.5),
        clock * 16 + SEED[k + 2] * 32,
        Math.min(1, 0.94 + VORTEX[at + 5] * 0.1) * tearing,
        angle,
      );
    }
  } finally {
    c.restore();
  }
  c.globalCompositeOperation = "source-over";
  fieldClock = clock;
  fieldPower = power;
  fieldPhase = phase;
  return true;
}

/** Back/front sample the same connected body volume. Phase is the shared
 * ignition clock, not wall-clock history; it drives one scatter impulse. */
export function drawBodyFlame(context, size, strength, clock, scale = 1, layer = "all", phase = 0) {
  // The storm is already gone when material becomes visible. Even an
  // isolated legacy caller cannot leave a green body stencil over armour.
  if (Number.isFinite(phase) && phase >= NANITE_FIRE_PHASES.materialStart) return;
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
  const unit = H / 1000;
  const power = clamp(strength);
  const progress = Number.isFinite(phase) ? clamp(phase) : 0;
  // Extinction sheds density across the broad volume. It must not contract
  // the ignition ellipse back onto the chest like a hard circular wipe.
  const connected = paintBodyField(
    progress >= NANITE_FIRE_PHASES.burstStart ? 1 : power,
    clock,
    progress,
  );
  const scatter = naniteFlameScatter(progress);
  context.save();
  try {
    if (scale !== 1) context.scale(scale, scale);
    if (connected) {
      context.globalCompositeOperation = layer === "back" ? "lighter" : "source-over";
      // Quiet ignition is a small but visible lick, not an invisible delay.
      // Its spatial front remains small; only its local radiance is lifted.
      const radiance =
        progress > 0 && progress < NANITE_FIRE_PHASES.burstStart ? Math.sqrt(power) : power;
      // Owner, 2026-10-20: less fog, so the tongues read as fire.
      context.globalAlpha = radiance * (layer === "back" ? 0.4 : 0.08);
      if (layer === "front") {
        // Only a tenuous spill crosses the whole body. Real near-volume
        // tongues below supply the occluding front arcs with their own
        // irregular alpha: there is no hard front/back polygon cut.
        context.drawImage(
          bodyField,
          (-W * BODY_X) / BODY_W,
          (-H * BODY_Y) / BODY_H,
          (W * FIELD_W) / BODY_W,
          (H * FIELD_H) / BODY_H,
        );
      } else {
        context.drawImage(
          bodyField,
          (-W * BODY_X) / BODY_W,
          (-H * BODY_Y) / BODY_H,
          (W * FIELD_W) / BODY_W,
          (H * FIELD_H) / BODY_H,
        );
      }
    }
    // Authored volume follows the same revolving ribbons, not separate
    // candles assigned to the head, arms or legs. Its lean follows the
    // curve's tangent as that stream wraps round to the far side.
    const count = coarse ? 14 : 18;
    context.globalCompositeOperation = "lighter";
    for (let i = 0; i < count; i += 1) {
      const k = i * 8;
      const strand = i % VORTEX_STRANDS;
      const along = Math.floor(i / VORTEX_STRANDS);
      const step = Math.round((along * VORTEX_STEPS) / Math.ceil(count / VORTEX_STRANDS - 1));
      const at = (strand * (VORTEX_STEPS + 1) + step) * VORTEX_STRIDE;
      if (connected && VORTEX[at + 5] * (layer === "back" ? -1 : 1) < -0.1) continue;
      const v = connected ? (VORTEX[at + 1] - BODY_Y) / BODY_H : SOURCES[i * 4 + 1];
      const local = smooth(clamp((power - Math.abs(v - 0.34) * 0.23) / 0.77));
      const x = connected ? ((VORTEX[at] - BODY_X) * W) / BODY_W : SOURCES[i * 4] * W;
      const y = connected ? ((VORTEX[at + 1] - BODY_Y) * H) / BODY_H : v * H;
      const lean = connected ? Math.atan2(-VORTEX[at + 2], VORTEX[at + 3]) + Math.PI / 2 : 0;
      tongue(
        context,
        x,
        y,
        (75 + SEED[k + 1] * 65) * unit,
        (125 + SEED[k + 2] * 100) * unit * local,
        clock * 16 + SEED[k + 3] * 32,
        local * (connected ? 0.98 : 0.92) * (connected ? VORTEX[at + 6] : 1),
        lean,
      );
    }
    if (layer !== "back" && scatter > 0 && scatter < 1) {
      const fade = Math.sin(scatter * Math.PI);
      context.fillStyle = "rgb(166 255 126)";
      for (let i = 0; i < 40; i += 1) {
        const k = i * 8;
        const root = i * 4;
        const travel = (55 + SEED[k] * 100) * unit * scatter;
        const x = SOURCES[root] * W + SOURCES[root + 2] * travel;
        const y = SOURCES[root + 1] * H + SOURCES[root + 3] * travel - scatter * 35 * unit;
        context.globalAlpha = power * fade * (0.45 + SEED[k + 1] * 0.5);
        // Hot droplets stretch with their impulse, then shrink into chips.
        context.fillRect(x, y, unit * (1.2 + fade * 2), unit * (1 + fade * 4));
        if (i % (coarse ? 7 : 4) === 0) {
          tongue(
            context,
            x,
            y,
            unit * (35 + 32 * SEED[k + 2]),
            unit * (65 + 100 * SEED[k + 3]) * fade,
            clock * 16 + SEED[k + 4] * 32,
            power * fade * 0.78,
            SOURCES[root + 2] * (0.6 + 0.35 * scatter),
          );
        }
      }
    }
  } finally {
    context.restore();
  }
}

// The fire's heat (owner, 2026-10-21: 炎を改善): the volume above reads as
// smoke without a hot core, so bright tongues rise from a burning bed that
// hugs the body's outline, cooling from a near-white green core through
// green to forest green, with sparks. Additive, a pure function of the
// clock (no particles kept between frames), sprites built once.
const HEAT_TONES = [
  [226, 255, 208],
  [120, 236, 110],
  [44, 170, 52],
];
let heatSprites = null;
const heatSpritesFor = () => {
  if (heatSprites) return heatSprites;
  const doc = globalThis.document;
  if (!doc?.createElement) return null;
  heatSprites = HEAT_TONES.map(([r, g, b]) => {
    const canvas = doc.createElement("canvas");
    canvas.width = canvas.height = 64;
    const c = canvas.getContext("2d");
    if (c?.createRadialGradient) {
      const glow = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      glow.addColorStop(0, `rgb(${r} ${g} ${b} / 1)`);
      glow.addColorStop(0.3, `rgb(${r} ${g} ${b} / 0.6)`);
      glow.addColorStop(1, `rgb(${r} ${g} ${b} / 0)`);
      c.fillStyle = glow;
      c.fillRect(0, 0, 64, 64);
    }
    return canvas;
  });
  return heatSprites;
};
const heatHash = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
// The body's half-width at a height (fractions of the figure).
const HEAT_PROFILE = [
  [0.06, 0.07],
  [0.18, 0.08],
  [0.24, 0.38],
  [0.4, 0.34],
  [0.5, 0.23],
  [0.62, 0.25],
  [0.8, 0.23],
  [0.97, 0.27],
];
const heatHalfWidth = (v) => {
  for (let k = 1; k < HEAT_PROFILE.length; k += 1) {
    const [y1, w1] = HEAT_PROFILE[k];
    if (v <= y1) {
      const [y0, w0] = HEAT_PROFILE[k - 1];
      return w0 + ((w1 - w0) * (v - y0)) / (y1 - y0);
    }
  }
  return HEAT_PROFILE[HEAT_PROFILE.length - 1][1];
};
const HEAT_TONGUES = 220;
const HEAT_SPARKS = 40;

export function drawFlameHeat(context, size, strength, clock, scale = 1) {
  if (!(strength > 0) || !Number.isFinite(clock) || !size) return;
  const sprites = heatSpritesFor();
  if (!sprites) return;
  const W = size.width;
  const H = size.height;
  context.save();
  if (scale !== 1) context.scale(scale, scale);
  context.globalCompositeOperation = "lighter";
  for (let i = 0; i < HEAT_TONGUES; i += 1) {
    if (heatHash(i + 0.5) > strength * 1.1) continue;
    const age = (clock * (0.6 + 0.5 * heatHash(i + 1.3)) + heatHash(i + 2.7)) % 1;
    const v = 0.05 + 0.93 * heatHash(i + 3.9);
    const side = heatHash(i + 4.7) < 0.5 ? -1 : 1;
    const floor = heatHash(i + 5.3) < 0.18;
    const bx = floor
      ? W * (0.5 + (heatHash(i + 6.1) - 0.5) * 0.7)
      : W * (0.5 + side * (heatHalfWidth(v) + 0.005 + 0.025 * heatHash(i + 6.9)));
    const by = floor ? H * 0.985 : H * v;
    const lift = (70 + 90 * heatHash(i + 7.7)) * age;
    const sway = Math.sin(clock * 3.1 + i * 1.3 + age * 6) * 6 * age;
    const s = (26 + 30 * heatHash(i + 8.3)) * (1 - age * 0.55);
    const tone = age < 0.22 ? 0 : age < 0.55 ? 1 : 2;
    context.globalAlpha = Math.min(1, Math.sin(Math.PI * Math.min(1, age * 1.2)) * strength * (tone ? 0.8 : 1));
    context.drawImage(sprites[tone], bx + sway - s / 2, by - lift - s * 0.7, s, s * 1.4);
  }
  context.fillStyle = "rgb(200 255 180)";
  for (let i = 0; i < HEAT_SPARKS; i += 1) {
    if (heatHash(i + 40.5) > strength) continue;
    const age = (clock * (0.4 + 0.3 * heatHash(i + 41.1)) + heatHash(i + 42.7)) % 1;
    const v = 0.08 + 0.9 * heatHash(i + 43.3);
    const side = heatHash(i + 44.9) < 0.5 ? -1 : 1;
    const x = W * (0.5 + side * (heatHalfWidth(v) + 0.02)) + Math.sin(clock * 2 + i) * 10 * age;
    const y = H * v - 110 * age;
    const d = 1.2 + 1.6 * (1 - age);
    context.globalAlpha = (1 - age) * 0.85 * strength;
    context.fillRect(x - d / 2, y - d / 2, d, d);
  }
  context.restore();
}
