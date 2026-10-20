import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";
import sharp from "sharp";
import ts from "typescript";
import {
  NANITE_FIRE_PHASES,
  naniteFlameEnvelope,
  naniteFlameScatter,
  sampleFlameBirth,
} from "../src/lib/rexonance-ignition.js";

let serial = 0;
const fresh = () => import(`../src/lib/rexonance-flame.js?unit=${serial++}`);
const file = (path) => new URL(`../${path}`, import.meta.url);

function painter({ throwAt = 0 } = {}) {
  const operations = [];
  const states = [];
  let draws = 0;
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
        image.src || image.__qaRole || "fallback",
        ...args,
        this.globalAlpha,
        this.globalCompositeOperation,
      ]);
      draws += 1;
      if (throwAt && draws === throwAt) throw new Error("draw failure");
    },
    fillRect(...args) {
      operations.push(["rect", ...args, this.globalAlpha, this.globalCompositeOperation]);
    },
    scale(...args) {
      operations.push(["scale", ...args]);
    },
    translate(...args) {
      operations.push(["translate", ...args]);
    },
    rotate(...args) {
      operations.push(["rotate", ...args]);
    },
    createLinearGradient() {
      return { addColorStop() {} };
    },
    createRadialGradient() {
      return { addColorStop() {} };
    },
    clearRect(...args) {
      operations.push(["clear", ...args]);
    },
    ellipse(...args) {
      operations.push(["ellipse", ...args]);
    },
    rect(...args) {
      operations.push(["pathRect", ...args]);
    },
    clip() {
      operations.push(["clip"]);
    },
    createImageData(width, height) {
      return { data: new Uint8ClampedArray(width * height * 4) };
    },
    putImageData(pixels) {
      operations.push(["pixels"]);
      this.__qaPixels = pixels.data;
    },
    beginPath() {
      operations.push(["pathStart"]);
    },
    moveTo(...args) {
      operations.push(["move", ...args]);
    },
    bezierCurveTo(...args) {
      operations.push(["curve", ...args]);
    },
    quadraticCurveTo(...args) {
      operations.push(["quadratic", ...args]);
    },
    lineTo(...args) {
      operations.push(["line", ...args]);
    },
    closePath() {
      operations.push(["pathClose"]);
    },
    fill() {
      operations.push(["fill", this.globalAlpha, this.globalCompositeOperation]);
    },
  };
  return { context, operations, states };
}

function fixture() {
  const images = [];
  const canvases = [];
  const document = {
    hidden: false,
    documentElement: { dataset: {} },
    createElement(tag) {
      if (tag === "canvas") {
        const p = painter();
        const canvas = { getContext: () => p.context };
        canvases.push({ canvas, ...p });
        return canvas;
      }
      assert.equal(tag, "img");
      const image = { naturalWidth: 1024, naturalHeight: 1024, decode: () => Promise.resolve() };
      images.push(image);
      return image;
    },
  };
  return {
    images,
    canvases,
    environment: {
      document,
      navigator: { connection: {} },
      matchMedia: () => ({ matches: false }),
    },
  };
}

async function ready(module, fixture) {
  const promise = module.warmNaniteFlame(fixture.environment);
  assert.equal(fixture.images.length, 1);
  fixture.images[0].onload();
  assert.equal(await promise, true);
}

function prepareField(module, f, source = { src: "actual-undersuit" }) {
  const before = f.canvases.length;
  assert.equal(module.prepareBodyFlame(source, { width: 571, height: 1040 }, f.environment), true);
  assert.equal(f.canvases.length - before, 3, "one mask, one field and one prepared density sheet");
  const [mask, field, flow] = f.canvases.slice(-3);
  mask.canvas.__qaRole = "body-mask";
  field.canvas.__qaRole = "body-field";
  flow.canvas.__qaRole = "body-flow";
  for (const surface of [mask, field, flow])
    assert.ok(
      surface.canvas.width * surface.canvas.height * 4 <= 1024 * 1024,
      "bounded preparation surface, including the approved 48px transparent vortex-tip margin",
    );
  return { source, mask, field, flow };
}

function flameRoots(operations) {
  const roots = [];
  for (const row of operations) {
    if (row[0] === "translate") roots.push({ x: row[1], y: row[2], images: [] });
    if (row[0] === "image" && roots.length) roots.at(-1).images.push(row);
  }
  return roots.filter((root) => root.images.length);
}

