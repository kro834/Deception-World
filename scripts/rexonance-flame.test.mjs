import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";
import sharp from "sharp";
import ts from "typescript";
import {
  NANITE_FIRE_FRAGMENTS,
  NANITE_FIRE_PHASES,
  fireFragmentPose,
  naniteFlameEnvelope,
} from "../src/lib/rexonance-ignition.js";
import {
  FIELD_BODY,
  FIELD_D,
  FIELD_H,
  FIELD_IN,
  FIELD_TEXELS_PER_WIDTH,
  FIELD_W,
  FIRE_RECT,
  buildFireField,
} from "../src/lib/rexonance-fire/fire-field.js";
import { buildNoiseTable } from "../src/lib/rexonance-fire/fire-noise.js";
import {
  POSE_FLASH,
  POSE_FLICKER,
  POSE_FLOW_A,
  POSE_RING_RADIUS,
  POSE_RING_STRENGTH,
  POSE_SLOTS,
  POSE_TIME,
  POSE_VIEW_X0,
  POSE_VIEW_X1,
  POSE_VIEW_Y0,
  POSE_VIEW_Y1,
  poseFire,
  poseView,
} from "../src/lib/rexonance-fire/fire-pose.js";
import { fireKernel, rasterFire } from "../src/lib/rexonance-fire/fire-raster.js";
import { RAMP_CLEAN, RAMP_SOOTY } from "../src/lib/rexonance-fire/fire-tuning.js";
import { REXONANCE_SUIT_UNDERSUIT } from "../src/lib/rexonance-suit.ts";

let serial = 0;
const fresh = () => import(`../src/lib/rexonance-flame.js?unit=${serial++}`);
const file = (path) => new URL(`../${path}`, import.meta.url);
const SIZE = { width: 571, height: 1040 };

// A recording 2D context. getImageData paints the last drawn source's
// silhouette (a function on the source) at the drawn rectangle.
function painter({ throwAt = 0 } = {}) {
  const operations = [];
  const states = [];
  let draws = 0;
  let last = null;
  const context = {
    globalAlpha: 0.73,
    globalCompositeOperation: "multiply",
    fillStyle: "#123456",
    save() {
      states.push([this.globalAlpha, this.globalCompositeOperation, this.fillStyle]);
    },
    restore() {
      [this.globalAlpha, this.globalCompositeOperation, this.fillStyle] = states.pop();
    },
    drawImage(image, ...args) {
      operations.push([
        "image",
        image.dataset?.rexonanceFire || image.__qaRole || "other",
        ...args,
        this.globalAlpha,
        this.globalCompositeOperation,
      ]);
      last = [image, ...args];
      draws += 1;
      if (throwAt && draws === throwAt) throw new Error("draw failure");
    },
    fillRect(...args) {
      operations.push(["rect", ...args, this.globalAlpha, this.fillStyle]);
    },
    scale(...args) {
      operations.push(["scale", ...args]);
    },
    clearRect() {},
    createRadialGradient() {
      return { addColorStop() {} };
    },
    createImageData(width, height) {
      return { data: new Uint8ClampedArray(width * height * 4), width, height };
    },
    putImageData(pixels) {
      operations.push(["pixels"]);
      this.__qaPixels = pixels.data;
    },
    getImageData(x, y, width, height) {
      const data = new Uint8ClampedArray(width * height * 4);
      if (last && typeof last[0].silhouette === "function")
        last[0].silhouette(data, width, height, last[1], last[2], last[3], last[4]);
      return { data, width, height };
    },
  };
  return { context, operations, states };
}

// A recording WebGL mock: enough of the API for the renderer, counting
// uploads and draws, able to lose its context.
function mockGL() {
  const calls = {
    texImage2D: 0,
    drawArrays: 0,
    drawElements: 0,
    bufferSubData: 0,
    deleted: 0,
    created: 0,
  };
  let lost = false;
  const gl = {
    calls,
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    ARRAY_BUFFER: 5,
    ELEMENT_ARRAY_BUFFER: 6,
    STATIC_DRAW: 7,
    DYNAMIC_DRAW: 8,
    TEXTURE_2D: 9,
    RGBA: 10,
    UNSIGNED_BYTE: 11,
    CLAMP_TO_EDGE: 12,
    REPEAT: 13,
    LINEAR: 14,
    TEXTURE0: 15,
    TEXTURE1: 16,
    TRIANGLE_STRIP: 17,
    TRIANGLES: 18,
    UNSIGNED_SHORT: 19,
    BLEND: 20,
    ONE: 21,
    SCISSOR_TEST: 22,
    DEPTH_TEST: 23,
    CULL_FACE: 24,
    COLOR_BUFFER_BIT: 25,
    FLOAT: 26,
    NONE: 0,
    lose() {
      lost = true;
    },
    isContextLost: () => lost,
    createShader: () => (calls.created++, {}),
    shaderSource() {},
    compileShader() {},
    getShaderParameter: () => true,
    deleteShader() {},
    createProgram: () => (calls.created++, {}),
    attachShader() {},
    linkProgram() {},
    getProgramParameter: () => true,
    deleteProgram: () => calls.deleted++,
    createBuffer: () => (calls.created++, {}),
    bindBuffer() {},
    bufferData() {},
    bufferSubData: () => calls.bufferSubData++,
    deleteBuffer: () => calls.deleted++,
    createTexture: () => (calls.created++, {}),
    bindTexture() {},
    texParameteri() {},
    texImage2D: () => calls.texImage2D++,
    deleteTexture: () => calls.deleted++,
    pixelStorei() {},
    getAttribLocation: () => 0,
    getUniformLocation: () => ({}),
    useProgram() {},
    enable() {},
    disable() {},
    viewport() {},
    scissor() {},
    activeTexture() {},
    uniform1i() {},
    uniform2f() {},
    uniform4f() {},
    enableVertexAttribArray() {},
    vertexAttribPointer() {},
    drawArrays: () => calls.drawArrays++,
    drawElements: () => calls.drawElements++,
    blendFunc() {},
    clearColor() {},
    clear() {},
    getExtension: () => ({
      loseContext() {
        lost = true;
      },
    }),
  };
  return gl;
}

function fixture({ gl = false, coarse = false } = {}) {
  const images = [];
  const canvases = [];
  const timers = [];
  let listeners = {};
  const document = {
    hidden: false,
    documentElement: { dataset: {} },
    createElement(tag) {
      if (tag === "canvas") {
        const p = painter();
        const canvas = {
          width: 0,
          height: 0,
          dataset: {},
          gl: null,
          events: {},
          addEventListener(name, handler) {
            this.events[name] = handler;
          },
          removeEventListener(name) {
            delete this.events[name];
          },
          getContext(type) {
            if (type === "2d") return p.context;
            if (!gl) return null;
            this.gl ??= mockGL();
            return this.gl;
          },
        };
        canvases.push({ canvas, ...p });
        return canvas;
      }
      assert.equal(tag, "img");
      const image = { naturalWidth: 1024, naturalHeight: 1024, decode: () => Promise.resolve() };
      images.push(image);
      return image;
    },
  };
  const environment = {
    document,
    navigator: { connection: {} },
    matchMedia: (query) => ({ matches: coarse && query.includes("coarse") }),
    performance: { now: () => clock },
    location: { pathname: "/rexonance-saga" },
    setTimeout(fn, ms) {
      timers.push({ fn, at: clock + ms });
      return timers.length;
    },
    clearTimeout(id) {
      if (timers[id - 1]) timers[id - 1].fn = null;
    },
    addEventListener(name, handler) {
      listeners[name] = handler;
    },
  };
  let clock = 1000;
  const advance = (ms) => {
    clock += ms;
    for (const timer of timers.splice(0))
      if (timer.fn && timer.at <= clock) timer.fn();
      else if (timer.fn) timers.push(timer);
  };
  return { images, canvases, environment, timers, listeners: () => listeners, advance };
}

