import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const component = read("src/components/dream-chapter/dream-record-explorer.tsx");
const style = read("src/styles-dream-record-explorer.css");

test("the record explorer uses only canonical chronicle fields and existing destinations", () => {
  assert.match(component, /filterDreamRecords\(DREAM_CHRONICLE, filters\)/);
  assert.match(component, /record\.title\.text/);
  assert.match(component, /dreamRecordExcerpt\(record\)/);
  assert.match(component, /record\.cast\.join\("・"\)/);
  assert.match(component, /DREAM_RECORD_OPTIONS\.cases\.map/);
  assert.match(component, /DREAM_RECORD_OPTIONS\.people\.map/);
  assert.match(component, /DREAM_RECORD_OPTIONS\.places\.map/);
  assert.match(component, /resolveDreamRecordLinks\(record/);
  assert.match(component, /links\.chronicleHref/);
  assert.match(component, /links\.synopsisHref/);
  assert.match(component, /links\.placeHref/);
});

test("the result list is bounded, announces result counts, and exposes an empty-state reset", () => {
  assert.match(component, /const PAGE_SIZE = 8/);
  assert.match(component, /results\.slice\(0, visibleCount\)/);
  assert.match(component, /aria-live="polite"/);
  assert.match(component, /この条件に合う記録はありません/);
  assert.match(component, /条件をクリア/);
  assert.match(component, /続き(?:を|を)表示/);
});

test("controls remain labeled and the dedicated stylesheet stays page-scoped and responsive", () => {
  for (const label of ["章", "人物", "舞台"])
    assert.match(component, new RegExp(`<span>${label}<\\/span>`));
  assert.match(component, /<select[\s\S]*?value=\{filters\.case\}/);
  assert.match(component, /<select[\s\S]*?value=\{filters\.person\}/);
  assert.match(component, /<select[\s\S]*?value=\{filters\.place\}/);
  assert.match(style, /\.dream-page\.dream-page \.dream-record-explorer/);
  assert.match(
    style,
    /@media \(max-width: 520px\)[\s\S]*?\.dream-record-results\s*\{\s*grid-template-columns: minmax\(0, 1fr\)/,
  );
  assert.match(style, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(style, /@media \(forced-colors: active\)/);
  assert.match(style, /:focus-visible/);
  assert.doesNotMatch(style, /font-size:\s*(?:[0-9]|1[01])px/);
});
