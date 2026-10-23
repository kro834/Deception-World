import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { transform } from "lightningcss";

const read = (name) => readFile(new URL(`../src/${name}`, import.meta.url), "utf8");
const sheets = await Promise.all(
  [
    ["styles-tablet-world.css", "world"],
    ["styles-tablet-dossier.css", "dossier"],
  ].map(async ([name, family]) => {
    const css = await read(name);
    const media = [];
    transform({
      filename: name,
      code: Buffer.from(css),
      visitor: {
        Rule(rule) {
          if (rule.type === "media") media.push(rule.value);
        },
      },
    });
    return { name, family, css, media };
  }),
);

// Evaluate parsed media conditions, so the exclusion checks exercise the
// stylesheet's actual guards instead of a separately maintained breakpoint map.
const matches = (condition, viewport) => {
  if (condition.type === "operation") {
    const results = condition.conditions.map((entry) => matches(entry, viewport));
    return condition.operator === "and" ? results.every(Boolean) : results.some(Boolean);
  }
  assert.equal(condition.type, "feature");
  const feature = condition.value;
  if (feature.type === "plain") {
    const actual =
      feature.name === "orientation"
        ? viewport.width > viewport.height
          ? "landscape"
          : "portrait"
        : viewport.pointer;
    assert.ok(["orientation", "any-pointer"].includes(feature.name));
    return actual === feature.value.value;
  }
  assert.equal(feature.type, "range");
  const actual =
    feature.name === "aspect-ratio" ? viewport.width / viewport.height : viewport[feature.name];
  const threshold =
    feature.value.type === "ratio"
      ? feature.value.value[0] / feature.value.value[1]
      : feature.value.value.value.value;
  assert.ok(Number.isFinite(actual) && Number.isFinite(threshold));
  assert.ok(["greater-than-equal", "less-than-equal"].includes(feature.operator));
  return feature.operator === "greater-than-equal" ? actual >= threshold : actual <= threshold;
};
const applies = (media, viewport) =>
  media.query.mediaQueries.some((query) => matches(query.condition, viewport));

test("tablet sheets parse and every rule retains its route family and page scope", () => {
  for (const sheet of sheets) {
    assert.ok(sheet.media.length > 0, sheet.name);
    for (const media of sheet.media) {
      for (const rule of media.rules) {
        assert.equal(rule.type, "style");
        for (const selector of rule.value.selectors) {
          assert.equal(selector[0].type, "type");
          assert.equal(selector[0].name, "html");
          assert.ok(
            selector.some(
              (part) =>
                part.type === "attribute" &&
                part.name === "data-family" &&
                part.operation.value === sheet.family,
            ),
          );
          assert.ok(selector.some((part) => part.type === "type" && part.name === "main"));
        }
        assert.equal(rule.value.declarations.importantDeclarations.length, 0);
      }
    }
  }
});

test("phone and ordinary desktop do not enter any tablet rule even with touch", () => {
  for (const sheet of sheets) {
    for (const viewport of [
      { width: 320, height: 640, pointer: "coarse" },
      { width: 390, height: 844, pointer: "coarse" },
      { width: 1440, height: 900, pointer: "coarse" },
      { width: 1440, height: 900, pointer: "fine" },
    ]) {
      assert.ok(
        sheet.media.every((media) => !applies(media, viewport)),
        `${sheet.name}: ${viewport.width}x${viewport.height}`,
      );
    }
  }
});

test("both compact landscape windows reach the World title reflow", () => {
  const hero = sheets[0].media.find((media) =>
    media.rules.some((rule) =>
      rule.value.declarations.declarations.some((entry) => entry.property === "grid-template"),
    ),
  );
  assert.ok(hero);
  for (const [width, height] of [
    [720, 540],
    [900, 600],
  ]) {
    assert.ok(applies(hero, { width, height, pointer: "coarse" }));
  }
  for (const [width, height] of [
    [768, 1024],
    [820, 1180],
    [1024, 1366],
  ]) {
    assert.equal(applies(hero, { width, height, pointer: "coarse" }), false);
  }
});

test("the split dossier rebalances iPad landscape and the wide fold only", () => {
  const split = sheets[1].media[0];
  for (const [width, height] of [
    [900, 600],
    [1024, 768],
    [1180, 820],
    [1366, 1024],
  ]) {
    assert.ok(applies(split, { width, height, pointer: "coarse" }));
  }
  for (const [width, height] of [
    [720, 540],
    [507, 1024],
    [639, 834],
    [1024, 1366],
  ]) {
    assert.equal(applies(split, { width, height, pointer: "coarse" }), false);
  }
});

test("layout adjustments preserve gestures, stage ownership, artwork and reading content", () => {
  for (const { css } of sheets) {
    const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(
      source,
      /touch-action|pointer-events|overflow|(?<![\w-])position:|display:\s*none|(?<![\w-])content:|url\(|@keyframes|animation|transition|!important/,
    );
    assert.doesNotMatch(
      source,
      /--sd-pad-end\s*:|\.rider-tabs|\.liquid-|\.form-pickup|\.manager-archive-tabs|\.topbar|\.manager-topbar/,
    );
    assert.doesNotMatch(source, /(?<!min-|max-)height\s*:/);
    assert.doesNotMatch(source, /grid-template-rows:\s*subgrid|grid-row\s*:/);
  }
});