// The real undersuit's alpha (the published picture the suit module names),
// registered into the field's body rectangle.
const undersuitAlpha = await (async () => {
  const { data, info } = await sharp(readFileSync(file(`public${REXONANCE_SUIT_UNDERSUIT}`)))
    .ensureAlpha()
    .resize(Math.round(FIELD_BODY.width), Math.round(FIELD_BODY.height))
    .raw()
    .toBuffer({ resolveWithObject: true });
  const alpha = new Uint8Array(FIELD_W * FIELD_H);
  for (let y = 0; y < info.height; y += 1)
    for (let x = 0; x < info.width; x += 1) {
      const fx = Math.round(FIELD_BODY.x) + x;
      const fy = Math.round(FIELD_BODY.y) + y;
      if (fx >= 0 && fx < FIELD_W && fy >= 0 && fy < FIELD_H)
        alpha[fy * FIELD_W + fx] = data[(y * info.width + x) * 4 + 3];
    }
  return alpha;
})();
const undersuit = {
  src: "undersuit",
  silhouette(data, width, height) {
    assert.equal(width, FIELD_W);
    assert.equal(height, FIELD_H);
    for (let i = 0; i < width * height; i += 1) data[i * 4 + 3] = undersuitAlpha[i];
  },
};
const undersuitField = new Uint8Array(FIELD_W * FIELD_H * 4);
assert.equal(buildFireField(undersuitAlpha, FIELD_W, FIELD_H, undersuitField), true);
const noise = buildNoiseTable();

async function warmed(options) {
  const module = await fresh();
  const f = fixture(options);
  const warm = module.warmNaniteFlame(f.environment);
  f.advance(0);
  assert.equal(await warm, true);
  assert.equal(module.prepareBodyFlame(undersuit, SIZE, f.environment), true);
  return { module, f };
}

// Mean fire over the undersuit's registered body bands, from the CPU
// oracle: the fraction of lit skin per band and its mean colour.
const BANDS = {
  foot: [0.9, 1],
  shin: [0.72, 0.9],
  thigh: [0.5, 0.72],
  waist: [0.38, 0.5],
  chest: [0.2, 0.38],
  crown: [0.02, 0.12],
};
const ARMS = { hands: [0.5, 0.56], upperArm: [0.3, 0.4] };
const pose = new Float64Array(POSE_SLOTS);
const pixel = new Float64Array(8);
function bodyFire(phase, clock = 0.5, field = undersuitField) {
  poseFire(phase, naniteFlameEnvelope(phase), clock, 1, pose);
  const bands = {};
  for (const [name, [from, to]] of [...Object.entries(BANDS), ...Object.entries(ARMS)]) {
    let lit = 0;
    let count = 0;
    const colour = [0, 0, 0];
    for (let yy = from; yy < to; yy += 0.01)
      for (let xx = 0.08; xx < 0.92; xx += 0.02) {
        const u = (xx - FIRE_RECT.x) / FIRE_RECT.width;
        const v = (yy - FIRE_RECT.y) / FIRE_RECT.height;
        const i =
          Math.round(FIELD_BODY.y + yy * FIELD_BODY.height) * FIELD_W +
          Math.round(FIELD_BODY.x + xx * FIELD_BODY.width);
        if (undersuitAlpha[i] <= 96) continue;
        if (name in ARMS && xx > 0.25 && xx < 0.75) continue;
        count += 1;
        fireKernel(u, v, pose, field, noise, pixel);
        const alpha = pixel[3] + pixel[7];
        if (alpha > 0.12) {
          lit += 1;
          colour[0] += pixel[0] + pixel[4];
          colour[1] += pixel[1] + pixel[5];
          colour[2] += pixel[2] + pixel[6];
        }
      }
    bands[name] = {
      count,
      ratio: count ? lit / count : 0,
      colour: colour.map((c) => (lit ? c / lit : 0)),
    };
  }
  return bands;
}

test("the engulf covers the undersuit gradually from the soles to the crown and hands, then holds a full torch", () => {
  const P = NANITE_FIRE_PHASES;
  const early = bodyFire(0.03);
  assert.ok(early.foot.ratio > 0.3, `the kindle lights the feet (${early.foot.ratio})`);
  assert.ok(early.shin.ratio < 0.3 && early.chest.ratio === 0 && early.crown.ratio === 0);
  const half = bodyFire(0.085);
  assert.ok(
    half.foot.ratio > 0.4 && half.shin.ratio > 0.5 && half.thigh.ratio > 0.15,
    "legs burn by the middle",
  );
  assert.ok(half.crown.ratio === 0 && half.hands.ratio < 0.2, "crown and hands wait");
  const late = bodyFire(0.13);
  assert.ok(late.chest.ratio > 0.4, "the chest burns late in the climb");
  const torch = bodyFire(P.cover + 0.005);
  for (const [name, band] of Object.entries(torch))
    assert.ok(band.ratio > 0.2, `${name} burns in the full torch (${band.ratio})`);
  // Monotone coverage per band as the clock advances, never retreating.
  let previous = null;
  for (let phase = 0.005; phase <= P.cover; phase += 0.005) {
    const now = bodyFire(phase);
    if (previous)
      for (const name of Object.keys(BANDS))
        assert.ok(
          now[name].ratio >= previous[name].ratio - 0.08,
          `${name} coverage never retreats at ${phase}`,
        );
    previous = now;
  }
  // Order: feet before shins before thighs before chest before crown.
  const firstLit = {};
  for (let phase = 0.005; phase <= P.cover; phase += 0.005) {
    const now = bodyFire(phase);
    for (const name of Object.keys(BANDS))
      if (!(name in firstLit) && now[name].ratio > 0.1) firstLit[name] = phase;
  }
  assert.ok(firstLit.foot < firstLit.shin, JSON.stringify(firstLit));
  assert.ok(firstLit.shin < firstLit.thigh);
  assert.ok(firstLit.thigh < firstLit.chest);
  assert.ok(firstLit.chest < firstLit.crown);
  assert.ok(firstLit.crown - firstLit.foot > 0.08, "the climb is gradual, not a flash-over");
});

test("the colour shifts continuously from sooty green through teal to clean cyan-blue before the burst, oldest fire first", () => {
  const P = NANITE_FIRE_PHASES;
  const green = bodyFire(0.09).foot.colour;
  assert.ok(green[1] > green[0] * 1.3 && green[1] > green[2] * 1.3, `forest green early ${green}`);
  const mid = bodyFire((P.cleanFrom + P.cleanTo) / 2);
  assert.ok(
    mid.foot.colour[2] / mid.foot.colour[1] > (mid.chest.colour[2] / mid.chest.colour[1]) * 1.05,
    "the oldest fire (feet) turns clean before the fresh front (chest)",
  );
  assert.ok(mid.foot.colour[1] > mid.foot.colour[0] * 1.2, "midway it is teal, not grey");
  const clean = bodyFire(P.burstStart - 0.003);
  for (const name of ["foot", "chest", "crown"]) {
    const c = clean[name].colour;
    assert.ok(c[2] > c[1] * 1.05 && c[2] > c[0] * 1.6, `${name} is cyan-blue at the torch ${c}`);
  }
  // No grey midpoint and no pops: the mean colour moves in small steps.
  let previous = bodyFire(0.08).foot.colour;
  for (let phase = 0.085; phase < P.burstStart; phase += 0.005) {
    const c = bodyFire(phase).foot.colour;
    const saturation = Math.max(...c) - Math.min(...c);
    assert.ok(saturation > 0.12, `saturated at ${phase}: ${c}`);
    assert.ok(
      Math.hypot(c[0] - previous[0], c[1] - previous[1], c[2] - previous[2]) < 0.12,
      `continuous at ${phase}`,
    );
    previous = c;
  }
});