test("the allocation-optimized prepared density is byte-identical to the approved rendered field", async () => {
  const module = await fresh(),
    f = fixture();
  await ready(module, f);
  const body = prepareField(module, f),
    pixels = body.flow.context.__qaPixels;
  assert.ok(
    pixels instanceof Uint8ClampedArray,
    "inspect actual putImageData RGBA, not source literals or a manifest",
  );
  assert.equal(pixels.length, 384 * 624 * 4);
  assert.equal(
    createHash("sha256").update(pixels).digest("hex"),
    "ec156b05e9d196df405dcc8e8fe49c27922d4f0601b0b5ac8a5cbb3d89904034",
  );
  const before = f.canvases.length;
  assert.equal(
    module.prepareBodyFlame(body.source, { width: 571, height: 1040 }, f.environment),
    true,
  );
  assert.equal(
    f.canvases.length,
    before,
    "the exact approved image is retained rather than rebuilt per appearance",
  );
  assert.equal(body.flow.context.__qaPixels, pixels);
});

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

test("warm-up deduplicates in-flight loads and retains the decoded atlas on return", async () => {
  const module = await fresh();
  const f = fixture();
  assert.equal(module.naniteFlameReady(), false);
  const first = module.warmNaniteFlame(f.environment);
  const second = module.warmNaniteFlame(f.environment);
  assert.equal(first, second, "same pending promise");
  assert.equal(f.images.length, 1);
  assert.equal(f.images[0].src, module.NANITE_FLAME_ATLAS.src);
  assert.equal(f.images[0].fetchPriority, "low", "does not compete with LCP imagery");
  assert.equal(f.images[0].decoding, "async");
  f.images[0].onload();
  assert.equal(await first, true);
  assert.equal(module.naniteFlameReady(), true);
  assert.equal(await module.warmNaniteFlame(f.environment), true);
  assert.equal(f.images.length, 1);
  assert.equal(f.images[0].onload, null);
  assert.equal(f.images[0].onerror, null);
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

for (const fault of ["network", "decode", "decode-throw", "dimensions", "create-throw"]) {
  test(`${fault} failure is safe and cooldown prevents request storms`, async () => {
    const module = await fresh();
    const f = fixture();
    if (fault === "create-throw")
      f.environment.document.createElement = () => {
        throw new Error("no image");
      };
    const pending = module.warmNaniteFlame(f.environment);
    if (fault === "create-throw") {
      /* caught by warm-up, no render-blocking rejection */
    } else if (fault === "network") f.images[0].onerror();
    else {
      if (fault === "decode") f.images[0].decode = () => Promise.reject(new Error("bad decode"));
      if (fault === "decode-throw")
        f.images[0].decode = () => {
          throw new Error("bad decode");
        };
      if (fault === "dimensions") f.images[0].naturalWidth = 1000;
      f.images[0].onload();
    }
    assert.equal(await pending, false);
    assert.equal(await module.warmNaniteFlame(f.environment), false);
    assert.equal(
      f.images.length,
      fault === "create-throw" ? 0 : 1,
      "an immediate revisit cannot refetch a failing sheet",
    );
    assert.equal(module.naniteFlameReady(), false);
  });
}

test("a missing atlas still paints tapered procedural fire once, without repeated canvas allocation", async () => {
  const module = await fresh();
  const f = fixture();
  let canvases = 0;
  const create = f.environment.document.createElement;
  f.environment.document.createElement = (tag) => {
    if (tag === "canvas") canvases++;
    return create(tag);
  };
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: f.environment.document,
  });
  try {
    const first = painter();
    module.drawBodyFlame(first.context, { width: 571, height: 1040 }, 1, 1);
    module.drawNaniteFlame(first.context, [285, 335], 1, 1);
    assert.ok(first.operations.some((row) => row[0] === "image" && row[1] === "fallback"));
    const allocated = canvases;
    assert.ok(allocated > 0 && allocated <= 2);
    const second = painter();
    module.drawBodyFlame(second.context, { width: 571, height: 1040 }, 1, 1);
    module.drawNaniteFlame(second.context, [285, 335], 1, 1);
    assert.deepEqual(second.operations, first.operations);
    assert.equal(canvases, allocated, "fallback sprites are shared and cached");
  } finally {
    if (previous) Object.defineProperty(globalThis, "document", previous);
    else delete globalThis.document;
  }
});

