import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { prefersLightweightRendering } from "../src/lib/rendering-profile.js";

const PIXEL_9 =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";
const GALAXY_S24 =
  "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";
const SAMSUNG_INTERNET =
  "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36";
const WEBVIEW =
  "Mozilla/5.0 (Linux; Android 12; SM-A536B; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.0.0 Mobile Safari/537.36";

const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("capable Android Chrome, Samsung Internet and WebView keep the full renderer", () => {
  for (const userAgent of [PIXEL_9, GALAXY_S24, SAMSUNG_INTERNET, WEBVIEW]) {
    for (const hardwareConcurrency of [6, 8, 9, 10]) {
      assert.equal(
        prefersLightweightRendering({ userAgent, deviceMemory: 8, hardwareConcurrency }),
        false,
        `${userAgent} ${hardwareConcurrency}`,
      );
    }
  }
  // Chrome may withhold the hints entirely; the model name never decides.
  assert.equal(prefersLightweightRendering({ userAgent: PIXEL_9 }), false);
});

test("weak Android hardware and constrained networks select the lightweight renderer", () => {
  for (const hints of [
    { hardwareConcurrency: 4, deviceMemory: 4 },
    { hardwareConcurrency: 4, deviceMemory: 8 },
    { hardwareConcurrency: 2 },
    { hardwareConcurrency: 8, deviceMemory: 2 },
    { hardwareConcurrency: 8, deviceMemory: 8, connection: { saveData: true } },
    { hardwareConcurrency: 8, deviceMemory: 8, connection: { effectiveType: "2g" } },
    { hardwareConcurrency: 8, deviceMemory: 8, connection: { effectiveType: "slow-2g" } },
  ]) {
    for (const userAgent of [PIXEL_9, SAMSUNG_INTERNET, WEBVIEW]) {
      assert.equal(
        prefersLightweightRendering({ userAgent, ...hints }),
        true,
        `${userAgent} ${JSON.stringify(hints)}`,
      );
    }
  }
});

test("iPhone, iPad and desktop keep the full renderer without resource constraints", () => {
  for (const userAgent of [
    "iPhone OS 26",
    "iPad; CPU OS 27",
    "Macintosh; Intel Mac OS X",
    "Windows NT 10.0",
  ]) {
    assert.equal(prefersLightweightRendering({ userAgent, hardwareConcurrency: 8 }), false);
  }
  // Four cores is a weak-Android signal only; it says nothing about a desktop.
  assert.equal(
    prefersLightweightRendering({ userAgent: "Windows NT 10.0", hardwareConcurrency: 4 }),
    false,
  );
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
  const source = readSource("src/lib/liquid/boot.js");
  assert.match(
    source,
    /activate\(root\) \{[\s\S]*?prefersLightweightRendering\(navigator\)[\s\S]*?return false;[\s\S]*?this\.ensure\(\)/,
  );
});

test("frosted controls keep capable Android on the CSS lens (no WebGL)", () => {
  assert.match(readSource("src/styles-frosted-controls.css"), /:root \{\s*--liquid-frosted: 1;/);
  assert.match(
    readSource("src/lib/liquid/boot.js"),
    /activate\(root\) \{[\s\S]*?--liquid-frosted'\)\.trim\(\) === '1'\)[\s\S]*?return false;[\s\S]*?this\.ensure\(\)/,
  );
});

test("Android keeps compositor-driven reading progress, independent of economy", () => {
  const mode = readSource("src/components/world/use-world-mode.ts");
  const supports = mode.match(/const supportsNativeProgress =([\s\S]*?);/)?.[1] ?? "";
  assert.match(supports, /\/Android\/i\.test\(userAgent\)/);
  assert.doesNotMatch(supports, /economy/i);
  const css = readSource("src/styles-android-performance.css");
  assert.match(
    css,
    /html\[data-native-scroll-progress="true"\][\s\S]*?animation-timeline: scroll\(root block\)/,
  );
  // One line: the native path drops the Motion prism, the script path drops
  // the hairline.
  assert.match(
    css,
    /html\[data-native-scroll-progress="true"\]:not\(\[data-world-effects="economy"\]\)\s*\.site-shell\.film-edition\.motion-on\s*\.topbar::before \{\s*content: none;/,
  );
  assert.match(
    css,
    /html:not\(\[data-world-effects="economy"\]\):not\(\[data-native-scroll-progress="true"\]\)\s*\.site-shell\.film-edition\.motion-on\s*\.topbar::after \{\s*content: none;/,
  );
});

test("capable Android keeps the key art and the Mirage boot; only economy freezes decoration", () => {
  const css = readSource("src/styles-android-performance.css");
  const hidden =
    css.match(
      /html\[data-android-renderer\]\s*:is\(([^)]*)\)\s*\{\s*display: none !important;/,
    )?.[1] ?? "";
  assert.match(hidden, /\.grain/);
  assert.doesNotMatch(hidden, /\.hero-backdrop-layer/);
  // Every animation freeze (it used to stop the boot's mr-project beat on
  // .poster-media) is scoped to weak Android.
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const freezes = [...rules.matchAll(/([^{}]+)\{[^{}]*animation: none !important;/g)];
  assert.ok(freezes.length > 0);
  for (const [, selector] of freezes) {
    assert.match(selector, /html\[data-android-renderer\]/);
    assert.doesNotMatch(
      selector,
      /html\[data-android-renderer\](?!\[data-world-effects="economy"\])/,
      selector,
    );
  }
});

test("Android keeps the edge stretch and uses small-viewport min-heights", () => {
  const css = readSource("src/styles-world/18.css");
  const root = css.match(/html\[data-android-renderer\] \{([^}]*)\}/)?.[1] ?? "";
  assert.match(root, /overscroll-behavior-y: contain;/);
  assert.doesNotMatch(css, /html\[data-android-renderer\][^{]*\{[^}]*overscroll-behavior-y: none/);
  assert.doesNotMatch(css, /html\[data-android-renderer\][^{]*\{[^}]*min-height: 100dvh/);
});
