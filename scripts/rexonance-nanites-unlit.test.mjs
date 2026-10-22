// The nanite kit's pixel jobs (owner, 2026-10-16: 「超大幅な改善で。」): the raw
// nanite metal, the guideway's hologram and walls, and molten gold, derived
// at run time from decoded pictures with createSplitLightsJob's contract —
// and that job's own bytes untouched.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("../src/lib/rexonance-unlit.js", import.meta.url), "utf8");
const types = readFileSync(new URL("../src/lib/rexonance-unlit.d.ts", import.meta.url), "utf8");

function load() {
  const canvases = [];
  const calls = { draw: [], read: 0, put: 0, composite: 0 };
  let now = 0;
  let failRead = false;
  const document = {
    createElement(tag) {
      assert.equal(tag, "canvas");
      const canvas = { width: 0, height: 0, pixels: null, drawn: null };
      const context = {
        drawImage(image, ...args) {
          calls.draw.push(args);
          canvas.drawn = image;
          if (image.pixels) canvas.pixels = Uint8ClampedArray.from(image.pixels);
        },
        clearRect() {
          canvas.drawn = null;
        },
        getImageData(x, y, w, h) {
          calls.read += 1;
          if (failRead) throw new Error("tainted");
          const data = new Uint8ClampedArray(w * h * 4);
          if (canvas.drawn) data.set(canvas.drawn.pixels);
          return { width: w, height: h, data };
        },
        createImageData(w, h) {
          return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
        },
        putImageData(image) {
          calls.put += 1;
          canvas.pixels = Uint8ClampedArray.from(image.data);
        },
        set globalCompositeOperation(_value) {
          calls.composite += 1;
        },
      };
      canvas.getContext = () => context;
      canvases.push(canvas);
      return canvas;
    },
  };
  const runtime = { document, performance: { now: () => (now += 2) } };
  runInNewContext(
    source.replaceAll("export function ", "function ") +
      "\nglobalThis.api = { splitLights, createSplitLightsJob, createNaniteMetalJob, createNaniteGuideJob, createNaniteMoltenJob, naniteHexHeight, naniteHexLight };",
    runtime,
  );
  return {
    api: runtime.api,
    calls,
    canvases,
    now: () => now,
    failReads() {
      failRead = true;
    },
  };
}

function seeded(width, height, seed = 0x5eed1234) {
  let state = seed;
  return Uint8ClampedArray.from({ length: width * height * 4 }, (_, i) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const v = state >>> 24;
    // Alpha: a third transparent, some partial, the rest opaque.
    if (i % 4 === 3) return v < 85 ? 0 : v < 140 ? v : 255;
    return v;
  });
}
const picture = (pixels) => ({ pixels, close() {} });
const luma = (p, i) => (0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2]) / 255;
const byte = (v) => (v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v));

function run(job, slicing, ui) {
  let steps = 0;
  for (;;) {
    steps += 1;
    const until = slicing === "row" ? -1 : slicing === "seven" ? ui.now() + 13 : Infinity;
    if (job.step(until)) break;
    assert.equal(job.commit(), null, "an unfinished pass publishes nothing");
  }
  return steps;
}

test("the original light split is byte-for-byte HEAD's (the nanite jobs only follow it)", () => {
  const original = source.slice(0, source.indexOf("\n// --- The nanite kit"));
  assert.equal(
    createHash("sha256").update(original).digest("hex"),
    // Round 4: the split's job phased (strips, one upload a step); sweep 2:
    // its source read back once, whole, and its strips put straight into the
    // outputs. Its bytes are pinned below (SPLIT_DIGEST unchanged; the
    // real-size digests: rexonance-unlit-runtime).
    "8484b85f54570718db8c3c975aa200145f6b3e2575830f99e98281b1b1ad0128",
  );
  // And it still splits a seeded picture exactly as before (frozen digest).
  const ui = load();
  const pixels = seeded(19, 23, 0x17c0ffee);
  const result = ui.api.splitLights(picture(pixels), 0, 0, 19, 23, undefined, { motes: true });
  const digest = createHash("sha256");
  for (const name of ["unlit", "lights", "motes"]) digest.update(result[name].pixels);
  assert.equal(digest.digest("hex").slice(0, 16), SPLIT_DIGEST);
});
// Computed from HEAD a07ff56's splitLights on the seeded picture above.
const SPLIT_DIGEST = "6dcc3f4bdb642587";

