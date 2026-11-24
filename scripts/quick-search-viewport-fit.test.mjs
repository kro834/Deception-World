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
function length(
  value,
  height,
  { topInset = 0, bottomInset = 0, topOffset = top, bottomOffset = "0px" } = {},
) {
  const expression = value
    .replaceAll("var(--qs-top)", topOffset)
    .replaceAll("var(--qs-bottom)", bottomOffset)
    .replaceAll("env(safe-area-inset-top, 0px)", `${topInset}px`)
    .replaceAll("env(safe-area-inset-bottom, 0px)", `${bottomInset}px`)
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

test("phone sheet and scroll panel fit above the home indicator and below the top inset", () => {
  const [, phone, phonePanel] = css.match(
    /@media \(max-width: 640px\) \{\s*dialog\.quick-search \{([^}]+)\}\s*\.quick-search-panel \{([^}]+)\}/,
  );
  const topOffset = phone.match(/--qs-top:\s*([^;]+);/)[1];
  const bottomOffset = phone.match(/--qs-bottom:\s*([^;]+);/)[1];
  for (const [topInset, bottomInset] of [
    [0, 0],
    [59, 34],
  ]) {
    const height = 667;
    const dimensions = { topInset, bottomInset, topOffset, bottomOffset };
    const y = length(phone.match(/margin-top:\s*([^;]+);/)[1], height, dimensions);
    assert.equal(y, Math.max(12, topInset));
    for (const sheet of [phone, phonePanel]) {
      const available = length(sheet.match(/max-height:\s*([^;]+);/)[1], height, dimensions);
      assert.equal(y + available, height - Math.max(12, bottomInset));
    }
  }
});
