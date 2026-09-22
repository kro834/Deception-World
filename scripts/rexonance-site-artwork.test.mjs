import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { REXONANCE_SITE_ARTWORK } from "../src/lib/rexonance-site-artwork.ts";
import { rexonanceImage } from "../src/lib/rexonance-images.ts";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const component = read("src/components/rexonance-saga/rexonance-saga.tsx");
const route = read("src/routes/rexonance-saga.tsx");

test("the special site maps the three supplied artworks to separately versioned URLs", () => {
  assert.deepEqual(REXONANCE_SITE_ARTWORK, {
    standard: "/rider-rexonance-saga-pickup-20260923.webp",
    max: "/rider-rexonance-max-20260923.webp",
    ultra: "/rider-rexonance-ultra-20260923.webp",
  });
  for (const stage of Object.keys(REXONANCE_SITE_ARTWORK)) {
    assert.match(
      component,
      new RegExp(`${stage}: \\{[\\s\\S]*?image: REXONANCE_SITE_ARTWORK\\.${stage}`),
    );
  }
  assert.doesNotMatch(component + route, /rider-rexonance-[\w-]+-20260922/);
});

test("hero, share image, preload and navigation warmup use the same new standard artwork", () => {
  assert.match(component, /src=\{REXONANCE_SITE_ARTWORK\.standard\}/);
  assert.match(component, /rexonanceImage\(REXONANCE_SITE_ARTWORK\.standard\)/);
  assert.match(route, /"og:image", content: REXONANCE_SITE_ARTWORK\.standard/);
  assert.match(route, /href: REXONANCE_SITE_ARTWORK\.standard/);
  assert.match(route, /imageSrcSet: rexonanceImage\(REXONANCE_SITE_ARTWORK\.standard\)\.srcSet/);
  assert.match(
    read("src/lib/asset-loader.ts"),
    /REXONANCE_SAGA_ENTER_ASSETS = \[REXONANCE_SITE_ARTWORK\.standard\]/,
  );
  assert.match(
    component,
    /warmRexonanceStages\(rail, \[STAGES\.max\.image, STAGES\.ultra\.image\]\)/,
  );
});

test("all new original and responsive images are local WebP below 600 KB", () => {
  for (const source of Object.values(REXONANCE_SITE_ARTWORK)) {
    const { srcSet } = rexonanceImage(source);
    const candidates = srcSet.split(", ").map((item) => item.split(" ")[0]);
    assert.equal(candidates.length, 3);
    for (const path of [source, ...candidates]) {
      const bytes = readFileSync(new URL(`../public${path}`, import.meta.url));
      assert.equal(bytes.toString("ascii", 0, 4), "RIFF", path);
      assert.equal(bytes.toString("ascii", 8, 12), "WEBP", path);
      assert.ok(bytes.length < 600_000, path);
      assert.match(path, /20260923/);
    }
  }
});
