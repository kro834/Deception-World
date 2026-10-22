import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("../src/lib/rexonance-unlit.js", import.meta.url), "utf8");

// Independent frozen scalar oracle for the original synchronous pass. It
// deliberately does not call the new range loop or either public API.
function originalBytes(pixels) {
  const unlit = Uint8ClampedArray.from(pixels);
  const lights = new Uint8ClampedArray(pixels.length);
  for (let i = 0; i < pixels.length; i += 4) {
    const [red, green, blue, alpha] = pixels.subarray(i, i + 4);
    if (alpha === 0) continue;
    const brightest = Math.max(red, green, blue);
    const darkest = Math.min(red, green, blue);
    const colour = brightest - darkest;
    if (brightest < 70 || colour < brightest * 0.3) continue;
    const sixth =
      brightest === red
        ? ((green - blue) / colour + 6) % 6
        : brightest === green
          ? (blue - red) / colour + 2
          : (red - green) / colour + 4;
    const hue = sixth * 60;
    if (hue >= 12 && hue < 70) continue;
    const share =
      Math.min(1, (colour / brightest - 0.3) / 0.25) * Math.min(1, (brightest - 70) / 60);
    lights.set([red, green, blue, share > 0 ? alpha : 0], i);
    const grey = (0.2126 * red + 0.7152 * green + 0.0722 * blue) * 0.62;
    unlit.set(
      [
        Math.round(red + (grey * 0.92 - red) * share),
        Math.round(green + (grey * 0.97 - green) * share),
        Math.round(blue + (grey * 1.1 - blue) * share),
        alpha,
      ],
      i,
    );
  }
  return { unlit, lights };
}

function randomPixels(width, height) {
  let state = 0x17c0ffee;
  return Uint8ClampedArray.from({ length: width * height * 4 }, (_, i) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return i % 4 === 3 && i % 13 === 0 ? 0 : state >>> 24;
  });
}

function fixture(pixels, width, height, failures = {}) {
  const canvases = [];
  const calls = { draw: [], read: [], create: [], put: [], clock: 0, close: 0 };
  let now = 0;
  // Round 4: the job reads strips, so the fake canvas models regions — the
  // draw snapshots the source's live pixels, reads/puts address rows.
  const image = { pixels, close: () => calls.close++ };
  const document = {
    createElement(tag) {
      assert.equal(tag, "canvas");
      const index = canvases.length;
      if (failures.canvas === index) throw new Error("canvas unavailable");
      const canvas = { width: 0, height: 0, pixels: null };
      const context = {
        drawImage(...args) {
          calls.draw.push(args);
          if (failures.draw) throw new Error("closed bitmap");
          if (args[0].pixels) canvas.pixels = Uint8ClampedArray.from(args[0].pixels);
        },
        clearRect() {
          canvas.pixels = null;
        },
        getImageData(...args) {
          calls.read.push(args);
          if (failures.read) throw new Error("tainted snapshot");
          const [, y, w, h] = args;
          const data = (canvas.pixels ?? new Uint8ClampedArray(pixels.length)).slice(
            y * width * 4,
            (y + h) * width * 4,
          );
          if (failures.omitImageDataWidth) return { data };
          return { width: w, height: h, data };
        },
        createImageData(...args) {
          calls.create.push(args);
          if (failures.create) throw new Error("allocation failed");
          const [w, h] = args;
          return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
        },
        // Only the dirty rectangle's rows land, as with the native put (the
        // job puts whole rows; sweep 2: the unlit canvas's strips come from
        // the one whole read, the lights' from a strip buffer).
        putImageData(data, dx, dy, dirtyX = 0, dirtyY = 0, dirtyW = width, dirtyH = undefined) {
          const rowBytes = width * 4;
          const rows = dirtyH ?? data.data.length / rowBytes;
          calls.put.push({ index, args: [dx, dy, dirtyX, dirtyY, dirtyW, rows] });
          if (failures.put === index) throw new Error("lost drawing context");
          assert.deepEqual([dx, dirtyX, dirtyW], [0, 0, width], "whole rows");
          canvas.pixels ??= new Uint8ClampedArray(pixels.length);
          canvas.pixels.set(
            data.data.subarray(dirtyY * rowBytes, (dirtyY + rows) * rowBytes),
            (dy + dirtyY) * rowBytes,
          );
        },
      };
      canvas.getContext = (kind, options) => {
        assert.equal(kind, "2d");
        if (index === 0) {
          assert.equal(options.willReadFrequently, true);
          assert.equal(Object.keys(options).join(","), "willReadFrequently");
        }
        return failures.context === index ? null : context;
      };
      canvases.push(canvas);
      return canvas;
    },
  };
  const runtime = {
    document,
    performance: {
      now() {
        calls.clock++;
        return (now += 2);
      },
    },
  };
  runInNewContext(
    source.replaceAll("export function ", "function ") +
      "\nglobalThis.api = { splitLights, createSplitLightsJob };",
    runtime,
  );
  return { api: runtime.api, calls, image, document, canvases, now: () => now };
}

