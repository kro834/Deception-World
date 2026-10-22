import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { supportsCpuPreparation } from "../src/lib/rexonance-unlit.js";

const engine = readFileSync(new URL("../src/lib/rexonance-resonance.js", import.meta.url), "utf8");

test("readback composites choose CPU backing before their first draw; live sheets do not", () => {
  const sheets = [...engine.matchAll(/makeSheet\("([^"]+)"(, true)?\)/g)];
  assert.deepEqual(
    sheets.filter((m) => m[2]).map((m) => m[1]),
    ["driver-sheet", "gold-raw-sheet", "gold-art-sheet", "base-raw-sheet"],
  );
  const factory = engine.slice(
    engine.indexOf("const makeSheet ="),
    engine.indexOf("const drawPieces ="),
  );
  assert.match(
    factory,
    /sheet\.height = H;[\s\S]*if \(cpu && cpuPreparation\) sheet\.getContext\("2d", \{ willReadFrequently: true \}\);[\s\S]*return sheet;/,
  );
  const split = engine.slice(
    engine.indexOf("const splitLightsIdle ="),
    engine.indexOf("const pixelJobIdle ="),
  );
  assert.match(
    split,
    /createSplitLightsJob\(source, 0, 0, W, H, document, \{\s*\.\.\.options,\s*cpuUnlit: cpuPreparation,/,
  );
  assert.match(
    engine,
    /cpuPreparation = await idleTask\(\(\) => active\(\) && supportsCpuPreparation\(document\)\)/,
  );
  // No extra persistent pixel cache: the existing generation-owned resources
  // are still reset on cancellation, route disposal and static-mode changes.
  assert.match(factory, /resources\.add\(sheet\)/);
  assert.match(
    engine,
    /for \(const resource of resources\) resource\.width = resource\.height = 0/,
  );
});

function backend({ drift = false, unavailable = false, unreadable = false } = {}) {
  const canvases = [];
  let reads = 0;
  const document = {
    createElement(tag) {
      assert.equal(tag, "canvas");
      const canvas = { width: 0, height: 0, cpu: null, pixels: null, source: null };
      const context = {
        canvas,
        createImageData(w, h) {
          return { data: new Uint8ClampedArray(w * h * 4) };
        },
        putImageData(image) {
          canvas.pixels = image.data.slice();
        },
        drawImage(image) {
          canvas.pixels = image.pixels.slice();
          canvas.source = image;
        },
        getImageData() {
          reads++;
          if (unreadable) throw new Error("pixel reads unavailable");
          const data = canvas.pixels.slice();
          if (drift && canvas.source.cpu) data[0] ^= 1;
          return { data };
        },
      };
      canvas.getContext = (kind, options) => {
        assert.equal(kind, "2d");
        canvas.cpu ??= Boolean(options?.willReadFrequently);
        return unavailable ? null : context;
      };
      canvases.push(canvas);
      return canvas;
    },
  };
  return { document, canvases, reads: () => reads };
}

for (const drift of [false, true]) {
  test(`CPU preparation requires exact backend parity (drift=${drift})`, () => {
    const ui = backend({ drift });
    assert.equal(supportsCpuPreparation(ui.document), !drift);
    assert.equal(ui.canvases.length, 5);
    assert.equal(ui.reads(), 2);
    assert.ok(
      ui.canvases.every((c) => c.width === 0 && c.height === 0),
      "release all probe stores",
    );
    assert.equal(supportsCpuPreparation(ui.document), !drift);
    assert.equal(ui.canvases.length, 5, "cache only the document's boolean result");
    assert.equal(ui.reads(), 2, "no repeated GPU probe for new assembly generations");
  });
}

for (const failure of ["unavailable", "unreadable"]) {
  test(`CPU preparation falls back safely when ${failure}`, () => {
    const ui = backend({ [failure]: true });
    assert.equal(supportsCpuPreparation(ui.document), false);
    assert.ok(ui.canvases.every((c) => c.width === 0 && c.height === 0));
    const count = ui.canvases.length;
    assert.equal(supportsCpuPreparation(ui.document), false);
    assert.equal(ui.canvases.length, count);
  });
}

test("CPU preparation is unavailable without a browser document", () => {
  assert.equal(supportsCpuPreparation(null), false);
  assert.equal(supportsCpuPreparation({}), false);
});

test("only byte-compatible CPU preparation uses the larger bounded pixel slice", () => {
  assert.match(engine, /job\.step\(start \+ \(cpuPreparation \? 2\.5 : 1\.5\), deadline\)/);
  assert.equal(engine.match(/done = stepPixels\(job, deadline,/g)?.length, 2);
});
