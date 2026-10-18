import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";
import sharp from "sharp";

let serial = 0;
const fresh = () => import(`../src/lib/rexonance-flame.js?unit=${serial++}`);
const file = (path) => new URL(`../${path}`, import.meta.url);

function painter({ throwAt = 0 } = {}) {
  const operations = [];
  const states = [];
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
        image.src || "fallback",
        ...args,
        this.globalAlpha,
        this.globalCompositeOperation,
      ]);
      if (throwAt && operations.length === throwAt) throw new Error("draw failure");
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
    beginPath() {},
    moveTo() {},
    bezierCurveTo() {},
    closePath() {},
    fill() {},
  };
  return { context, operations, states };
}

function fixture() {
  const images = [];
  const document = {
    hidden: false,
    documentElement: { dataset: {} },
    createElement(tag) {
      if (tag === "canvas") return { getContext: () => painter().context };
      assert.equal(tag, "img");
      const image = { naturalWidth: 1024, naturalHeight: 1024, decode: () => Promise.resolve() };
      images.push(image);
      return image;
    },
  };
  return {
    images,
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

test("the Blender flame is one transparent 32-frame atlas, not repeated radial discs", async () => {
  const { NANITE_FLAME_ATLAS: atlas } = await fresh();
  assert.equal(Object.isFrozen(atlas), true);
  assert.deepEqual(atlas, {
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
    readFileSync(file("public/rexonance-flame-20261019/manifest.json"), "utf8"),
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

test("touch uses fewer interpolated tongues while retaining body, floor and reactor fire", async () => {
  const counts = [];
  for (const coarse of [false, true]) {
    const module = await fresh();
    const f = fixture();
    f.environment.matchMedia = (query) => ({
      matches: coarse && query.includes("pointer: coarse"),
    });
    await ready(module, f);
    const p = painter();
    module.drawBodyFlame(p.context, { width: 571, height: 1040 }, 1, 1.7);
    module.drawNaniteFlame(p.context, [285, 335], 1, 1.7);
    counts.push(p.operations.filter((row) => row[0] === "image").length);
  }
  assert.ok(counts[0] <= 128 && counts[1] <= 104);
  assert.ok(
    counts[1] >= 80 && counts[1] < counts[0],
    `touch ${counts[1]} vs fine ${counts[0]} drawImage calls`,
  );
});

test("front fire crosses the entire head, torso, arms, thighs, shins and feet on both input tiers", async () => {
  const W = 571;
  const H = 1040;
  const regions = [
    ["head", 0.5, 0.13],
    ["upper torso", 0.5, 0.266],
    ["abdomen", 0.5, 0.362],
    ["hips", 0.5, 0.58],
    ["left upper arm", 0.22, 0.437],
    ["right upper arm", 0.78, 0.437],
    ["left forearm", 0.18, 0.54],
    ["right forearm", 0.82, 0.54],
    ["left thigh", 0.36, 0.56],
    ["right thigh", 0.64, 0.56],
    ["left shin", 0.28, 0.77],
    ["right shin", 0.72, 0.77],
    ["left foot", 0.25, 0.94],
    ["right foot", 0.75, 0.94],
  ];
  for (const coarse of [false, true]) {
    const module = await fresh();
    const f = fixture();
    f.environment.matchMedia = (query) => ({
      matches: coarse && query.includes("pointer: coarse"),
    });
    await ready(module, f);
    const p = painter();
    module.drawBodyFlame(p.context, { width: W, height: H }, 1, 1.7, 1, "front");
    const roots = [];
    for (const row of p.operations) {
      if (row[0] === "translate") roots.push({ x: row[1], y: row[2], images: [] });
      if (row[0] === "image") roots.at(-1).images.push(row);
    }
    assert.equal(
      roots.length,
      coarse ? 16 : 20,
      "reuse the old edge-fire budget for body-surface roots",
    );
    for (const [region, x, y] of regions) {
      assert.ok(
        // Sample the body's inner surface, not a copy of the authored root
        // array. A flame's visible middle must reach this point: anchoring a
        // transparent sprite below it is not enough. Browser PNGs additionally
        // verify the real absorbed/emitted colour over the original undersuit.
        roots.some((root) => {
          const image = root.images[0];
          return (
            Math.abs(root.x - x * W) < image[8] * 0.32 &&
            y * H > root.y + image[7] + image[9] * 0.1 &&
            y * H < root.y + image[7] + image[9] * 0.95
          );
        }),
        `${coarse ? "coarse" : "fine"}: ${region} receives near-surface fire, not only an edge halo`,
      );
    }
    const centre = roots.slice(0, 4).map((root) => {
      const image = root.images[0];
      return [
        root.y + image[7] + image[9] * ((24 - 0.5) / 255),
        root.y + image[7] + image[9] * ((245 - 0.5) / 255),
      ];
    });
    assert.ok(centre[0][0] < H * 0.05, "the flame actually reaches the head surface");
    for (let i = 1; i < centre.length; i++)
      assert.ok(
        centre[i][0] <= centre[i - 1][1] + H * 0.012,
        "overlapping fire joins the body centre instead of leaving a hollow sternum",
      );
    assert.ok(centre.at(-1)[1] > H * 0.62, "the joined flame extends into the hips");
    assert.ok(
      p.operations.filter((row) => row[0] === "image").every((row) => row.at(-1) === "source-over"),
      "near fire retains the authored volume absorption over bright armour",
    );
    assert.equal(p.states.length, 0);
  }
});

test("whole-body near fire remains within the existing 128/104 draw budgets including both contact lights", async () => {
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
      const p = painter();
      module.drawBodyFlame(p.context, { width: 571, height: 1040 }, 1, 1.7, 1, "back");
      module.drawNaniteFlame(p.context, [285, 335], 1, 1.7);
      module.drawBodyFlame(p.context, { width: 571, height: 1040 }, 1, 1.7, 1, "front");
      const images = p.operations.filter((row) => row[0] === "image");
      assert.equal(
        images.filter((row) => row[1] === "fallback").length,
        2,
        "include the reactor and floor contact-light draws in the budget",
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
  const render = (clock) => {
    const p = painter();
    module.drawBodyFlame(p.context, { width: 571, height: 1040 }, 0.8, clock, 1.25, "back");
    module.drawNaniteFlame(p.context, [285, 335], 0.8, clock, 1.25);
    module.drawBodyFlame(p.context, { width: 571, height: 1040 }, 0.8, clock, 1.25, "front");
    assert.equal(p.states.length, 0);
    assert.equal(p.context.globalAlpha, 0.73);
    assert.equal(p.context.globalCompositeOperation, "multiply");
    assert.equal(p.context.fillStyle, "#123456");
    return p.operations;
  };
  const first = render(1.37);
  assert.notDeepEqual(render(2.7), first);
  assert.deepEqual(
    render(1.37),
    first,
    "returning to an exact clock restores exact source/destination/alpha values",
  );
  const atlasDraws = first.filter((row) => row[0] === "image");
  assert.ok(
    atlasDraws.length >= 60 && atlasDraws.length <= 130,
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
    const p = painter({ throwAt: 3 });
    assert.throws(() => draw(p.context), /draw failure/);
    assert.equal(p.states.length, 0);
    assert.equal(p.context.globalAlpha, 0.73);
    assert.equal(p.context.globalCompositeOperation, "multiply");
    assert.equal(p.context.fillStyle, "#123456");
  }
});
