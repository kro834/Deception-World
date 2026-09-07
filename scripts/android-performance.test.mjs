import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { prefersLightweightRendering } from "../src/lib/rendering-profile.js";

test("Android Chrome, Samsung and WebView use CSS glass even with plentiful RAM", () => {
  for (const userAgent of [
    "Linux; Android 14; Pixel 8 Chrome/131",
    "Android 13; SM-S918B SamsungBrowser/26",
    "Android 12; wv",
  ]) {
    assert.equal(
      prefersLightweightRendering({ userAgent, deviceMemory: 8, hardwareConcurrency: 8 }),
      true,
    );
  }
});
test("iPhone, iPad and desktop keep the full renderer without resource constraints", () => {
  for (const userAgent of [
    "iPhone OS 18",
    "iPad; CPU OS 18",
    "Macintosh; Intel Mac OS X",
    "Windows NT 10.0",
  ]) {
    assert.equal(prefersLightweightRendering({ userAgent, hardwareConcurrency: 8 }), false);
  }
});
test("resource hints still select the lightweight renderer independently of platform", () => {
  for (const hints of [
    { deviceMemory: 2 },
    { hardwareConcurrency: 2 },
    { connection: { saveData: true } },
    { connection: { effectiveType: "2g" } },
  ]) {
    assert.equal(prefersLightweightRendering(hints), true);
  }
  assert.equal(prefersLightweightRendering({}), false);
});
test("lightweight glass exits before shader setup and texture generation", () => {
  const source = readFileSync(new URL("../src/lib/liquid/boot.js", import.meta.url), "utf8");
  assert.match(
    source,
    /activate\(root\) \{[\s\S]*?prefersLightweightRendering\(navigator\)[\s\S]*?return false;[\s\S]*?this\.ensure\(\)/,
  );
});
