// A connected combustion volume, clipped to the real undersuit. The same
// field feeds both nanite engines: a quiet ignition, one explosive front,
// then material shed from that surface. The Blender volume adds turbulent
// detail inside the field, rather than twenty unrelated miniature fires.
import { naniteFlameScatter, sampleFlameBirth } from "./rexonance-ignition.js";
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

// Three small surfaces (~1.8 MiB), prepared once and retained across calls.
// A source image is already decoded by the suit warm-up: no extra request.
let bodySource = null;
let bodyMask = null;
let bodyField = null;
let bodyFlow = null;
let bodyContext = null;
let fieldClock = -Infinity;
let fieldPower = -1;
const FIELD_W = 288;
const FIELD_H = 528;
// Room for a broad, rolling plume outside the figure (not a human cutout).
const BODY_X = 48;
const BODY_Y = 28;
const BODY_W = FIELD_W - BODY_X * 2;
const BODY_H = FIELD_H - BODY_Y * 2;

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
    // Physical silhouette, softly dilated around limbs: no rectangular base,
    // centre root in the crotch, detached cheek orb or crown chimney.
    m.filter = "blur(4px)";
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * TAU;
      m.drawImage(source, BODY_X + Math.cos(a) * 3, BODY_Y + Math.sin(a) * 3, BODY_W, BODY_H);
    }
    m.filter = "none";
    m.drawImage(source, BODY_X, BODY_Y, BODY_W, BODY_H);
    // A continuous firestorm around the body. These loose, asymmetric
    // folds deliberately do not copy the head, arms or legs. The volume
    // can roll into the air between/around them instead of wearing a suit
    // made of green light. No horizontal lower edge is authored here.
    m.filter = "blur(5px)";
    m.fillStyle = "rgb(255 255 255 / 0.9)";
    m.beginPath();
    m.moveTo(FIELD_W * 0.18, FIELD_H * 0.96);
    m.bezierCurveTo(
      FIELD_W * 0.02,
      FIELD_H * 0.85,
      FIELD_W * 0.13,
      FIELD_H * 0.77,
      FIELD_W * 0.04,
      FIELD_H * 0.64,
    );
    m.bezierCurveTo(
      FIELD_W * 0.16,
      FIELD_H * 0.72,
      FIELD_W * 0.13,
      FIELD_H * 0.47,
      FIELD_W * 0.04,
      FIELD_H * 0.42,
    );
    m.bezierCurveTo(
      FIELD_W * 0.23,
      FIELD_H * 0.52,
      FIELD_W * 0.18,
      FIELD_H * 0.23,
      FIELD_W * 0.33,
      FIELD_H * 0.12,
    );
    m.bezierCurveTo(
      FIELD_W * 0.25,
      FIELD_H * 0.3,
      FIELD_W * 0.43,
      FIELD_H * 0.27,
      FIELD_W * 0.49,
      FIELD_H * 0.02,
    );
    m.bezierCurveTo(
      FIELD_W * 0.62,
      FIELD_H * 0.19,
      FIELD_W * 0.5,
      FIELD_H * 0.23,
      FIELD_W * 0.68,
      FIELD_H * 0.13,
    );
    m.bezierCurveTo(
      FIELD_W * 0.64,
      FIELD_H * 0.32,
      FIELD_W * 0.9,
      FIELD_H * 0.28,
      FIELD_W * 0.86,
      FIELD_H * 0.44,
    );
    m.bezierCurveTo(
      FIELD_W * 0.8,
      FIELD_H * 0.52,
      FIELD_W * 0.94,
      FIELD_H * 0.49,
      FIELD_W * 0.96,
      FIELD_H * 0.7,
    );
    m.bezierCurveTo(
      FIELD_W * 0.85,
      FIELD_H * 0.63,
      FIELD_W * 0.96,
      FIELD_H * 0.87,
      FIELD_W * 0.78,
      FIELD_H * 0.97,
    );
    m.bezierCurveTo(
      FIELD_W * 0.64,
      FIELD_H * 1.01,
      FIELD_W * 0.57,
      FIELD_H * 0.95,
      FIELD_W * 0.51,
      FIELD_H * 0.9,
    );
    m.bezierCurveTo(
      FIELD_W * 0.47,
      FIELD_H * 0.97,
      FIELD_W * 0.32,
      FIELD_H * 1.01,
      FIELD_W * 0.18,
      FIELD_H * 0.96,
    );
    m.closePath();
    m.fill();
    m.filter = "none";
    const pixels = f.createImageData(FIELD_W, FIELD_H);
    // A seamless advected density, made only during preparation. It keeps
    // adjacent limbs visibly joined even between the Blender's hot curls.
    for (let y = 0; y < FIELD_H; y += 1) {
      const v = (y / FIELD_H) * TAU;
      for (let x = 0; x < FIELD_W; x += 1) {
        const u = (x / FIELD_W) * TAU;
        const warp = u + Math.sin(v * 3 + u * 2) * 0.8;
        const noise =
          0.5 +
          Math.sin(warp * 7 - v * 4) * 0.2 +
          Math.sin(u * 17 + Math.sin(v * 5) * 2 - v * 11) * 0.16 +
          Math.sin(u * 31 + v * 19) * 0.1;
        const hot = Math.pow(clamp(noise), 2);
        const k = (y * FIELD_W + x) * 4;
        pixels.data[k] = 8 + hot * 166;
        pixels.data[k + 1] = 64 + hot * 188;
        pixels.data[k + 2] = 22 + hot * 80;
        pixels.data[k + 3] = 104 + hot * 135;
      }
    }
    f.putImageData(pixels, 0, 0);
    bodySource = source;
    bodyMask = mask;
    bodyField = field;
    bodyFlow = flow;
    bodyContext = c;
    fieldClock = -Infinity;
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

