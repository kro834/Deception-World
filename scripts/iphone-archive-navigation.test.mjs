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
  assert.match(loadGate, /const ARCHIVE_PRELOAD_BUDGET_MS = \d+;/);
  assert.match(loadGate, /Promise\.race\(\[\s*archiveWarmup,/);
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
