import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/components/cinematic/opening-gl.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const natural = { width: 1536, height: 1024 };
const url = "https://example.test/prism.webp";
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

function runtime({ displayed = [], decode, bitmapFails = false } = {}) {
  const created = [];
  const bitmaps = [];
  const exports = {};
  class Image {
    naturalWidth = 1536;
    naturalHeight = 1024;
    constructor() { created.push(this); }
    decode() { return decode?.(this) ?? Promise.resolve(); }
  }
  runInNewContext(code, {
    exports, URL, Image,
    document: { baseURI: "https://example.test/", images: displayed },
    require: () => ({}),
    fetch: () => { throw new Error("Texture preparation must not refetch image bytes"); },
    createImageBitmap: async (image, options) => {
      if (bitmapFails) throw new Error("Bitmap resize unsupported");
      const bitmap = { width: options.resizeWidth ?? image.naturalWidth, height: options.resizeHeight ?? image.naturalHeight };
      bitmaps.push({ image, options, bitmap });
      return bitmap;
    },
  });
  return { load: exports.loadGlImage, created, bitmaps };
}

test("a decoded responsive title candidate supplies independently owned premultiplied textures", async () => {
  const displayed = { currentSrc: url, src: "/fallback.webp", complete: true, naturalWidth: 358, naturalHeight: 239, decode: async () => {} };
  const r = runtime({ displayed: [displayed] });
  const [burn, dive] = await Promise.all([r.load(url, natural, 716), r.load(url, natural, 1024)]);
  assert.equal(r.created.length, 0);
  assert.equal(r.bitmaps.length, 2);
  assert.notEqual(burn.source, dive.source, "one renderer closing its bitmap cannot invalidate the other");
  assert.ok(r.bitmaps.every((b) => b.image === displayed));
  assert.equal(r.bitmaps[0].options.premultiplyAlpha, "premultiply");
  assert.equal(r.bitmaps[0].options.resizeQuality, "low");
  assert.equal(burn.width, 716);
  assert.equal(burn.height, 477, "use the source aspect, not density-corrected naturalWidth");
  assert.equal(dive.width, 1024);
});

test("a bitmap fallback reuses the decoded image instead of issuing a second request", async () => {
  const r = runtime({ bitmapFails: true });
  const texture = await r.load("/world.webp", natural, 1024);
  assert.equal(r.created.length, 1);
  assert.equal(texture.source, r.created[0]);
  assert.equal(r.created[0].src, "https://example.test/world.webp");
  assert.equal(r.created[0].crossOrigin, undefined, "same-origin poster retains its normal image-cache key");
  assert.equal(texture.width, 1536);
});

test("a borrowed responsive layer is never retained by the bitmap fallback", async () => {
  const displayed = { currentSrc: url, crossOrigin: "anonymous", complete: true, naturalWidth: 358, naturalHeight: 239, decode: async () => {} };
  const r = runtime({ displayed: [displayed], bitmapFails: true });
  const texture = await r.load(url, natural, 1024);
  assert.equal(r.created.length, 1);
  assert.notEqual(texture.source, displayed);
  assert.equal(texture.source, r.created[0]);
  assert.equal(texture.source.crossOrigin, "anonymous", "match the live layer cache mode");
  assert.equal(texture.source.src, url);
  assert.equal(texture.source.srcset, undefined);
  assert.equal(texture.width, 1536, "fallback width is not density-corrected");
});

test("a tainted foreign DOM image cannot bypass anonymous CORS", async () => {
  const remote = "https://art.example.test/prism.webp";
  const displayed = { currentSrc: remote, crossOrigin: null, complete: true, naturalWidth: 1536, decode: async () => { throw new Error("not CORS safe"); } };
  const r = runtime({ displayed: [displayed] });
  await r.load(remote, natural, 1024);
  assert.equal(r.created.length, 1);
  assert.equal(r.created[0].crossOrigin, "anonymous");
  assert.notEqual(r.bitmaps[0].image, displayed);
});

test("concurrent preparations share only pending decoding, then release the image reference", async () => {
  const decoding = deferred();
  const r = runtime({ decode: () => decoding.promise });
  const a = r.load("/world.webp", natural, 640);
  const b = r.load("/world.webp", natural, 960);
  assert.equal(r.created.length, 1);
  decoding.resolve();
  await Promise.all([a, b]);
  await r.load("/world.webp", natural, 960);
  assert.equal(r.created.length, 2, "no settled module cache retains detached nodes or decoded images");
});

test("failed image decoding is released so a later preparation can retry", async () => {
  let failed = true;
  const r = runtime({ decode: () => failed ? Promise.reject(new Error("network")) : Promise.resolve() });
  await assert.rejects(r.load("/world.webp", natural, 640), /network/);
  failed = false;
  await r.load("/world.webp", natural, 640);
  assert.equal(r.created.length, 2);
});

test("a responsive candidate changed during decode is not uploaded as the requested texture", async () => {
  const displayed = { currentSrc: url, complete: true, naturalWidth: 358, naturalHeight: 239,
    decode: async () => { displayed.currentSrc = "https://example.test/other-density.webp"; } };
  const r = runtime({ displayed: [displayed] });
  await r.load(url, natural, 640);
  assert.equal(r.created.length, 1);
  assert.equal(r.created[0].src, url);
  assert.notEqual(r.bitmaps[0].image, displayed);
});

test("a replaced layer or failed decode falls back without mutating the DOM image", async () => {
  const displayed = { currentSrc: url, complete: true, naturalWidth: 358,
    decode: async () => { throw new Error("layer replaced"); } };
  const r = runtime({ displayed: [displayed] });
  await r.load(url, natural, 640);
  assert.equal(r.created.length, 1);
  assert.equal(displayed.currentSrc, url);
  assert.equal(displayed.src, undefined);
});

test("cross-origin texture requests retain anonymous CORS", async () => {
  const r = runtime();
  await r.load("https://art.example.test/prism.webp", natural, 640);
  assert.equal(r.created[0].crossOrigin, "anonymous");
});

test("a matching fallback src is not mistaken for a different currentSrc", async () => {
  const displayed = { currentSrc: "https://example.test/low.webp", src: url, complete: true, naturalWidth: 320,
    decode: async () => { throw new Error("should not decode wrong candidate"); } };
  const r = runtime({ displayed: [displayed] });
  await r.load(url, natural, 640);
  assert.equal(r.created.length, 1);
  assert.equal(r.created[0].src, url);
});