// One textured field is reused by the back and front passes of a frame.
// The body alpha is applied after advection, so texture may flow without
// translating or stretching a cheek, foot or a separate flame's root.
function paintBodyField(power, clock) {
  if (!bodyContext || !bodyFlow || !bodyMask || !bodyField) return false;
  if (fieldClock === clock && fieldPower === power) return true;
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
    const offset = (((clock * 69) % H) + H) % H;
    c.drawImage(bodyFlow, 0, offset - H, W, H);
    c.drawImage(bodyFlow, 0, offset, W, H);
    // Overlapping sheets are texture within the one connected field. The
    // participating-volume detail is still the real Cycles-rendered asset.
    c.globalCompositeOperation = "lighter";
    for (let i = 0; i < 8; i += 1) {
      const k = i * 8;
      const column = i % 2;
      const row = i >> 1;
      tongue(
        c,
        W * (0.23 + column * 0.52) + Math.sin(clock * 1.7 + row * 1.8) * 8,
        H * (0.32 + row * 0.255),
        W * 0.84,
        H * (0.43 + Math.sin(clock * 2.1 + i) * 0.025),
        clock * 16 + SEED[k + 2] * 32,
        0.82,
        Math.sin(clock * 1.9 + row) * 0.09,
      );
    }
  } finally {
    c.restore();
  }
  c.globalCompositeOperation = "destination-in";
  c.globalAlpha = 1;
  // A continuous soft boundary sways from the feet while the internal
  // volume curls independently. Unlike strip displacement this has no
  // horizontal seams/notches, and costs only one mask draw per frame.
  c.save();
  c.translate(FIELD_W * 0.5, FIELD_H * 0.9);
  c.rotate(Math.sin(clock * 1.7) * 0.018 * power);
  c.scale(1 + Math.sin(clock * 2.1) * 0.018 * power, 1);
  c.drawImage(bodyMask, -FIELD_W * 0.5, -FIELD_H * 0.9);
  c.restore();
  c.globalCompositeOperation = "source-over";
  fieldClock = clock;
  fieldPower = power;
  return true;
}

/** Back/front sample the same connected body volume. Phase is the shared
 * ignition clock, not wall-clock history; it drives one scatter impulse. */
export function drawBodyFlame(context, size, strength, clock, scale = 1, layer = "all", phase = 0) {
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
  // Extinction sheds density across the broad volume. It must not contract
  // the ignition ellipse back onto the chest like a hard circular wipe.
  const connected = paintBodyField(phase > 0.175 ? 1 : power, clock);
  const scatter = naniteFlameScatter(phase);
  context.save();
  try {
    if (scale !== 1) context.scale(scale, scale);
    if (connected) {
      context.globalCompositeOperation = layer === "back" ? "lighter" : "source-over";
      // Quiet ignition is a small but visible lick, not an invisible delay.
      // Its spatial front remains small; only its local radiance is lifted.
      const radiance = phase > 0 && phase < 0.175 ? Math.sqrt(power) : power;
      context.globalAlpha = radiance * (layer === "back" ? 0.5 : 0.98);
      context.drawImage(
        bodyField,
        (-W * BODY_X) / BODY_W,
        (-H * BODY_Y) / BODY_H,
        (W * FIELD_W) / BODY_W,
        (H * FIELD_H) / BODY_H,
      );
    }
    // Escaping tongues are edge detail, never the source of body coverage.
    // Broad shared gusts couple neighbouring strands instead of separate
    // miniature candles. The face stays on the same flow as the shoulders.
    const count = coarse ? 8 : 10;
    context.globalCompositeOperation = "lighter";
    for (let i = 0; i < count; i += 1) {
      const j = Math.floor((i * 48) / count);
      const k = i * 8;
      const root = j * 4;
      const v = SOURCES[root + 1];
      const local = smooth(clamp((power - Math.abs(v - 0.34) * 0.23) / 0.77));
      const gust = Math.sin(clock * 1.8 + v * 9);
      const curl = Math.sin(clock * 2.7 - v * 13 + SEED[k] * TAU);
      const y = v * H;
      tongue(
        context,
        SOURCES[root] * W + gust * 3 * unit,
        y,
        (45 + SEED[k + 1] * 40) * unit,
        Math.min((90 + SEED[k + 2] * 90) * unit * local * (1 + curl * 0.15), y - H * 0.02),
        clock * 16 + SEED[k + 3] * 32,
        local * (connected ? 0.56 : 0.92),
        SOURCES[root + 2] * 0.07 + gust * 0.14,
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
