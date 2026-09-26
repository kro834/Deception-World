import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Usability round C (2026-09-26): the side menu and the dossier reading. The
// menu opens on the reader's own row, closes by the back gesture and a swipe,
// and hides the page behind it from screen readers; a form record ends on a
// CLOSE; the reader bar lets short screens be; the hero names the rider; the
// reader and the Form Archive keep their marks for forced colours and the
// keyboard.

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replaceAll("\r\n", "\n");

const chrome = read("src/components/world/world-chrome.tsx");
const stub = read("src/components/world/manager-stub.tsx");
const finalStage = read("src/components/final-stage/final-stage.tsx");
const rider = read("src/components/world/rider-page.tsx");
const pickup = read("src/styles-pickup-stability.css");
const reader = read("src/styles-dossier-reader.css");
const archive = read("public/archive-mobile-stability.css");

const openEffect = chrome.slice(
  chrome.indexOf("if (!controlled || !isOpen) return;"),
  chrome.indexOf("}, [controlled, isOpen, onOpenChange]);"),
);
const cleanup = openEffect.slice(openEffect.lastIndexOf("return () => {"));

test("the menu opens with the reader's own dossier row in view", () => {
  assert.ok(openEffect.length > 0);
  // After the reset to the top, and by scrolling the panel alone. The row
  // keeps the panel's own bottom padding clear (the home indicator's inset
  // rides on it), not a fixed 24px.
  assert.match(
    openEffect,
    /panel\.scrollTop = 0;[\s\S]*?const current = panel\.querySelector<HTMLElement>\(\s*'\.side-panel-links > \[aria-current="page"\]',?\s*\);\s*if \(current\) \{\s*const clearance = parseFloat\(window\.getComputedStyle\(panel\)\.paddingBottom\) \|\| 24;\s*const overflow =\s*current\.getBoundingClientRect\(\)\.bottom \+ clearance - panel\.getBoundingClientRect\(\)\.bottom;\s*if \(overflow > 0\) panel\.scrollTop \+= overflow;\s*\}/,
  );
  assert.doesNotMatch(openEffect, /current\.scrollIntoView/);
  // The groups keep their order.
  const groups = [
    "SECTIONS",
    "SPECIAL",
    "STORIES",
    "RIDERS",
    "UNMANAGED",
    "INFORMATION",
    "SYSTEM",
  ].map((name) => chrome.indexOf(`<p>${name}</p>`));
  assert.ok(
    groups.every((index) => index > 0),
    String(groups),
  );
  assert.deepEqual(
    [...groups].sort((a, b) => a - b),
    groups,
  );
});

