import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// Owner decisions (2026-11-23), following the canon update: no stray "* "
// bullet in リアクター・モア, Rexonance's unit is 『P14』, and its resonance is
// 《自己共鳴》 (never 超共鳴).
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("リアクター・モア's first bullet uses ・ like the others, never a literal '* '", () => {
  for (const path of [
    "src/components/illusionculum-saga/illusionculum-data.ts",
    "design/illusionculum-saga-20261023/owner-text.md",
  ]) {
    const text = read(path);
    assert.ok(text.includes("・多角包囲砲撃と位相障壁："), path);
    assert.doesNotMatch(text, /\* 多角包囲砲撃/, path);
  }
});

test("Rexonance's unit is 『P14』 everywhere, never 『P14 Extreme Tuning』", () => {
  const paths = [
    "src/components/rexonance-saga/rexonance-saga.tsx",
    "src/components/far-from-saga/far-from-report-text.ts",
    "src/components/far-from-saga/far-from-p16-official-text.ts",
    "src/components/far-from-saga/far-from-p16-official.ts",
    "src/components/far-from-saga/far-from-p16-data.ts",
    "src/components/far-from-saga/far-from-p16.tsx",
    "src/components/far-from-saga/far-from-comparison-data.ts",
    "src/components/search/search-data.ts",
    "src/routes/rexonance-saga.tsx",
    "src/components/illusionculum-saga/illusionculum-data.ts",
    "src/components/meta-unitas-saga/meta-unitas-data.ts",
    "public/saga-form-archive-embedded.html",
    "archives/saga-form-archive-standalone.html",
  ];
  for (const path of paths) assert.doesNotMatch(read(path), /P14\s+Extreme/, path);
  assert.match(read("src/components/rexonance-saga/rexonance-saga.tsx"), /『P14』は、出力変換・位相制御・能力間調停を/);
  assert.match(read("src/components/far-from-saga/far-from-report-text.ts"), /レクソナンスサーガの『P14』を基礎として/);
  // Expreme's own unit stays 『P14 Standard』.
  assert.match(read("src/components/extreme-saga/extreme-saga.tsx"), /エクスプリームの『P14 Standard』/);
});

test("Far From's blurbs call Rexonance's resonance 《自己共鳴》, not 超共鳴", () => {
  const paths = [
    "src/components/final-stage/final-stage.tsx",
    "src/components/final-stage/final-stage-data.ts",
    "src/components/world/rider-page.tsx",
    "src/components/search/form-archive-index.ts",
    "public/saga-form-archive-embedded.html",
    "archives/saga-form-archive-standalone.html",
  ];
  for (const path of paths) {
    const text = read(path);
    assert.doesNotMatch(text, /超共鳴/, path);
    assert.match(text, /《自己共鳴》/, path);
    assert.doesNotMatch(text, /《《|》》/, path);
  }
  assert.match(read("src/components/search/form-archive-index.ts"), /最終到達｜《自己共鳴》と接続・統合・多次元運用/);
});
