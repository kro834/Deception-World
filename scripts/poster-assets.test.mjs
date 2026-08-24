import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const worldHome = read("../src/components/world/world-home.tsx");
const worldHomePart = read("../source-parts/src/components/world/world-home.tsx/01.part");
const fetchAssets = read("./fetch-public-assets.mjs");

test("the two supplied key visuals join the poster shuffle deck", () => {
  assert.match(worldHome, /poster-card-32\.jpeg/);
  assert.match(worldHome, /poster-card-33\.jpeg/);
  assert.match(worldHome, /仮面ライダーサイファー/);
  assert.match(worldHome, /夜の遊園地に立つ紅黒の装甲ライダー/);
  assert.match(worldHomePart, /poster-card-32\.jpeg/);
  assert.match(worldHomePart, /poster-card-33\.jpeg/);
  assert.match(fetchAssets, /"poster-card-32\.jpeg"/);
  assert.match(fetchAssets, /"poster-card-33\.jpeg"/);
});

test("the new posters are optimized deployment assets", () => {
  for (const name of ["poster-card-32.jpeg", "poster-card-33.jpeg"]) {
    const asset = new URL(`../public/${name}`, import.meta.url);
    const bytes = statSync(asset).size;
    assert.ok(bytes > 100_000, `${name} should contain the supplied artwork`);
    assert.ok(bytes < 700_000, `${name} should stay within the poster transfer budget`);
    assert.equal(readFileSync(asset).subarray(0, 3).toString("hex"), "ffd8ff");
  }
});
