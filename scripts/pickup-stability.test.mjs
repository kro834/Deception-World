import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
test("thumb reserves touch ownership before contact and ignores child capture transfer", () => {
  const source = read("src/components/world/slide-open-control.tsx");
  assert.match(source, /pointerEvents: "auto"/);
  assert.match(source, /touchAction: "none"/);
  assert.match(source, /event.target === event.currentTarget\) cancelDrag\(event\)/);
  assert.match(
    read("src/styles-world/18.css"),
    /html\[data-android-renderer\] \.ios-slide-open \{[^}]*overscroll-behavior: auto/s,
  );
});
test("pickup keeps close outside the scrolling panel and reserves heading space", () => {
  const source = read("src/components/world/manager-stub.tsx");
  assert.ok(
    source.indexOf('className="form-pickup-close"') <
      source.indexOf('className="form-pickup-panel"'),
  );
  const css = read("src/styles-pickup-stability.css");
  assert.match(css, /padding-top: 76px/);
  assert.match(css, /overflow-wrap: anywhere/);
  assert.match(css, /repeat\(2, minmax\(0, 1fr\)\)/);
});