test("a failed sheet retries only after the documented cooldown and recovers", async (t) => {
  const module = await fresh();
  const f = fixture();
  let now = 1_000_000;
  t.mock.method(Date, "now", () => now);
  const first = module.warmNaniteFlame(f.environment);
  f.images[0].onerror();
  assert.equal(await first, false);
  now += 29_999;
  assert.equal(await module.warmNaniteFlame(f.environment), false);
  assert.equal(f.images.length, 1);
  now += 1;
  const retry = module.warmNaniteFlame(f.environment);
  assert.equal(f.images.length, 2);
  f.images[1].onload();
  assert.equal(await retry, true);
  assert.equal(module.naniteFlameReady(), true);
});

test("a browser without image.decode can use a fully loaded correctly sized sheet", async () => {
  const module = await fresh();
  const f = fixture();
  const pending = module.warmNaniteFlame(f.environment);
  delete f.images[0].decode;
  f.images[0].onload();
  assert.equal(await pending, true);
  assert.equal(module.naniteFlameReady(), true);
});

test("touch retains the shared volume while reducing detail within the total frame budget", async () => {
  const counts = [];
  for (const coarse of [false, true]) {
    const module = await fresh(),
      f = fixture();
    f.environment.matchMedia = (query) => ({
      matches: coarse && query.includes("pointer: coarse"),
    });
    await ready(module, f);
    const body = prepareField(module, f);
    body.field.operations.length = 0;
    const p = painter();
    module.drawBodyFlame(p.context, { width: 571, height: 1040 }, 1, 0.42, 1, "back", 0.175);
    module.drawNaniteFlame(p.context, [285, 335], 1, 0.42);
    module.drawBodyFlame(p.context, { width: 571, height: 1040 }, 1, 0.42, 1, "front", 0.175);
    const all = [...p.operations, ...body.field.operations];
    counts.push(all.filter((row) => row[0] === "image").length);
    assert.equal(
      p.operations.filter((row) => row[0] === "image" && row[1] === "body-field").length,
      2,
    );
  }
  assert.ok(
    counts[0] <= 128 && counts[1] <= 104,
    `total draws including internal field: ${counts}`,
  );
  assert.ok(counts[1] < counts[0], "touch reduces detail, not the shared body field");
});

