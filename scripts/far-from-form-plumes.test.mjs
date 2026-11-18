import assert from "node:assert/strict";
import test from "node:test";

function browser(t) {
  const images = [];
  const connection = { saveData: false };
  const document = { hidden: false, documentElement: { dataset: {} } };
  const media = new Set();
  class Image {
    complete = false;
    naturalWidth = 0;
    decoded = Promise.withResolvers();
    constructor() { images.push(this); }
    decode() { return this.decoded.promise; }
    removeAttribute(name) { delete this[name]; }
  }
  const globals = {
    Image, document, navigator: { connection },
    matchMedia: (query) => ({ matches: query.split(", ").some((q) => media.has(q)) }),
  };
  for (const [key, value] of Object.entries(globals)) {
    const old = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value, configurable: true });
    t.after(() => {
      if (old) Object.defineProperty(globalThis, key, old);
      else delete globalThis[key];
    });
  }
  return { images, connection, document, media };
}

function paint(draw, coarse = true) {
  const blits = [];
  const ctx = {
    globalAlpha: 1, save() {}, restore() {}, transform() {},
    drawImage(...args) { blits.push(args); },
  };
  draw(ctx, "ultra", .4, coarse);
  return blits;
}

test("import and drawing never request a sheet; hidden, reduced, forced-colour, economy and Save-Data sessions skip it", async (t) => {
  const { images, connection, document, media } = browser(t);
  const { warmFarFromFormPlumes: warm, drawFarFromFormPlumes: draw } = await import("../src/lib/far-from-form-plumes.ts");
  assert.deepEqual(paint(draw), []);
  assert.equal(images.length, 0);
  for (const query of ["(prefers-reduced-motion: reduce)", "(forced-colors: active)"]) {
    media.add(query);
    warm()();
    media.delete(query);
  }
  document.hidden = true;
  warm()();
  document.hidden = false;
  connection.saveData = true;
  warm()();
  connection.saveData = false;
  document.documentElement.dataset.worldEffects = "economy";
  warm()();
  assert.equal(images.length, 0);
});

test("card and runway share a download and only draw it once decoded; releasing one lease keeps the other playable", async (t) => {
  const { images } = browser(t);
  const { warmFarFromFormPlumes: warm, drawFarFromFormPlumes: draw } = await import("../src/lib/far-from-form-plumes.ts");
  const runway = warm();
  const card = warm();
  t.after(runway);
  t.after(card);
  assert.equal(images.length, 1);
  const [image] = images;
  assert.equal(image.src, "/far-from-fire-20261118/plumes.webp");
  assert.equal(image.fetchPriority, "low");
  image.complete = true;
  image.naturalWidth = 704;
  assert.deepEqual(paint(draw), []);
  image.decoded.resolve();
  await image.decoded.promise;
  const touch = paint(draw);
  assert.equal(touch.length, 7);
  assert.equal(paint(draw, false).length, 9);
  assert.deepEqual([...new Set(touch.map((args) => Math.floor(args[2] / 352)))].sort(), [0, 1, 2]);
  card();
  card();
  assert.ok(paint(draw).every(([source]) => source === image));
  assert.equal(paint(draw).length, 7);
  runway();
  assert.deepEqual(paint(draw), []);
});

test("a failed lease permits a new attempt, and late completions cannot replace a retriggered sheet", async (t) => {
  const { images } = browser(t);
  const { warmFarFromFormPlumes: warm, drawFarFromFormPlumes: draw } = await import("../src/lib/far-from-form-plumes.ts");
  const runway = warm();
  t.after(runway);
  images[0].decoded.reject(new Error("interrupted"));
  await assert.rejects(images[0].decoded.promise);
  const card = warm();
  t.after(card);
  assert.equal(images.length, 2);
  const interrupted = images[1];
  runway();
  assert.ok(interrupted.src);
  interrupted.complete = true;
  interrupted.naturalWidth = 704;
  card();
  assert.equal(interrupted.src, "");
  const retrigger = warm();
  t.after(retrigger);
  const current = images[2];
  interrupted.decoded.resolve();
  await interrupted.decoded.promise;
  assert.deepEqual(paint(draw), []);
  current.decoded.resolve();
  await current.decoded.promise;
  assert.equal(paint(draw)[0][0], current);
  retrigger();
  assert.deepEqual(paint(draw), []);
});

test("the real combustion renderer paints the body while the optional image stalls or fails", async (t) => {
  const { images } = browser(t);
  const { warmFarFromFormPlumes } = await import("../src/lib/far-from-form-plumes.ts");
  const { drawFarFromFormCombustion } = await import("../src/lib/far-from-form-combustion.ts");
  const release = warmFarFromFormPlumes();
  t.after(release);
  let raster;
  const surface = { getContext: () => ({
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: (image) => { raster = image.data; },
  }) };
  const drawn = [];
  const ctx = {
    canvas: { ownerDocument: { createElement: () => surface } },
    drawImage: (image) => drawn.push(image),
    save() {}, restore() {}, scale() {}, translate() {},
    beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
  };
  const paintBody = () => {
    drawn.length = 0;
    drawFarFromFormCombustion(ctx, "high", .4, 210, 315, true);
    assert.deepEqual(drawn, [surface]);
    const lit = raster.filter((byte, i) => i % 4 === 3 && byte > 75).length;
    assert.ok(lit > raster.length / 4 * .08);
  };
  paintBody();
  images[0].decoded.reject(new Error("network failure"));
  await assert.rejects(images[0].decoded.promise);
  paintBody();
});

test("Ultra's rotating close-up cells enter from both sides in every pair of streams", async (t) => {
  const { images } = browser(t);
  const { warmFarFromFormPlumes: warm } = await import("../src/lib/far-from-form-plumes.ts");
  const { drawFarFromNanoGather } = await import("../src/lib/far-from-ultra-intake.ts");
  t.after(warm());
  images[0].decoded.resolve();
  await images[0].decoded.promise;
  const blits = [];
  const ctx = {
    drawImage: (...args) => blits.push(args),
    beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fillRect() {},
    createRadialGradient: () => ({ addColorStop() {} }),
  };
  for (const coarse of [true, false]) {
    blits.length = 0;
    drawFarFromNanoGather(ctx, .69, coarse);
    // Positions use full-body coordinates. Even while some cells are at the
    // core, the upper, middle and lower inlets all feed it from open air.
    for (const side of [x => x < .18, x => x > .82]) {
      const heights = blits.filter(args => side(args[5])).map(args => args[6]);
      assert.ok(heights.some(y => y < .23), String(heights));
      assert.ok(heights.some(y => y >= .23 && y < .57), String(heights));
      assert.ok(heights.some(y => y >= .57), String(heights));
    }
    const initial = blits.slice();
    drawFarFromNanoGather(ctx, .82, coarse);
    blits.length = 0;
    drawFarFromNanoGather(ctx, .69, coarse);
    assert.deepEqual(blits, initial);
  }
});
