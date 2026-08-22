import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const loadGate = readFileSync(new URL("../src/components/load-gate.tsx", import.meta.url), "utf8");
const worldChrome = readFileSync(new URL("../src/components/world/world-chrome.tsx", import.meta.url), "utf8");
const zeusButton = readFileSync(new URL("../src/components/zeus-button.tsx", import.meta.url), "utf8");
const archiveRoute = readFileSync(new URL("../src/routes/form-archive.tsx", import.meta.url), "utf8");
const rootRoute = readFileSync(new URL("../src/routes/__root.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const transitionStyles = readFileSync(new URL("../src/styles-route-transitions.css", import.meta.url), "utf8");
const titleSequence = readFileSync(new URL("../src/components/cinematic/title-sequence.tsx", import.meta.url), "utf8");
const diveVelocity = readFileSync(new URL("../src/components/cinematic/dive-velocity-canvas.tsx", import.meta.url), "utf8");

test("the iPhone archive entry closes its menu and never waits for the full standalone document", () => {
  assert.match(
    worldChrome,
    /<GuardedLink to="\/form-archive" assets=\{\[\]\} beforeNavigate=\{close\}>/,
  );
  assert.doesNotMatch(loadGate, /preloadArchiveDocument/);
  assert.doesNotMatch(loadGate, /saga-form-archive-standalone\.html/);
  assert.match(loadGate, /router\.preloadRoute\(\{ to: to as never \}\)/);
  assert.doesNotMatch(loadGate, /fetch\s*\(/);
  assert.match(styles, /@media \(max-width: 1180px\), \(any-pointer: coarse\)/);
  assert.match(styles, /width: min\(92vmax, 980px\)/);
  assert.match(styles, /archive-mobile-tunnel-out/);
  assert.match(styles, /\.archive-route-dive\.is-arriving \.cine-dive-tunnel > i[\s\S]*?animation: none !important/);
  assert.match(styles, /height: 100vh;\s*height: 100svh;/);
  assert.doesNotMatch(styles, /height: 100svh;\s*height: 100dvh;/);
});

test("the archive switcher occupies a dedicated iPhone-safe toolbar above the iframe", () => {
  assert.match(archiveRoute, /<header className="form-archive-toolbar"/);
  assert.match(rootRoute, /styles-route-transitions\.css\?url/);
  assert.match(transitionStyles, /--archive-toolbar-height:/);
  assert.match(
    transitionStyles,
    /\.form-archive-page > iframe \{\s*inset: var\(--archive-toolbar-height\) 0 auto;[\s\S]*?height: calc\(100% - var\(--archive-toolbar-height\)\);/,
  );
  assert.match(
    transitionStyles,
    /\.form-archive-toolbar \.form-archive-switcher\.liquid-swipe-tabs \{[\s\S]*?position: absolute;/,
  );
  assert.match(transitionStyles, /@media \(max-width: 560px\)/);
});

test("title and archive routes ship the same deployment-safe dive animation", () => {
  assert.match(transitionStyles, /\.cine-stage\.is-diving \.cine-dive-tunnel/);
  assert.match(transitionStyles, /\.archive-route-dive\.is-diving \.cine-dive-tunnel/);
  assert.match(transitionStyles, /dw-dive-mobile-streaks/);
  assert.match(transitionStyles, /width: min\(94vmax, 860px\)/);
  assert.doesNotMatch(transitionStyles, /150vmax/);
});

test("the opening dive adds an adaptive, mobile-bounded perspective layer", () => {
  assert.match(titleSequence, /<DiveVelocityCanvas active=\{isWorldTransitioning\}/);
  assert.match(titleSequence, /window\.scrollTo\(\{ top: 0, left: 0, behavior: "auto" \}\)/);
  assert.match(diveVelocity, /maxPixels = compact \? 1_350_000 : 3_200_000/);
  assert.match(diveVelocity, /device\.connection\?\.saveData/);
  assert.match(diveVelocity, /slowFrames >= 7/);
  assert.match(diveVelocity, /cancelAnimationFrame\(frame\)/);
  assert.match(diveVelocity, /prefers-reduced-motion: reduce/);
  assert.match(transitionStyles, /\.cine-stage\.is-diving \.cine-dive-velocity/);
  assert.match(transitionStyles, /\.cine-stage\.is-arriving \.cine-dive-velocity/);
  assert.match(transitionStyles, /\.cine-stage\.is-arriving \.cine-dive-flash \{\s*inset: -8vh 0;/);
  assert.match(transitionStyles, /\.cine-dive-velocity \{\s*display: none;/);
});

test("opening the side menu keeps the Zeus control full-size and draggable", () => {
  assert.match(zeusButton, /data-menu-open=\{String\(sideMenuOpen\)\}/);
  assert.doesNotMatch(zeusButton, /panelLeft/);
  assert.doesNotMatch(
    styles,
    /body:has\(\.side-panel\[data-open="true"\]\) > \.zeus-button[\s\S]*?scale\(0\.66\)/,
  );
  assert.match(styles, /\.zeus-button\[data-menu-open="true"\]::before/);
});
