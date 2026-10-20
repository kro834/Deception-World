// Connected combustion spreads from the feet through branching body paths.
// Both nanite engines share its irregular advancing fronts and extinction;
// the Blender volume supplies turbulent detail inside those burning paths.
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
// Room for branching plumes outside the figure (not a human cutout).
// Extra transparent padding protects the rising volume's irregular tips;
// it does not stretch the flame or alter the real body's registration.
const BODY_X = 48 + FIELD_PAD;
const BODY_Y = 28 + FIELD_PAD;
const BODY_W = 192;
const BODY_H = 472;
const VORTEX_STRANDS = 6;
const VORTEX_STEPS = 24;
const VORTEX_STRIDE = 7;
// Cubic paths in registered body coordinates: two foot-to-crown trunks,
// two waist-to-arm branches, then two shoulder/crown forks. Arrival times
// travel along connected paths rather than expanding a chest-centred disc.
// x0/y0, x1/y1, x2/y2, x3/y3, birth, travel, half-width, depth.
const BURN_PATHS = new Float32Array([
  // Left/right foot-to-crown trunks.
  0.25, 0.99, 0.29, 0.7, 0.55, 0.48, 0.44, -0.04, 0, 0.94, 27, -0.65, 0.74, 1, 0.66, 0.64, 0.43,
  0.4, 0.55, -0.035, 0.045, 0.9, 29, 0.65,
  // Left/right waist-to-arm branches.
  0.43, 0.53, 0.35, 0.45, 0.09, 0.6, 0.09, 0.26, 0.43, 0.4, 24, 0.4, 0.56, 0.51, 0.67, 0.44, 0.95,
  0.58, 0.91, 0.22, 0.49, 0.39, 25, -0.4,
  // Left/right shoulder-to-crown forks.
  0.45, 0.3, 0.32, 0.23, 0.3, 0.07, 0.35, -0.09, 0.72, 0.27, 21, -0.5, 0.55, 0.28, 0.72, 0.23, 0.7,
  0.05, 0.67, -0.06, 0.75, 0.25, 22, 0.5,
]);
// Reused x/y, transverse normal, thickness, depth and surviving density.
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
    if (!m?.clearRect || !c?.drawImage || !f?.createImageData) return false;
    // Keep the real registration as the low-density interior. The visible
    // outer shape is rebuilt from the advancing burn paths each frame.
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
  colour.addColorStop(0, "rgb(172 252 128 / 0)");
  colour.addColorStop(0.11, "rgb(172 252 128 / 0.84)");
  colour.addColorStop(0.24, "rgb(66 196 76 / 0.72)");
  colour.addColorStop(0.58, "rgb(20 108 48 / 0.44)");
  colour.addColorStop(0.86, "rgb(11 62 32 / 0.18)");
  colour.addColorStop(1, "rgb(7 38 22 / 0)");
  c.fillStyle = colour;
  c.beginPath();
  c.moveTo(26, 188);
  c.bezierCurveTo(4, 146, 29, 119, 36, 101);
  c.bezierCurveTo(44, 73, 17, 50, 62, 4);
  c.bezierCurveTo(46, 56, 86, 61, 69, 108);
  c.bezierCurveTo(59, 138, 91, 154, 71, 184);
  c.bezierCurveTo(58, 176, 45, 189, 26, 188);
  c.closePath();
  c.fill();
  const coreColour = c.createLinearGradient(0, 188, 0, 28);
  coreColour.addColorStop(0, "rgb(212 255 168 / 0)");
  coreColour.addColorStop(0.16, "rgb(212 255 168 / 0.68)");
  coreColour.addColorStop(0.45, "rgb(116 236 102 / 0.42)");
  coreColour.addColorStop(1, "rgb(34 142 58 / 0)");
  c.fillStyle = coreColour;
  c.beginPath();
  c.moveTo(38, 184);
  c.bezierCurveTo(26, 152, 41, 126, 46, 98);
  c.bezierCurveTo(50, 74, 42, 54, 58, 28);
  c.bezierCurveTo(54, 62, 68, 82, 60, 118);
  c.bezierCurveTo(55, 144, 67, 162, 58, 182);
  c.bezierCurveTo(51, 178, 44, 185, 38, 184);
  c.closePath();
  c.fill();
  const glow = document.createElement("canvas");
  glow.width = glow.height = 64;
  const g = glow.getContext("2d");
  if (g?.createRadialGradient) {
    const gradient = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgb(164 252 124 / 0.62)");
    gradient.addColorStop(0.24, "rgb(56 188 72 / 0.36)");
    gradient.addColorStop(0.58, "rgb(20 108 46 / 0.16)");
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
      const side = i ? 1 : -1;
      const pulse = 0.86 + 0.18 * Math.sin(clock * (3.4 + SEED[k + 1]) + i * 2.1);
      tongue(
        context,
        cx + side * (32 + 18 * power) + Math.sin(clock * 2.7 + i * 3.4) * 5,
        cy + 20 + Math.sin(clock * 3.1 + i * 2.3) * 4,
        (26 + SEED[k + 2] * 26) * 1.68,
        (68 + SEED[k + 3] * 75) * 1.28 * (0.46 + 0.54 * power) * pulse,
        clock * 16 * (0.82 + SEED[k + 4] * 0.35) + SEED[k + 5] * 32,
        power * (0.31 + SEED[k + 6] * 0.13),
        side * 0.12 + Math.sin(clock * 4.2 + i) * 0.05,
      );
    }
    if (heat) {
      context.globalCompositeOperation = "lighter";
      context.globalAlpha = power * (0.2 + 0.04 * Math.sin(clock * 5.2));
      context.drawImage(heat, cx - 94, cy - 46, 188, 92);
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
    const spatialPhase = x * 0.17 + y * 0.11;
    tongue(
      context,
      x,
      y,
      23 + power * 30,
      37 + power * 75,
      clock * 17 + spatialPhase,
      power,
      Math.sin(clock * 5.8 + x * 0.07 + y * 0.03) * 0.15 + ((x - 285.5) / 571) * 0.14,
    );
  } finally {
    context.restore();
  }
}

