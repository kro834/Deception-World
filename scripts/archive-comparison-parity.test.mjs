import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const standalone = readFileSync(
  new URL("../public/realm-form-archive-standalone.html", import.meta.url),
  "utf8",
);
const embedded = readFileSync(
  new URL("../public/realm-form-archive-embedded.html", import.meta.url),
  "utf8",
);
const realmUpdate = readFileSync(
  new URL("../public/realm-archive-update.js", import.meta.url),
  "utf8",
);
const realmUpdateCss = readFileSync(
  new URL("../public/realm-archive-update.css", import.meta.url),
  "utf8",
);

for (const [label, html] of [
  ["standalone", standalone],
  ["embedded", embedded],
]) {
  test(`Realm ${label} comparison uses the enhanced Saga control layout`, () => {
    assert.match(html, /id="realm-v29-saga-comparison-parity"/);
    assert.match(html, /\.files-compare-mode-v14,[\s\S]*?display:none!important/);
    assert.match(html, /\.compare-native-controls \{[\s\S]*?display:grid!important/);
    assert.match(html, /\.compare-native-controls > \.compare-range-head \{[\s\S]*?display:flex!important/);
    assert.match(html, /\.compare-native-controls > \.compare-range \{[\s\S]*?display:block!important/);
    assert.match(html, /\.compare-live-status \{[\s\S]*?display:block!important/);
  });
}

test("Realm comparison controller keeps both input sides in Saga's direct mode", () => {
  assert.match(standalone, /panel\.classList\.add\('saga-compare-ready'\)/);
  assert.match(standalone, /compare\.classList\.add\('is-enhanced'\)/);
  assert.match(standalone, /nativeMode\.checked=true/);
  assert.match(standalone, /quickMode\.checked=false/);
  assert.match(standalone, /data-controller','ios-direct-realm-v29'/);
  assert.match(standalone, /window\.addEventListener\('pageshow'/);
});

test("Realm comparison swaps the analysis channel colors with the selected forms", () => {
  assert.match(standalone, /\.is-color-swapped \.compare-side-a \{[\s\S]*?--side-accent:var\(--saga-violet\)/);
  assert.match(standalone, /\.is-color-swapped \.compare-side-b \{[\s\S]*?--side-accent:var\(--saga-cyan\)/);
  assert.match(standalone, /colorsSwapped=!colorsSwapped/);
  assert.match(standalone, /labels\[0\]\.textContent=colorsSwapped\?'VIOLET CHANNEL':'CYAN CHANNEL'/);
  assert.match(standalone, /labels\[1\]\.textContent=colorsSwapped\?'CYAN CHANNEL':'VIOLET CHANNEL'/);
  assert.match(realmUpdate, /colorsSwapped = !colorsSwapped/);
  assert.match(realmUpdate, /compare\.classList\.toggle\("is-color-swapped", colorsSwapped\)/);
  assert.match(realmUpdate, /colorsSwapped \? "VIOLET CHANNEL" : "CYAN CHANNEL"/);
  assert.match(realmUpdate, /colorsSwapped \? "CYAN CHANNEL" : "VIOLET CHANNEL"/);
});

test("Realm comparison reuses Saga's panel motion and arrow color states", () => {
  assert.match(realmUpdate, /panel\.animate\(/);
  assert.match(realmUpdate, /translate3d\(\$\{direction \* 10\}px,0,0\) scale\(\.995\)/);
  assert.match(realmUpdate, /duration: 420, easing: "cubic-bezier\(\.16,1,\.3,1\)"/);
  assert.match(realmUpdate, /window\.setTimeout\(finishAnimation, 520\)/);
  assert.doesNotMatch(realmUpdate, /railBar\.animate\(/);
  assert.match(realmUpdateCss, /\.is-color-swapped \.compare-swap-js\.is-flipped \.compare-swap-icon \{[\s\S]*?color: var\(--saga-violet\) !important/);
  assert.match(realmUpdateCss, /transform 0\.46s cubic-bezier\(0\.16, 1, 0\.3, 1\)/);
  assert.match(realmUpdateCss, /color 0\.34s ease/);
  assert.doesNotMatch(realmUpdateCss, /animation-duration:\s*480ms/);
  assert.doesNotMatch(realmUpdateCss, /cubic-bezier\(\.2,\s*\.82,\s*\.24,\s*1\)/);
  assert.doesNotMatch(realmUpdateCss, /is-swapping \.compare-side-/);
});