test("the back gesture closes the menu through a feature-detected CloseWatcher", () => {
  assert.match(openEffect, /\.CloseWatcher;/);
  assert.match(
    openEffect,
    /if \(typeof Watcher === "function"\) \{\s*try \{\s*watcher = new Watcher\(\);\s*watcher\.onclose = \(\) => \{\s*sideMenuRestoreFocusRef\.current = false;\s*onOpenChange\?\.\(false\);\s*\};\s*\} catch \{\s*watcher = null;\s*\}/,
  );
  assert.match(cleanup, /^return \(\) => \{\s*watcher\?\.destroy\(\);/);
  // No history entries: the menu never pushes a state to catch Back.
  assert.doesNotMatch(chrome, /history\.(pushState|replaceState)/);
  // Esc inside the menu is the panel's own and is cancelled, so it closes once.
  assert.match(
    chrome,
    /if \(event\.key === "Escape"\) \{\s*event\.preventDefault\(\);\s*event\.stopPropagation\(\);\s*sideMenuRestoreFocusRef\.current = true;/,
  );
});

test("a touch swipe to the right closes the menu, and only a clear one", () => {
  assert.match(chrome, /const SIDE_MENU_SWIPE_SLOP_PX = 10;/);
  assert.match(chrome, /const SIDE_MENU_SWIPE_RATIO = 1\.4;/);
  assert.match(chrome, /const SIDE_MENU_SWIPE_CLOSE_PX = 72;/);
  assert.match(chrome, /const SIDE_MENU_SWIPE_FLICK_MIN_PX = 24;/);
  assert.match(chrome, /const SIDE_MENU_SWIPE_CLOSE_PX_PER_MS = 0\.5;/);
  assert.match(chrome, /const SIDE_MENU_SWIPE_SAMPLE_MS = 100;/);
  // Touch only; a pen or mouse drag is left alone.
  assert.match(
    chrome,
    /const onPanelPointerDown = \(event: PointerEvent<HTMLElement>\) => \{\s*sideMenuRestoreFocusRef\.current = false;\s*if \(!controlled \|\| !isOpen \|\| event\.pointerType !== "touch" \|\| !event\.isPrimary\) return;/,
  );
  // The first 10px decide; a vertical start stays the list's scroll.
  assert.match(
    chrome,
    /if \(dx <= SIDE_MENU_SWIPE_SLOP_PX \|\| dx <= SIDE_MENU_SWIPE_RATIO \* Math\.abs\(dy\)\) \{\s*swipeRef\.current = null;\s*return;\s*\}/,
  );
  // Only the finger moves the panel: an inline translate with no transition.
  assert.match(chrome, /panel\.setPointerCapture\(event\.pointerId\);/);
  assert.match(chrome, /panel\.style\.transition = "none";/);
  assert.match(chrome, /panel\.style\.translate = `\$\{Math\.max\(0, dx\)\}px 0`;/);
  // A flick needs 24px as well as speed: a tap that rolls a few pixels to
  // the right stays a tap and navigates. The speed is the release's, read
  // over the finger's last ~100ms, not averaged from touchdown.
  assert.match(
    chrome,
    /if \(\s*dx > SIDE_MENU_SWIPE_CLOSE_PX \|\|\s*\(dx > SIDE_MENU_SWIPE_FLICK_MIN_PX && speed > SIDE_MENU_SWIPE_CLOSE_PX_PER_MS\)\s*\) \{\s*sideMenuRestoreFocusRef\.current = false;\s*close\(\);/,
  );
  assert.match(
    chrome,
    /const speed =\s*\(event\.clientX - swipe\.sampleX\) \/ Math\.max\(1, event\.timeStamp - swipe\.sampleTime\);/,
  );
  assert.match(
    chrome,
    /if \(event\.timeStamp - swipe\.sampleTime > SIDE_MENU_SWIPE_SAMPLE_MS\) \{\s*swipe\.sampleX = swipe\.lastX;\s*swipe\.sampleTime = swipe\.lastTime;\s*\}\s*swipe\.lastX = event\.clientX;\s*swipe\.lastTime = event\.timeStamp;/,
  );
  assert.doesNotMatch(chrome, /swipe\.time\b/);
  // Release, cancel and a lost capture leave no inline style behind.
  assert.match(
    chrome,
    /const releaseSwipe = \(\) => \{\s*swipeRef\.current = null;\s*panelRef\.current\?\.style\.removeProperty\("translate"\);\s*panelRef\.current\?\.style\.removeProperty\("transition"\);/,
  );
  assert.match(chrome, /onPointerCancel=\{onPanelPointerCancel\}/);
  assert.match(chrome, /onLostPointerCapture=\{onPanelPointerCancel\}/);
  assert.match(cleanup, /panel\.style\.removeProperty\("translate"\);/);
});

test("the page behind the open menu leaves the accessibility tree, and comes back first", () => {
  assert.match(
    openEffect,
    /let node: HTMLElement = panel;\s*while \(node !== document\.body && node\.parentElement\) \{/,
  );
  assert.match(
    openEffect,
    /if \(sibling === node \|\| !\(sibling instanceof HTMLElement\) \|\| sibling\.inert\) continue;\s*if \(sibling\.matches\("dialog, \.side-panel-scrim, script, style, link"\)\) continue;\s*sibling\.inert = true;\s*inerted\.push\(sibling\);/,
  );
  // Released before focus returns: an inert opener cannot take it.
  const release = cleanup.indexOf("for (const element of inerted) element.inert = false;");
  const restore = cleanup.indexOf("previousFocus?.focus({ preventScroll: true });");
  assert.ok(release > 0 && restore > release, `${release} < ${restore}`);
});

test("every form record ends on a CLOSE named by its visible label", () => {
  for (const [name, source, panelEnd] of [
    [
      "FormPickup",
      stub,
      /<\/section>\s*\) : null\}\s*\{\/\*[\s\S]*?\*\/\}\s*<button type="button" className="form-pickup-end-close" onClick=\{close\}>[\s\S]*?<\/button>\s*<\/div>\s*<\/dialog>/,
    ],
    [
      "RiderPickup",
      finalStage,
      /<div className="fst-pickup-record">\{children\}<\/div>\s*\{\/\*[\s\S]*?\*\/\}\s*<button type="button" className="form-pickup-end-close" onClick=\{close\}>[\s\S]*?<\/button>\s*<\/div>\s*<\/dialog>/,
    ],
  ]) {
    assert.match(source, panelEnd, name);
    const button = source.slice(
      source.indexOf('className="form-pickup-end-close"'),
      source.indexOf("</button>", source.indexOf('className="form-pickup-end-close"')),
    );
    // The corner control keeps the one 閉じる the dossier checks look up.
    assert.doesNotMatch(button, /aria-label/, name);
    assert.match(button, /<span>CLOSE<\/span>\s*<i aria-hidden="true">/, name);
  }
  const rule = pickup.slice(
    pickup.indexOf(".form-pickup-dialog .form-pickup-end-close {"),
    pickup.indexOf("}", pickup.indexOf(".form-pickup-dialog .form-pickup-end-close {")),
  );
  assert.match(rule, /width: 100%;/);
  assert.match(rule, /min-height: 48px;/);
  assert.match(rule, /margin: 24px 0 0;/);
  assert.match(rule, /border-radius: 999px;/);
  assert.match(rule, /background: #101b29;/);
  assert.doesNotMatch(rule, /sticky|animation|transition|backdrop-filter/);
  // From 761px it is a centred button, not a bar across the record.
  assert.match(
    pickup,
    /@media \(min-width: 761px\) \{\s*\.form-pickup-dialog \.form-pickup-end-close \{\s*width: min\(100%, 420px\);\s*margin-inline: auto;\s*\}\s*\}/,
  );
  assert.match(
    pickup,
    /\.form-pickup-dialog\.is-rexonance-dialog \.form-pickup-end-close \{\s*border-color: rgba\(159, 232, 255, 0\.36\);/,
  );
  assert.match(
    pickup,
    /\.form-pickup-dialog \.form-pickup-end-close:focus-visible \{\s*outline: 2px solid/,
  );
});

test("the dossier reader lets short screens be and keeps its mark in forced colours", () => {
  assert.match(
    reader,
    /@media \(max-height: 500px\) \{\s*main\.manager-page \.dossier-reader \{\s*position: relative;\s*top: auto;\s*\}/,
  );
  // There its jumps land just under the header, not a bar's height below.
  assert.match(
    reader,
    /@media \(max-height: 500px\) \{[^@]*?html\[data-mode="world"\]:has\(> body > main\.manager-page \.dossier-reader\) \{\s*scroll-padding-top: calc\(44px \+ env\(safe-area-inset-top\)\);\s*\}/,
  );
  // The section's own scroll-margin stays.
  assert.match(reader, /scroll-margin-top: 52px;/);
  // Tall screens keep the sticky bar.
  assert.match(reader, /\.dossier-reader \{\s*position: sticky;\s*top: 74px;/);
  assert.match(
    reader,
    /@media \(forced-colors: active\) \{\s*main\.manager-page \.dossier-reader a\[aria-current\] \{\s*forced-color-adjust: none;\s*color: HighlightText;\s*background: Highlight;\s*border-color: Highlight;/,
  );
});

test("a rider dossier's first screen names the rider", () => {
  assert.match(
    rider,
    /<p className="manager-file-number">\s*CHARACTER FILE \/\/ \{rider\.no\} \{rider\.name\}\s*<\/p>/,
  );
  // The header's label (and the brand's name) stays the file number.
  assert.match(rider, /fileLabel=\{`CHARACTER FILE \/\/ \$\{rider\.no\}`\}/);
});

test("the Form Archive's nav, hero actions and detail arrows show keyboard focus", () => {
  assert.match(
    archive,
    /html :is\(#saga-forms-performance-v5, #edition-panel-saga #saga--saga-forms-performance-v5, #edition-panel-realm #realm--saga-forms-performance-v5\) :is\(\.archive-nav a, \.hero-action, \.detail-nav button\):focus-visible \{\s*outline: 2px solid var\(--active-2, #c3aaff\);\s*outline-offset: 3px;/,
  );
  // The nav scrolls inside a rounded pill that would clip an outer ring at
  // its edges: its links draw the ring inside, by a later rule of equal
  // weight.
  const ring = archive.indexOf(
    ":is(.archive-nav a, .hero-action, .detail-nav button):focus-visible {",
  );
  const inset = archive.indexOf(
    "html :is(#saga-forms-performance-v5, #edition-panel-saga #saga--saga-forms-performance-v5, #edition-panel-realm #realm--saga-forms-performance-v5) .archive-nav a:focus-visible {\n  outline-offset: -3px;\n}",
  );
  assert.ok(ring > 0 && inset > ring, `${ring} < ${inset}`);
});

test("the Form Archive's four section links fit their pill from 360px", () => {
  const narrow = archive.slice(archive.indexOf("@media (max-width: 389px) {"));
  assert.ok(narrow.length > 0);
  assert.match(narrow, /\.hero-topline \{\s*column-gap: 10px;\s*padding-inline: 0\.6rem;\s*\}/);
  assert.match(
    narrow,
    /\.archive-nav a \{\s*padding-inline: 0\.4rem;\s*letter-spacing: 0\.04em;\s*\}/,
  );
  // Both editions, at the weight of the focus rules; the pill keeps its own
  // padding (a ring at either end clears its rounded clip) and the links
  // keep their touch height.
  assert.equal(
    narrow.match(
      /html :is\(#saga-forms-performance-v5, #edition-panel-saga #saga--saga-forms-performance-v5, #edition-panel-realm #realm--saga-forms-performance-v5\) /g,
    )?.length,
    2,
  );
  assert.doesNotMatch(narrow, /\.archive-nav \{|min-height|font-size|display: none/);
});