// Heat advances along rooted branches. Time only bends/lifts those paths:
// it cannot revolve them around the figure or form a circular fire shell.
function poseVortex(power, clock, phase) {
  const burst = smooth(
    clamp(
      (phase - NANITE_FIRE_PHASES.burstStart) /
        (NANITE_FIRE_PHASES.burstEnd - NANITE_FIRE_PHASES.burstStart),
    ),
  );
  const ignition = phase > 0 ? clamp(phase / 0.155) : power;
  for (let strand = 0; strand < VORTEX_STRANDS; strand += 1) {
    const base = strand * (VORTEX_STEPS + 1) * VORTEX_STRIDE;
    const path = strand * 12;
    for (let i = 0; i <= VORTEX_STEPS; i += 1) {
      const t = i / VORTEX_STEPS;
      const u = 1 - t;
      const at = base + i * VORTEX_STRIDE;
      const x =
        u * u * u * BURN_PATHS[path] +
        3 * u * u * t * BURN_PATHS[path + 2] +
        3 * u * t * t * BURN_PATHS[path + 4] +
        t * t * t * BURN_PATHS[path + 6];
      const y =
        u * u * u * BURN_PATHS[path + 1] +
        3 * u * u * t * BURN_PATHS[path + 3] +
        3 * u * t * t * BURN_PATHS[path + 5] +
        t * t * t * BURN_PATHS[path + 7];
      const flutter =
        Math.sin(t * 10.3 - clock * 4.4 + strand * 2.09) +
        Math.sin(t * 23.7 - clock * 2.7 + strand * 1.3) * 0.37;
      const arrival = BURN_PATHS[path + 8] + t * BURN_PATHS[path + 9];
      const burning = smooth(clamp((ignition - arrival + 0.075) / 0.15));
      const split = smooth(clamp((Math.sin(t * 13.4 - clock * 2.6 + strand * 1.7) + 0.55) * 1.8));
      const tear = (1 - burst * split * 0.94) * burning;
      const billow = 0.94 + 0.17 * Math.sin(t * 17.3 - clock * 4.8 + strand * 1.9);
      // Extinction stretches the existing branches upward; horizontal
      // displacement is local wind, never an expanding radial impulse.
      const lift = burst * VORTEX_H * (0.028 + 0.05 * (1 - y));
      VORTEX[at] = BODY_X + BODY_W * x + flutter * (3 + t * 6) + burst * flutter * 4;
      VORTEX[at + 1] = BODY_Y + BODY_H * y - lift;
      VORTEX[at + 4] =
        BURN_PATHS[path + 10] *
        (0.38 + 0.62 * Math.sin(Math.PI * (0.15 + t * 0.85))) *
        Math.sqrt(Math.max(0, 1 - t)) *
        billow *
        (0.65 + power * 0.35) *
        (1 - burst * 0.65) *
        tear;
      VORTEX[at + 5] = BURN_PATHS[path + 11];
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

// Overlapping curved cells form tapered branching tongues. They remain
// rooted while the advancing front widens each newly burning section.
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
      if (VORTEX[a + 6] + VORTEX[b + 6] < 0.02) continue;
      const wa = VORTEX[a + 4];
      const wb = VORTEX[b + 4];
      const ax = VORTEX[a] + VORTEX[a + 2] * wa;
      const ay = VORTEX[a + 1] + VORTEX[a + 3] * wa;
      const bx = VORTEX[b] + VORTEX[b + 2] * wb;
      const by = VORTEX[b + 1] + VORTEX[b + 3] * wb;
      const cx = VORTEX[b] - VORTEX[b + 2] * wb;
      const cy = VORTEX[b + 1] - VORTEX[b + 3] * wb;
      const dx = VORTEX[a] - VORTEX[a + 2] * wa;
      const dy = VORTEX[a + 1] - VORTEX[a + 3] * wa;
      const mx = (VORTEX[a + 2] + VORTEX[b + 2]) * 0.5;
      const my = (VORTEX[a + 3] + VORTEX[b + 3]) * 0.5;
      const tx = VORTEX[b] - VORTEX[a];
      const ty = VORTEX[b + 1] - VORTEX[a + 1];
      const swell = (wa + wb) * (0.14 + 0.08 * Math.sin(clock * 4.6 + i * 0.45 + strand * 2.1));
      const cap = 0.28 + burst * 0.18;
      context.moveTo(ax, ay);
      context.bezierCurveTo(
        ax + tx * 0.35 + mx * swell,
        ay + ty * 0.35 + my * swell,
        bx - tx * 0.35 + mx * swell,
        by - ty * 0.35 + my * swell,
        bx,
        by,
      );
      context.bezierCurveTo(bx + tx * cap, by + ty * cap, cx + tx * cap, cy + ty * cap, cx, cy);
      context.bezierCurveTo(
        cx - tx * 0.35 - mx * swell * 0.7,
        cy - ty * 0.35 - my * swell * 0.7,
        dx + tx * 0.35 - mx * swell * 0.7,
        dy + ty * 0.35 - my * swell * 0.7,
        dx,
        dy,
      );
      context.bezierCurveTo(dx - tx * cap, dy - ty * cap, ax - tx * cap, ay - ty * cap, ax, ay);
      context.closePath();
    }
    // Smaller pointed forks share the parent front and die with it. Each
    // bends upward from its root instead of curling around a circular lobe.
    for (let branch = 0; branch < 3; branch += 1) {
      const at = base + (5 + branch * 7) * VORTEX_STRIDE;
      if (side && VORTEX[at + 5] * side < 0) continue;
      const x = VORTEX[at];
      const y = VORTEX[at + 1];
      const margin = Math.min(x, FIELD_W - x, y, FIELD_H - y);
      const surviving = VORTEX[at + 6] * (1 - burst * 0.82);
      const root = Math.min(7, VORTEX[at + 4] * 0.24) * surviving;
      if (root < 0.12) continue;
      const radius =
        Math.min((11 + branch * 6) * (1 + burst * 0.6), Math.max(0, margin * 0.42)) * surviving;
      const lean = (strand % 2 ? 1 : -1) * (0.7 + 0.22 * Math.sin(clock * 3.1 + branch + strand));
      context.moveTo(x - root, y);
      context.bezierCurveTo(
        x - root + lean * radius * 0.35,
        y - radius * 0.55,
        x + lean * radius * 1.4,
        y - radius * 0.9,
        x + lean * radius,
        y - radius * 2,
      );
      context.bezierCurveTo(
        x + lean * radius * 0.7,
        y - radius,
        x + root + lean * radius * 0.25,
        y - radius * 0.3,
        x + root,
        y,
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
    // Interior heat appears only after the advancing paths reach the upper
    // body. Early ignition cannot illuminate the entire suit at once.
    const ignition = phase > 0 ? clamp(phase / 0.155) : power;
    m.globalAlpha = 0.12 * (1 - burst) * smooth(clamp((ignition - 0.7) / 0.3));
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
    // Arrival is already encoded in each branch's mask. No ellipse or
    // radial wipe can turn the ignition into a growing circular shell.
    const offset = (((-clock * 88) % H) + H) % H;
    c.drawImage(bodyFlow, 0, offset - H, W, H);
    c.drawImage(bodyFlow, 0, offset, W, H);
    // Overlapping sheets texture the branches with the shared Cycles asset.
    const volumes = coarse ? 18 : 24;
    const span = volumes / VORTEX_STRANDS - 1;
    for (let i = 0; i < volumes; i += 1) {
      const k = i * 8;
      const strand = i % VORTEX_STRANDS;
      const along = Math.floor(i / VORTEX_STRANDS);
      const step = Math.min(VORTEX_STEPS - 1, Math.round((along * (VORTEX_STEPS - 1)) / span));
      const at = (strand * (VORTEX_STEPS + 1) + step) * VORTEX_STRIDE;
      const rawAngle = Math.atan2(-VORTEX[at + 2], VORTEX[at + 3]) + Math.PI / 2;
      const angle = rawAngle * 0.64 + Math.sin(clock * 4.8 + i * 1.3) * 0.06;
      const tearing = VORTEX[at + 6];
      c.globalCompositeOperation = i % 3 === 2 ? "lighter" : "source-over";
      tongue(
        c,
        VORTEX[at],
        VORTEX[at + 1],
        VORTEX_W * (0.37 + SEED[k] * 0.21) * (0.45 + tearing * 0.55),
        VORTEX_H * (0.2 + SEED[k + 1] * 0.095) * (0.5 + tearing * 0.5),
        clock * 16 + SEED[k + 2] * 32,
        Math.min(1, 0.94 + VORTEX[at + 5] * 0.1) * tearing,
        angle,
      );
    }
    // Detail stays inside the connected burning branches and their tips.
    c.globalCompositeOperation = "destination-in";
    c.globalAlpha = 1;
    c.drawImage(bodyMask, 0, 0);
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
  // Only the first 132ms of material overlap the fading storm. Even an
  // isolated legacy caller cannot leave a green body stencil over armour.
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
  const unit = H / 1000;
  const power = clamp(strength);
  const progress = Number.isFinite(phase) ? clamp(phase) : 0;
  // Extinction sheds density along the same branches without contracting
  // the advancing front back onto the chest.
  const connected = paintBodyField(
    progress >= NANITE_FIRE_PHASES.burstStart ? 1 : power,
    clock,
    progress,
  );
  if (!connected)
    poseVortex(progress >= NANITE_FIRE_PHASES.burstStart ? 1 : power, clock, progress);
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
      // Brightness lives in the clipped volume, never floating overlays.
      context.globalAlpha = radiance * (layer === "back" ? 0.4 : 0.72);
      if (layer === "front") {
        // Retain the volume's irregular alpha, including its gaps. This
        // replaces the former separate foreground candle silhouettes.
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
    // Without a prepared field, sample the same advancing branches. This
    // keeps load failure and the normal path on the same ignition topology.
    const count = connected ? 0 : coarse ? 14 : 18;
    const span = Math.ceil(count / VORTEX_STRANDS - 1);
    context.globalCompositeOperation = "lighter";
    for (let i = 0; i < count; i += 1) {
      const k = i * 8;
      const strand = i % VORTEX_STRANDS;
      const along = Math.floor(i / VORTEX_STRANDS);
      const step = Math.min(VORTEX_STEPS - 1, Math.round((along * (VORTEX_STEPS - 1)) / span));
      const at = (strand * (VORTEX_STEPS + 1) + step) * VORTEX_STRIDE;
      if (VORTEX[at + 5] * (layer === "back" ? -1 : 1) < -0.1) continue;
      const radiance =
        progress > 0 && progress < NANITE_FIRE_PHASES.burstStart ? Math.sqrt(power) : power;
      const local = radiance * VORTEX[at + 6];
      const x = ((VORTEX[at] - BODY_X) * W) / BODY_W;
      const y = ((VORTEX[at + 1] - BODY_Y) * H) / BODY_H;
      const rawLean = Math.atan2(-VORTEX[at + 2], VORTEX[at + 3]) + Math.PI / 2;
      const lean = rawLean * 0.64 + Math.sin(clock * 5.2 + i * 1.4) * 0.07;
      tongue(
        context,
        x,
        y,
        (78 + SEED[k + 1] * 68) * unit,
        (130 + SEED[k + 2] * 104) * unit * (0.4 + local * 0.6),
        clock * 16 + SEED[k + 3] * 32,
        local * 0.92,
        lean,
      );
    }
    if (layer !== "back" && scatter > 0 && scatter < 1) {
      const fade = Math.sin(scatter * Math.PI);
      context.fillStyle = "rgb(176 255 134)";
      for (let i = 0; i < 40; i += 1) {
        const k = i * 8;
        const root = i * 4;
        const travel = (55 + SEED[k] * 100) * unit * scatter;
        const x = SOURCES[root] * W + SOURCES[root + 2] * travel;
        const y = SOURCES[root + 1] * H + SOURCES[root + 3] * travel - scatter * 35 * unit;
        context.globalAlpha = power * fade * (0.48 + SEED[k + 1] * 0.5);
        // Hot droplets stretch with their impulse, then shrink into chips.
        context.fillRect(x, y, unit * (1.2 + fade * 2.1), unit * (1 + fade * 4.2));
      }
    }
  } finally {
    context.restore();
  }
}
