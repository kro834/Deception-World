import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { transform } from "lightningcss";

const css = readFileSync(new URL("../src/styles-tablet-reading.css", import.meta.url), "utf8");
const media = [];
transform({
  filename: "styles-tablet-reading.css",
  code: Buffer.from(css),
  visitor: {
    Rule(rule) {
      if (rule.type === "media") media.push(rule.value);
    },
  },
});

// Exercise the parsed stylesheet's guards, including the aspect-ratio gates.
function matches(condition, { width, height }) {
  if (condition.type === "operation") {
    const results = condition.conditions.map((item) => matches(item, { width, height }));
    return condition.operator === "and" ? results.every(Boolean) : results.some(Boolean);
  }
  assert.equal(condition.type, "feature");
  const feature = condition.value;
  if (feature.type === "plain") {
    if (feature.name === "any-pointer") return feature.value.value === "coarse";
    assert.equal(feature.name, "orientation");
    return (width > height ? "landscape" : "portrait") === feature.value.value;
  }
  assert.equal(feature.type, "range");
  const actual = feature.name === "aspect-ratio" ? width / height : { width, height }[feature.name];
  const limit =
    feature.value.type === "ratio"
      ? feature.value.value[0] / feature.value.value[1]
      : feature.value.value.value.value;
  assert.ok(Number.isFinite(actual) && Number.isFinite(limit));
  assert.ok(["greater-than-equal", "less-than-equal"].includes(feature.operator));
  return feature.operator === "greater-than-equal" ? actual >= limit : actual <= limit;
}
const applies = (block, width, height) =>
  block.query.mediaQueries.some((query) => matches(query.condition, { width, height }));

test("reading rules parse and retain an explicit family and local surface scope", () => {
  assert.equal(media.length, 5);
  for (const block of media) {
    for (const rule of block.rules) {
      assert.equal(rule.type, "style");
      for (const selector of rule.value.selectors) {
        assert.equal(selector[0].name, "html");
        assert.ok(
          selector.some((part) => part.type === "attribute" && part.name === "data-family"),
        );
        assert.ok(
          selector.some(
            (part) =>
              part.type === "class" &&
              ["dream-reading-room", "dream-page", "search-page"].includes(part.name),
          ),
        );
      }
      assert.equal(rule.value.declarations.importantDeclarations.length, 0);
    }
  }
});

test("ordinary phones, split windows and 1440px desktop retain their layouts", () => {
  for (const [width, height] of [
    [320, 640],
    [390, 844],
    [507, 1024],
    [639, 834],
    [1440, 900],
  ]) {
    assert.ok(
      media.slice(0, 4).every((block) => !applies(block, width, height)),
      `${width}x${height}`,
    );
  }
});

test("large portrait tablets receive the compact controls and full-width contents", () => {
  assert.ok(applies(media[0], 1024, 1366));
  for (const [width, height] of [
    [820, 1180],
    [1024, 768],
    [1080, 720],
    [1180, 820],
  ]) {
    assert.equal(applies(media[0], width, height), false, `${width}x${height}`);
  }
  for (const selector of [
    ".dream-reading-chapter-select",
    ".dream-reading-position-select",
    ".dream-prologue",
    ".dream-contents",
  ]) {
    assert.ok(css.includes(selector));
  }
});

test("the folio adjustment covers portrait and landscape iPad sizes", () => {
  for (const [width, height] of [
    [768, 1024],
    [820, 1180],
    [1024, 1366],
    [1024, 768],
    [1180, 820],
    [1366, 1024],
  ]) {
    assert.ok(applies(media[1], width, height), `${width}x${height}`);
  }
});

test("compact landscape rails cover the fold sizes without reaching portrait", () => {
  for (const [width, height] of [
    [720, 540],
    [900, 600],
    [1080, 720],
  ]) {
    assert.ok(applies(media[2], width, height), `${width}x${height}`);
  }
  for (const [width, height] of [
    [768, 1024],
    [1024, 1366],
    [1024, 768],
    [1180, 820],
  ]) {
    assert.equal(applies(media[2], width, height), false, `${width}x${height}`);
  }
});

test("the search-kind extension only reaches short landscape tablet windows", () => {
  for (const [width, height] of [
    [1024, 768],
    [1080, 720],
  ]) {
    assert.ok(applies(media[3], width, height), `${width}x${height}`);
  }
  for (const [width, height] of [
    [900, 600],
    [1024, 1366],
    [1180, 820],
  ]) {
    assert.equal(applies(media[3], width, height), false, `${width}x${height}`);
  }
});

test("reading layout leaves card columns, chapter estimates and input behavior untouched", () => {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(
    source,
    /content-visibility|contain-intrinsic|scroll-margin|touch-action|pointer-events|@keyframes|animation|transition|!important/,
  );
  assert.doesNotMatch(
    source,
    /\.library-grid|\.search-result-grid|\.dream-section|\.dream-annex|\.dream-story-case|\.dream-hero|\.dream-topbar|font-size:\s*(?:1[01]|[0-9])px/,
  );
  assert.doesNotMatch(source, /(?<![\w-])content:|url\(|object-fit|object-position/);
});
