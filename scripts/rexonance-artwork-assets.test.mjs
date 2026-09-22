import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";

const readSource = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const artworks = [
  "rider-rexonance-saga-pickup-20260922",
  "rider-rexonance-max-20260922",
  "rider-rexonance-ultra-20260922",
];

test("the dated Rexonance artwork set ships canonical and responsive WebP files", () => {
  const imageMap = readSource("../src/lib/rexonance-images.ts");
  const buildScript = readSource("./build-rexonance-images.mjs");

  for (const stem of artworks) {
    assert.match(imageMap, new RegExp(`/${stem}\\.webp\\": 1086`));
    assert.match(buildScript, new RegExp(`\\"${stem}\\.webp\\"`));

    for (const file of [
      `${stem}.webp`,
      `${stem}-delivery-640.webp`,
      `${stem}-delivery-960.webp`,
      `${stem}-delivery-1086.webp`,
    ]) {
      const asset = new URL(`../public/${file}`, import.meta.url);
      const bytes = readFileSync(asset);
      assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF", file);
      assert.equal(bytes.subarray(8, 12).toString("ascii"), "WEBP", file);
      assert.ok(statSync(asset).size < 1_200_000, `${file} should stay below 1.2 MB`);
    }
  }
});

test("both archive detail and comparison cards use the replacement for all three forms", () => {
  const script = readSource("../public/rexonance-archive-update.js");
  const css = readSource("../public/rexonance-archive-update.css");
  for (const stem of artworks) {
    assert.ok(script.includes(`image.src = "/${stem}.webp"`), stem);
    assert.ok(css.includes(`content: url("/${stem}.webp")`), stem);
  }
});