test("the detonation dissolves the body fire into fragments that cool into the nanites, and nothing remains after flameEnd", () => {
  const P = NANITE_FIRE_PHASES;
  const torch = bodyFire(P.burstStart - 0.001);
  const blown = bodyFire(P.burstStart + 0.04);
  for (const name of Object.keys(BANDS))
    assert.ok(blown[name].ratio < torch[name].ratio * 0.35, `${name} fire is blown apart`);
  const gone = bodyFire(P.flameEnd);
  for (const band of Object.values(gone)) assert.equal(band.ratio, 0);
  // Fragments: cold on the body before the burst, hot and flying after,
  // every one cooled (a chip) by flameEnd, the first by materialStart.
  const out = new Float64Array(6);
  let cooledByMaterial = 0;
  for (let i = 0; i < NANITE_FIRE_FRAGMENTS; i += 1) {
    const seed = (i + 0.5) / NANITE_FIRE_FRAGMENTS;
    fireFragmentPose(seed, P.burstStart - 0.01, out);
    assert.equal(out[4], 0);
    assert.equal(out[2], 0);
    const [bx, by] = out;
    fireFragmentPose(seed, P.burstStart + 0.01, out);
    assert.ok(out[4] > 0.5 && (out[0] !== bx || out[1] !== by), "flung out, white hot");
    fireFragmentPose(seed, P.materialStart - 1e-6, out);
    assert.ok(out[4] > 0, "no fragment is a chip before materialStart");
    fireFragmentPose(seed, P.materialStart + 0.012, out);
    if (out[4] === 0) cooledByMaterial += 1;
    fireFragmentPose(seed, P.flameEnd, out);
    assert.equal(out[4], 0, "every fragment is a chip by flameEnd");
    assert.ok([...out].every(Number.isFinite));
  }
  assert.ok(cooledByMaterial > 0 && cooledByMaterial < NANITE_FIRE_FRAGMENTS / 2);
});

test("the detonation's flash and shock ring fade out before the canvas's or the rect's edges, and the ring is a brief pulse", () => {
  const P = NANITE_FIRE_PHASES;
  const span = P.burstEnd - P.burstStart;
  // A flash still lit where the drawing ends shows as a hard-edged panel
  // behind the figure. The drawing ends at the fire rect, or sooner where
  // the scene's canvas bleeds less past the figure: the desktop entry's
  // canvas ends a quarter width beside the figure and 0.18 heights above
  // it, inside the rect. The flash and ring's own light (the back layer
  // with and without them) is measured on the view's outermost texels and
  // 0.03 figure widths in, from the detonation's first instant (full
  // flash) on through the blast carrying the envelope out.
  const bare = new Float64Array(POSE_SLOTS);
  const plain = new Float64Array(8);
  const inX = 0.03 / FIRE_RECT.width;
  const inY = 0.03 / (FIRE_RECT.height * (1040 / 571));
  const entry = [
    (-0.25 - FIRE_RECT.x) / FIRE_RECT.width,
    (-0.18 - FIRE_RECT.y) / FIRE_RECT.height,
    (1.25 - FIRE_RECT.x) / FIRE_RECT.width,
    1,
  ];
  for (const [x0, y0, x1, y1] of [[0, 0, 1, 1], entry])
    for (const share of [0, 0.05, 0.15, 0.3, 0.5]) {
      const phase = P.burstStart + share * span;
      poseFire(phase, naniteFlameEnvelope(phase), 0.5, 1, pose);
      poseView(pose, x0, y0, x1, y1);
      bare.set(pose);
      bare[POSE_FLASH] = 0;
      bare[POSE_RING_STRENGTH] = 0;
      let edge = 0;
      let near = 0;
      for (let i = 0; i < 240; i += 1) {
        const su = x0 + ((i + 0.5) / 240) * (x1 - x0);
        const sv = y0 + ((i + 0.5) / 240) * (y1 - y0);
        for (const [u, v, inset] of [
          [x0 + 0.001, sv, false],
          [x1 - 0.001, sv, false],
          [su, y0 + 0.001, false],
          [su, y1 - 0.001, false],
          [x0 + inX, sv, true],
          [x1 - inX, sv, true],
          [su, y0 + inY, true],
          [su, y1 - inY, true],
        ]) {
          fireKernel(u, v, pose, undersuitField, noise, pixel);
          fireKernel(u, v, bare, undersuitField, noise, plain);
          const light = Math.max(pixel[0] - plain[0], pixel[1] - plain[1], pixel[2] - plain[2]);
          if (inset) near = Math.max(near, light);
          else edge = Math.max(edge, light);
        }
      }
      const at = `${share} in [${[x0, y0, x1, y1].map((n) => n.toFixed(3))}]`;
      assert.ok(edge < 0.002, `no flash on the drawing's edge ${at}: ${edge.toFixed(4)}`);
      assert.ok(near < 0.06, `the flash has faded just inside the edge ${at}: ${near.toFixed(4)}`);
    }
  // poseFire always starts from the whole rect; a degenerate view keeps it.
  poseFire(P.burstStart, 1, 0.5, 1, pose);
  assert.deepEqual(
    [pose[POSE_VIEW_X0], pose[POSE_VIEW_Y0], pose[POSE_VIEW_X1], pose[POSE_VIEW_Y1]],
    [0, 0, 1, 1],
  );
  poseView(pose, 0.6, 0.2, 0.4, 0.9);
  assert.deepEqual(
    [pose[POSE_VIEW_X0], pose[POSE_VIEW_Y0], pose[POSE_VIEW_X1], pose[POSE_VIEW_Y1]],
    [0, 0, 1, 1],
  );
  poseView(pose, NaN, 0.2, 0.8, 0.9);
  assert.deepEqual(
    [pose[POSE_VIEW_X0], pose[POSE_VIEW_Y0], pose[POSE_VIEW_X1], pose[POSE_VIEW_Y1]],
    [0, 0, 1, 1],
  );
  poseView(pose, -0.2, 0.1, 1.4, 0.9);
  assert.deepEqual(
    [pose[POSE_VIEW_X0], pose[POSE_VIEW_Y0], pose[POSE_VIEW_X1], pose[POSE_VIEW_Y1]],
    [0, 0.1, 1, 0.9],
  );
  // The flash still lights the air round the figure: beside the waist,
  // just off the skin, at the detonation.
  poseFire(P.burstStart, naniteFlameEnvelope(P.burstStart), 0.5, 1, pose);
  assert.equal(pose[POSE_FLASH], 1);
  let flash = 0;
  for (let xx = -0.12; xx < 0; xx += 0.01) {
    fireKernel(
      (xx - FIRE_RECT.x) / FIRE_RECT.width,
      (0.45 - FIRE_RECT.y) / FIRE_RECT.height,
      pose,
      undersuitField,
      noise,
      pixel,
    );
    flash = Math.max(flash, pixel[2]);
  }
  assert.ok(flash > 0.3, `the flash lights the air beside the body: ${flash.toFixed(3)}`);
  // The ring sweeps out while bright and has died away by mid-burst, before
  // the fragments have scattered, so it never lingers as a ghost outline.
  let previous = Infinity;
  for (let share = 0; share <= 1.0001; share += 0.05) {
    const phase = P.burstStart + share * span;
    poseFire(phase, 1, 0.5, 1, pose);
    assert.ok(pose[POSE_RING_STRENGTH] <= previous, "the ring only fades");
    previous = pose[POSE_RING_STRENGTH];
    if (share >= 0.5) assert.ok(pose[POSE_RING_STRENGTH] < 0.1, `faded by mid-burst ${share}`);
  }
  assert.equal(previous, 0, "gone by the burst's end");
  poseFire(P.burstStart + 0.2 * span, 1, 0.5, 1, pose);
  assert.ok(
    pose[POSE_RING_STRENGTH] > 0.3 && pose[POSE_RING_RADIUS] > 0.1,
    "a bright pulse off the body",
  );
});

