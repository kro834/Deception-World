import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gallerySelectFocus } from "../src/components/gallery/gallery-select-focus.ts";

test("picker dismissal without a value change keeps pointer-only decoration suppressed", () => {
  const currentTarget = { dataset: {}, value: "all" };
  gallerySelectFocus.onPointerDown({ currentTarget });
  // iOS Cancel and reselecting the current option need not dispatch change/blur.
  assert.equal(currentTarget.dataset.pointerFocus, "true");
  assert.equal(currentTarget.value, "all");
  assert.equal(gallerySelectFocus.onChange, undefined);
  assert.equal(gallerySelectFocus.onClick, undefined);
});

test("keyboard input restores focus decoration without blurring or changing the value", () => {
  for (const key of ["Tab", "ArrowDown", "Enter", "Escape"]) {
    const currentTarget = { dataset: {}, value: "portrait" };
    gallerySelectFocus.onPointerDown({ currentTarget });
    gallerySelectFocus.onKeyDown({ currentTarget, key });
    assert.equal(currentTarget.dataset.pointerFocus, undefined);
    assert.equal(currentTarget.value, "portrait");
  }
});

test("blur clears pointer state so keyboard re-entry retains its focus indicator", () => {
  const currentTarget = { dataset: {} };
  gallerySelectFocus.onPointerDown({ currentTarget });
  gallerySelectFocus.onBlur({ currentTarget });
  assert.equal(currentTarget.dataset.pointerFocus, undefined);
  gallerySelectFocus.onPointerDown({ currentTarget });
  assert.equal(currentTarget.dataset.pointerFocus, "true");
});

test("all gallery native selects include the shared modality handlers", () => {
  for (const path of ["gallery-page.tsx"]) {
    const source = readFileSync(
      new URL(`../src/components/gallery/${path}`, import.meta.url),
      "utf8",
    );
    const selects = [...source.matchAll(/<select\b([\s\S]*?)>/g)];
    assert.ok(selects.length > 0);
    for (const [, attributes] of selects) assert.match(attributes, /\{\.\.\.gallerySelectFocus\}/);
  }
  const css = readFileSync(new URL("../src/styles-gallery.css", import.meta.url), "utf8");
  assert.match(
    css,
    /select\[data-gallery-select="true"\]\[data-pointer-focus="true"\]:focus\s*\{\s*outline: none;\s*box-shadow: none;/,
  );
  assert.match(
    css,
    /select\[data-gallery-select="true"\]:not\(\[data-pointer-focus="true"\]\):focus-visible/,
  );
});
