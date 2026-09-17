import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";
import { rexonanceImage } from "../src/lib/rexonance-images.ts";

test("Responsive Rexonance variants exist and are smaller than their originals", () => {
  for (const source of [
    "/rider-rexonance-saga-pickup.jpeg",
    "/rider-rexonance-max.webp",
    "/rider-rexonance-ultra.webp",
    "/rexonance-p14-core.jpg",
  ]) {
    const { srcSet, sizes } = rexonanceImage(source);
    assert.ok(sizes.includes("100vw"));
    const original = statSync(new URL(`../public${source}`, import.meta.url)).size;
    for (const candidate of srcSet.split(", ")) {
      const [path] = candidate.split(" ");
      const bytes = readFileSync(new URL(`../public${path}`, import.meta.url));
      assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
      assert.ok(bytes.length < original, path);
    }
  }
  assert.deepEqual(rexonanceImage("/unrelated.jpg"), {});
});

test("Preload and warmup use the same responsive source as the rendered images", () => {
  for (const file of [
    "routes/rexonance-saga.tsx",
    "components/rexonance-saga/rexonance-saga.tsx",
    "lib/asset-loader.ts",
  ]) {
    const source = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
    assert.match(source, /rexonanceImage/);
  }
});
