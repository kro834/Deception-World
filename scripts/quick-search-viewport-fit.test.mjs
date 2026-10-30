import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/styles-quick-search.css", import.meta.url), "utf8");
const dialog = css.match(/dialog\.quick-search\s*\{([^}]+)\}/)[1];
const panel = css.match(/\.quick-search-panel\s*\{([^}]+)\}/)[1];
const top = dialog.match(/--qs-top:\s*([^;]+);/)[1];
const maximum = panel.match(/max-height:\s*([^;]+);/)[1];

// Evaluate these authored CSS lengths against a short landscape/split viewport.
// This catches a sheet whose scroll area fits its own max-height but whose
// top margin pushes its footer below the locked document's viewport.
function length(value, height) {
  const expression = value
    .replaceAll("var(--qs-top)", top)
    .replace(/([0-9.]+)d?vh/g, (_, n) => String((Number(n) * height) / 100))
    .replace(/([0-9.]+)px/g, "$1")
    .replace(/\b(min|max)\(/g, "Math.$1(")
    .replace(/\bcalc\(/g, "(");
  assert.match(expression.replace(/Math\.(min|max)/g, ""), /^[0-9.\s()+,*\-/]+$/);
  return Function(`return (${expression})`)();
}

for (const height of [320, 600, 700, 834, 1194]) {
  test(`quick-search results and footer fit a ${height}px landscape/split viewport`, () => {
    const offset = length(top, height);
    const available = length(maximum, height);
    assert.ok(available > 0);
    assert.ok(
      offset + available <= height - 24,
      `${offset} + ${available} exceeds the bottom escape margin`,
    );
  });
}

test("phone layout reserves its own 12px top and bottom margins", () => {
  assert.match(
    css,
    /@media \(max-width: 640px\) \{\s*dialog\.quick-search \{[^}]*margin-top: 12px;[^}]*max-height: calc\(100dvh - 24px\);/,
  );
});