// Round 4 (phased split): besides one step per row, a job of one strip takes
// one upload step per canvas, and (sweep 2) one step for the snapshot and its
// one whole read-back.
const PHASES = 3;

function assertBytes(result, expected) {
  assert.ok(result);
  assert.deepEqual(result.unlit.pixels, expected.unlit);
  assert.deepEqual(result.lights.pixels, expected.lights);
}

test("synchronous compatibility preserves every original byte across seeded RGBA", () => {
  const width = 64;
  const height = 97;
  const pixels = randomPixels(width, height);
  const expected = originalBytes(pixels);
  const ui = fixture(pixels, width, height);
  assertBytes(ui.api.splitLights(ui.image, 11, 13, width, height), expected);
  assert.deepEqual(ui.calls.draw[0], [ui.image, 11, 13, width, height, 0, 0, width, height]);
  // Sweep 2: the snapshot is the one draw; the outputs are put, never copied.
  assert.equal(ui.calls.draw.length, 1, "one snapshot, no output copies");
  assert.deepEqual(ui.calls.read, [[0, 0, width, height]]);
  assert.deepEqual(ui.calls.create, [[width, height]]);
  assert.equal(ui.calls.put.length, 2);
  assert.deepEqual(
    ui.calls.put.map(({ index }) => index),
    [1, 2],
    "straight into the unlit and light canvases",
  );
  assert.equal(ui.calls.clock, 0, "the synchronous API requires no scheduler or clock");
  assert.equal(ui.calls.close, 0);
});

test("ImageData without width uses the requested row size and synchronous compatibility terminates", () => {
  const width = 5;
  const height = 7;
  const pixels = randomPixels(width, height);
  const expected = originalBytes(pixels);
  const synchronous = fixture(pixels, width, height, { omitImageDataWidth: true });
  assertBytes(synchronous.api.splitLights(synchronous.image, 0, 0, width, height), expected);
  assert.equal(synchronous.calls.clock, 0);
  const sliced = fixture(pixels, width, height, { omitImageDataWidth: true });
  const job = sliced.api.createSplitLightsJob(sliced.image, 0, 0, width, height);
  for (let step = 0; step < height + PHASES; step++)
    assert.equal(job.step(-1), step === height + PHASES - 1);
  assertBytes(job.commit(), expected);
});

for (const width of [NaN, Infinity, -Infinity]) {
  test(`missing ImageData width and nonfinite requested width ${String(width)} safely return null`, () => {
    const ui = fixture(randomPixels(3, 4), 3, 4, { omitImageDataWidth: true });
    assert.equal(ui.api.splitLights(ui.image, 0, 0, width, 4), null);
    assert.ok(ui.canvases.every((canvas) => canvas.width === 0));
    assert.equal(ui.calls.put.length, 0);
  });
}

