import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/* 2026-10-08 (the owner's reports): closing an artwork must leave the reader
   where they were, Back must close the artwork instead of leaving the
   gallery, and a refresh control in the pinned bar pulls everyone's latest
   titles without moving the page. */
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const page = read("src/components/gallery/gallery-page.tsx");
const css = read("src/styles-gallery.css");

test("the viewer freezes the page and puts the reader back where they were", () => {
  assert.match(page, /acquireViewportScrollLock\(\{ freezeBody: true \}\)/);
  assert.match(page, /readingAtRef.current = \{ top: window\.scrollY, left: window\.scrollX \}/);
  assert.match(page, /subscribeRendered: \(done\) => router\.subscribe\("onRendered", done\)/);
  assert.match(page, /router\.history\.location\.pathname !== "\/gallery"/);
  assert.ok(
    page.indexOf("const release = acquireViewportScrollLock") < page.indexOf("dialog.showModal()"),
  );
  assert.match(page, /settleGalleryViewerReturn\(/);
  assert.match(page, /galleryLayoutTop\(opener\) - originalTop/);
  assert.match(
    page,
    /galleryViewer: \{ \.\.\.record, position: \{ \.\.\.record.position, top \} \}/,
  );
  assert.match(
    page,
    /viewerOpen,\s*router,\s*featuredId,\s*works,\s*titles,\s*display.preferences.density,\s*display.status,\s*display.error,/,
  );
  assert.doesNotMatch(page, /requestAnimationFrame/);
  const router = read("src/router.tsx");
  assert.match(router, /!document.body.hasAttribute\("data-gallery-viewer-lock"\)/);
});

test("one history entry per open viewer: Back closes it, a page close removes it", () => {
  assert.match(
    page,
    /router\.history\.push\(galleryArtworkHref\(here\.href, viewerId\), \{[\s\S]*?galleryViewer: \{[\s\S]*?position: readingAt/,
  );
  assert.match(page, /ownEntry &&[\s\S]*?router\.history\.back\(\)/);
  assert.equal(
    (page.match(/router\.history\.push\(/g) ?? []).length,
    1,
    "moving between works adds none",
  );
});

test("the refresh control: in the pinned bar, busy rather than disabled, announced", () => {
  assert.match(
    page,
    /className="gallery-refresh"[\s\S]*?onClick=\{refreshNow\}[\s\S]*?aria-disabled=\{refreshing\}/,
  );
  assert.doesNotMatch(
    page.match(/className="gallery-refresh"[\s\S]*?<\/button>/)[0],
    /\sdisabled=/,
  );
  assert.match(
    page,
    /id="gallery-refresh-status" className="gallery-refresh-status" aria-live="polite"/,
  );
  assert.match(page, /await communityReloadRef\.current\?\.\(\)\) \?\? false/);
  const bar = css.match(/\.gallery-topbar \{[\s\S]*?\n\}/)[0];
  assert.match(bar, /position: fixed;/);
  assert.match(
    css,
    /\.gallery-page \{\s*--gallery-bar: 78px;\s*padding-top: calc\(var\(--gallery-bar\)/,
  );
  const button = css.match(/\.gallery-refresh \{[\s\S]*?\n\}/)[0];
  assert.match(button, /min-width: 44px;/);
  assert.match(button, /min-height: 44px;/);
});
