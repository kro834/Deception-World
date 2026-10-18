import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";
import sharp from "sharp";
import ts from "typescript";

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

function flameRoots(operations) {
  const roots = [];
  for (const row of operations) {
    if (row[0] === "translate") roots.push({ x: row[1], y: row[2], images: [] });
    if (row[0] === "image" && roots.length) roots.at(-1).images.push(row);
  }
  return roots.filter((root) => root.images.length);
}

const rootEnergy = (root) => root.images.reduce((sum, image) => sum + image.at(-2), 0);

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
    // The supplied undersuit splits into two legs below y=.46. Its centre
    // at .58 is transparent: demanding coverage there created a hanging
    // curtain in the empty crotch rather than fire attached to the waist.
    ["waist", 0.5, 0.445],
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
    const roots = flameRoots(p.operations);
    assert.equal(
      roots.length,
      coarse ? 17 : 20,
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
    assert.ok(
      centre[0][0] < H * 0.085,
      "the flame reaches the supplied head's real upper surface near y=.077, not an airborne crown",
    );
    for (let i = 1; i < centre.length; i++)
      assert.ok(
        centre[i][0] <= centre[i - 1][1] + H * 0.012,
        "overlapping fire joins the body centre instead of leaving a hollow sternum",
      );
    assert.ok(centre.at(-1)[1] > H * 0.43, "the joined flame reaches the solid waist");
    assert.ok(
      roots.slice(0, 4).every((root) => root.y <= H * 0.48),
      "wide centre fire is rooted on the solid torso, not suspended in the leg gap",
    );
    assert.ok(
      p.operations.filter((row) => row[0] === "image").every((row) => row.at(-1) === "source-over"),
      "near fire retains the authored volume absorption over bright armour",
    );
    assert.equal(p.states.length, 0);
  }
});

test("near fire is rooted on the supplied body instead of dangling below its hands or across the leg gap", async () => {
  const { data, info } = await sharp(
    readFileSync(file("public/rexonance-suit-20261016/undersuit.webp")),
  )
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.deepEqual([info.width, info.height], [571, 1040]);
  const radius = 24;
  for (const coarse of [false, true]) {
    const module = await fresh();
    const f = fixture();
    f.environment.matchMedia = (query) => ({
      matches: coarse && query.includes("pointer: coarse"),
    });
    await ready(module, f);
    for (const clock of [0.2, 0.85, 1.3, 2.1]) {
      const p = painter();
      module.drawBodyFlame(p.context, info, 1, clock, 1, "front");
      for (const [index, root] of flameRoots(p.operations).entries()) {
        let touchesBody = false;
        for (
          let y = Math.max(0, Math.floor(root.y - radius));
          y <= Math.min(info.height - 1, root.y + radius);
          y++
        )
          for (
            let x = Math.max(0, Math.floor(root.x - radius));
            x <= Math.min(info.width - 1, root.x + radius);
            x++
          )
            if (
              (x - root.x) ** 2 + (y - root.y) ** 2 <= radius ** 2 &&
              data[(y * info.width + x) * 4 + 3] > 32
            )
              touchesBody = true;
        assert.ok(
          touchesBody,
          `${coarse ? "coarse" : "fine"}/${clock}/root ${index}: its feathered root contacts the actual body within ${radius}px`,
        );
      }
    }
  }
});

test("face fire begins on both cheeks with independent volume phases, never as a floating crown", async () => {
  for (const coarse of [false, true]) {
    const module = await fresh();
    const f = fixture();
    f.environment.matchMedia = (query) => ({
      matches: coarse && query.includes("pointer: coarse"),
    });
    await ready(module, f);
    for (const clock of [0.35, 1.37, 2.1]) {
      const front = painter();
      module.drawBodyFlame(front.context, { width: 571, height: 1040 }, 1, clock, 1, "front");
      const cheeks = flameRoots(front.operations)
        .filter((root) => root.y < 1040 * 0.24)
        .sort((a, b) => a.x - b.x);
      assert.equal(cheeks.length, 2, "both input tiers retain left/right face contact");
      assert.ok(cheeks[0].x < 571 * 0.5 && cheeks[1].x > 571 * 0.5);
      assert.ok(
        cheeks.every((root) => root.y >= 1040 * 0.13),
        "fire is attached to the face, not emitted above the head",
      );
      assert.notDeepEqual(
        cheeks[0].images.map((image) => [image[2], image[3], image.at(-2)]),
        cheeks[1].images.map((image) => [image[2], image[3], image.at(-2)]),
        "the cheeks are not mirrored copies of the same atlas phase/opacity",
      );
      const back = painter();
      module.drawBodyFlame(back.context, { width: 571, height: 1040 }, 1, clock, 1, "back");
      assert.ok(
        flameRoots(back.operations).every((root) => root.y >= 1040 * 0.12),
        "the rear layer cannot introduce a second fire origin over the forehead",
      );
    }
  }
});

