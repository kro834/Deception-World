import assert from "node:assert/strict";
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
  const image = { close: () => calls.close++ };
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
          if (failures.omitImageDataWidth) return { data: Uint8ClampedArray.from(pixels) };
          return { width, height, data: Uint8ClampedArray.from(pixels) };
        },
        createImageData(...args) {
          calls.create.push(args);
          if (failures.create) throw new Error("allocation failed");
          return { width, height, data: new Uint8ClampedArray(pixels.length) };
        },
        putImageData(data, ...args) {
          calls.put.push({ index, args });
          if (failures.put === index) throw new Error("lost drawing context");
          canvas.pixels = Uint8ClampedArray.from(data.data);
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
  assert.equal(ui.calls.draw.length, 3, "one snapshot, two GPU-friendly output copies");
  assert.deepEqual(ui.calls.read, [[0, 0, width, height]]);
  assert.deepEqual(ui.calls.create, [[width, height]]);
  assert.equal(ui.calls.put.length, 2);
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
  for (let row = 0; row < height; row++) assert.equal(job.step(-1), row === height - 1);
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
  assert.equal(ui.calls.read.length, 1);
  assert.equal(ui.calls.put.length, 2);
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
  for (let row = 0; row < 4; row++) assert.equal(job.step(-1), row === 3);
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
      assert.ok(++slices <= height, "an expired budget still advances one complete row");
      const until = slicing === "one-row" ? -1 : slicing === "six-ms" ? ui.now() + 6 : Infinity;
      const idle = slicing === "idle-expired" ? { timeRemaining: () => 0 } : undefined;
      const before = ui.now();
      done = job.step(until, idle);
      if (slicing === "six-ms") assert.ok(ui.now() - before <= 6);
      if (!done) assert.equal(job.commit(), null, "incomplete work cannot expose either canvas");
      assert.equal(ui.calls.put.length, 0, "row slices do not commit canvas pixels");
    }
    if (slicing === "one-row" || slicing === "idle-expired") assert.equal(slices, height);
    if (slicing === "infinite") assert.equal(slices, 1);
    assertBytes(job.commit(), originalBytes(pixels));
    assert.equal(ui.calls.draw.length, 3);
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

test("setup takes one immutable snapshot even if the borrowed source pixels later change", () => {
  const pixels = randomPixels(5, 7);
  const expected = originalBytes(pixels);
  const ui = fixture(pixels, 5, 7);
  const job = ui.api.createSplitLightsJob(ui.image, 9, 4, 5, 7);
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

for (const failures of [
  { canvas: 0 },
  { canvas: 1 },
  { context: 0 },
  { draw: true },
  { read: true },
  { create: true },
]) {
  test(`unavailable setup returns null and keeps the decoded source borrowed: ${JSON.stringify(failures)}`, () => {
    const ui = fixture(randomPixels(3, 4), 3, 4, failures);
    assert.equal(ui.api.createSplitLightsJob(ui.image, 0, 0, 3, 4), null);
    assert.ok(ui.canvases.every((canvas) => canvas.width === 0));
    assert.equal(ui.calls.put.length, 0);
    assert.equal(ui.calls.close, 0);
  });
}

for (const failures of [{ context: 1 }, { context: 2 }, { put: 0 }]) {
  test(`unavailable commit returns null with no partial result and remains terminal: ${JSON.stringify(failures)}`, () => {
    const ui = fixture(randomPixels(3, 4), 3, 4, failures);
    const job = ui.api.createSplitLightsJob(ui.image, 0, 0, 3, 4);
    assert.ok(job);
    assert.equal(job.step(Infinity), true);
    assert.equal(job.commit(), null);
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
  const ui = fixture(randomPixels(3, 4), 3, 4, { put: 0 });
  assert.equal(ui.api.createSplitLightsJob(ui.image, 0, 0, 3, 4, null), null);
  assert.equal(ui.api.splitLights(ui.image, 0, 0, 3, 4), null);
  assert.equal(ui.calls.close, 0);
});