// Visible fire (emission, not alpha) over a rectangle of body units, on the
// air or on the skin: the fraction of samples brighter than a flame tip.
function visibleFire(phase, clock, x0, x1, y0, y1, onSkin) {
  poseFire(phase, naniteFlameEnvelope(phase), clock, 1, pose);
  let lit = 0;
  let count = 0;
  for (let yy = y0; yy < y1; yy += 0.01)
    for (let xx = x0; xx < x1; xx += 0.01) {
      const i =
        Math.round(FIELD_BODY.y + yy * FIELD_BODY.height) * FIELD_W +
        Math.round(FIELD_BODY.x + xx * FIELD_BODY.width);
      const skin = i >= 0 && i < undersuitAlpha.length && undersuitAlpha[i] > 96;
      if (skin !== onSkin) continue;
      count += 1;
      fireKernel(
        (xx - FIRE_RECT.x) / FIRE_RECT.width,
        (yy - FIRE_RECT.y) / FIRE_RECT.height,
        pose,
        undersuitField,
        noise,
        pixel,
      );
      if (Math.max(pixel[0] + pixel[4], pixel[1] + pixel[5], pixel[2] + pixel[6]) > 0.25) lit += 1;
    }
  return count ? lit / count : 0;
}

test("the fire is mostly what rises off the body: licks above the crown and shoulders, none under the soles, a covered skin, visible tips", () => {
  const P = NANITE_FIRE_PHASES;
  const torch = P.cover + 0.005;
  const clocks = [0.3, 0.5, 0.9, 1.7];
  // Tongues above the crown come and go (the plume's reach drifts), but
  // they are there on most clocks and tall on some; the shoulders always
  // shed licks; nothing hangs below the soles; the whole lit undersuit
  // reads as covered, not a half-speckled coating.
  const crown = clocks.map((clock) => visibleFire(torch, clock, 0.38, 0.62, -0.3, -0.02, false));
  assert.ok(crown.filter((ratio) => ratio > 0.08).length >= 3, `licks above the crown ${crown}`);
  assert.ok(Math.max(...crown) > 0.15, `tall licks above the crown ${crown}`);
  for (const clock of clocks) {
    const left = visibleFire(torch, clock, 0.18, 0.42, 0.1, 0.25, false);
    const right = visibleFire(torch, clock, 0.58, 0.82, 0.1, 0.25, false);
    assert.ok(
      Math.max(left, right) > 0.1,
      `licks off the shoulders at ${clock} (${left}, ${right})`,
    );
    const floor = visibleFire(torch, clock, 0.25, 0.75, 1.03, 1.12, false);
    assert.ok(floor < 0.02, `the fire sits on the floor at ${clock} (${floor})`);
    const skin = visibleFire(torch, clock, -0.35, 1.35, -0.36, 1.1, true);
    assert.ok(skin > 0.7, `the covered undersuit reads as covered at ${clock} (${skin})`);
  }
  // The kindle lights the soles only: no fire in the air above the crown.
  assert.equal(visibleFire(0.03, 0.5, 0.38, 0.62, -0.3, -0.02, false), 0);
  // A tongue's cool fringe is a visible flame colour, never black: deep
  // green while sooty, pink-violet once clean; it fades by its emission.
  const [, sr, sg, sb] = RAMP_SOOTY[0];
  assert.ok(sg >= 0.2 && sg > sr * 2 && sg > sb * 2, `a deep green fringe ${RAMP_SOOTY[0]}`);
  const [, cr, cg, cb] = RAMP_CLEAN[0];
  assert.ok(cb >= 0.4 && cr > cg && cb > cr, `a pink-violet fringe ${RAMP_CLEAN[0]}`);
  // The air's arrival (the lit/unlit boundary a plume inherits from the
  // body below it) is smooth, so a tongue rising between the head and a
  // shoulder is never cut along their boundary.
  let jump = 0;
  for (let y = 0; y < FIELD_H; y += 1)
    for (let x = 0; x < FIELD_W; x += 1) {
      const i = y * FIELD_W + x;
      if (undersuitAlpha[i] > 96) continue;
      for (const j of [i + 1, i + FIELD_W]) {
        if (j >= undersuitAlpha.length || (j === i + 1 && x === FIELD_W - 1)) continue;
        if (undersuitAlpha[j] > 96) continue;
        jump = Math.max(jump, Math.abs(undersuitField[i * 4 + 1] - undersuitField[j * 4 + 1]));
      }
    }
  assert.ok(jump <= 0.12 * 255, `the air's arrival has no cut (max step ${jump / 255})`);
});

// Roughness of the back layer's emission (mean absolute step between
// neighbouring pixels, over the mean emission) and its lit fraction, at a
// clock: what a shear of the turbulence or a dither would raise.
function texture(phase, clock) {
  const w = 72;
  const h = 112;
  const back = new Uint8ClampedArray(w * h * 4);
  const front = new Uint8ClampedArray(w * h * 4);
  poseFire(phase, naniteFlameEnvelope(phase), clock, 1, pose);
  rasterFire(pose, undersuitField, noise, w, h, back, front);
  const e = (x, y) => {
    const k = (y * w + x) * 4;
    return ((back[k] + back[k + 1] + back[k + 2]) * back[k + 3]) / (3 * 255 * 255);
  };
  let step = 0;
  let sum = 0;
  let lit = 0;
  for (let y = 0; y < h - 1; y += 1)
    for (let x = 0; x < w - 1; x += 1) {
      const here = e(x, y);
      step += Math.abs(e(x + 1, y) - here) + Math.abs(e(x, y + 1) - here);
      sum += here;
      if (here > 0.1) lit += 1;
    }
  return { roughness: step / Math.max(sum, 1e-9), lit: lit / ((w - 1) * (h - 1)) };
}

test("a clock of hours (the scroll's page time) burns the same smooth fire as a clock of seconds: no shear, no speckle", () => {
  const torch = NANITE_FIRE_PHASES.cover + 0.005;
  const near = [0.5, 1.7].map((clock) => texture(torch, clock));
  const roughest = Math.max(...near.map((frame) => frame.roughness));
  const sparsest = Math.min(...near.map((frame) => frame.lit));
  for (const clock of [3.1, 400.3, 4000.7, 86400.1]) {
    const far = texture(torch, clock);
    assert.ok(
      far.roughness < roughest * 1.25,
      `smooth at ${clock}s: ${far.roughness} against ${roughest}`,
    );
    assert.ok(far.lit > sparsest * 0.7, `the same body of fire at ${clock}s (${far.lit})`);
    // Every drift is wrapped into the noise's period on the CPU: no
    // kernel, and no GPU precision, ever sees the large clock.
    poseFire(torch, 1, clock, 1, pose);
    assert.equal(pose[POSE_TIME], clock);
    for (let slot = POSE_FLOW_A; slot < POSE_SLOTS; slot += 1)
      if (slot !== POSE_FLICKER)
        assert.ok(pose[slot] >= 0 && pose[slot] < 1, `drift ${slot} wrapped at ${clock}s`);
    assert.ok(Math.abs(pose[POSE_FLICKER]) < 0.2);
  }
});