test("the hex relief: pure, periodic, a groove between hexes, lit upper-left and dark lower-right", () => {
  const { api } = load();
  const pitch = 4.6;
  let groove = 0;
  let top = 0;
  for (let y = 0; y < 40; y += 0.25)
    for (let x = 0; x < 40; x += 0.25) {
      const h = api.naniteHexHeight(x, y, pitch);
      const l = api.naniteHexLight(x, y, pitch);
      assert.ok(h >= 0 && h <= 1 && l >= -1 && l <= 1);
      assert.equal(api.naniteHexHeight(x, y, pitch), h, "pure");
      assert.ok(Math.abs(api.naniteHexHeight(x + pitch, y, pitch) - h) < 1e-9, "periodic along x");
      assert.ok(Math.abs(api.naniteHexHeight(x + pitch / 2, y + (pitch * Math.sqrt(3)) / 2, pitch) - h) < 1e-9, "periodic along the rows");
      if (h === 0) groove += 1;
      if (h === 1) top += 1;
    }
  assert.ok(groove > 0 && top > groove * 3, "mostly hex tops with a narrow groove");
  // A hex centred on the origin: flat top, its left edge's rim lit, its right edge's dark.
  assert.equal(api.naniteHexHeight(0, 0, pitch), 1);
  assert.equal(api.naniteHexLight(0, 0, pitch), 0);
  assert.equal(api.naniteHexLight(-pitch / 2 + 0.8, 0, pitch), 1);
  assert.equal(api.naniteHexLight(pitch / 2 - 0.8, 0, pitch), -1);
  assert.equal(api.naniteHexHeight(pitch / 2, 0, pitch), 0, "the groove between neighbours");
  assert.equal(api.naniteHexHeight(0, 0), api.naniteHexHeight(0, 0, 4.6), "pitch defaults to 4.6");
});

test("raw metal: the art's exact alpha, the spec's shading, a silhouette, slice-invariant bytes", () => {
  const [w, h] = [37, 29];
  const pixels = seeded(w, h);
  const outputs = [];
  for (const slicing of ["row", "seven", "whole"]) {
    const ui = load();
    const job = ui.api.createNaniteMetalJob(picture(pixels), 5, 9, w, h, undefined, { silhouette: true });
    assert.ok(job);
    const steps = run(job, slicing, ui);
    if (slicing === "row") assert.equal(steps, h);
    if (slicing === "seven") assert.ok(steps > 2 && steps < h, "several rows per slice");
    if (slicing === "whole") assert.equal(steps, 1);
    const result = job.commit();
    assert.equal(job.commit(), result, "idempotent");
    assert.deepEqual(Object.keys(result), ["metal", "silhouette"]);
    assert.deepEqual(ui.calls.draw[0], [5, 9, w, h, 0, 0, w, h]);
    assert.equal(ui.calls.read, 1);
    assert.equal(ui.calls.composite, 0, "no composite operations");
    outputs.push(result);
  }
  for (const result of outputs.slice(1)) {
    assert.deepEqual(result.metal.pixels, outputs[0].metal.pixels);
    assert.deepEqual(result.silhouette.pixels, outputs[0].silhouette.pixels);
  }
  const { metal, silhouette } = outputs[0];
  const { api } = load();
  for (let y = 0; y < h; y += 1)
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const A = pixels[i + 3];
      assert.equal(metal.pixels[i + 3], A, "alpha identity");
      assert.equal(silhouette.pixels[i + 3], A, "silhouette alpha identity");
      if (!A) {
        assert.deepEqual(Array.from(metal.pixels.subarray(i, i + 4)), [0, 0, 0, 0]);
        continue;
      }
      assert.deepEqual(Array.from(silhouette.pixels.subarray(i, i + 3)), [6, 10, 18]);
      const hgt = api.naniteHexHeight(x + 0.5, y + 0.5);
      const lit = api.naniteHexLight(x + 0.5, y + 0.5);
      const at = (xx, yy) => (xx < 0 || yy < 0 || xx >= w || yy >= h ? 0 : pixels[(yy * w + xx) * 4 + 3]);
      const rim = Math.max(-1, Math.min(1, ((-(at(x + 1, y) - at(x - 1, y)) - (at(x, y + 1) - at(x, y - 1))) / 255) * 0.9));
      const v = (26 + 150 * luma(pixels, i)) * (0.74 + 0.26 * hgt) + 34 * lit + 70 * rim;
      assert.deepEqual(
        Array.from(metal.pixels.subarray(i, i + 3)),
        [byte(v * 0.92), byte(v * 0.97 + 4 * hgt), byte(v * 1.06 + 10 * hgt)],
      );
    }
});

