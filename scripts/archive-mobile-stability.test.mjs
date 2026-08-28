import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../src/routes/form-archive.tsx", import.meta.url), "utf8");
const mobileStyles = readFileSync(
  new URL("../public/archive-mobile-stability.css", import.meta.url),
  "utf8",
);
const scrollStability = readFileSync(
  new URL("../public/archive-scroll-stability.js", import.meta.url),
  "utf8",
);
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

const embeddedArchives = [
  new URL("../public/saga-form-archive-embedded.html", import.meta.url),
  new URL("../public/realm-form-archive-embedded.html", import.meta.url),
];

test("the app uses memory-safe embedded archives and recreates the iframe when switching", () => {
  assert.match(route, /\/saga-form-archive-embedded\.html/);
  assert.match(route, /\/realm-form-archive-embedded\.html/);
  assert.match(route, /saga-form-archive-embedded\.html\?v=20260828-r44/);
  assert.match(route, /realm-form-archive-embedded\.html\?v=20260828-r44/);
  assert.match(route, /<iframe[\s\S]*?key=\{`\$\{archive\}:\$\{transitionGeneration\}`\}/);
  assert.doesNotMatch(route, /-standalone\.html/);
  assert.match(route, /if \(!loaded \|\| next === activeTransitionRef\.current\.archive\) return/);
  assert.doesNotMatch(route, /setTimeout\(\(\) => setLoaded\(true\), 1800\)/);
  assert.match(route, /saga-archive:ready/);
});

test("archive readiness is owned by the current child frame and transition generation", () => {
  assert.match(route, /activeTransition\.archive !== expectedArchive/);
  assert.match(route, /activeTransition\.generation !== expectedGeneration/);
  assert.match(route, /frameRef\.current !== expectedFrame/);
  assert.match(route, /event\.source !== expectedWindow/);
  assert.match(
    route,
    /event\.source === null &&[\s\S]*?loadedFrameTransition\?\.archive === expectedArchive &&[\s\S]*?loadedFrameTransition\.generation === expectedGeneration;[\s\S]*?if \(shouldUseOpaqueWebKitFallback\) return/,
  );
  assert.match(route, /fallback\.generation !== activeTransition\.generation/);
  assert.match(route, /fallback\.frame !== frame/);
  assert.match(route, /setLoaded\(true\);[\s\S]*?ARCHIVE_READY_FAILSAFE_MS/);
  assert.match(route, /data-archive-generation=\{transitionGeneration\}/);
  assert.match(route, /loadedFrameTransitionRef\.current = activeTransition/);
  assert.match(route, /loadedFrameTransitionRef\.current = null/);
  assert.match(route, /saga-archive:status-request/);
  assert.doesNotMatch(route, /requestAnimationFrame\(\(\) => setLoaded\(true\)\)/);
});

test("embedded archives externalize base64 images and load the mobile stability layer", () => {
  for (const file of embeddedArchives) {
    assert.ok(existsSync(file), `${file.pathname} should exist`);
    const html = readFileSync(file, "utf8");
    assert.doesNotMatch(html, /data:image\//);
    assert.match(html, /data-embedded-archive="true"/);
    assert.match(html, /data-archive-kind="(?:saga|realm)"/);
    assert.match(html, /archive-mobile-stability\.css/);
    assert.match(html, /archive-mobile-stability\.css\?v=20260823-r41/);
    assert.match(html, /archive-scroll-stability\.js\?v=20260828-r44/);
    assert.match(html, /data-archive-ready-signal/);
    assert.match(html, /saga-archive:ready/);
    assert.ok(statSync(file).size < 1_000_000, `${file.pathname} should stay below 1 MB`);

    for (const match of html.matchAll(/\/archive-media\/([^"')\s]+)/g)) {
      assert.ok(
        existsSync(new URL(`../public/archive-media/${match[1]}`, import.meta.url)),
        `archive media ${match[1]} should exist`,
      );
    }
  }
});

test("coarse-pointer devices trim continuous GPU effects without removing interactions", () => {
  assert.match(mobileStyles, /@media \(any-pointer: coarse\)/);
  assert.match(mobileStyles, /content-visibility: auto/);
  assert.match(mobileStyles, /\.v6s-fx-orbit/);
  assert.match(mobileStyles, /\.archive-nav \{\s*transform: none !important/);
  assert.doesNotMatch(mobileStyles, /translateY\(64px\)/);
  assert.doesNotMatch(mobileStyles, /pointer-events:\s*none/);
});

test("embedded archives use one root scroller and recover stale locks throughout the session", () => {
  assert.match(mobileStyles, /touch-action: pan-y/);
  assert.match(
    mobileStyles,
    /:is\(#edition-panel-saga, #edition-panel-realm\) > \.edition-body \{[\s\S]*?overflow: visible !important/,
  );
  assert.match(
    mobileStyles,
    /data-archive-kind="realm"\]:has\([\s\S]*?#realm--saga-forms-performance-v5\.is-selector-sheet-open[\s\S]*?\[id\$="form-selector"\]\[aria-modal="true"\][\s\S]*?\)/,
  );
  assert.match(mobileStyles, /data-archive-kind="saga"[\s\S]*?overflow-y: scroll/);
  assert.match(mobileStyles, /data-archive-kind="realm"[\s\S]*?overflow-y: scroll/);
  assert.match(
    mobileStyles,
    /\.compare-chip-slider[\s\S]*?touch-action: pan-x pan-y pinch-zoom !important/,
  );
  assert.match(mobileStyles, /\.archive-hero,[\s\S]*?\.hero-grid,[\s\S]*?min-width: 0/);
  assert.match(
    mobileStyles,
    /\.archive-hero \{\s*grid-template-columns: minmax\(0, 1fr\) !important/,
  );
  assert.match(route, /scrolling="yes"/);
  assert.match(scrollStability, /releaseStaleScrollLock/);
  assert.match(scrollStability, /forceResetTransientUi/);
  assert.match(scrollStability, /isActiveArchiveRoot/);
  assert.match(scrollStability, /archiveKind === "realm"/);
  assert.match(scrollStability, /new MutationObserver/);
  assert.match(scrollStability, /pointercancel/);
  assert.match(scrollStability, /touchcancel/);
  assert.match(scrollStability, /is-selector-sheet-closing[\s\S]*?420/);
  assert.match(scrollStability, /document\.documentElement\.style\.removeProperty\(property\)/);
  assert.match(
    scrollStability,
    /classList\.remove\("is-selector-sheet-open", "is-selector-sheet-closing"\)/,
  );
  assert.match(scrollStability, /scrim instanceof HTMLElement\) scrim\.hidden = true/);
  assert.match(route, /contentWindow\?\.postMessage\([\s\S]*?saga-archive:close-transients/);
  assert.match(scrollStability, /saga-archive:ready/);
});

test("production builds regenerate embedded archives from their standalone sources", () => {
  assert.equal(packageJson.scripts["archive:embed"], "node scripts/build-embedded-archives.mjs");
  assert.equal(packageJson.scripts.prebuild, "npm run archive:embed");
});