test("body fire kindles by region, converges continuously, and reverses without retained ignition state", async () => {
  for (const coarse of [false, true]) {
    const module = await fresh();
    const f = fixture();
    f.environment.matchMedia = (query) => ({
      matches: coarse && query.includes("pointer: coarse"),
    });
    await ready(module, f);
    const render = (strength, clock = 1.73) => {
      const p = painter();
      module.drawBodyFlame(p.context, { width: 571, height: 1040 }, strength, clock, 1, "front");
      assert.equal(p.states.length, 0);
      assert.equal(p.context.globalAlpha, 0.73);
      assert.equal(p.context.globalCompositeOperation, "multiply");
      return p.operations;
    };
    const peak = flameRoots(render(1));
    const early = flameRoots(render(0.15));
    const growing = flameRoots(render(0.55));
    assert.equal(peak.length, coarse ? 17 : 20, "peak still burns over the whole body");
    assert.ok(growing.length > 0, "the intermediate fire is visible, not a delayed jump");
    const relativeEnergy = early.map((root, index) => rootEnergy(root) / rootEnergy(peak[index]));
    assert.ok(
      early.length < peak.length ||
        Math.max(...relativeEnergy) - Math.min(...relativeEnergy) > 0.025,
      "early roots have different local ignition envelopes, not one synchronous global fade",
    );
    assert.ok(
      early.some((root) => root.y < 1040 * 0.5 && Math.abs(root.x - 571 * 0.5) < 80),
      "ignition begins on the torso rather than waiting for a whole-body flash",
    );
    assert.ok(
      early.every((root) => root.y < 1040 * 0.85),
      "the distant feet ignite after the torso, not at the same instant",
    );
    const meanHeight = (roots) => {
      const energy = roots.reduce((sum, root) => sum + rootEnergy(root), 0);
      return roots.reduce((sum, root) => sum + root.images[0][9] * rootEnergy(root), 0) / energy;
    };
    assert.ok(meanHeight(growing) < meanHeight(peak), "dying fire loses height as well as opacity");
    let previousEnergy = 0;
    const peakEnergy = peak.reduce((sum, root) => sum + rootEnergy(root), 0);
    const snapshots = new Map();
    for (let i = 0; i <= 50; i++) {
      const strength = i / 50;
      const operations = render(strength);
      const roots = flameRoots(operations);
      const energy = roots.reduce((sum, root) => sum + rootEnergy(root), 0);
      assert.ok(Number.isFinite(energy) && energy >= 0);
      assert.ok(
        Math.abs(energy - previousEnergy) < peakEnergy * 0.16,
        `${coarse ? "coarse" : "fine"}/${strength}: no single-step brightness pop`,
      );
      for (const root of roots)
        for (const image of root.images) {
          assert.ok(image.at(-2) >= 0 && image.at(-2) <= 1, "bounded local alpha");
          assert.ok(image[8] > 0 && image[9] > 0, "no inverted extinction geometry");
        }
      snapshots.set(strength, operations);
      previousEnergy = energy;
    }
    for (let i = 50; i >= 0; i--)
      assert.deepEqual(
        render(i / 50),
        snapshots.get(i / 50),
        "reverse scroll recovers identical fire even after all regions have fully ignited",
      );
    assert.deepEqual(render(0), [], "extinguished fire has no remaining sprite or ember calls");
  }
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
      const noAllocation = () => assert.fail("a warmed frame must reuse its prepared resources");
      f.environment.document.createElement = noAllocation;
      const random = t.mock.method(Math, "random", noAllocation);
      try {
        for (let i = 0; i <= 80; i++) {
          const strength = (i <= 40 ? i : 80 - i) / 40;
          const clock = (i <= 40 ? i : 80 - i) / 17;
          const p = painter();
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
          const images = p.operations.filter((row) => row[0] === "image");
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
  const pending = ["drawBodyFlame", "drawNaniteFlame"];
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