test("the guide's hologram is scan-lined ice and its walls only stand on the opaque, bright rails", () => {
  const [w, h] = [24, 30];
  const pixels = seeded(w, h, 0xbadc0de);
  const guide = { ...picture(pixels), width: w, height: h };
  const results = ["row", "seven", "whole"].map((slicing) => {
    const ui = load();
    const job = ui.api.createNaniteGuideJob(guide, undefined, { walls: true });
    run(job, slicing, ui);
    assert.equal(ui.calls.composite, 0);
    return job.commit();
  });
  for (const result of results.slice(1)) {
    assert.deepEqual(result.holo.pixels, results[0].holo.pixels);
    assert.deepEqual(result.walls.pixels, results[0].walls.pixels);
  }
  const { holo, walls } = results[0];
  assert.equal(holo.width, w);
  assert.equal(walls.height, h);
  const rows = [0, 0];
  const counts = [0, 0];
  for (let y = 0; y < h; y += 1)
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const A = pixels[i + 3];
      const L = luma(pixels, i);
      const scan = y % 3 === 2 ? 0.22 : 1;
      assert.equal(holo.pixels[i + 3], byte(A * (0.35 + 0.65 * L) * scan), "holo alpha");
      if (A) assert.deepEqual(Array.from(holo.pixels.subarray(i, i + 3)), [byte(40 + 186 * L), byte(150 + 100 * L), byte(200 + 55 * L)]);
      const k = Math.max(0, Math.min(1, (L - 0.3) / 0.25));
      assert.equal(walls.pixels[i + 3], A > 160 ? byte(A * k) : 0, "walls alpha");
      if (walls.pixels[i + 3]) assert.deepEqual(Array.from(walls.pixels.subarray(i, i + 3)), [92, 60, 22]);
      rows[y % 3 === 2 ? 1 : 0] += holo.pixels[i + 3];
      counts[y % 3 === 2 ? 1 : 0] += 1;
    }
  assert.ok(rows[1] / counts[1] < 0.4 * (rows[0] / counts[0]), "the scan lines are darker");
  const plain = load();
  const job = plain.api.createNaniteGuideJob(guide);
  job.step(Infinity);
  assert.deepEqual(Object.keys(job.commit()), ["holo"], "walls only when asked");
});

test("molten gold runs the white-hot ramp; its alpha is the source's times the mask's", () => {
  const [w, h] = [16, 12];
  const pixels = seeded(w, h, 0x601d);
  const mask = seeded(w, h, 0x3a5c);
  for (const withMask of [false, true]) {
    const outputs = ["row", "seven", "whole"].map((slicing) => {
      const ui = load();
      const job = ui.api.createNaniteMoltenJob(picture(pixels), 3, 4, w, h, undefined, withMask ? { mask: picture(mask) } : {});
      run(job, slicing, ui);
      assert.equal(ui.calls.read, withMask ? 2 : 1);
      if (withMask) assert.deepEqual(ui.calls.draw[1], [3, 4, w, h, 0, 0, w, h], "the mask at the same region");
      return job.commit().molten;
    });
    assert.deepEqual(outputs[1].pixels, outputs[0].pixels);
    assert.deepEqual(outputs[2].pixels, outputs[0].pixels);
    const molten = outputs[0];
    const stops = [
      [0, 120, 52, 10],
      [0.4, 236, 140, 40],
      [0.7, 255, 210, 120],
      [1, 255, 250, 236],
    ];
    for (let i = 0; i < pixels.length; i += 4) {
      const A = pixels[i + 3];
      assert.equal(molten.pixels[i + 3], withMask ? byte((A * mask[i + 3]) / 255) : A);
      if (!A) continue;
      const t = Math.min(1, 0.25 + 0.85 * luma(pixels, i));
      const k = stops.findIndex(([at], index) => index > 0 && t <= at);
      const [t0, ...c0] = stops[k - 1];
      const [t1, ...c1] = stops[k];
      const u = (t - t0) / (t1 - t0);
      assert.deepEqual(
        Array.from(molten.pixels.subarray(i, i + 3)),
        c0.map((v, c) => byte(v + (c1[c] - v) * u)),
      );
    }
  }
});

test("the jobs publish nothing partial, cancel only what they own, and fall back to null", () => {
  const ui = load();
  const job = ui.api.createNaniteMetalJob(picture(seeded(4, 5)), 0, 0, 4, 5);
  assert.equal(job.step(-1), false);
  job.cancel();
  assert.equal(job.commit(), null);
  assert.equal(job.step(Infinity), true);
  assert.ok(ui.canvases.every((canvas) => canvas.width === 0), "owned canvases released");
  const done = load();
  const finished = done.api.createNaniteMoltenJob(picture(seeded(4, 5)), 0, 0, 4, 5);
  finished.step(Infinity);
  const result = finished.commit();
  finished.cancel();
  assert.equal(result.molten.width, 4, "cancel never destroys a published result");
  const failing = load();
  failing.failReads();
  assert.equal(failing.api.createNaniteGuideJob({ ...picture(seeded(4, 5)), width: 4, height: 5 }), null);
  assert.ok(failing.canvases.every((canvas) => canvas.width === 0));
  assert.equal(load().api.createNaniteMetalJob(picture(seeded(4, 5)), 0, 0, 4, 5, null), null);
  assert.equal(load().api.createNaniteMetalJob(picture(seeded(4, 5)), 0, 0, NaN, 5), null);
  assert.equal(load().api.createNaniteGuideJob(null), null);
});

test("the declarations name every nanite job and the pure relief", () => {
  for (const name of ["createNaniteMetalJob", "createNaniteGuideJob", "createNaniteMoltenJob", "naniteHexHeight", "naniteHexLight"]) {
    assert.match(source, new RegExp(`export function ${name}\\(`));
    assert.match(types, new RegExp(`export function ${name}\\(`));
  }
  const jobs = source.slice(source.indexOf("\n// --- The nanite kit"));
  assert.doesNotMatch(jobs, /globalCompositeOperation|filter\s*=|setTimeout|Math\.random/);
});
