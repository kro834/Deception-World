import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { SITE_PAGE_ENTRIES } from "../src/lib/site-page-registry.ts";
import { LIBRARY_ENTRIES, findLibraryLocation, searchLibrary } from "../src/lib/library-data.ts";
import { emptyLibrarySaved, toggleLibraryBookmark, addLibraryVisit, parseLibrarySaved } from "../src/lib/library-storage.ts";

const recovered = ["meta-unitas", "saga-cinema", "gallery-tours", "exhibition"];

test("every registry route has one library record and the four recovered pages preserve existing copy", () => {
  assert.equal(new Set(SITE_PAGE_ENTRIES.map((page) => page.id)).size, SITE_PAGE_ENTRIES.length);
  assert.equal(new Set(SITE_PAGE_ENTRIES.map((page) => page.path)).size, SITE_PAGE_ENTRIES.length);
  for (const page of SITE_PAGE_ENTRIES) {
    assert.ok(existsSync(new URL(`../src/routes${page.path}.tsx`, import.meta.url)), page.path);
    assert.equal(LIBRARY_ENTRIES.filter((entry) => entry.id === page.id).length, 1);
    if (recovered.includes(page.id)) {
      const route = readFileSync(new URL(`../src/routes${page.path}.tsx`, import.meta.url), "utf8");
      assert.ok(route.includes(page.title), `${page.id} retains the published title`);
      assert.ok(route.includes(page.description), `${page.id} reuses the published description`);
      assert.ok(searchLibrary(page.title, "page").some((entry) => entry.id === page.id));
      assert.equal(findLibraryLocation(page.path)?.id, page.id);
    }
  }
});

test("new page records participate in bookmarks and history without invalidating existing records", () => {
  let saved = toggleLibraryBookmark(emptyLibrarySaved(), "saga");
  for (const [index, id] of recovered.entries()) {
    saved = toggleLibraryBookmark(saved, id);
    saved = addLibraryVisit(saved, id, 1000 + index);
  }
  const restored = parseLibrarySaved(JSON.stringify(saved));
  assert.deepEqual(restored.bookmarks, ["saga", ...recovered]);
  assert.deepEqual(restored.recent.map(({ id }) => id), [...recovered].reverse());
});

test("new library/search cards use the existing page artwork instead of anonymous fallback plates", () => {
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync(new URL("../src/lib/record-art.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports, require: () => ({ nameWords: (value) => [value] }) });
  for (const [path, src] of [
    ["/meta-unitas-saga", "/meta-unitas-saga-20261023/middle-640.webp"],
    ["/saga-cinema", "/saga-cinema-assets/chapter-4.jpg"],
    ["/gallery-tours", "/gallery/g113-480.webp"],
    ["/exhibition", "/gallery/g01-480.webp"],
  ]) {
    assert.equal(exports.pathArt(path).src, src);
    assert.ok(existsSync(new URL(`../public${src}`, import.meta.url)), src);
  }
});

test("the library metadata dependency graph imports no heavy page, story or artwork data", () => {
  for (const file of ["site-page-registry", "dream-chapter-index"]) {
    const source = readFileSync(new URL(`../src/lib/${file}.ts`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /^import\s/m);
  }
});