test("the silhouette is anti-aliased: one smooth signed distance on the alpha threshold, and a skin edge without a step", () => {
  const signed = (i) =>
    ((undersuitField[i * 4] / 255) * FIELD_D - (undersuitField[i * 4 + 3] / 255) * FIELD_IN) *
    FIELD_TEXELS_PER_WIDTH;
  let steepest = 0;
  let misplaced = 0;
  for (let y = 1; y < FIELD_H - 1; y += 1)
    for (let x = 1; x < FIELD_W - 1; x += 1) {
      const i = y * FIELD_W + x;
      const sd = signed(i);
      if (Math.abs(sd) > 4) continue;
      steepest = Math.max(
        steepest,
        Math.abs(signed(i + 1) - sd),
        Math.abs(signed(i + FIELD_W) - sd),
      );
      // Wherever the 3×3 neighbourhood is all body (or all air), the
      // smoothed distance keeps its side of the silhouette.
      let body = 0;
      for (let dy = -1; dy <= 1; dy += 1)
        for (let dx = -1; dx <= 1; dx += 1)
          if (undersuitAlpha[i + dy * FIELD_W + dx] > 96) body += 1;
      if ((body === 9 && sd > 0) || (body === 0 && sd < 0)) misplaced += 1;
    }
  assert.ok(steepest < 1.3, `a distance field's slope (${steepest} texels per texel)`);
  assert.equal(misplaced, 0, "the boundary stays where the undersuit's alpha puts it");
  // Across the torso's left edge at a tenth of a texel per sample, the
  // front layer (the skin's share) rises through several intermediate
  // values: the edge is a ramp, not a step of the field's texel grid.
  poseFire(NANITE_FIRE_PHASES.cover + 0.005, 1, 0.5, 1, pose);
  const row = 0.33;
  const v = (row - FIRE_RECT.y) / FIRE_RECT.height;
  const samples = [];
  for (let xx = 0.2; xx < 0.42; xx += 0.1 / FIELD_BODY.width) {
    fireKernel((xx - FIRE_RECT.x) / FIRE_RECT.width, v, pose, undersuitField, noise, pixel);
    samples.push(pixel[7]);
  }
  const top = Math.max(...samples);
  const between = samples.filter((a) => a > top * 0.1 && a < top * 0.9).length;
  assert.ok(top > 0.2, "the skin burns at the torch");
  assert.ok(between >= 6, `${between} intermediate samples across the edge`);
});

test("a frame is a closed-form function of (phase, clock): identical on reverse scrub, changed by the clock", () => {
  const w = 24;
  const h = 36;
  const back = new Uint8ClampedArray(w * h * 4);
  const front = new Uint8ClampedArray(w * h * 4);
  const render = (phase, clock) => {
    poseFire(phase, naniteFlameEnvelope(phase), clock, 1, pose);
    rasterFire(pose, undersuitField, noise, w, h, back, front);
    return createHash("sha256").update(back).update(front).digest("hex");
  };
  const reference = render(0.12, 0.42);
  assert.notEqual(render(0.2, 0.42), reference);
  assert.notEqual(render(0.12, 0.7), reference, "time flickers the texture");
  assert.notEqual(render(0.09, 0.42), reference);
  assert.equal(render(0.12, 0.42), reference, "reverse scrubbing restores the exact frame");
  assert.equal(render(0, 0.42), render(-1, 9), "nothing before ignition");
  assert.ok(
    back.every((b) => b === 0),
    "nothing before ignition",
  );
});

test("warm-up builds procedural tables only: no image request, deduplicated, and tier-aware on return", async () => {
  const module = await fresh();
  const f = fixture();
  assert.equal(module.naniteFlameReady(), false);
  const first = module.warmNaniteFlame(f.environment);
  f.advance(0);
  assert.equal(await first, true);
  assert.equal(f.images.length, 0, "the Blender atlas is no longer fetched for the suit-up");
  assert.equal(module.naniteFlameReady(), true);
  assert.equal(await module.warmNaniteFlame(f.environment), true);
  const { noise: table, field } = module.inspectBodyFlame();
  assert.ok(table instanceof Uint8Array && table.length === 256 * 256 * 4);
  assert.ok(field instanceof Uint8Array, "an authored silhouette burns until an undersuit arrives");
  assert.equal(module.prepareBodyFlame(undersuit, SIZE, f.environment), true);
  assert.notEqual(module.inspectBodyFlame().field, field);
  const prepared = module.inspectBodyFlame().field;
  assert.equal(module.prepareBodyFlame(undersuit, SIZE, f.environment), true);
  assert.equal(module.inspectBodyFlame().field, prepared, "the same source is not rebuilt");
  assert.equal(module.prepareBodyFlame(null, SIZE, f.environment), false);
  assert.equal(module.prepareBodyFlame(undersuit, { width: 0, height: 1 }, f.environment), false);
});

test("both layers of one frame come from one render; the GPU path draws two quads and one spark batch per frame", async () => {
  const { module } = await warmed({ gl: true });
  const p = painter();
  module.drawBodyFlame(p.context, SIZE, 1, 0.5, 1.5, "back", 0.12);
  const inspect = module.inspectBodyFlame();
  assert.equal(inspect.mode, 1, "WebGL renders");
  const gl = inspect.glCanvas.gl;
  assert.equal(gl.calls.texImage2D, 2, "field and noise uploaded once");
  assert.equal(gl.calls.drawArrays, 2, "back and front fire layers");
  assert.equal(gl.calls.drawElements, 0, "no sparks before the burst");
  module.drawNaniteFlame(p.context, [284, 275], 1, 0.5, 1.5);
  module.drawBodyFlame(p.context, SIZE, 1, 0.5, 1.5, "front", 0.12);
  assert.equal(gl.calls.drawArrays, 2, "the front layer reuses the frame");
  const images = p.operations.filter((row) => row[0] === "image");
  assert.deepEqual(
    images.map((row) => row[1]),
    ["body", "other", "other", "body"],
    "one body draw per layer and two reactor glows",
  );
  const [back, , , front] = images;
  assert.equal(back[3], 0);
  assert.equal(front[3], inspect.glCanvas.height / 2, "front reads the lower half");
  assert.deepEqual(back.slice(6, 10), [
    FIRE_RECT.x * 571,
    FIRE_RECT.y * 1040,
    FIRE_RECT.width * 571,
    FIRE_RECT.height * 1040,
  ]);
  assert.deepEqual(p.operations[0], ["scale", 1.5, 1.5]);
  assert.equal(p.states.length, 0);
  assert.equal(p.context.globalAlpha, 0.73);
  assert.equal(p.context.globalCompositeOperation, "multiply");
  module.drawBodyFlame(p.context, SIZE, 0.9, 0.5, 1, "all", 0.2);
  assert.equal(gl.calls.drawArrays, 4);
  assert.equal(gl.calls.drawElements, 1, "the burst's sparks are one batch");
  assert.equal(gl.calls.texImage2D, 2, "no per-frame uploads");
  assert.equal(inspect.glCanvas.width, module.NANITE_FIRE_BACKING.width);
  assert.equal(inspect.glCanvas.height, module.NANITE_FIRE_BACKING.height * 2);
});

test("the fire measures how much of its rect the destination canvas shows, from the caller's transform, and re-renders when that changes", async () => {
  for (const gl of [false, true]) {
    const { module } = await warmed({ gl });
    const view = () => {
      const p = module.inspectBodyFlame().pose;
      return [p[POSE_VIEW_X0], p[POSE_VIEW_Y0], p[POSE_VIEW_X1], p[POSE_VIEW_Y1]];
    };
    const phase = NANITE_FIRE_PHASES.burstStart;
    // A canvas of 400×800 pixels; the caller maps the 571×1040 figure to
    // half size at (60, 80), and the fire scales it by 1.2 on top.
    const clipped = painter();
    clipped.context.canvas = { width: 400, height: 800 };
    clipped.context.getTransform = () => ({ a: 0.5, b: 0, c: 0, d: 0.5, e: 60, f: 80 });
    module.drawBodyFlame(clipped.context, SIZE, 1, 0.5, 1.2, "back", phase);
    const k = 0.5 * 1.2;
    const expected = [
      (-60 / (k * SIZE.width) - FIRE_RECT.x) / FIRE_RECT.width,
      (-80 / (k * SIZE.height) - FIRE_RECT.y) / FIRE_RECT.height,
      ((400 - 60) / (k * SIZE.width) - FIRE_RECT.x) / FIRE_RECT.width,
      1,
    ];
    assert.ok(expected[0] > 0 && expected[1] > 0 && expected[2] < 1, "the canvas clips the rect");
    assert.ok(((800 - 80) / (k * SIZE.height) - FIRE_RECT.y) / FIRE_RECT.height > 1);
    for (let i = 0; i < 4; i += 1) assert.ok(Math.abs(view()[i] - expected[i]) < 1e-9, `${view()}`);
    // The same frame on a context that does not report its transform (or
    // rotates) is the whole rect again: a new render, not the cached one.
    module.drawBodyFlame(painter().context, SIZE, 1, 0.5, 1.2, "back", phase);
    assert.deepEqual(view(), [0, 0, 1, 1]);
    const rotated = painter();
    rotated.context.canvas = { width: 400, height: 800 };
    rotated.context.getTransform = () => ({ a: 0, b: 0.5, c: -0.5, d: 0, e: 60, f: 80 });
    module.drawBodyFlame(rotated.context, SIZE, 1, 0.5, 1.2, "back", phase);
    assert.deepEqual(view(), [0, 0, 1, 1]);
  }
});

