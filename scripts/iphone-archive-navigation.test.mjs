import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const loadGate = readFileSync(new URL("../src/components/load-gate.tsx", import.meta.url), "utf8");
const worldChrome = readFileSync(new URL("../src/components/world/world-chrome.tsx", import.meta.url), "utf8");
const zeusButton = readFileSync(new URL("../src/components/zeus-button.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

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

test("opening the side menu keeps the Zeus control full-size and draggable", () => {
  assert.match(zeusButton, /data-menu-open=\{String\(sideMenuOpen\)\}/);
  assert.doesNotMatch(zeusButton, /panelLeft/);
  assert.doesNotMatch(
    styles,
    /body:has\(\.side-panel\[data-open="true"\]\) > \.zeus-button[\s\S]*?scale\(0\.66\)/,
  );
  assert.match(styles, /\.zeus-button\[data-menu-open="true"\]::before/);
});