test("one prepared field and a clock-driven depth-separated vortex feed both body layers", async () => {
  const module = await fresh(),
    f = fixture();
  await ready(module, f);
  const body = prepareField(module, f);
  assert.ok(
    body.mask.operations.filter((row) => row[0] === "image" && row[1] === body.source.src).length >=
      1,
    "the mask is derived from the actual undersuit, not a rectangle or twenty root islands",
  );
  const allocated = f.canvases.length;
  assert.equal(
    module.prepareBodyFlame(body.source, { width: 571, height: 1040 }, f.environment),
    true,
  );
  assert.equal(f.canvases.length, allocated, "return calls reuse the prepared surfaces");
  body.field.operations.length = 0;
  body.mask.operations.length = 0;
  const back = painter(),
    front = painter();
  module.drawBodyFlame(back.context, { width: 571, height: 1040 }, 1, 0.42, 1, "back", 0.175);
  const firstField = [...body.field.operations];
  const firstMask = [...body.mask.operations];
  module.drawBodyFlame(front.context, { width: 571, height: 1040 }, 1, 0.42, 1, "front", 0.175);
  assert.deepEqual(
    body.field.operations,
    firstField,
    "both passes reuse the same clock/strength field without rebuilding it",
  );
  assert.deepEqual(
    body.mask.operations,
    firstMask,
    "front/back share the same cached vortex geometry",
  );
  assert.ok(
    firstField.some(
      (row) => row[0] === "image" && row[1] === "body-mask" && row.at(-1) === "destination-in",
    ),
    "the complete flow is clipped to the actual body alpha after advection",
  );
  const maskDraws = firstField.filter((row) => row[0] === "image" && row[1] === "body-mask");
  assert.equal(
    maskDraws.length,
    1,
    "one curved volume mask, not separately displaced horizontal strips",
  );
  assert.equal(maskDraws[0].length, 6, "draw the whole mask, never clip source slices");
  assert.ok(
    firstMask.filter((row) => row[0] === "curve").length >= 144,
    "the shape itself winds through continuous curved ribbons",
  );
  assert.equal(
    firstMask.filter((row) => row[0] === "fill" && row.at(-1) === "destination-out").length,
    0,
    "depth comes from authored alpha, never punched-out oval holes",
  );
  assert.doesNotMatch(
    JSON.stringify(firstField),
    /pathRect/,
    "no row-wise mask clipping can leave stepped outer notches",
  );
  assert.ok(
    firstField.some((row) => row[0] === "image" && row[1] === module.NANITE_FLAME_ATLAS.src),
    "the continuous field still contains the real Blender volume texture",
  );
  for (const p of [back, front]) {
    const field = p.operations.find((row) => row[0] === "image" && row[1] === "body-field");
    assert.ok(field, "one shared volume covers head, connected torso, limbs and feet");
    const sourceBox = firstMask
      .filter((row) => row[0] === "image" && row[1] === body.source.src)
      .at(-1);
    if (p === back) {
      const [x, y, width, height] = field.slice(2, 6);
      assert.ok(
        x < 0 && y < 0 && width >= 571 * 1.4 && height > 1040,
        "retain air around the figure for the rolling plume",
      );
      assert.ok(Math.abs(x + (sourceBox[2] / body.field.canvas.width) * width) < 1e-9);
      assert.ok(Math.abs(y + (sourceBox[3] / body.field.canvas.height) * height) < 1e-9);
      assert.ok(Math.abs((sourceBox[4] / body.field.canvas.width) * width - 571) < 1e-9);
      assert.ok(
        Math.abs((sourceBox[5] / body.field.canvas.height) * height - 1040) < 1e-9,
        "the broad field never shifts the actual suit registration",
      );
    } else {
      assert.equal(
        p.operations.some((row) => row[0] === "clip"),
        false,
        "front depth never hard-cuts the rolling volumes to polygon outlines",
      );
      assert.equal(
        field.at(-2),
        0.72,
        "the clipped volume supplies foreground radiance without independent flame sprites",
      );
    }
    assert.equal(p.states.length, 0);
    assert.equal(p.context.globalAlpha, 0.73);
    assert.equal(p.context.globalCompositeOperation, "multiply");
  }
  body.mask.operations.length = 0;
  module.drawBodyFlame(painter().context, { width: 571, height: 1040 }, 1, 0.7, 1, "back", 0.175);
  assert.notDeepEqual(
    body.mask.operations,
    firstMask,
    "clock changes the actual curved shape, not only its texture offset",
  );
  const turned = [...body.mask.operations];
  body.mask.operations.length = 0;
  module.drawBodyFlame(painter().context, { width: 571, height: 1040 }, 1, 0.7, 1, "back", 0.21);
  assert.notDeepEqual(
    body.mask.operations,
    turned,
    "burst phase tears and expands the geometry even at the same clock",
  );
});

test("authored fire detail follows a body-height revolving volume with bounded, changing roots", async () => {
  for (const coarse of [false, true]) {
    const module = await fresh(),
      f = fixture();
    f.environment.matchMedia = (query) => ({
      matches: coarse && query.includes("pointer: coarse"),
    });
    await ready(module, f);
    const body = prepareField(module, f);
    const sourceBox = body.mask.operations
      .filter((row) => row[0] === "image" && row[1] === body.source.src)
      .at(-1);
    const rootsAt = (clock) => {
      const p = painter();
      body.field.operations.length = 0;
      module.drawBodyFlame(
        p.context,
        { width: 571, height: 1040 },
        1,
        clock,
        1,
        "all",
        NANITE_FIRE_PHASES.burstStart,
      );
      assert.equal(
        p.operations.filter((row) => row[0] === "image" && row[1] === module.NANITE_FLAME_ATLAS.src)
          .length,
        0,
        "no independent flame sprites are painted over the connected field",
      );
      const roots = flameRoots(body.field.operations)
        .filter((root) => root.images.some((image) => image[1] === module.NANITE_FLAME_ATLAS.src))
        .map((root) => ({
          ...root,
          x: ((root.x - sourceBox[2]) * 571) / sourceBox[4],
          y: ((root.y - sourceBox[3]) * 1040) / sourceBox[5],
        }));
      assert.ok(roots.length >= 5, "the wrapping field has multiple genuine volume detail samples");
      assert.ok(
        roots.every(
          (root) =>
            Number.isFinite(root.x) &&
            Number.isFinite(root.y) &&
            root.x >= -571 * 0.4 &&
            root.x <= 571 * 1.4 &&
            root.y >= -1040 * 0.15 &&
            root.y <= 1040 * 1.15,
        ),
        "curved roots remain within the deliberate padded volume",
      );
      assert.ok(Math.min(...roots.map((root) => root.y)) < 1040 * 0.2);
      assert.ok(
        Math.max(...roots.map((root) => root.y)) > 1040 * 0.8,
        "head to lower-leg volume is present",
      );
      assert.ok(
        Math.max(...roots.map((root) => root.x)) - Math.min(...roots.map((root) => root.x)) >
          571 * 0.3,
        "the vortex wraps broadly, not a central chimney",
      );
      return roots.map(({ x, y }) => [x, y]);
    };
    const first = rootsAt(0.7);
    rootsAt(1.4);
    assert.notDeepEqual(rootsAt(1.1), first, "the sources themselves orbit, not only atlas pixels");
    assert.deepEqual(rootsAt(0.7), first, "reverse restores the same volume geometry");
  }
});