test("the real 1024 by 866 preparation region stays byte-identical across bounded row slices", () => {
  const width = 1024;
  const height = 866;
  const pixels = randomPixels(width, height);
  const expected = originalBytes(pixels);
  const ui = fixture(pixels, width, height);
  const job = ui.api.createSplitLightsJob(ui.image, 0, 0, width, height);
  let slices = 0;
  while (!job.step(ui.now() + 6)) assert.ok(++slices < height);
  assert.ok(slices > 1, "the full-size pixel pass genuinely yields");
  assertBytes(job.commit(), expected);
  // Sweep 2: read back once, whole; four 248-row strips, each uploaded per canvas.
  assert.deepEqual(ui.calls.read, [[0, 0, width, height]]);
  assert.equal(ui.calls.put.length, 8);
  assert.ok(ui.calls.put.every(({ args }) => args[5] <= 248));
});

test("known cyan, blue and pink pixels become cold monochrome and restore their original light bytes", () => {
  const pixels = Uint8ClampedArray.from([0, 255, 255, 128, 0, 0, 255, 255, 255, 0, 255, 64]);
  const ui = fixture(pixels, 3, 1);
  const result = ui.api.splitLights(ui.image, 0, 0, 3, 1);
  assert.deepEqual(
    Array.from(result.unlit.pixels),
    [115, 121, 137, 128, 11, 11, 13, 255, 41, 44, 50, 64],
  );
  assert.deepEqual(result.lights.pixels, pixels);
});

test("transparent, threshold, gold, bronze and light-colour boundaries retain original bytes", () => {
  const pixels = Uint8ClampedArray.from(
    [
      [0, 255, 255, 0],
      [0, 255, 255, 128],
      [69, 0, 69, 255],
      [70, 0, 70, 255],
      [100, 70, 100, 255],
      [100, 71, 100, 255],
      [200, 40, 0, 255], // Exactly hue 12: kept gold.
      [200, 39, 0, 255], // Just below hue 12: light colour.
      [150, 180, 0, 255], // Exactly hue 70: light colour.
      [151, 180, 0, 255], // Just below hue 70: kept gold.
      [200, 160, 30, 255],
      [140, 75, 25, 255],
      [10, 20, 255, 255],
      [200, 30, 255, 127],
      [255, 20, 130, 64],
      [250, 250, 250, 255],
    ].flat(),
  );
  const expected = originalBytes(pixels);
  const ui = fixture(pixels, 4, 4);
  const job = ui.api.createSplitLightsJob(ui.image, 0, 0, 4, 4);
  for (let step = 0; step < 4 + PHASES; step++) assert.equal(job.step(-1), step === 3 + PHASES);
  assertBytes(job.commit(), expected);
  for (const index of [8, 9, 10, 11, 20, 21, 22, 23, 24, 25, 26, 27, 36, 37, 38, 39])
    assert.equal(expected.unlit[index], pixels[index], `preserved boundary byte ${index}`);
});

for (const slicing of ["one-row", "six-ms", "idle-expired", "infinite"]) {
  test(`${slicing} slices produce byte-identical outputs with one setup and no partial publication`, () => {
    const width = 23;
    const height = 31;
    const pixels = randomPixels(width, height);
    const ui = fixture(pixels, width, height);
    const job = ui.api.createSplitLightsJob(ui.image, 0, 0, width, height);
    assert.ok(job);
    assert.equal(job.commit(), null);
    assert.equal(ui.calls.put.length, 0);
    let done = false;
    let slices = 0;
    while (!done) {
      assert.ok(++slices <= height + PHASES, "an expired budget still advances one phase or row");
      const until = slicing === "one-row" ? -1 : slicing === "six-ms" ? ui.now() + 6 : Infinity;
      const idle = slicing === "idle-expired" ? { timeRemaining: () => 0 } : undefined;
      const before = ui.now();
      done = job.step(until, idle);
      if (slicing === "six-ms") assert.ok(ui.now() - before <= 6);
      if (!done) assert.equal(job.commit(), null, "incomplete work cannot expose either canvas");
      // (Round 4: the uploads are steps of their own, published only by commit.)
    }
    if (slicing === "one-row" || slicing === "idle-expired") assert.equal(slices, height + PHASES);
    if (slicing === "infinite") assert.equal(slices, 1);
    assertBytes(job.commit(), originalBytes(pixels));
    assert.equal(ui.calls.draw.length, 1);
    assert.equal(ui.calls.read.length, 1);
    assert.equal(ui.calls.create.length, 1);
    assert.equal(ui.calls.put.length, 2);
    assert.equal(ui.calls.close, 0);
  });
}

