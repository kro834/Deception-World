import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the app blocks clipboard actions and content extraction at the root", () => {
  const root = read("src/routes/__root.tsx");
  const guard = read("src/components/content-protection.tsx");
  const styles = read("src/styles.css");

  assert.match(root, /<ContentProtection\s*\/>/);
  for (const eventName of ["copy", "cut", "paste", "contextmenu", "dragstart"]) {
    assert.match(guard, new RegExp(`addEventListener\\(\\"${eventName}\\"`));
  }
  assert.match(guard, /key === "c" \|\| key === "x" \|\| key === "v"/);
  assert.match(styles, /body \*[\s\S]*?-webkit-user-select: none !important/);
  assert.match(styles, /\[contenteditable="plaintext-only"\][\s\S]*?user-select: text !important/);
});

test("sandboxed form archives receive the same clipboard protection", () => {
  const script = read("public/archive-scroll-stability.js");
  const styles = read("public/archive-mobile-stability.css");

  for (const eventName of ["copy", "cut", "paste", "contextmenu", "dragstart"]) {
    assert.match(script, new RegExp(`addEventListener\\(\\"${eventName}\\"`));
  }
  assert.match(script, /\["c", "x", "v"\]\.includes\(key\)/);
  assert.match(styles, /body \*[\s\S]*?-webkit-touch-callout: none !important/);
  assert.match(styles, /user-select: none !important/);
});

test("selection protection never cancels text-origin native pan gestures", () => {
  for (const file of ["src/components/content-protection.tsx", "public/archive-scroll-stability.js"]) {
    assert.doesNotMatch(read(file), /addEventListener\(["'](?:selectstart|touchstart|touchmove|pointerdown|pointermove)["']/);
  }
});