test("the main vortex is completely gone before any material phase, even for an isolated legacy caller", async () => {
  const module = await fresh(),
    f = fixture();
  await ready(module, f);
  const body = prepareField(module, f);
  for (const phase of [NANITE_FIRE_PHASES.materialStart, 0.3, 0.6, 1]) {
    const p = painter();
    body.field.operations.length = 0;
    body.mask.operations.length = 0;
    module.drawBodyFlame(p.context, { width: 571, height: 1040 }, 1, 0.8, 1, "all", phase);
    assert.deepEqual(p.operations, [], "no centre fire overlays newly appearing metal");
    assert.deepEqual(body.field.operations, []);
    assert.deepEqual(body.mask.operations, []);
  }
});

test("a single scatter impulse leaves the shared burning surface and reverses exactly", async () => {
  const module = await fresh(),
    f = fixture();
  await ready(module, f);
  prepareField(module, f);
  const render = (phase) => {
    const p = painter();
    module.drawBodyFlame(
      p.context,
      { width: 571, height: 1040 },
      naniteFlameEnvelope(phase),
      0.65,
      1,
      "front",
      phase,
    );
    assert.equal(p.states.length, 0);
    return p.operations;
  };
  for (const phase of [0.1, NANITE_FIRE_PHASES.burstStart, NANITE_FIRE_PHASES.burstEnd, 0.6, 1])
    assert.equal(
      render(phase).filter((row) => row[0] === "rect").length,
      0,
      "no continuously respawning decorative sparks",
    );
  const phase = (NANITE_FIRE_PHASES.burstStart + NANITE_FIRE_PHASES.burstEnd) / 2,
    scatter = naniteFlameScatter(phase);
  const reference = render(phase);
  const drops = reference.filter((row) => row[0] === "rect");
  assert.ok(drops.length > 20 && drops.length <= 40);
  const source = new Float32Array(4);
  for (const [i, drop] of drops.entries()) {
    sampleFlameBirth((i + 0.5) / 48, source);
    const dx = drop[1] - source[0] * 571;
    const dy = drop[2] - source[1] * 1040 + scatter * 35 * 1.04;
    assert.ok(
      Math.abs(dx * source[3] - dy * source[2]) < 0.01,
      "outward travel begins on the same shared source",
    );
    assert.ok(dx * source[2] + dy * source[3] >= 0, "the impulse travels out of the fire");
    assert.ok(drop.at(-2) >= 0 && drop.at(-2) <= 1);
  }
  render(0.85);
  render(0.03);
  assert.deepEqual(
    render(phase),
    reference,
    "reverse cannot retain a spent burst or respawn particles",
  );
  assert.deepEqual(render(1), [], "the handoff leaves the completed armour unobscured");
});

