import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createViewportResizeFilter } from "../src/lib/viewport-resize.ts";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replaceAll("\r\n", "\n");

test("toolbar-only resizes are ignored, real viewport changes are not", (t) => {
  const originalWindow = globalThis.window;
  t.after(() => {
    globalThis.window = originalWindow;
  });
  const viewport = { width: 412, height: 915, scale: 1 };
  globalThis.window = { innerWidth: 412, innerHeight: 915, visualViewport: viewport };
  const significant = createViewportResizeFilter();
  viewport.height = 971; // URL bar collapsed
  assert.equal(significant(), false);
  viewport.height = 915; // URL bar back
  assert.equal(significant(), false);
  viewport.height = 560; // soft keyboard
  assert.equal(significant(), true);
  viewport.height = 915;
  assert.equal(significant(), true);
  viewport.width = 915; // rotation
  viewport.height = 412;
  assert.equal(significant(), true);
  viewport.scale = 1.5; // pinch zoom
  assert.equal(significant(), true);
});

test("JS scroll progress restyles only the headers that draw it", () => {
  const mode = read("src/components/world/use-world-mode.ts");
  assert.doesNotMatch(mode, /html\.style\.setProperty\("--page-progress"/);
  assert.match(mode, /host\.style\.setProperty\("--page-progress", value\)/);
  for (const host of ["topbar", "manager-topbar", "rider-archive-topbar", "dream-site-header"]) {
    assert.match(mode, new RegExp(`"${host}"`));
  }
  assert.match(mode, /addEventListener\("resize", requestResizeSync, \{ passive: true \}\)/);
  // A small height-only resize with no scroll still syncs, once it settles.
  assert.match(mode, /else resizeSettleTimer = window\.setTimeout\(requestProgressSync, 150\)/);
  assert.match(
    mode,
    /window\.clearTimeout\(resizeSettleTimer\);\s*reducedMotion\.removeEventListener/,
  );
  // The prism line hides the World topbar's hairline: no per-frame value
  // there, while the dossier and dream headers keep theirs.
  assert.match(mode, /const PRISM_TOPBAR = "\.site-shell\.film-edition\.motion-on \.topbar";/);
  assert.match(
    mode,
    /if \(value !== null && prismLine && host\.matches\(PRISM_TOPBAR\)\) continue;/,
  );
  assert.match(mode, /prismLine = prismLineCapable && !reducedMotion\.matches;/);
  const css = read("src/styles-android-performance.css");
  assert.match(
    css,
    /html:not\(\[data-world-effects="economy"\]\) \.site-shell\.film-edition\.motion-on \.topbar::after \{\s*content: none;/,
  );
});

test("Zeus blocks touch scrolling only while a held drag owns the finger", () => {
  const zeus = read("src/components/zeus-button.tsx");
  const install = zeus.indexOf('window.addEventListener("touchmove", preventHeldTouchScroll');
  assert.ok(install > 0);
  assert.equal(zeus.indexOf('window.addEventListener("touchmove"', install + 1), -1);
  assert.match(
    zeus.slice(zeus.lastIndexOf("const armTouchGuard", install), install),
    /useCallback/,
  );
  assert.match(zeus, /held\.current = true;\s*armTouchGuard\(\);/);
  assert.match(zeus, /const finishPointer[\s\S]*?held\.current = false;\s*disarmTouchGuard\(\);/);
  assert.match(
    zeus,
    /const cancelDanglingPointer[\s\S]*?held\.current = false;\s*disarmTouchGuard\(\);/,
  );
  assert.match(zeus, /cancelPlacement\(\);\s*disarmTouchGuard\(\);/);
  assert.match(zeus, /if \(!significantResize\(\)\) \{\s*onScroll\(\);/);
  // WebKit: the held guard is also on the button itself, and removed with it.
  assert.match(
    zeus,
    /button\.addEventListener\("touchmove", preventHeldTouchScroll, \{ passive: false \}\)/,
  );
  assert.match(zeus, /button\.removeEventListener\("touchmove", preventHeldTouchScroll\)/);
});

test("World scroll milestones stay out of the page-wide render", () => {
  const home = read("src/components/world/world-home.tsx");
  const nav = home.slice(
    home.indexOf("const WorldSectionNav = memo("),
    home.indexOf("export function WorldHome()"),
  );
  assert.match(nav, /useState<WorldSectionId \| null>\(null\)/);
  assert.match(nav, /if \(current === lastActiveRef\.current\) return;/);
  assert.match(nav, /aria-current=\{activeSection === "story" \? "location" : undefined\}/);
  assert.match(
    nav,
    /if \(significantResize\(\)\) \{\s*readLandingTop\(\);\s*requestSectionSync\(\);/,
  );
  assert.match(nav, /else resizeSettleTimer = window\.setTimeout\(requestSectionSync, 150\)/);
  assert.match(nav, /window\.clearTimeout\(resizeSettleTimer\);/);
  // Anchor jumps land a section at its scroll-margin-top: the marker reaches it.
  assert.match(nav, /parseFloat\(getComputedStyle\(sections\[0\]\)\.scrollMarginTop\)/);
  assert.match(
    nav,
    /const marker = Math\.max\(92, landingTop \+ 8, Math\.min\(200, window\.innerHeight \* 0\.22\)\);/,
  );
  const page = home.slice(home.indexOf("export function WorldHome()"));
  assert.doesNotMatch(page, /setActiveSection/);
  assert.match(page, /<WorldSectionNav \/>/);
  assert.match(page, /heroInViewRef\.current = entry\.isIntersecting/);
  assert.match(page, /startTransition\(\(\) => setHeroVisible\(next\)\)/);
  assert.match(page, /if \(decoding \|\| !heroInViewRef\.current/);
});

test("World sections keep their layout and scroll reveals are never paused", () => {
  const chapters = read("src/styles-world/21.css");
  assert.doesNotMatch(chapters, /\.records-section\s*\{[^}]*content-visibility/);
  assert.doesNotMatch(chapters, /data-viewport-active="false"\] \*/);
  assert.match(chapters, /data-viewport-active="false"\]\s*:is\(\s*\.orbit/);
  const layer = read("src/styles-world/25.css");
  assert.doesNotMatch(layer, /:is\([^)]*\.world-column[^)]*\)\s*\{\s*content-visibility/);
  assert.doesNotMatch(layer, /:is\([^)]*\.episode-archive[^)]*\)\s*\{\s*content-visibility/);
  assert.match(layer, /\.manager-dossier \{\s*content-visibility: auto;/);
});