test("committing twice is idempotent and cancellation does not destroy published canvases", () => {
  const pixels = randomPixels(5, 7);
  const ui = fixture(pixels, 5, 7);
  const job = ui.api.createSplitLightsJob(ui.image, 0, 0, 5, 7);
  assert.equal(job.step(Infinity), true);
  const result = job.commit();
  job.cancel();
  assert.equal(job.commit(), result);
  assert.equal(job.step(-1), true);
  assert.equal(ui.calls.put.length, 2);
  assert.equal(result.unlit.width, 5);
  assert.equal(result.lights.width, 5);
  assertBytes(result, originalBytes(pixels));
});

// (Round 4: the snapshot is the first step's, no longer setup's.)
test("the first step takes one immutable snapshot even if the borrowed source pixels later change", () => {
  const pixels = randomPixels(5, 7);
  const expected = originalBytes(pixels);
  const ui = fixture(pixels, 5, 7);
  const job = ui.api.createSplitLightsJob(ui.image, 9, 4, 5, 7);
  assert.equal(ui.calls.draw.length, 0, "setup only makes the canvases");
  assert.equal(job.step(-1), false);
  assert.deepEqual(ui.calls.draw[0], [ui.image, 9, 4, 5, 7, 0, 0, 5, 7]);
  pixels.fill(0);
  assert.equal(job.step(Infinity), true);
  assertBytes(job.commit(), expected);
  assert.equal(ui.calls.read.length, 1);
  assert.equal(ui.calls.close, 0);
});

for (const started of [false, true]) {
  test(`cancellation ${started ? "after a row" : "before any rows"} releases only owned resources`, () => {
    const ui = fixture(randomPixels(5, 7), 5, 7);
    const job = ui.api.createSplitLightsJob(ui.image, 0, 0, 5, 7);
    if (started) assert.equal(job.step(-1), false);
    job.cancel();
    const before = JSON.stringify(ui.calls);
    job.cancel();
    assert.equal(job.step(Infinity), true);
    assert.equal(job.commit(), null);
    assert.equal(JSON.stringify(ui.calls), before);
    assert.deepEqual(
      ui.canvases.map((canvas) => canvas.width),
      [0, 0, 0],
    );
    assert.equal(ui.calls.close, 0);
  });
}

// (Round 4: a closed bitmap, a tainted read or a failed allocation now
// fails a step — terminal, null commit — instead of setup.)
for (const failures of [{ canvas: 0 }, { canvas: 1 }, { context: 0 }]) {
  test(`unavailable setup returns null and keeps the decoded source borrowed: ${JSON.stringify(failures)}`, () => {
    const ui = fixture(randomPixels(3, 4), 3, 4, failures);
    assert.equal(ui.api.createSplitLightsJob(ui.image, 0, 0, 3, 4), null);
    assert.ok(ui.canvases.every((canvas) => canvas.width === 0));
    assert.equal(ui.calls.put.length, 0);
    assert.equal(ui.calls.close, 0);
  });
}

