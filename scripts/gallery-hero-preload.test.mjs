import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { GALLERY_DEFAULT_ARTWORK } from "../src/components/gallery/gallery-data.ts";
import { GALLERY_HERO_PRELOAD_SCRIPT } from "../src/components/gallery/gallery-hero-preload.ts";
import { galleryStageSizes } from "../src/components/gallery/gallery-image-delivery.ts";

function run({
  choice = null,
  readyState = "loading",
  pathname = "/gallery",
  blocked = false,
  existing = false,
} = {}) {
  const links = [];
  const document = {
    readyState,
    querySelector: () => (existing || links.length ? {} : null),
    createElement: () => ({
      setAttribute(key, value) {
        this[key] = value;
      },
    }),
    head: { appendChild: (link) => links.push(link) },
  };
  runInNewContext(GALLERY_HERO_PRELOAD_SCRIPT, {
    document,
    location: { pathname },
    localStorage: {
      getItem() {
        if (blocked) throw new Error("blocked");
        return choice;
      },
    },
  });
  return links;
}

test("first gallery document begins the same responsive request before hydration", () => {
  for (const choice of [null, "", "g03"]) {
    const [link] = run({ choice });
    assert.ok(link);
    assert.equal(link.rel, "preload");
    assert.equal(link.as, "image");
    assert.equal(link.href, GALLERY_DEFAULT_ARTWORK.medium);
    assert.equal(link.imagesrcset, GALLERY_DEFAULT_ARTWORK.fullSrcSet);
    assert.equal(
      link.imagesizes,
      galleryStageSizes(GALLERY_DEFAULT_ARTWORK.width, GALLERY_DEFAULT_ARTWORK.height),
    );
    assert.equal(link.fetchpriority, "high");
  }
});

test("saved catalogue and uploaded heroes never preload the default work", () => {
  for (const choice of ["g68", "g01", "u-12345678-1234-4123-8123-123456789012", "invalid"])
    assert.equal(run({ choice }).length, 0);
});

test("SPA/history entries, other routes, blocked storage and repeated heads do not speculate", () => {
  for (const options of [
    { readyState: "interactive" },
    { readyState: "complete" },
    { pathname: "/world" },
    { blocked: true },
    { existing: true },
  ])
    assert.equal(run(options).length, 0);
});

test("preload is gallery-only and shares the rendered default, sizes, and no-JS fallback", () => {
  const route = readFileSync(new URL("../src/routes/gallery.tsx", import.meta.url), "utf8");
  const page = readFileSync(
    new URL("../src/components/gallery/gallery-page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(route, /scripts: import\.meta\.env\.SSR \? \[\{ children: GALLERY_HERO_PRELOAD_SCRIPT \}\] : \[\]/);
  assert.match(page, /resolveGalleryStageArtwork\([\s\S]*?GALLERY_DEFAULT_ARTWORK/);
  assert.match(page, /sizes=\{galleryStageSizes\(print.width, print.height\)\}/);
  assert.match(page, /<noscript>\{image\}<\/noscript>/);
  const css = readFileSync(
    new URL("../src/styles-gallery-image-fallback.css", import.meta.url),
    "utf8",
  );
  assert.match(css, /@layer base/);
  assert.match(css, /@media \(scripting: none\)/);
  assert.match(css, /div\[hidden\]\[id\^="S:"\]:has\(\.gallery-page\[data-gallery-page\]\)/);
  assert.match(css, /\.gallery-page \.gallery-arrival \{\s*display: none !important;/);
});
