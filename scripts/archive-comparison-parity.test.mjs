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