for (const failures of [
  { draw: true },
  { read: true },
  { create: true },
  { context: 1 },
  { context: 2 },
  { put: 1 },
  { put: 2 },
]) {
  test(`an unavailable phase commits null with no partial result and remains terminal: ${JSON.stringify(failures)}`, () => {
    const ui = fixture(randomPixels(3, 4), 3, 4, failures);
    const job = ui.api.createSplitLightsJob(ui.image, 0, 0, 3, 4);
    assert.ok(job);
    assert.equal(job.step(Infinity), true);
    assert.equal(job.commit(), null);
    if (failures.draw || failures.read || failures.create) assert.equal(ui.calls.put.length, 0);
    const before = JSON.stringify(ui.calls);
    assert.equal(job.step(Infinity), true);
    assert.equal(job.commit(), null);
    job.cancel();
    assert.equal(JSON.stringify(ui.calls), before);
    assert.deepEqual(
      ui.canvases.map((canvas) => canvas.width),
      [0, 0, 0],
    );
    assert.equal(ui.calls.close, 0);
  });
}

test("a broken deadline settles safely instead of stranding private image buffers", () => {
  const ui = fixture(randomPixels(3, 4), 3, 4);
  const job = ui.api.createSplitLightsJob(ui.image, 0, 0, 3, 4);
  assert.equal(
    job.step(Infinity, {
      timeRemaining() {
        throw new Error("host deadline invalidated");
      },
    }),
    true,
  );
  assert.equal(job.commit(), null);
  assert.deepEqual(
    ui.canvases.map((canvas) => canvas.width),
    [0, 0, 0],
  );
});

test("absent documents and synchronous setup or commit failure preserve null fallback", () => {
  const ui = fixture(randomPixels(3, 4), 3, 4, { put: 1 });
  assert.equal(ui.api.createSplitLightsJob(ui.image, 0, 0, 3, 4, null), null);
  assert.equal(ui.api.splitLights(ui.image, 0, 0, 3, 4), null);
  assert.equal(ui.calls.close, 0);
});

/* ---------- Sweep 2 leftover (F02's treatment for the light split) ----------
   Every readback is a native round trip to the GPU: with a GPU-backed source
   (the scene's driver sheet) each strip read waited for the GPU to drain, and
   the driver's split became the preparation's longest phase while the reader
   scrolled (0.9 s, up to 260 ms a read). The source is now read back once,
   whole, in a step of its own; the strips are shaded from that memory and
   uploaded a strip of one canvas a step. The bytes are 4cd89e2's. */

// A pixel-exact fake canvas: unscaled copies, region reads, dirty-rect puts,
// each native call counted per canvas.
function exactCanvases() {
  const counts = { draw: [], read: [], put: [], create: 0 };
  const canvases = [];
  const document = {
    createElement() {
      const index = canvases.length;
      let width = 0;
      let height = 0;
      const canvas = {
        index,
        data: new Uint8ClampedArray(0),
        get width() {
          return width;
        },
        set width(value) {
          width = value;
          canvas.data = new Uint8ClampedArray(width * height * 4);
        },
        get height() {
          return height;
        },
        set height(value) {
          height = value;
          canvas.data = new Uint8ClampedArray(width * height * 4);
        },
      };
      const context = {
        drawImage(image, sx, sy, sw, sh, dx, dy) {
          counts.draw.push({ index, from: image.index ?? "source" });
          for (let y = 0; y < sh; y += 1)
            canvas.data.set(
              image.data.subarray(
                ((sy + y) * image.width + sx) * 4,
                ((sy + y) * image.width + sx + sw) * 4,
              ),
              ((dy + y) * width + dx) * 4,
            );
        },
        getImageData(x, y, w, h) {
          counts.read.push({ index, rect: [x, y, w, h] });
          const data = new Uint8ClampedArray(w * h * 4);
          for (let row = 0; row < h; row += 1)
            data.set(
              canvas.data.subarray(((y + row) * width + x) * 4, ((y + row) * width + x + w) * 4),
              row * w * 4,
            );
          return { width: w, height: h, data };
        },
        createImageData(w, h) {
          counts.create += 1;
          return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
        },
        putImageData(image, dx, dy, x0, y0, w, h) {
          counts.put.push({ index, top: dy + y0, rows: h, bytes: image.data.length });
          assert.deepEqual([dx, x0, w], [0, 0, width], "whole rows");
          for (let row = 0; row < h; row += 1)
            canvas.data.set(
              image.data.subarray((y0 + row) * image.width * 4, (y0 + row + 1) * image.width * 4),
              (dy + y0 + row) * width * 4,
            );
        },
      };
      canvas.getContext = (_kind, options) => {
        if (!("cpu" in canvas)) canvas.cpu = options?.willReadFrequently === true;
        return context;
      };
      canvases.push(canvas);
      return canvas;
    },
  };
  return { document, counts, canvases };
}

