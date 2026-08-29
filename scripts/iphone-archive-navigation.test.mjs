import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const loadGate = readFileSync(new URL("../src/components/load-gate.tsx", import.meta.url), "utf8");
const worldChrome = readFileSync(
  new URL("../src/components/world/world-chrome.tsx", import.meta.url),
  "utf8",
);
const worldHome = readFileSync(
  new URL("../src/components/world/world-home.tsx", import.meta.url),
  "utf8",
);
const zeusButton = readFileSync(
  new URL("../src/components/zeus-button.tsx", import.meta.url),
  "utf8",
);
const archiveRoute = readFileSync(
  new URL("../src/routes/form-archive.tsx", import.meta.url),
  "utf8",
);
const rootRoute = readFileSync(new URL("../src/routes/__root.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const reconstructedOpeningStyles = readFileSync(
  new URL("../source-parts/src/styles.css/01.part", import.meta.url),
  "utf8",
);
const transitionStyles = readFileSync(
  new URL("../src/styles-route-transitions.css", import.meta.url),
  "utf8",
);
const titleSequence = readFileSync(
  new URL("../src/components/cinematic/title-sequence.tsx", import.meta.url),
  "utf8",
);
const titleSequenceSourcePart = readFileSync(
  new URL("../source-parts/src/components/cinematic/title-sequence.tsx/01.part", import.meta.url),
  "utf8",
);
const openingHandoff = readFileSync(
  new URL("../src/components/cinematic/opening-handoff.tsx", import.meta.url),
  "utf8",
);
const worldHomeSourcePartsUrl = new URL(
  "../source-parts/src/components/world/world-home.tsx/",
  import.meta.url,
);
const worldHomeSourcePartNames = readdirSync(worldHomeSourcePartsUrl)
  .filter((name) => name.endsWith(".part"))
  .sort();
const worldHomeSourceParts = worldHomeSourcePartNames
  .map((name) => readFileSync(new URL(name, worldHomeSourcePartsUrl), "utf8"))
  .join("");

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
  assert.match(
    styles,
    /\.archive-route-dive\.is-arriving \.cine-dive-tunnel > i[\s\S]*?animation: none !important/,
  );
  assert.match(styles, /height: 100vh;\s*height: 100svh;/);
  assert.match(styles, /height: 100svh;\s*height: 100dvh;/);
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

test("the opening dive uses the shared mobile-safe handoff layer", () => {
  assert.match(titleSequence, /beginOpeningHandoff\(\{/);
  assert.match(titleSequence, /waitForVisualPaint/);
  assert.match(titleSequence, /transitionCovered:\s*true/);
  assert.doesNotMatch(
    titleSequence,
    /createPortal|title-world-dive-overlay|DiveVelocityCanvas|window\.scrollTo/,
  );
  assert.match(openingHandoff, /createPortal/);
  assert.match(openingHandoff, /data-opening-handoff-root/);
  assert.match(openingHandoff, /window\.visualViewport/);
  assert.match(transitionStyles, /\[data-opening-handoff-root\]\s*\{/);
  assert.match(
    transitionStyles,
    /\[data-opening-handoff-root\]\s*\{[\s\S]{0,700}?z-index:\s*2147483200/,
  );
  assert.match(
    transitionStyles,
    /@media \(max-width: 640px\)[\s\S]*?\[data-opening-handoff-root\]/,
  );
  assert.match(
    transitionStyles,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\[data-opening-handoff-root\]/,
  );
});

test("the deployment assembler preserves the shared title handoff implementation", () => {
  assert.equal(titleSequenceSourcePart, titleSequence);
});

test("the deployment assembler preserves the complete WorldHome implementation", () => {
  assert.ok(worldHomeSourcePartNames.length > 0);
  assert.equal(worldHomeSourceParts, worldHome);
});

test("the shortened opening keeps heavy startup work off the first paint", () => {
  assert.match(titleSequence, /const SEQUENCE_MS = 5800/);
  assert.match(titleSequence, /requestIdleCallback\(warm, \{ timeout: 900 \}\)/);
  assert.match(titleSequence, /\}, 650\);/);
  assert.match(titleSequence, /preload="none"/);
  assert.match(titleSequence, /videoStartTimerRef\.current = window\.setTimeout/);
  assert.match(styles, /--seq: 5\.8s/);
  assert.match(styles, /progress-marker 0\.4s ease 5\.4s forwards/);
  assert.match(reconstructedOpeningStyles, /--seq: 5\.8s/);
  assert.match(reconstructedOpeningStyles, /animation: progress-fill var\(--seq\) linear forwards/);
  assert.match(reconstructedOpeningStyles, /progress-marker 0\.4s ease 5\.4s forwards/);
});

test("opening the side menu yields the top layer to its navigation controls", () => {
  assert.match(zeusButton, /data-menu-open=\{String\(sideMenuOpen\)\}/);
  assert.doesNotMatch(zeusButton, /panelLeft/);
  assert.match(
    styles,
    /\.zeus-button\[data-menu-open="true"\] \{[\s\S]*?visibility: hidden;[\s\S]*?pointer-events: none;/,
  );
});

test("the world no longer renders the manual update button", () => {
  assert.doesNotMatch(worldChrome, /SiteUpdateButton|site-update-control|サイトの最新版を確認/);
  assert.doesNotMatch(worldHome, /SiteUpdateButton|site-update-control/);
});