test("warmed ignition, peak, extinction and reverse frames allocate no new canvas, gradients or random state", async (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  try {
    for (const coarse of [false, true]) {
      const module = await fresh();
      const f = fixture();
      f.environment.matchMedia = (query) => ({
        matches: coarse && query.includes("pointer: coarse"),
      });
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: f.environment.document,
      });
      await ready(module, f);
      const body = prepareField(module, f);
      const noAllocation = () => assert.fail("a warmed frame must reuse its prepared resources");
      f.environment.document.createElement = noAllocation;
      body.field.context.createLinearGradient =
        body.field.context.createRadialGradient =
        body.field.context.createImageData =
          noAllocation;
      const random = t.mock.method(Math, "random", noAllocation);
      try {
        for (let i = 0; i <= 80; i++) {
          const strength = (i <= 40 ? i : 80 - i) / 40;
          const clock = (i <= 40 ? i : 80 - i) / 17;
          const p = painter();
          body.field.operations.length = 0;
          p.context.createLinearGradient = p.context.createRadialGradient = noAllocation;
          module.drawBodyFlame(p.context, { width: 571, height: 1040 }, strength, clock, 1, "back");
          module.drawNaniteFlame(p.context, [285, 335], strength, clock);
          module.drawBodyFlame(
            p.context,
            { width: 571, height: 1040 },
            strength,
            clock,
            1,
            "front",
          );
          const images = [...p.operations, ...body.field.operations].filter(
            (row) => row[0] === "image",
          );
          assert.ok(images.length <= (coarse ? 104 : 128), `${images.length} total frame draws`);
          assert.equal(p.states.length, 0);
        }
      } finally {
        random.mock.restore();
      }
    }
  } finally {
    if (previous) Object.defineProperty(globalThis, "document", previous);
    else delete globalThis.document;
  }
});

test("the warmed drawing call graph constructs no per-frame objects, arrays, closures or seeded randomness", () => {
  const source = ts.createSourceFile(
    "rexonance-flame.js",
    readFileSync(file("src/lib/rexonance-flame.js"), "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const functions = new Map();
  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name)
      functions.set(statement.name.text, statement);
    if (ts.isVariableStatement(statement))
      for (const declaration of statement.declarationList.declarations)
        if (
          ts.isIdentifier(declaration.name) &&
          declaration.initializer &&
          (ts.isArrowFunction(declaration.initializer) ||
            ts.isFunctionExpression(declaration.initializer))
        )
          functions.set(declaration.name.text, declaration.initializer);
  }
  const pending = ["drawBodyFlame", "drawNaniteFlame", "drawNaniteFirebrand"];
  const visited = new Set();
  const forbidden = [];
  while (pending.length) {
    const name = pending.pop();
    // prepare() is a guarded, one-time resource path, verified above by
    // replacing createElement/gradient factories after the actual warm-up.
    if (name === "prepare" || visited.has(name)) continue;
    const fn = functions.get(name);
    assert.ok(fn, `the drawing helper ${name} can be inspected`);
    visited.add(name);
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
  assert.ok(visited.size >= 4, "inspect the body/core exports and their real shared helpers");
  assert.deepEqual(forbidden, [], "retain prepared numeric seed tables and scalar frame math");
});

test("a material firebrand uses the same decoded volume, at most two draws, and restores state even on failure", async () => {
  const module = await fresh(),
    f = fixture();
  await ready(module, f);
  const before = f.canvases.length;
  f.environment.document.createElement = () => {
    throw new Error("new resource after warm-up");
  };
  const draw = (clock) => {
    const p = painter();
    module.drawNaniteFirebrand(p.context, 180, 420, 0.75, clock, 1.5);
    assert.equal(p.states.length, 0);
    assert.equal(p.context.globalAlpha, 0.73);
    assert.equal(p.context.globalCompositeOperation, "multiply");
    const images = p.operations.filter((row) => row[0] === "image");
    assert.ok(images.length > 0 && images.length <= 2);
    assert.ok(images.every((row) => row[1] === module.NANITE_FLAME_ATLAS.src));
    return p.operations;
  };
  const reference = draw(0.63);
  draw(1.5);
  draw(0.2);
  assert.deepEqual(
    draw(0.63),
    reference,
    "reverse samples retain the same real flame texture and pose",
  );
  assert.equal(f.canvases.length, before, "fire fragments reuse the already decoded atlas");
  const failing = painter({ throwAt: 1 });
  assert.throws(
    () => module.drawNaniteFirebrand(failing.context, 180, 420, 0.75, 0.63),
    /draw failure/,
  );
  assert.equal(failing.states.length, 0);
  assert.equal(failing.context.globalAlpha, 0.73);
  assert.equal(failing.context.globalCompositeOperation, "multiply");
  const invalid = painter();
  for (const args of [
    [NaN, 20, 1, 1],
    [20, Infinity, 1, 1],
    [20, 20, 0, 1],
    [20, 20, 1, NaN],
    [20, 20, 1, 1, 0],
  ])
    module.drawNaniteFirebrand(invalid.context, ...args);
  assert.deepEqual(invalid.operations, []);
});

test("the connected field, volume detail and contact light share the existing 128/104 frame budgets", async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  try {
    for (const coarse of [false, true]) {
      const module = await fresh();
      const f = fixture();
      f.environment.matchMedia = (query) => ({
        matches: coarse && query.includes("pointer: coarse"),
      });
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: f.environment.document,
      });
      await ready(module, f);
      const body = prepareField(module, f);
      body.field.operations.length = 0;
      const p = painter();
      module.drawBodyFlame(p.context, { width: 571, height: 1040 }, 1, 1.7, 1, "back");
      module.drawNaniteFlame(p.context, [285, 335], 1, 1.7);
      module.drawBodyFlame(p.context, { width: 571, height: 1040 }, 1, 1.7, 1, "front");
      const images = [...p.operations, ...body.field.operations].filter(
        (row) => row[0] === "image",
      );
      assert.equal(
        images.filter((row) => row[1] === "fallback").length,
        1,
        "include the faint reactor contact light instead of omitting hidden work",
      );
      assert.ok(images.length <= (coarse ? 104 : 128), `${images.length} total draws`);
      assert.equal(p.context.globalAlpha, 0.73);
      assert.equal(p.context.globalCompositeOperation, "multiply");
    }
  } finally {
    if (previous) Object.defineProperty(globalThis, "document", previous);
    else delete globalThis.document;
  }
});