test("without WebGL, or once the context is lost, the CPU kernel paints the same frames and sparks", async () => {
  const { module } = await warmed();
  const p = painter();
  module.drawBodyFlame(p.context, SIZE, 1, 0.5, 1, "all", 0.2);
  const inspect = module.inspectBodyFlame();
  assert.equal(inspect.mode, 2);
  const images = p.operations.filter((row) => row[0] === "image");
  assert.deepEqual(
    images.map((row) => row[1]),
    ["back", "front"],
  );
  const sparks = p.operations.filter((row) => row[0] === "rect");
  assert.ok(
    sparks.length > 60 && sparks.length <= NANITE_FIRE_FRAGMENTS,
    `${sparks.length} sparks`,
  );
  const out = new Float64Array(6);
  let first = 0;
  while (fireFragmentPose((first + 0.5) / NANITE_FIRE_FRAGMENTS, 0.2, out)[4] <= 0) first += 1;
  assert.ok(
    Math.abs(sparks[0][1] + sparks[0][3] / 2 - out[0] * 571) < 1e-3,
    "a drawn spark sits exactly on its handoff pose",
  );
  const pixels = inspect.rasterBack.getContext("2d").__qaPixels;
  assert.ok(
    pixels.some((v) => v > 0),
    "the CPU kernel painted fire",
  );
  // A lost GPU context falls back without a throw and without allocating.
  const g = await warmed({ gl: true });
  g.module.drawBodyFlame(painter().context, SIZE, 1, 0.5, 1, "back", 0.1);
  const canvas = g.module.inspectBodyFlame().glCanvas;
  canvas.gl.lose();
  canvas.events.webglcontextlost({ preventDefault() {} });
  const q = painter();
  g.module.drawBodyFlame(q.context, SIZE, 1, 0.6, 1, "back", 0.1);
  assert.equal(g.module.inspectBodyFlame().mode, 2, "CPU frames while the context is lost");
  canvas.events.webglcontextrestored();
  g.module.drawBodyFlame(q.context, SIZE, 1, 0.7, 1, "back", 0.1);
  assert.equal(g.module.inspectBodyFlame().mode, 1, "the GPU path rebuilds after restore");
});

test("the fire is gone at flameEnd for every caller and no-op for invalid input, without leaking canvas state", async () => {
  const { module } = await warmed({ gl: true });
  for (const phase of [NANITE_FIRE_PHASES.flameEnd, 0.3, 1]) {
    const p = painter();
    module.drawBodyFlame(p.context, SIZE, 1, 0.8, 1, "all", phase);
    assert.deepEqual(p.operations, []);
  }
  const p = painter();
  for (const strength of [0, -1, NaN, Infinity]) {
    module.drawBodyFlame(p.context, SIZE, strength, 1);
    module.drawNaniteFlame(p.context, [285, 335], strength, 1);
    module.drawNaniteFirebrand(p.context, 10, 10, strength, 1);
  }
  for (const clock of [NaN, Infinity]) module.drawBodyFlame(p.context, SIZE, 1, clock);
  for (const scale of [0, -1, NaN]) module.drawBodyFlame(p.context, SIZE, 1, 1, scale);
  for (const size of [null, { width: 0, height: 1040 }, { width: 571, height: NaN }])
    module.drawBodyFlame(p.context, size, 1, 1);
  for (const core of [null, [NaN, 335]]) module.drawNaniteFlame(p.context, core, 1, 1);
  assert.deepEqual(p.operations, []);
  for (const draw of [
    (context) => module.drawBodyFlame(context, SIZE, 1, 0.6, 1, "all", 0.1),
    (context) => module.drawNaniteFlame(context, [285, 335], 1, 0.6),
    (context) => module.drawNaniteFirebrand(context, 100, 100, 1, 0.6),
  ]) {
    const failing = painter({ throwAt: 1 });
    assert.throws(() => draw(failing.context), /draw failure/);
    assert.equal(failing.states.length, 0);
    assert.equal(failing.context.globalAlpha, 0.73);
    assert.equal(failing.context.globalCompositeOperation, "multiply");
  }
  const legacy = painter();
  module.drawBodyFlame(legacy.context, SIZE, 0.5, 0.6);
  assert.equal(
    legacy.operations.filter((row) => row[0] === "image").length,
    2,
    "an omitted phase still draws",
  );
});

test("warmed frames allocate no canvas, gradient, image data or random state, within the draw budget, on both tiers", async (t) => {
  for (const coarse of [false, true]) {
    for (const gl of [false, true]) {
      const { module, f } = await warmed({ gl, coarse });
      const noAllocation = () => assert.fail("a warmed frame must reuse its prepared resources");
      module.drawBodyFlame(painter().context, SIZE, 1, 0.3, 1, "all", 0.05);
      f.environment.document.createElement = noAllocation;
      for (const { context } of f.canvases)
        context.createImageData = context.createRadialGradient = noAllocation;
      const random = t.mock.method(Math, "random", noAllocation);
      try {
        for (let i = 0; i <= 60; i++) {
          const phase = ((i <= 30 ? i : 60 - i) / 30) * 0.24;
          const clock = 0.3 + i / 50;
          const p = painter();
          module.drawBodyFlame(
            p.context,
            SIZE,
            naniteFlameEnvelope(phase) || 0.5,
            clock,
            1,
            "back",
            phase,
          );
          module.drawNaniteFlame(p.context, [285, 335], 1, clock);
          module.drawBodyFlame(
            p.context,
            SIZE,
            naniteFlameEnvelope(phase) || 0.5,
            clock,
            1,
            "front",
            phase,
          );
          module.drawNaniteFirebrand(p.context, 200, 300, 0.8, clock);
          const images = p.operations.filter((row) => row[0] === "image").length;
          const rects = p.operations.filter((row) => row[0] === "rect").length;
          assert.ok(images <= 6, `${images} image draws`);
          assert.ok(rects <= (coarse ? NANITE_FIRE_FRAGMENTS / 2 : NANITE_FIRE_FRAGMENTS));
          assert.equal(p.states.length, 0);
        }
      } finally {
        random.mock.restore();
      }
      assert.equal(module.inspectBodyFlame().coarse, coarse);
      if (gl)
        assert.equal(
          module.inspectBodyFlame().glCanvas.width,
          coarse ? module.NANITE_FIRE_BACKING.touchWidth : module.NANITE_FIRE_BACKING.width,
          "the touch tier renders at a smaller backing resolution",
        );
    }
  }
});

