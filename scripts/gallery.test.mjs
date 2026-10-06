import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync(
  new URL("../src/components/gallery/gallery-page.tsx", import.meta.url),
  "utf8",
);
const route = readFileSync(new URL("../src/routes/gallery.tsx", import.meta.url), "utf8");
const chrome = readFileSync(
  new URL("../src/components/world/world-chrome.tsx", import.meta.url),
  "utf8",
);

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
  assert.match(component, /target="_blank" rel="noreferrer"/);
});

test("opening filtered artwork keeps it selected in the collection and navigation wraps", () => {
  assert.match(
    component,
    /if \(category !== "all" && category !== work\.category\) setCategory\("all"\)/,
  );
  assert.match(component, /works\[\(selectedIndex \+ step \+ works\.length\) % works\.length\]/);
  assert.match(component, /selectedIndex \+ 1\} \/ \{works\.length\}/);
  assert.match(component, /event\.key === "ArrowLeft" \|\| event\.key === "ArrowRight"/);
});

test("native viewer owns and releases the shared viewport lock and dismisses on browser history", () => {
  assert.match(component, /dialog\.showModal\(\)/);
  assert.match(component, /dialog\.focus\(\{ preventScroll: true \}\)/);
  assert.match(component, /const release = acquireViewportScrollLock\(\)/);
  assert.match(component, /if \(dialog\.open\) dialog\.close\(\)/);
  assert.match(component, /release\(\)/);
  assert.match(component, /useDialogHistoryDismiss\(dialogRef,[\s\S]*?setSelectedId\(null\)/);
});

test("viewer exposes dialog names, keyboard dismissal, live position, and image recovery", () => {
  assert.match(component, /aria-haspopup="dialog"/);
  assert.match(component, /aria-controls="gallery-viewer"/);
  assert.match(component, /aria-labelledby="gallery-viewer-title"/);
  assert.match(component, /onCancel=\{/);
  assert.match(component, /aria-live="polite"/);
  assert.match(component, /onError=\{\(\) => setFailedId\(selected\.id\)\}/);
  assert.match(component, /selected\.medium/);
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
