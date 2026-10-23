import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { transform } from "lightningcss";

const read = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), "utf8");

function parse(name, source) {
  const media = [];
  transform({
    filename: name,
    code: Buffer.from(source),
    visitor: {
      Rule(rule) {
        if (rule.type === "media") media.push(rule.value);
      },
    },
  });
  return media;
}

function styleRules(name, source) {
  const styles = [];
  transform({
    filename: name,
    code: Buffer.from(source),
    visitor: {
      Rule(rule) {
        if (rule.type === "style") styles.push(rule.value);
      },
    },
  });
  return styles;
}

function features(condition, result = []) {
  if (condition.type === "operation") {
    assert.equal(condition.operator, "and", "tablet guard must require every feature");
    for (const child of condition.conditions) features(child, result);
  } else {
    assert.equal(condition.type, "feature");
    result.push(condition.value);
  }
  return result;
}

function pxValue(value) {
  if (!value || typeof value !== "object") return undefined;
  if (value.unit === "px" && typeof value.value === "number") return value.value;
  for (const child of Object.values(value)) {
    const found = pxValue(child);
    if (found !== undefined) return found;
  }
  return undefined;
}

function selectorText(selector) {
  const names = [];
  const visit = (part) => {
    if (!part || typeof part !== "object") return;
    if (part.name) names.push(part.name);
    if (part.operation?.value) names.push(part.operation.value);
    if (part.selectors) part.selectors.forEach((nested) => nested.forEach(visit));
  };
  selector.forEach(visit);
  return names;
}

function scopedRules(media, family, requiredNames, targetTag, property) {
  const found = [];
  for (const block of media) {
    for (const rule of block.rules) {
      assert.equal(rule.type, "style");
      for (const selector of rule.value.selectors) {
        const names = selectorText(selector);
        const declarations = rule.value.declarations.declarations;
        if (
          !declarations.some(
            (declaration) => declaration.property === property && pxValue(declaration.value) === 48,
          )
        ) {
          continue;
        }
        if (
          names.includes(family) &&
          requiredNames.every((name) => names.includes(name)) &&
          (!targetTag || names.includes(targetTag))
        ) {
          found.push({ block, selector: names, declarations });
        }
      }
    }
  }

  // Validate the guard on the exact rule that declares the 48px target. This
  // avoids treating a similarly named 960-1100px search layout rule as proof.
  for (const { block } of found) {
    const required = new Map([
      ["width:greater-than-equal", 560],
      ["width:less-than-equal", 1366],
      ["height:greater-than-equal", 501],
    ]);
    let coarse = false;
    for (const query of block.query.mediaQueries) {
      for (const feature of features(query.condition)) {
        if (feature.type === "plain" && feature.name === "any-pointer") {
          coarse ||= feature.value.value === "coarse";
        }
        if (feature.type === "range") {
          const key = `${feature.name}:${feature.operator}`;
          if (required.has(key)) {
            assert.equal(pxValue(feature.value), required.get(key), `${key} tablet guard`);
            required.delete(key);
          }
        }
      }
    }
    assert.equal(required.size, 0, "48px target carries the complete viewport guard");
    assert.ok(coarse, "48px target requires any-pointer: coarse");
  }
  return found;
}

function hasPxDeclaration(rule, property, expected) {
  return rule.declarations.some(
    (declaration) => declaration.property === property && pxValue(declaration.value) === expected,
  );
}

const galleryCss = read("styles-tablet-gallery.css");
const gallery = parse("styles-tablet-gallery.css", galleryCss);
const readingCss = read("styles-tablet-reading.css");
const reading = parse("styles-tablet-reading.css", readingCss);

