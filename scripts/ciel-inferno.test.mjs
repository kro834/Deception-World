import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import {
  CIEL_INFERNO_GAP_MS,
  CIEL_INFERNO_TAPS,
  CIEL_INFERNO_WINDOW_MS,
  createCielInfernoTrigger,
} from "../src/lib/ciel-inferno-trigger.ts";

const file = (path) => new URL(`../${path}`, import.meta.url);
const bytes = (path) => readFileSync(file(path));
const digest = (value) => createHash("sha256").update(value).digest("hex");

test("the secret artwork is exactly the supplied composition, resized only with private metadata removed", async () => {
  const manifest = JSON.parse(bytes("public/ciel-inferno-20261019/artwork-manifest.json"));
  const reference = bytes(manifest.source.path);
  assert.equal(digest(reference), manifest.source.sha256);
  const source = await sharp(reference).metadata();
  assert.equal(source.width, source.height);
  assert.ok(source.width >= 1080);
  assert.deepEqual(
    manifest.assets.map((asset) => asset.width),
    [216, 720, 1080],
  );
  for (const asset of manifest.assets) {
    const image = bytes(`public${asset.path}`);
    const metadata = await sharp(image).metadata();
    assert.equal(digest(image), asset.sha256);
    assert.equal(image.length, asset.bytes);
    assert.deepEqual(
      [metadata.format, metadata.width, metadata.height],
      ["webp", asset.width, asset.width],
    );
    for (const key of ["exif", "xmp", "iptc"]) assert.equal(metadata[key], undefined);
    const expected = await sharp(reference)
      .resize(asset.width, asset.width, { fit: "inside", kernel: "lanczos3" })
      .webp({ quality: 90, alphaQuality: 100, effort: 6 })
      .toBuffer();
    assert.deepEqual(image, expected, `${asset.width}: no crop, repaint or composition change`);
  }
});

test("the pressure jet is a bounded, transparent, animated Blender volume with reproducible source identity", async () => {
  const manifest = JSON.parse(bytes("public/ciel-inferno-20261019/jet-manifest.json"));
  const image = bytes(`public${manifest.asset.path}`);
  assert.equal(image.length, manifest.asset.bytes);
  assert.equal(digest(image), manifest.asset.sha256);
  assert.ok(image.length <= 600_000);
  const metadata = await sharp(image).metadata();
  assert.deepEqual(
    [metadata.format, metadata.width, metadata.height, metadata.channels],
    ["webp", 2048, 512, 4],
  );
  assert.deepEqual(
    [
      manifest.atlas.columns,
      manifest.atlas.rows,
      manifest.atlas.frames,
      manifest.atlas.frameWidth,
      manifest.atlas.frameHeight,
    ],
    [8, 4, 32, 256, 128],
  );
  assert.deepEqual(manifest.atlas.sourceAnchor, [8, 64]);
  assert.equal(manifest.atlas.direction, "right");
  assert.equal(manifest.render.renderer, "Cycles CPU");
  assert.equal(manifest.render.enclosureNormals, "outward");
  assert.ok(manifest.render.signedVolumeMin > 0);
  assert.equal(manifest.render.loopGeometryMaxDelta, 0);
  assert.equal(manifest.render.loopCheckRendered, true);
  assert.equal(manifest.loopPixelCheck.differentChannels, 0);
  assert.equal(manifest.loopPixelCheck.maxChannelDelta, 0);
  for (const source of manifest.sources)
    assert.equal(digest(bytes(source.path)), source.sha256, source.path);
  const { data } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const frames = new Set(),
    levels = new Set();
  for (let frame = 0; frame < 32; frame++) {
    const pixels = [];
    let occupied = 0;
    for (let y = 0; y < 128; y++) {
      for (let x = 0; x < 256; x++) {
        const i = (((frame >> 3) * 128 + y) * 2048 + (frame % 8) * 256 + x) * 4;
        const pixel = data.subarray(i, i + 4);
        pixels.push(...pixel);
        levels.add(pixel[3]);
        if (pixel[3] > 8) occupied++;
        if (x < 8 || x >= 248)
          assert.ok(pixel[3] <= 8, `frame ${frame}: soft inlet/outlet, no tile cut`);
      }
    }
    assert.ok(
      occupied > 500 && occupied < 256 * 128 * 0.85,
      `frame ${frame}: substantial flow with transparent margins`,
    );
    frames.add(digest(Buffer.from(pixels)));
  }
  assert.ok(frames.size >= 28);
  assert.ok(levels.size >= 64);
});

