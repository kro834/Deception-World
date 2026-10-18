// The nanites' source (owner): forest-green fire, kindling and dying down
// slowly from head to feet. Both suit-up engines use this renderer. Its
// tongues are a Blender-rendered, turbulent participating volume, not a
// cloud of overlapping radial-gradient discs. Their roots follow the body
// and floor; its near layer burns across the entire unfinished body before
// the existing slow envelope lets the final armour emerge unchanged.
export const NANITE_FLAME_ATLAS = Object.freeze({
  src: "/rexonance-flame-20261019/flame.webp",
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
const PROFILE = [
  [0.04, 0.065],
  [0.16, 0.09],
  [0.24, 0.39],
  [0.4, 0.35],
  [0.5, 0.24],
  [0.62, 0.26],
  [0.8, 0.24],
  [0.98, 0.28],
];
const halfWidth = (v) => {
  for (let k = 1; k < PROFILE.length; k += 1) {
    const [y1, w1] = PROFILE[k];
    if (v <= y1) {
      const [y0, w0] = PROFILE[k - 1];
      return w0 + (w1 - w0) * clamp((v - y0) / (y1 - y0));
    }
  }
  return PROFILE[PROFILE.length - 1][1];
};
const ROOTS = new Float32Array(40 * 3);
for (let i = 0; i < 40; i += 1) {
  const v = 0.075 + ((i >> 1) / 19) * 0.9;
  const side = i % 2 ? 1 : -1;
  ROOTS[i * 3] = 0.5 + side * (halfWidth(v) + 0.006);
  ROOTS[i * 3 + 1] = v;
  ROOTS[i * 3 + 2] = side;
}
// Near-surface roots follow the actual body, not just its silhouette.
// x/y are figure fractions; width is figure px at H=1000; height is H's
// fraction. The first sixteen cover every region even on a coarse pointer.
// Extra fine-pointer strands fill the waist/upper-thigh mixing layer.
const FRONT = new Float32Array([
  // Head, chest, abdomen and hips overlap along the body centreline.
  0.5, 0.18, 145, 0.19, 0, 0.5, 0.35, 245, 0.25, 0.015, 0.5, 0.52, 225, 0.25, -0.02, 0.5, 0.68, 215,
  0.26, 0.015,
  // Arms and forearms; volume roots sit below their visible body patches.
  0.21, 0.46, 135, 0.26, -0.12, 0.79, 0.46, 135, 0.26, 0.12, 0.19, 0.64, 130, 0.25, -0.1, 0.81,
  0.64, 130, 0.25, 0.1,
  // The shins/feet splay wider than the thighs in the supplied undersuit.
  0.36, 0.79, 165, 0.32, -0.04, 0.64, 0.79, 165, 0.32, 0.04, 0.28, 0.94, 150, 0.25, -0.035, 0.72,
  0.94, 150, 0.25, 0.035, 0.255, 0.986, 155, 0.16, -0.045, 0.745, 0.986, 155, 0.16, 0.045, 0.39,
  0.42, 135, 0.23, -0.035, 0.61, 0.42, 135, 0.23, 0.035, 0.4, 0.58, 125, 0.23, -0.04, 0.6, 0.58,
  125, 0.23, 0.04, 0.4, 0.71, 120, 0.22, -0.025, 0.6, 0.71, 120, 0.22, 0.025,
]);

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
  colour.addColorStop(0, "rgb(156 243 112 / 0.8)");
  colour.addColorStop(0.2, "rgb(58 180 67 / 0.66)");
  colour.addColorStop(0.6, "rgb(22 101 49 / 0.38)");
  colour.addColorStop(1, "rgb(9 47 27 / 0)");
  c.fillStyle = colour;
  c.beginPath();
  c.moveTo(28, 192);
  c.bezierCurveTo(5, 147, 31, 121, 37, 104);
  c.bezierCurveTo(45, 76, 18, 53, 63, 5);
  c.bezierCurveTo(45, 58, 84, 62, 68, 109);
  c.bezierCurveTo(58, 139, 90, 154, 70, 192);
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
    // The reactor remains readable: narrow fire springs from its rim,
    // rather than a white-green bloom covering the central mechanism.
    for (let i = 0; i < 8; i += 1) {
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
        power * (0.66 + SEED[k + 6] * 0.26),
        Math.cos(angle) * 0.12,
      );
    }
    if (heat) {
      context.globalCompositeOperation = "lighter";
      context.globalAlpha = power * 0.18;
      context.drawImage(heat, cx - 89, cy - 43, 178, 86);
    }
    context.fillStyle = "rgb(164 235 119)";
    context.globalCompositeOperation = "source-over";
    for (let i = 0; i < 14; i += 1) {
      const k = i * 8;
      const age = (((clock * (0.34 + SEED[k] * 0.23) + SEED[k + 1]) % 1) + 1) % 1;
      context.globalAlpha = power * Math.sin(age * Math.PI) * 0.55;
      context.fillRect(
        cx + (SEED[k + 2] - 0.5) * 95 + Math.sin(age * 6 + i) * age * 13,
        cy + 14 - age * (115 + SEED[k + 3] * 110),
        0.7 + SEED[k + 4],
        1.3 + SEED[k + 5],
      );
    }
  } finally {
    context.restore();
  }
}

