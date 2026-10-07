import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync(
  new URL("../src/components/gallery/gallery-page.tsx", import.meta.url),
  "utf8",
);
const discovery = readFileSync(
  new URL("../src/components/gallery/gallery-discovery.ts", import.meta.url),
  "utf8",
);
const searchControls = readFileSync(
  new URL("../src/components/gallery/gallery-search-controls.tsx", import.meta.url),
  "utf8",
);
const viewerImage = readFileSync(
  new URL("../src/components/gallery/gallery-viewer-image.tsx", import.meta.url),
  "utf8",
);
const route = readFileSync(new URL("../src/routes/gallery.tsx", import.meta.url), "utf8");
const chrome = readFileSync(
  new URL("../src/components/world/world-chrome.tsx", import.meta.url),
  "utf8",
);
const curtain = readFileSync(
  new URL("../src/components/gallery/gallery-curtain.tsx", import.meta.url),
  "utf8",
);
const gate = readFileSync(new URL("../src/components/load-gate.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/styles-route-transitions.css", import.meta.url), "utf8");

test("exhibits start numbered and visitor edits publish versioned shared titles without a login form", () => {
  assert.doesNotMatch(component, /(?:featured|work|selected)\.title/);
  assert.match(component, /className="gallery-work-number">\{numberFor\(work\)\}/);
  assert.match(
    component,
    /updateCommunityGalleryTitle\([\s\S]*?work\.id,[\s\S]*?draft,[\s\S]*?editingVersion/,
  );
  assert.doesNotMatch(component, /saveGalleryTitle\(/);
  assert.match(component, /error\.status === 409/);
  assert.match(component, /以前の個人タイトルを公開/);
  assert.doesNotMatch(
    component,
    /type="(?:email|password)"|signInWithPassword|signUp\(|ログイン中|ログアウト/,
  );
  assert.match(component, /ensureGalleryWriteSession\(client\)/);
  assert.match(component, /投稿する/);
  assert.match(component, /setPendingImages\(files\)/);
  assert.match(component, /onSubmit=/);
  assert.match(component, /window\.addEventListener\("storage", onStorage\)/);
  assert.match(component, /window\.removeEventListener\("storage", onStorage\)/);
  assert.match(component, /input:not\(:disabled\)/);
  assert.match(
    component,
    /editing \|\|[\s\S]*?confirmDelete \|\|[\s\S]*?communityBusy \|\|[\s\S]*?event\.target instanceof HTMLInputElement/,
  );
  assert.match(component, /role="alert"/);
});

test("gallery discovery combines search, categories, and local favorites without default titles", () => {
  assert.match(component, /filterGalleryArtworks\(allArtworks/);
  assert.match(searchControls, /type="search"/);
  assert.match(searchControls, /value=\{query\}/);
  assert.match(component, /aria-pressed=\{favoritesOnly\}/);
  assert.match(component, /gallery-favorite-toggle/);
  assert.match(component, /aria-pressed=\{favorites\.includes\(selected\.id\)\}/);
  assert.match(component, /条件に合う作品はありません。/);
  assert.match(component, /絞り込みを解除/);
  assert.match(component, /GALLERY_FAVORITES_KEY/);
  assert.match(component, /setFavorites\(\s*readGalleryFavorites/);
  assert.match(component, /aria-label=.*work\.alt/);
  assert.match(discovery, /normalize\("NFKC"\)/);
  assert.match(discovery, /publicTitle, artwork\.alt/);
  assert.match(discovery, /knownIds\.has\(id\)/);
  assert.match(discovery, /deception-world\.gallery-favorites\.v1/);
  assert.match(component, /viewerWorksRef\.current = galleryViewerSequence/);
  assert.match(component, /GALLERY_ARTWORKS\.find\(\(work\) => work\.id === selectedId\)/);
});

test("gallery entry uses closing and opening cloth panels with a reduced-motion alternative", () => {
  assert.match(gate, /const isGalleryTransition = changesDocument && to === "\/gallery"/);
  assert.match(gate, /if \(variant === "gallery"\) return <GalleryCurtain phase=\{phase\} \/>/);
  assert.match(gate, /cover: 720, reveal: 1120/);
  assert.match(curtain, /\["left", "right"\]/);
  assert.match(css, /gallery-curtain-close 720ms/);
  assert.match(css, /gallery-curtain-open 1120ms/);
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*?gallery-curtain-fade-out 240ms/);
});

test("gallery route loads the World mode and its route-scoped stylesheet", () => {
  assert.match(route, /createFileRoute\("\/gallery"\)/);
  assert.match(route, /component: GalleryPage/);
  assert.match(route, /createWorldHead\(/);
  assert.match(route, /WORLD_CORE_STYLESHEET_LINKS/);
  assert.match(route, /galleryCssUrl/);
  assert.match(component, /useWorldMode\(\)/);
});

test("gallery artwork links keep a direct full-image destination and preserve modified clicks", () => {
  assert.match(
    component,
    /href=\{featured\.full\}[\s\S]*?onClick=\{\(event\) => openWork\(event, featured\)\}/,
  );
  assert.match(
    component,
    /href=\{work\.full\}[\s\S]*?onClick=\{\(event\) => openWork\(event, work\)\}/,
  );
  assert.match(
    component,
    /event\.button !== 0 \|\| event\.metaKey \|\| event\.ctrlKey \|\| event\.shiftKey \|\| event\.altKey/,
  );
  assert.match(component, /event\.preventDefault\(\)/);
  assert.match(viewerImage, /target="_blank" rel="noreferrer"/);
});

test("opening filtered artwork keeps discovery untouched and navigation follows the session", () => {
  assert.doesNotMatch(component, /category !== work\.category/);
  assert.match(component, /galleryAdjacentId\(/);
  assert.match(component, /selectedIndex \+ 1\} \/ \{viewerWorks\.length\}/);
  assert.match(component, /event\.key === "ArrowLeft" \|\| event\.key === "ArrowRight"/);
});

test("native viewer owns and releases the shared viewport lock and dismisses on browser history", () => {
  assert.match(component, /dialog\.showModal\(\)/);
  assert.match(component, /dialog\.focus\(\{ preventScroll: true \}\)/);
  // 2026-10-08: the viewer freezes the body (the owner's report: closing an
  // artwork could land at the top), so the page is put back exactly on close.
  assert.match(component, /const release = acquireViewportScrollLock\(\{ freezeBody: true \}\)/);
  assert.match(component, /if \(dialog\.open\) dialog\.close\(\)/);
  assert.match(component, /release\(\)/);
  assert.match(component, /router.history.subscribe\(restore\)/);
  assert.match(component, /plan.kind === "none"[\s\S]*?setSelectedId\(null\)/);
});

test("viewer exposes dialog names, keyboard dismissal, live position, and image recovery", () => {
  assert.match(component, /aria-haspopup="dialog"/);
  assert.match(component, /aria-controls="gallery-viewer"/);
  assert.match(component, /aria-labelledby="gallery-viewer-title"/);
  assert.match(component, /onCancel=\{/);
  assert.match(component, /aria-live="polite"/);
  assert.match(viewerImage, /onError=\{\(\) => setStatus\("error"\)\}/);
  assert.match(viewerImage, /work\.medium/);
  assert.match(viewerImage, /再読み込み/);
  assert.match(viewerImage, /2倍で鑑賞/);
  assert.match(component, /dialog\.addEventListener\("keydown", cycleFocus\)/);
  assert.match(component, /dialog\.removeEventListener\("keydown", cycleFocus\)/);
  assert.match(component, /event\.shiftKey \? -1 : 1/);
  assert.match(component, /controls\[nextIndex\]\.focus\(\{ preventScroll: true \}\)/);
});

test("gallery menu trigger uses the shared SideMenuTrigger contract", () => {
  assert.match(
    chrome,
    /export function SideMenuTrigger\([\s\S]*?onOpenChange\?: \(open: boolean\) => void/,
  );
  assert.match(component, /<SideMenuTrigger open=\{menuOpen\} onOpenChange=\{setMenuOpen\} \/>/);
  assert.match(
    component,
    /<SideMenuLayer context="gallery" open=\{menuOpen\} onOpenChange=\{setMenuOpen\} \/>/,
  );
  assert.match(chrome, /context === "gallery"[\s\S]*?\/gallery/);
});