test("the warmed drawing call graph, across the fire modules, constructs no per-frame objects, arrays, closures or seeded randomness", () => {
  const files = [
    "src/lib/rexonance-flame.js",
    "src/lib/rexonance-fire/fire-pose.js",
    "src/lib/rexonance-fire/fire-renderer.js",
    "src/lib/rexonance-fire/fire-raster.js",
    "src/lib/rexonance-fire/fire-field.js",
    "src/lib/rexonance-fire/fire-noise.js",
    "src/lib/rexonance-ignition.js",
  ];
  const functions = new Map();
  const sources = new Map();
  for (const path of files) {
    const source = ts.createSourceFile(
      path,
      readFileSync(file(path), "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.JS,
    );
    for (const statement of source.statements) {
      if (ts.isFunctionDeclaration(statement) && statement.name) {
        functions.set(statement.name.text, statement);
        sources.set(statement.name.text, source);
      }
      if (ts.isVariableStatement(statement))
        for (const declaration of statement.declarationList.declarations)
          if (
            ts.isIdentifier(declaration.name) &&
            declaration.initializer &&
            (ts.isArrowFunction(declaration.initializer) ||
              ts.isFunctionExpression(declaration.initializer))
          ) {
            functions.set(declaration.name.text, declaration.initializer);
            sources.set(declaration.name.text, source);
          }
    }
  }
  const pending = ["drawBodyFlame", "drawNaniteFlame", "drawNaniteFirebrand"];
  // Guarded one-time resource paths, verified above by replacing the
  // factories after the actual warm-up.
  const resources = new Set(["prepare", "prepareRenderer", "prepareRaster"]);
  const visited = new Set();
  const forbidden = [];
  while (pending.length) {
    const name = pending.pop();
    if (resources.has(name) || visited.has(name)) continue;
    const fn = functions.get(name);
    assert.ok(fn, `the drawing helper ${name} can be inspected`);
    visited.add(name);
    const source = sources.get(name);
    const visit = (node) => {
      if (
        ts.isNewExpression(node) ||
        ts.isObjectLiteralExpression(node) ||
        ts.isArrayLiteralExpression(node) ||
        ts.isArrowFunction(node) ||
        ts.isFunctionExpression(node)
      )
        forbidden.push(`${name}: ${ts.SyntaxKind[node.kind]}`);
      if (ts.isCallExpression(node)) {
        const expression = node.expression;
        if (ts.isIdentifier(expression)) {
          if (expression.text === "hash") forbidden.push(`${name}: per-frame hash`);
          if (functions.has(expression.text)) pending.push(expression.text);
        }
        if (
          ts.isPropertyAccessExpression(expression) &&
          ((expression.expression.getText(source) === "Math" &&
            expression.name.text === "random") ||
            /^(?:Array\.from|Object\.(?:keys|values|entries))$/.test(expression.getText(source)))
        )
          forbidden.push(`${name}: ${expression.getText(source)}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(fn.body);
  }
  for (const name of [
    "renderFrame",
    "poseFire",
    "poseFragments",
    "fireFragmentPose",
    "drawFireLayer",
    "drawFireSparks",
    "rasterFire",
    "fireKernel",
    "sampleNoise",
    "sampleFireField",
    "paintRasterSparks",
  ])
    assert.ok(visited.has(name), `${name} is on the audited draw path`);
  assert.deepEqual(forbidden, [], "retain prepared numeric tables and scalar frame math");
});

test("a firebrand is an incandescent spark of at most two glow draws, never a rotated image, deterministic on reverse", async () => {
  const { module } = await warmed();
  const draw = (clock) => {
    const p = painter();
    module.drawNaniteFirebrand(p.context, 180, 420, 0.75, clock, 1.5);
    assert.equal(p.states.length, 0);
    const images = p.operations.filter((row) => row[0] === "image");
    assert.ok(images.length > 0 && images.length <= 2);
    assert.ok(!p.operations.some((row) => row[0] === "rotate"));
    return p.operations;
  };
  const reference = draw(0.63);
  draw(1.5);
  assert.notDeepEqual(draw(0.2), reference);
  assert.deepEqual(draw(0.63), reference);
});

test("GPU and fallback surfaces are released when the page hides or leaves the route, and rebuilt on the next frame", async () => {
  const { module, f } = await warmed({ gl: true });
  module.drawBodyFlame(painter().context, SIZE, 1, 0.5, 1, "all", 0.1);
  const inspect = module.inspectBodyFlame();
  assert.equal(inspect.retained, true);
  const gl = inspect.glCanvas.gl;
  f.advance(1000);
  assert.equal(module.inspectBodyFlame().retained, true, "visible on the route: retained");
  f.environment.document.hidden = true;
  f.advance(1000);
  assert.equal(module.inspectBodyFlame().retained, false, "hidden and idle: released");
  assert.ok(gl.calls.deleted >= 7, "programs, buffers and textures deleted");
  assert.equal(inspect.glCanvas.width, 0);
  f.environment.document.hidden = false;
  module.drawBodyFlame(painter().context, SIZE, 1, 0.6, 1, "all", 0.1);
  assert.equal(module.inspectBodyFlame().mode, 1, "rebuilt on demand");
  assert.notEqual(module.inspectBodyFlame().glCanvas, inspect.glCanvas);
  f.environment.location.pathname = "/";
  f.advance(1000);
  f.advance(1000);
  assert.equal(module.inspectBodyFlame().retained, false, "off the route: released");
  f.listeners().pagehide();
  module.releaseBodyFlame();
  assert.equal(module.inspectBodyFlame().retained, false);
});

// drawFlameHeat (owner's other session, 2026-10-21) laid 220 radial tongue
// sprites and 40 sparks, white-green cooling to forest green, along the
// sides of a fixed body profile. The body fire subsumes it: its plume rises
// off the real silhouette (the shoulders, head, arms and feet) in the
// fire's own colour of the moment, hot at the base and cooling to the
// tips, and the detonation's fragments are its sparks. Drawn as well, it
// would lay green sprites over the blue torch and double the light.
test("drawFlameHeat is subsumed by the body fire: the scenes' calls draw nothing over it", async () => {
  const { module } = await warmed({ gl: true });
  for (const phase of [0.04, 0.12, NANITE_FIRE_PHASES.cover, 0.19]) {
    const p = painter();
    module.drawBodyFlame(p.context, SIZE, naniteFlameEnvelope(phase), 0.5, 1, "back", phase);
    const before = p.operations.length;
    module.drawFlameHeat(p.context, SIZE, 1, 0.5, 1.5);
    assert.equal(p.operations.length, before, `no second fire at ${phase}`);
    assert.equal(p.states.length, 0);
    assert.equal(p.context.globalAlpha, 0.73);
    assert.equal(p.context.globalCompositeOperation, "multiply");
  }
});

test("the reactor glow follows the fire's reach and colour: nothing before the chest burns, green then blue, two draws", async () => {
  const { module } = await warmed();
  const glow = (phase) => {
    const p = painter();
    module.drawBodyFlame(painter().context, SIZE, 1, 0.5, 1, "back", phase);
    module.drawNaniteFlame(p.context, [284, 275], 1, 0.5);
    return p.operations.filter((row) => row[0] === "image");
  };
  assert.deepEqual(glow(0.02), [], "the core is dark while only the feet burn");
  const green = glow(0.08);
  assert.equal(green.length, 1);
  assert.equal(green[0][2], 0, "the green glow");
  const blue = glow(0.172);
  assert.equal(blue.length, 1);
  assert.equal(blue[0][2], 64, "the blue glow");
  assert.ok(glow(0.13).length === 2, "both tones during the shift");
});

// The previous fire's Blender atlas stays published and pinned (the
// deployment verifier hashes it); this fire no longer loads it.
test("the Blender flame is one transparent 32-frame atlas, not repeated radial discs", async () => {
  const { NANITE_FLAME_ATLAS: atlas } = await fresh();
  assert.equal(Object.isFrozen(atlas), true);
  assert.deepEqual(atlas, {
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
  const asset = file(`public${atlas.src}`);
  const image = readFileSync(asset);
  const metadata = await sharp(image).metadata();
  assert.deepEqual(
    [metadata.format, metadata.width, metadata.height, metadata.channels],
    ["webp", 1024, 1024, 4],
  );
  assert.ok(
    statSync(asset).size <= 500_000,
    "one decoded 4 MiB atlas stays under a 500 kB transfer budget",
  );
  const { data, info } = await sharp(image)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const hashes = new Set();
  const alphaLevels = new Set();
  let [green, coloured] = [0, 0];
  let rootTailAlpha = 0;
  for (let frame = 0; frame < atlas.frames; frame++) {
    const pixels = [];
    let occupied = 0;
    for (let y = 0; y < atlas.tileHeight; y++) {
      for (let x = 0; x < atlas.tileWidth; x++) {
        const i =
          (((frame >> 3) * atlas.tileHeight + y) * info.width + (frame % 8) * atlas.tileWidth + x) *
          4;
        const [r, g, b, a] = data.subarray(i, i + 4);
        pixels.push(r, g, b, a);
        alphaLevels.add(a);
        if (y >= 248) rootTailAlpha = Math.max(rootTailAlpha, a);
        if (a > 8) occupied++;
        if (a > 24 && Math.max(r, g, b) - Math.min(r, g, b) > 12) {
          coloured++;
          if (g > r && g > b) green++;
        }
      }
    }
    assert.ok(occupied > 300, `frame ${frame}: non-empty volumetric tongue`);
    assert.ok(
      occupied < atlas.tileWidth * atlas.tileHeight * 0.9,
      `frame ${frame}: transparent space around the flame`,
    );
    hashes.add(createHash("sha256").update(Buffer.from(pixels)).digest("hex"));
  }
  assert.ok(hashes.size >= 28, `${hashes.size}/32 distinct animation frames`);
  assert.ok(alphaLevels.size > 64, "soft volumetric density rather than a binary silhouette");
  assert.equal(rootTailAlpha, 0, "the feathered root cannot expose a rectangular tile cutoff");
  assert.ok(coloured > 1000 && green / coloured > 0.85, "the rendered flame stays forest-green");
  const generator = readFileSync(file("scripts/blender/rexonance_flame.py"), "utf8");
  assert.match(generator, /import bpy/, "the external Blender build is reproducible");
});

test("the delivered fire matches its Blender source, authored ground contact and independently rendered loop seam", () => {
  const manifest = JSON.parse(
    readFileSync(file("public/rexonance-flame-natural-20261019/manifest.json"), "utf8"),
  );
  const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
  const bytes = readFileSync(file(`public${manifest.asset.path}`));
  assert.equal(digest(bytes), manifest.asset.sha256);
  assert.equal(bytes.length, manifest.asset.bytes);
  assert.deepEqual(manifest.atlas.sourceAnchor, [64, 248]);
  assert.ok(manifest.atlas.contentBounds.bottom <= manifest.atlas.sourceAnchor[1]);
  assert.ok(
    manifest.atlas.sourceAnchor[1] - manifest.atlas.contentBounds.bottom <= 8,
    "the feathered root remains within eight source pixels of its physical contact",
  );
  assert.equal(manifest.atlas.frames, 32);
  assert.equal(manifest.render.renderer, "Cycles CPU");
  assert.equal(manifest.render.loopCheckRendered, true);
  assert.ok(manifest.render.loopGeometryMaxDelta < 0.000001);
  assert.deepEqual(
    [manifest.loopPixelCheck.differentChannels, manifest.loopPixelCheck.maxChannelDelta],
    [0, 0],
  );
  assert.equal(new Set(manifest.renderHashes.map(({ sha256 }) => sha256)).size, 32);
  for (const source of manifest.sources)
    assert.equal(digest(readFileSync(file(source.path))), source.sha256, source.path);
});

test("the natural atlas feathers a curved, moving root without inventing new fire or losing its contact", async () => {
  const root = "public/rexonance-flame-natural-20261019";
  const manifest = JSON.parse(readFileSync(file(`${root}/manifest.json`), "utf8"));
  const previous = JSON.parse(
    readFileSync(file("public/rexonance-flame-20261019/manifest.json"), "utf8"),
  );
  assert.deepEqual(
    manifest.renderHashes,
    previous.renderHashes,
    "reuse the exact 32 Blender renders",
  );
  assert.equal(manifest.renderReuse.newBlenderRender, false, "describe the finishing honestly");
  assert.equal(manifest.renderReuse.colourChangesBeforeEncoding, false);
  assert.equal(manifest.encoding.rootFeather.alphaOnly, true);
  assert.equal(manifest.encoding.rootFeather.phasePeriodFrames, 32);
  assert.deepEqual(
    [
      manifest.loopPixelCheck.finishedDifferentChannels,
      manifest.loopPixelCheck.finishedMaxChannelDelta,
    ],
    [0, 0],
    "independently rendered frame 32 still closes exactly after curved alpha finishing",
  );
  assert.equal(
    manifest.loopPixelCheck.finishedFirstSha256,
    manifest.loopPixelCheck.finishedClosingSha256,
  );
  const current = await sharp(readFileSync(file(`${root}/flame.webp`)))
    .ensureAlpha()
    .raw()
    .toBuffer();
  const original = await sharp(readFileSync(file("public/rexonance-flame-20261019/flame.webp")))
    .ensureAlpha()
    .raw()
    .toBuffer();
  assert.equal(current.length, original.length);
  let reducedAlphaPixels = 0;
  let enlargedAlphaPixels = 0;
  const contours = new Set();
  for (let frame = 0; frame < 32; frame++) {
    const bottoms = [];
    const frequencies = new Map();
    for (let x = 0; x < 128; x++) {
      let bottom = -1;
      for (let y = 0; y < 256; y++) {
        const i = (((frame >> 3) * 256 + y) * 1024 + (frame % 8) * 128 + x) * 4 + 3;
        const before = original[i];
        const after = current[i];
        if (after > before + 1) enlargedAlphaPixels++;
        if (before > after + 1) reducedAlphaPixels++;
        if (y < 180) assert.equal(after, before, "leave the rendered flame tips untouched");
        if (after > 8) bottom = y;
        if (y >= 248) assert.equal(after, 0, "preserve the authored contact's transparent margin");
      }
      if (x >= 28 && x <= 100) {
        assert.ok(bottom >= 180, `frame ${frame}/${x}: keep a connected lower flame volume`);
        bottoms.push(bottom);
        frequencies.set(bottom, (frequencies.get(bottom) ?? 0) + 1);
      }
    }
    const sorted = [...bottoms].sort((a, b) => a - b);
    const spread =
      sorted[Math.floor(sorted.length * 0.9)] - sorted[Math.floor(sorted.length * 0.1)];
    assert.ok(
      spread >= 6,
      `frame ${frame}: its lower contour curves instead of forming a flat edge (${spread}px)`,
    );
    assert.ok(
      Math.max(...frequencies.values()) / bottoms.length < 0.65,
      `frame ${frame}: no horizontal cutoff spans most of the root`,
    );
    contours.add(bottoms.join(","));
  }
  assert.equal(
    enlargedAlphaPixels,
    0,
    "alpha-only finishing cannot add opaque rectangular material",
  );
  assert.ok(reducedAlphaPixels > 32 * 128, "feather the actual pixels, not only the manifest");
  assert.ok(contours.size >= 28, "the root contour sways through the real animation frames");
});

for (const reason of [
  "ssr",
  "hidden",
  "economy",
  "saveData",
  "2g",
  "slow-2g",
  "reduce",
  "forced-colors",
]) {
  test(`warm-up respects ${reason} without fetching`, async () => {
    const module = await fresh();
    const f = fixture();
    if (reason === "ssr") delete f.environment.document;
    if (reason === "hidden") f.environment.document.hidden = true;
    if (reason === "economy")
      f.environment.document.documentElement.dataset.worldEffects = "economy";
    if (reason === "saveData") f.environment.navigator.connection.saveData = true;
    if (reason.includes("2g")) f.environment.navigator.connection.effectiveType = reason;
    if (reason === "reduce")
      f.environment.matchMedia = (query) => ({ matches: query.includes("reduced-motion") });
    if (reason === "forced-colors")
      f.environment.matchMedia = (query) => ({ matches: query.includes("forced-colors") });
    assert.equal(await module.warmNaniteFlame(f.environment), false);
    assert.equal(f.images.length, 0);
    assert.equal(module.naniteFlameReady(), false);
  });
}
