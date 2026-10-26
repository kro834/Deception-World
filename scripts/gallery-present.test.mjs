import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const css = (await read("src/styles-gallery-present.css")).replace(/\/\*[\s\S]*?\*\//g, "");

test("the present sheet is last on the gallery route only", async () => {
  const route = await read("src/routes/gallery.tsx");
  const links = route.slice(route.indexOf("stylesheetLinks: ["));
  assert.ok(
    links.indexOf("href: galleryPresentCssUrl") > links.indexOf("href: galleryRefinementCssUrl"),
  );
  for (const path of [
    "src/routes/gallery-tours.tsx",
    "src/routes/world.tsx",
    "src/routes/dream-chapter.tsx",
    "src/lib/world-head.ts",
  ]) {
    assert.doesNotMatch(await read(path), /gallery-present|galleryPresent/);
  }
});

test("present rules stay on the gallery page and keep readable type", () => {
  let count = 0;
  for (const match of css.matchAll(/(?:^|[{};])\s*([^{}@;]+)\{/g)) {
    const selector = match[1].trim().replace(/\s+/g, " ");
    if (!selector || selector.startsWith("@")) continue;
    count += 1;
    assert.match(selector, /^html\[data-family="gallery"\] \.gallery-page\b/, selector);
  }
  assert.ok(count > 15, String(count));
  assert.doesNotMatch(css, /!important|@keyframes|animation\s*:|url\(/);
  for (const [, size] of css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) {
    assert.ok(Number(size) >= 12, size);
  }
  for (const [, min] of css.matchAll(/font-size:\s*clamp\((\d+(?:\.\d+)?)px/g)) {
    assert.ok(Number(min) >= 12, min);
  }
});