test("touch target overrides parse and require the tablet pointer guard", () => {
  for (const [rules, family, names, tag] of [
    [gallery, "gallery", ["gallery-page", "gallery-viewer"], "button"],
    [reading, "dream", ["dream-reading-room"], "button"],
    [reading, "library", ["search-page", "search-categories"], "button"],
  ]) {
    const targets = scopedRules(rules, family, names, tag, "min-height");
    assert.ok(targets.length > 0, `${family} target is route-family scoped under tablet guard`);
    assert.ok(targets.some((rule) => hasPxDeclaration(rule, "min-height", 48)));
    if (family === "gallery") {
      const summaryTargets = scopedRules(rules, family, names, "summary", "min-height");
      assert.ok(summaryTargets.some((rule) => hasPxDeclaration(rule, "min-height", 48)));
      assert.ok(
        scopedRules(rules, family, names, "button", "min-width").some((rule) =>
          hasPxDeclaration(rule, "min-width", 48),
        ),
      );
    }
  }
  const dreamSelectTargets = scopedRules(
    reading,
    "dream",
    ["dream-reading-room"],
    "select",
    "min-height",
  );
  assert.ok(
    dreamSelectTargets.some((rule) => hasPxDeclaration(rule, "min-height", 48)),
    "Dream select's 48px minimum stays inside the tablet touch guard",
  );
});

test("Dream position label stays 12px", () => {
  const positionCss = read("components/dream-chapter/dream-reading-room.css");
  assert.doesNotThrow(() => parse("dream-reading-room.css", positionCss));
  assert.match(
    positionCss,
    /\.dream-reading-position-select\s*>\s*span\s*\{[^}]*font-size:\s*12px;/,
  );
});

test("Dream select keeps a base custom arrow while its 48px minimum stays tablet-gated", () => {
  const roomCss = read("components/dream-chapter/dream-reading-room.css");
  const roomRules = styleRules("dream-reading-room.css", roomCss);
  const scopedSelectRules = roomRules
    .filter((rule) =>
      rule.selectors.some((selector) => {
        const names = selectorText(selector);
        return names.includes("dream-reading-room") && names.includes("select");
      }),
    )
    .map((rule) => rule.declarations.declarations);
  const arrow = scopedSelectRules.find((declarations) =>
    declarations.some((declaration) => declaration.property === "background-image"),
  );
  assert.ok(arrow, "Dream room select has a component-scoped custom arrow");

  const appearances = arrow.filter((declaration) => declaration.property === "appearance");
  assert.ok(
    appearances.some(
      (declaration) => declaration.vendorPrefix?.includes("webkit") && declaration.value === "none",
    ),
  );
  assert.ok(
    appearances.some(
      (declaration) => !declaration.vendorPrefix?.length && declaration.value === "none",
    ),
  );

  const paddedSelect = roomRules.find((rule) =>
    rule.selectors.some((selector) => {
      const names = selectorText(selector);
      return (
        names.includes("dream-reading-position-select") &&
        names.includes("dream-reading-room") &&
        names.includes("select")
      );
    }),
  );
  assert.ok(paddedSelect, "position selector keeps room for the arrow");
  const padding = paddedSelect.declarations.declarations.find(
    (declaration) => declaration.property === "padding-inline",
  )?.value;
  assert.equal(pxValue(padding.inlineStart), 12);
  assert.equal(pxValue(padding.inlineEnd), 32);

  const arrows = arrow.find((declaration) => declaration.property === "background-image")?.value;
  assert.equal(arrows.length, 2, "both chevron strokes are present");
  assert.ok(arrows.every((image) => image.type === "gradient"));
});

test("Gallery header keeps an inset focus ring and the close control spans both rows", () => {
  const focus = galleryCss.match(
    /\.gallery-viewer-header[\s\S]*?:focus-visible\s*\{([^}]*)\}/,
  )?.[1];
  assert.ok(focus, "Gallery header focus-visible rule exists");
  assert.match(focus, /outline-offset:\s*-3px;/);

  const closing = galleryCss.match(/\.gallery-close-primary\s*\{([^}]*)\}/)?.[1];
  assert.ok(closing, "Gallery close control rule exists");
  assert.match(closing, /grid-row:\s*1\s*\/\s*span\s+2;/);
});