test("valid draws use atlas frame rectangles with interpolation and deterministic reverse scrubbing", async () => {
  const module = await fresh();
  const f = fixture();
  await ready(module, f);
  const body = prepareField(module, f);
  const render = (clock) => {
    const p = painter();
    body.field.operations.length = 0;
    module.drawBodyFlame(p.context, { width: 571, height: 1040 }, 0.8, clock, 1.25, "back");
    module.drawNaniteFlame(p.context, [285, 335], 0.8, clock, 1.25);
    module.drawBodyFlame(p.context, { width: 571, height: 1040 }, 0.8, clock, 1.25, "front");
    assert.equal(p.states.length, 0);
    assert.equal(p.context.globalAlpha, 0.73);
    assert.equal(p.context.globalCompositeOperation, "multiply");
    assert.equal(p.context.fillStyle, "#123456");
    return [...p.operations, ...body.field.operations];
  };
  const first = render(1.37);
  assert.notDeepEqual(render(2.7), first);
  assert.deepEqual(
    render(1.37),
    first,
    "returning to an exact clock restores exact source/destination/alpha values",
  );
  const atlasDraws = first.filter(
    (row) => row[0] === "image" && row[1] === module.NANITE_FLAME_ATLAS.src,
  );
  assert.ok(
    atlasDraws.length >= 24 && atlasDraws.length <= 128,
    `${atlasDraws.length} atlas draws, not hundreds of blobs`,
  );
  assert.ok(new Set(atlasDraws.map((row) => `${row[2]},${row[3]}`)).size > 8);
  for (const row of atlasDraws) {
    assert.equal(row[1], module.NANITE_FLAME_ATLAS.src);
    assert.equal(row[4], 127);
    assert.equal(row[5], 255);
    assert.ok(row[2] >= 0 && row[3] >= 0 && row[2] + row[4] <= 1024 && row[3] + row[5] <= 1024);
    assert.ok(row.slice(2, -1).every(Number.isFinite), "all numerical canvas arguments are finite");
    assert.ok(row[8] > 0 && row[9] > 0, "positive destination dimensions");
  }
});