test("the secret requires ten deliberate taps with bounded gaps and a bounded total window", () => {
  assert.equal(CIEL_INFERNO_TAPS, 10);
  assert.equal(CIEL_INFERNO_GAP_MS, 550);
  assert.equal(CIEL_INFERNO_WINDOW_MS, 4000);
  const trigger = createCielInfernoTrigger();
  for (let i = 1; i <= 10; i++) {
    assert.deepEqual(trigger.tap((i - 1) * 200), {
      count: i,
      primed: i >= 3,
      triggered: i === 10,
    });
  }
});

test("the third tap primes, while the first and second stay ordinary activations", () => {
  const trigger = createCielInfernoTrigger();
  assert.deepEqual(trigger.tap(1000), { count: 1, primed: false, triggered: false });
  assert.deepEqual(trigger.tap(1100), { count: 2, primed: false, triggered: false });
  assert.deepEqual(trigger.tap(1200), { count: 3, primed: true, triggered: false });
  for (let i = 4; i <= 9; i++) {
    const result = trigger.tap(900 + i * 100);
    assert.equal(result.count, i);
    assert.equal(result.triggered, false, `tap ${i} must not open the effect`);
  }
});

test("the tenth fires once and later taps remain locked until an explicit reset", () => {
  const trigger = createCielInfernoTrigger();
  for (let i = 0; i < 9; i++) assert.equal(trigger.tap(i * 100).triggered, false);
  assert.equal(trigger.tap(900).triggered, true);
  for (const at of [901, 1000, 5000, 100_000, NaN, Infinity]) {
    assert.deepEqual(trigger.tap(at), { count: 10, primed: false, triggered: false });
  }
  trigger.reset();
  assert.deepEqual(trigger.tap(100_001), { count: 1, primed: false, triggered: false });
});

test("a gap of exactly 550 ms is allowed, but 551 ms starts a new burst", () => {
  for (const gap of [550, 551]) {
    const trigger = createCielInfernoTrigger();
    trigger.tap(10_000);
    const result = trigger.tap(10_000 + gap);
    assert.equal(result.count, gap === 550 ? 2 : 1);
    assert.equal(result.primed, false);
    assert.equal(result.triggered, false);
  }
});

test("a ten-tap burst spanning exactly four seconds is valid", () => {
  const trigger = createCielInfernoTrigger();
  const times = [0, 500, 1000, 1500, 2000, 2500, 3000, 3500, 3750, 4000];
  const results = times.map((time) => trigger.tap(time));
  assert.equal(results[8].triggered, false);
  assert.deepEqual(results[9], { count: 10, primed: true, triggered: true });
});

test("small gaps cannot extend the burst beyond four seconds", () => {
  const trigger = createCielInfernoTrigger();
  for (let i = 0; i < 9; i++) assert.equal(trigger.tap(i * 500).triggered, false);
  assert.deepEqual(trigger.tap(4500), { count: 1, primed: false, triggered: false });
  for (let i = 1; i < 9; i++) assert.equal(trigger.tap(4500 + i * 200).triggered, false);
  assert.equal(trigger.tap(6300).triggered, true);
});

test("a backwards clock restarts safely instead of inheriting an older burst", () => {
  const trigger = createCielInfernoTrigger();
  trigger.tap(1000);
  trigger.tap(1100);
  trigger.tap(1200);
  assert.deepEqual(trigger.tap(900), { count: 1, primed: false, triggered: false });
  assert.deepEqual(trigger.tap(1000), { count: 2, primed: false, triggered: false });
});

for (const invalid of [NaN, Infinity, -Infinity, -1]) {
  test(`invalid timestamp ${String(invalid)} cannot prime or trigger an unfinished burst`, () => {
    const trigger = createCielInfernoTrigger();
    for (let i = 0; i < 9; i++) trigger.tap(1000 + i * 100);
    assert.deepEqual(trigger.tap(invalid), { count: 0, primed: false, triggered: false });
    assert.deepEqual(trigger.tap(2000), { count: 1, primed: false, triggered: false });
  });
}

test("reset is idempotent and cancels every partial tap count", () => {
  for (let count = 0; count <= 10; count++) {
    const trigger = createCielInfernoTrigger();
    for (let i = 0; i < count; i++) trigger.tap(i * 100);
    trigger.reset();
    trigger.reset();
    assert.deepEqual(
      trigger.tap(1200),
      { count: 1, primed: false, triggered: false },
      `reset after ${count}`,
    );
  }
});

test("separate provider instances do not share counters, locks or persistence", () => {
  const a = createCielInfernoTrigger();
  const b = createCielInfernoTrigger();
  for (let i = 0; i < 9; i++) a.tap(i * 100);
  assert.deepEqual(b.tap(900), { count: 1, primed: false, triggered: false });
  assert.equal(a.tap(900).triggered, true);
  b.reset();
  assert.deepEqual(a.tap(1000), { count: 10, primed: false, triggered: false });
  assert.deepEqual(createCielInfernoTrigger().tap(0), {
    count: 1,
    primed: false,
    triggered: false,
  });
});