/** `back` is behind the body's plates; `front` burns across the whole body
 * and adds embers. The default preserves the old API for isolated uses/tests. No new
 * particle can appear beyond the figure's head/feet clipping bounds. */
export function drawBodyFlame(context, size, strength, clock, scale = 1, layer = "all") {
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
  const W = size.width;
  const H = size.height;
  const unit = H / 1000;
  const power = smooth(clamp(strength));
  context.save();
  try {
    if (scale !== 1) context.scale(scale, scale);
    // The silhouette still occludes the back fire. Redistribute its budget
    // toward the near body surface instead of adding more atlas draws.
    context.globalCompositeOperation = "lighter";
    if (layer !== "front") {
      // Nine/thirteen pairs preserve head-to-feet coverage behind the body;
      // their released budget now covers sixteen/twenty near-surface roots.
      const rootPairs = coarse ? 9 : 13;
      for (let n = 0; n < rootPairs * 2; n += 1) {
        const i = Math.round(((n >> 1) * 19) / (rootPairs - 1)) * 2 + (n % 2);
        const k = i * 8;
        const side = ROOTS[i * 3 + 2];
        const wave = Math.sin(clock * (2.2 + SEED[k]) + i * 2.4);
        const height = (72 + SEED[k + 1] * 79) * unit * 1.3 * (0.45 + power * 0.55);
        const y = ROOTS[i * 3 + 1] * H;
        tongue(
          context,
          ROOTS[i * 3] * W + side * 4 * unit * wave,
          y,
          (25 + SEED[k + 2] * 22) * unit * 1.8,
          Math.min(height, Math.max(5, y - H * 0.012)),
          clock * 16 * (0.78 + SEED[k + 3] * 0.4) + SEED[k + 4] * 32,
          power * (0.72 + SEED[k + 5] * 0.28),
          side * (0.04 + SEED[k + 6] * 0.13),
        );
      }
      // Separate contact fire: low, spreading tongues, never hovering balls.
      for (let i = 0; i < 8; i += 1) {
        const k = (i + 40) * 8;
        tongue(
          context,
          W * (0.16 + (i / 7) * 0.68),
          H * 0.986,
          (43 + SEED[k] * 30) * unit * 1.3,
          (42 + SEED[k + 1] * 53) * unit * 1.2 * power,
          clock * 16 * (0.85 + SEED[k + 2] * 0.3) + SEED[k + 3] * 32,
          power * 0.85,
          (i - 3.5) * 0.055,
        );
      }
      if (heat) {
        context.globalCompositeOperation = "lighter";
        context.globalAlpha = power * 0.32;
        context.drawImage(heat, W * 0.1, H * 0.947, W * 0.8, H * 0.055);
        context.globalCompositeOperation = "source-over";
      }
    }
    if (layer !== "back") {
      context.globalCompositeOperation = "source-over";
      // Overlapping, upward-moving volume tongues cross head, sternum,
      // abdomen, both arms, thighs, shins and feet. Preserve the volume's
      // authored absorption as well as emission: screen blending on bright
      // silver/blue plates had reduced the fire to almost invisible lines.
      const nearRoots = coarse ? 16 : 20;
      for (let i = 0; i < nearRoots; i += 1) {
        const k = (i + 44) * 8;
        const root = i * 5;
        const y = FRONT[root + 1] * H;
        const lift = FRONT[root + 3] * H * (0.58 + 0.42 * power);
        const pulse = 0.94 + 0.06 * Math.sin(clock * (2.1 + SEED[k]) + i * 1.7);
        tongue(
          context,
          FRONT[root] * W + Math.sin(clock * 1.7 + i * 2.3) * 3 * unit * power,
          y,
          FRONT[root + 2] * unit * (0.7 + 0.3 * power),
          Math.min(lift * pulse, Math.max(5, y - H * 0.012)),
          clock * 16 * (0.8 + SEED[k + 2] * 0.3) + SEED[k + 3] * 32,
          power * (0.88 + SEED[k + 4] * 0.1),
          FRONT[root + 4] + Math.sin(clock * 2 + i) * 0.025,
        );
      }
      context.fillStyle = "rgb(146 224 106)";
      for (let i = 0; i < 16; i += 1) {
        const k = i * 8;
        const age = (((clock * (0.28 + SEED[k] * 0.3) + SEED[k + 1]) % 1) + 1) % 1;
        const root = (i * 7 + 3) % 40;
        const y = ROOTS[root * 3 + 1] * H - age * 95 * unit;
        if (y < H * 0.02) continue;
        context.globalAlpha = power * (1 - age) * 0.5;
        context.fillRect(
          ROOTS[root * 3] * W + Math.sin(age * 7 + i) * age * 14 * unit,
          y,
          unit * (0.7 + SEED[k + 2]),
          unit * (1.2 + SEED[k + 3]),
        );
      }
    }
  } finally {
    context.restore();
  }
}