test("zero/non-finite strength, coordinates, clocks and scales are no-op without canvas allocation", async () => {
  const module = await fresh();
  const f = fixture();
  await ready(module, f);
  const p = painter();
  for (const strength of [0, -1, NaN, Infinity]) {
    module.drawBodyFlame(p.context, { width: 571, height: 1040 }, strength, 1);
    module.drawNaniteFlame(p.context, [285, 335], strength, 1);
  }
  for (const clock of [NaN, Infinity]) {
    module.drawBodyFlame(p.context, { width: 571, height: 1040 }, 1, clock);
    module.drawNaniteFlame(p.context, [285, 335], 1, clock);
  }
  for (const scale of [0, -1, NaN, Infinity]) {
    module.drawBodyFlame(p.context, { width: 571, height: 1040 }, 1, 1, scale);
    module.drawNaniteFlame(p.context, [285, 335], 1, 1, scale);
  }
  for (const size of [null, { width: 0, height: 1040 }, { width: 571, height: NaN }])
    module.drawBodyFlame(p.context, size, 1, 1);
  for (const core of [null, [NaN, 335], [285, Infinity]])
    module.drawNaniteFlame(p.context, core, 1, 1);
  assert.deepEqual(p.operations, []);
  assert.equal(p.states.length, 0);
});

test("the default API includes both body layers, and exceptions cannot leak canvas state", async () => {
  const module = await fresh();
  const f = fixture();
  await ready(module, f);
  prepareField(module, f);
  const back = painter(),
    front = painter(),
    all = painter();
  const args = [{ width: 571, height: 1040 }, 1, 0.6];
  module.drawBodyFlame(back.context, ...args, 1, "back");
  module.drawBodyFlame(front.context, ...args, 1, "front");
  module.drawBodyFlame(all.context, ...args);
  assert.deepEqual(all.operations, [...back.operations, ...front.operations]);
  for (const draw of [
    (context) => module.drawBodyFlame(context, ...args),
    (context) => module.drawNaniteFlame(context, [285, 335], 1, 0.6),
  ]) {
    const p = painter({ throwAt: 1 });
    assert.throws(() => draw(p.context), /draw failure/);
    assert.equal(p.states.length, 0);
    assert.equal(p.context.globalAlpha, 0.73);
    assert.equal(p.context.globalCompositeOperation, "multiply");
    assert.equal(p.context.fillStyle, "#123456");
  }
});

test("upward thermal advection, sculpted bezier lobes, additive core tongues and spatial firebrand phase avoid flat stamps", async () => {
  const module = await fresh();
  const f = fixture();
  await ready(module, f);
  const body = prepareField(module, f);
  body.field.operations.length = 0;
  body.mask.operations.length = 0;
  module.drawBodyFlame(painter().context, { width: 571, height: 1040 }, 1, 0.2, 1, "back", 0.14);
  const flowEarly = body.field.operations.filter(
    (row) => row[0] === "image" && row[1] === "body-flow",
  )[1][3];
  const curves = body.mask.operations.filter((row) => row[0] === "curve");
  assert.ok(
    curves.some((row) => Math.hypot(row[1] - row[5], row[2] - row[6]) > 0.5),
    "vortex ribbon curves use genuine tangent/swell control points rather than straight-line segments",
  );
  const fieldAtlas = body.field.operations.filter(
    (row) => row[0] === "image" && row[1] === module.NANITE_FLAME_ATLAS.src,
  );
  assert.ok(
    fieldAtlas.some((row) => row.at(-1) === "lighter") &&
      fieldAtlas.some((row) => row.at(-1) === "source-over"),
    "bodyField combines deep absorption volume with additive incandescent inner-stream tongues",
  );
  body.field.operations.length = 0;
  module.drawBodyFlame(painter().context, { width: 571, height: 1040 }, 1, 0.3, 1, "back", 0.14);
  const flowLate = body.field.operations.filter(
    (row) => row[0] === "image" && row[1] === "body-flow",
  )[1][3];
  assert.ok(flowLate < flowEarly, "turbulent density sheet advects upward as clock advances");

  const leftBrand = painter();
  const rightBrand = painter();
  module.drawNaniteFirebrand(leftBrand.context, 140, 360, 0.8, 0.5);
  module.drawNaniteFirebrand(rightBrand.context, 420, 620, 0.8, 0.5);
  assert.notDeepEqual(
    leftBrand.operations.filter((row) => row[0] === "image").map((row) => [row[2], row[3]]),
    rightBrand.operations.filter((row) => row[0] === "image").map((row) => [row[2], row[3]]),
    "simultaneous firebrands across the body sample desynchronized atlas frames",
  );
});