function seededPicture(width, height, seed) {
  let state = seed;
  const data = Uint8ClampedArray.from({ length: width * height * 4 }, (_, i) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const v = state >>> 24;
    // Alpha: a third transparent, some partial, the rest opaque.
    if (i % 4 === 3) return v < 85 ? 0 : v < 140 ? v : 255;
    return v;
  });
  return { width, height, data };
}

function exactApi(clock) {
  const runtime = { performance: { now: clock } };
  runInNewContext(
    source.replaceAll("export function ", "function ") +
      "\nglobalThis.api = { splitLights, createSplitLightsJob };",
    runtime,
  );
  return runtime.api;
}

// The scene's region (REXONANCE_SUIT_SIZE), cut from a larger picture.
const SUIT_W = 571;
const SUIT_H = 1040;
const STRIP = 248;
// 4cd89e2's splitLights on this picture (one read a strip, each canvas
// copied through the snapshot's canvas), on the same exact fake: sha-256.
const SPLIT_GOLDEN = {
  unlit: "5ecc1455482f6b45bd3ffbf5",
  lights: "6a1b4d19ac8e1c897c760cce",
  motes: "36d2e572481c0b62f8bd9793",
};

for (const cpuUnlit of [false, true])
  for (const motes of [false, true])
    for (const slicing of ["one-row", "idle-expired", "six-ms", "idle-period", "infinite"]) {
      test(`the light split reads its source back once, whole, and uploads a strip a step (cpu=${cpuUnlit}, ${motes ? "with motes, " : ""}${slicing})`, () => {
        let now = 0;
        const api = exactApi(() => (now += 0.5));
        const fake = exactCanvases();
        const picture = seededPicture(600, 1100, 0x5eed1234);
        const job = api.createSplitLightsJob(picture, 11, 13, SUIT_W, SUIT_H, fake.document, {
          motes,
          cpuUnlit,
        });
        const layers = motes ? 3 : 2;
        const strips = Math.ceil(SUIT_H / STRIP);
        // Setup only makes the canvases.
        assert.equal(fake.counts.draw.length + fake.counts.read.length + fake.counts.put.length, 0);
        let steps = 0;
        let done = false;
        while (!done) {
          steps += 1;
          assert.ok(steps <= 1 + SUIT_H + strips * layers, "an expired budget still advances");
          const reads = fake.counts.read.length;
          const puts = fake.counts.put.length;
          const before = now;
          if (slicing === "one-row") done = job.step(-1);
          else if (slicing === "idle-expired")
            done = job.step(Infinity, { timeRemaining: () => 0 });
          else if (slicing === "six-ms") {
            done = job.step(now + 6);
            assert.ok(now - before <= 6, `${now - before} ms`);
          } else if (slicing === "idle-period") {
            // A 12 ms idle period: the deadline's granularity (the rows stop
            // once less than 2 ms remain; each look at the deadline takes time).
            const end = now + 12;
            done = job.step(Infinity, {
              timeRemaining: () => Math.max(0, end - (now += 0.5)),
            });
            assert.ok(now - before <= 12, `${now - before} ms`);
          } else done = job.step(Infinity);
          if (steps === 1) {
            // The first step: the snapshot and its one whole read.
            assert.deepEqual(fake.counts.read, [{ index: 0, rect: [0, 0, SUIT_W, SUIT_H] }]);
            assert.deepEqual(fake.counts.draw, [{ index: 0, from: "source" }]);
            if (slicing === "one-row" || slicing === "idle-expired" || slicing === "six-ms")
              assert.equal(fake.counts.put.length, 0, "the read is a step of its own");
          } else {
            assert.equal(fake.counts.read.length, reads, "no later step reads back");
            // (A live idle period runs phases on while it lasts.)
            if (slicing === "one-row" || slicing === "idle-expired" || slicing === "six-ms")
              assert.ok(fake.counts.put.length - puts <= 1, "one strip of one canvas a step");
          }
          if (!done) assert.equal(job.commit(), null, "an unfinished pass publishes nothing");
        }
        const result = job.commit();
        assert.ok(result);
        assert.equal(result.unlit.cpu, cpuUnlit, "only the intermediate opts into CPU backing");
        assert.equal(result.lights.cpu, false, "draw-only overlay keeps default backing");
        if (motes) assert.equal(result.motes.cpu, false);
        // One read for the one source, one draw (the snapshot, never a copy of
        // an output), and a put per strip and canvas, each a strip of rows.
        assert.equal(fake.counts.read.length, 1);
        assert.equal(fake.counts.draw.length, 1);
        assert.equal(fake.counts.create, layers - 1, "one strip buffer per derived layer");
        assert.equal(fake.counts.put.length, strips * layers);
        const targets = motes ? ["unlit", "lights", "motes"] : ["unlit", "lights"];
        for (const [k, name] of targets.entries()) {
          const puts = fake.counts.put.filter((put) => put.index === result[name].index);
          assert.equal(puts.length, strips, `${name}: one put a strip`);
          let top = 0;
          for (const put of puts) {
            assert.equal(put.top, top, `${name}: the strips in order, none twice`);
            assert.ok(put.rows > 0 && put.rows <= STRIP, `${name}: ${put.rows} rows`);
            top += put.rows;
            // The lights' and motes' buffers are a strip, never a whole layer.
            if (k) assert.ok(put.bytes <= STRIP * SUIT_W * 4);
          }
          assert.equal(top, SUIT_H, `${name}: every row`);
        }
        assert.ok(
          fake.counts.put.every((put) => put.index !== 0),
          "nothing goes through the snapshot's canvas",
        );
        // The slices genuinely yield (except the whole pass at once).
        if (slicing === "infinite") assert.equal(steps, 1);
        else assert.ok(steps > strips * layers + 1, `${steps} steps`);
        if (slicing === "one-row" || slicing === "idle-expired")
          assert.equal(steps, 1 + SUIT_H + strips * layers);
        // 4cd89e2's bytes, whatever the slices.
        for (const name of targets)
          assert.equal(
            createHash("sha256").update(result[name].data).digest("hex").slice(0, 24),
            SPLIT_GOLDEN[name],
            name,
          );
        // The snapshot's canvas is released once the region is in memory.
        assert.equal(fake.canvases[0].width, 0);
        assert.equal(job.commit(), result);
      });
    }

test("the light split's whole read is checked before any row is shaded", () => {
  // A read (or a strip buffer) shorter than the region fails the job at once:
  // null, no canvas published, nothing put.
  for (const short of ["read", "create"]) {
    const fake = exactCanvases();
    const createElement = fake.document.createElement;
    fake.document.createElement = (tag) => {
      const canvas = createElement(tag);
      const context = canvas.getContext("2d");
      const read = context.getImageData;
      const create = context.createImageData;
      const wrapped = {
        ...context,
        getImageData: (x, y, w, h) => (short === "read" ? read(x, y, w, h - 1) : read(x, y, w, h)),
        createImageData: (w, h) => (short === "create" ? create(w, h - 1) : create(w, h)),
      };
      canvas.getContext = () => wrapped;
      return canvas;
    };
    const api = exactApi(() => 0);
    const job = api.createSplitLightsJob(seededPicture(8, 9, 7), 0, 0, 8, 9, fake.document);
    assert.equal(job.step(-1), true, short);
    assert.equal(job.commit(), null, short);
    assert.equal(fake.counts.put.length, 0, short);
    assert.ok(
      fake.canvases.every((canvas) => canvas.width === 0),
      short,
    );
  }
});
