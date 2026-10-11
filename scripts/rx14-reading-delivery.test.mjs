import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";
import sharp from "sharp";
import { dossierImage, dossierImageSources } from "../src/lib/dossier-images.ts";
import { recordImage } from "../src/lib/record-images.ts";
import { FORM_RECORD_IMAGES } from "../src/lib/record-form-images.ts";
import { LAUNCHER_TILE_IMAGES, launcherTile, posterImage } from "../src/lib/thumbnail-images.ts";

const asset = (path) => new URL(`../public${path}`, import.meta.url).pathname;
const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("launcher delivery files match the declared 240/400 pixel candidates", async () => {
  assert.equal(Object.keys(LAUNCHER_TILE_IMAGES).length, 18);
  for (const [route, set] of Object.entries(LAUNCHER_TILE_IMAGES)) {
    assert.equal(launcherTile(route), set.variants[0].path);
    const original = await sharp(asset(set.source)).metadata();
    for (const candidate of set.variants) {
      const image = await sharp(asset(candidate.path)).metadata();
      assert.equal(image.width, candidate.width, candidate.path);
      assert.ok(image.width <= original.width, route);
      assert.equal(image.format, "webp");
    }
    assert.deepEqual(
      set.variants.map((image) => image.width),
      route.startsWith("/riders/") ? [240, 400] : [240],
    );
  }
  assert.equal(launcherTile(null), undefined);
  assert.equal(launcherTile("/characters/not-supplied"), undefined);
});

test("JPEG delivery preserves source resolution and canonical fallback files", async () => {
  for (const path of dossierImageSources) {
    const delivery = dossierImage(path).srcSet;
    assert.match(delivery, /-delivery\.webp$/);
    const original = await sharp(asset(path)).metadata();
    const image = await sharp(asset(delivery)).metadata();
    assert.equal(image.width, original.width, path);
    assert.equal(image.height, original.height, path);
    assert.equal(image.format, "webp");
    assert.ok(statSync(asset(path)).size > 0, "retain supplied original");
  }
  assert.match(dossierImage("/civilian-naikami-chigiri.jpeg").srcSet, /360w, .*720w, .*1050w$/);
  assert.ok(dossierImage("/civilian-naikami-chigiri.jpeg").sizes);
  // Covered-navigation warmup and the James hero remain the same one-file choice.
  assert.deepEqual(dossierImage("/character-james-20260829.webp"), {});
});

test("fresh World visits choose responsive art; warmed opening reuses one full file", async () => {
  const master = "/deception-world-poster-delivery.webp";
  const fresh = posterImage(master);
  assert.equal(fresh.src, "/deception-world-poster-delivery-640.webp");
  assert.match(fresh.srcSet, /640w, .*720w, .*1024w$/);
  assert.deepEqual(posterImage(master, true), { src: master, srcSet: master });
  const original = await sharp(asset(master)).metadata();
  for (const width of [640, 720]) {
    const path = `/deception-world-poster-delivery-${width}.webp`;
    const image = await sharp(asset(path)).metadata();
    assert.equal(image.width, width);
    assert.ok(Math.abs(image.height / image.width - original.height / original.width) < 0.002);
    assert.ok(statSync(asset(path)).size < statSync(asset(master)).size * 0.55);
  }
  assert.deepEqual(posterImage("/poster-card-03.jpeg"), {
    src: "/poster-card-03-delivery.webp",
    srcSet: "/poster-card-03-delivery.webp",
  });
});

test("reading cards use real form pixels, never upscaled archive chips", async () => {
  assert.equal(Object.keys(FORM_RECORD_IMAGES).length, 26);
  for (const [key, set] of Object.entries(FORM_RECORD_IMAGES)) {
    const original = await sharp(asset(set.source)).metadata();
    const reading = recordImage(`/archive-media/thumbs/${key}.webp`);
    assert.equal(reading.src, set.variants[0].path, key);
    assert.ok(reading.sizes);
    for (const candidate of set.variants) {
      const info = await sharp(asset(candidate.path)).metadata();
      assert.equal(info.width, candidate.width, key);
      assert.ok(candidate.width <= original.width, `do not invent detail: ${key}`);
      assert.ok(!candidate.path.includes("/thumbs/"), key);
    }
    if (original.width <= 480) assert.equal(reading.src, set.source);
  }
});

test("initial pickup art is lazy; explicit pickup opening retains its priority", () => {
  const component = source("src/components/world/manager-stub.tsx");
  const figure = component.slice(
    component.indexOf('className="form-pickup-visual"'),
    component.indexOf('className="form-pickup-copy"'),
  );
  assert.match(figure, /loading="lazy"/);
  assert.match(figure, /fetchPriority="auto"/);
  assert.match(component, /fetchPriority="high"/);
});

test("World reading-stage motion is finite and paused by all rendering guards", () => {
  const css = source("src/styles-world-reading.css");
  for (const guard of [
    'data-world-effects="economy"',
    "data-loading",
    "data-route-cover",
    "data-side-menu-open",
    "data-dialog-open",
  ])
    assert.ok(css.replace(/\s+/g, "").includes(`:not([${guard}])`));
  assert.match(css, /prefers-reduced-motion: no-preference/);
  assert.match(css, /animation: sw-brief-art-in 360ms ease-out both/);
  assert.doesNotMatch(css, /infinite|backdrop-filter/);
});
