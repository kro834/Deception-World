import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = readFileSync(new URL("../src/routes/__root.tsx", import.meta.url), "utf8");

test("optional root UI turns rejected lazy imports into an empty component", () => {
  assert.match(
    root,
    /function optionalLazy[\s\S]*?return lazy\(\(\) =>\s*importModule\(\)\.catch\(\(\) => \(\{\s*default: \(\(\) => null\) as ComponentType<P>/,
  );

  for (const component of [
    "LibraryVisitTracker",
    "LazyInquiryNavigation",
    "LazyIpadMenuMode",
    "LazyZeusButtonHost",
  ]) {
    assert.ok(root.includes(`const ${component} = optionalLazy`), component);
  }
});

test("optional UI keeps its lazy split, pending fallback, and primary route content", () => {
  for (const component of [
    "LibraryVisitTracker",
    "LazyInquiryNavigation",
    "LazyIpadMenuMode",
  ]) {
    assert.match(
      root,
      new RegExp(`<Suspense fallback=\\{null\\}>[\\s\\S]*?<${component}\\b`),
    );
  }
  assert.match(root, /<Suspense fallback=\{null\}>[\s\S]*?<LazyZeusButtonHost\b/);
  assert.match(root, /<Outlet\s*\//);
});
