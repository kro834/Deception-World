import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/* 2026-09-29: the Zeus button keeps off the cast wall's PROFILE rows and the
   other new World and page controls, tries its own side before the far side,
   glides instead of jumping, holds a step for a settle, re-places on a
   disclosure toggle and on a dialog's own scroll, and shows the hold filling
   in (src/components/zeus-button.tsx, src/styles-chrome-elevation.css). */

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replaceAll("\r\n", "\n");
const zeus = read("src/components/zeus-button.tsx");
const chrome = read("src/styles-chrome-elevation.css");

test("disclosure rows and the new controls are stepped off as whole boxes", () => {
  const avoid = zeus.slice(zeus.indexOf("const ZEUS_AVOID_SELECTOR"), zeus.indexOf('].join(",")'));
  for (const selector of [
    '".wa-profile > summary"',
    '".wa-doc > summary"',
    '".dream-story-case > summary"',
    '".wa-open"',
    '".wa-contents a"',
    '".dream-contents a"',
    '".wa-quote-rail"',
    "'.rider-tabs [role=\"tab\"]'",
    "'.rxs-stage-tabs [role=\"tab\"]'",
    '".dossier-reader-links a"',
    '".hero-actions .primary-action"',
  ]) {
    assert.ok(avoid.includes(selector), selector);
  }
  // A control taller than most of the screen would pin the button home.
  assert.match(
    zeus,
    /if \(controlRect\.height > viewport\.height \* ZEUS_AVOID_MAX_HEIGHT\) return false;/,
  );
  // Inside a dialog only its own controls count, like its words.
  assert.match(zeus, /const controlRoot: ParentNode = button\.closest\("dialog"\) \?\? document;/);
});

test("its own side first; the far rows only when clear; the fallback weighs distance", () => {
  const at = (candidate) => zeus.indexOf(candidate);
  const down = at("{ x: preferred.x, y: preferred.y + lift },");
  const flip = at("{ x: mirrorX, y: preferred.y },");
  const up3 = at("{ x: preferred.x, y: preferred.y - lift * 3 },");
  assert.ok(down > 0 && flip > down, "the flip comes after the same-side steps");
  assert.ok(up3 > flip, "a third step up (mid-screen) comes after the flip");
  const list = zeus.slice(at("const candidates = ["), at("].map((candidate) => clampZeusCenter"));
  assert.equal(list.match(/\{ x: /g)?.length, 11, "preferred plus eleven steps");
  assert.match(zeus, /const ZEUS_NEAR_CANDIDATES = 10;/);
  assert.match(zeus, /if \(index >= ZEUS_NEAR_CANDIDATES\) continue;/);
  assert.match(zeus, /ZEUS_FALLBACK_DISTANCE_WEIGHT \*\s*Math\.hypot\(candidate\.x - preferred\.x/);
  // A fixed top bar is off limits to the steps, not to the reader's spot.
  assert.match(zeus, /index > 0 && topBar !== null && meetsAny\(candidateRect, \[topBar\]\)/);
});

test("a step is held for one clear settle before it goes home", () => {
  assert.match(zeus, /away\.clearSettles < 1\) \{\s*away\.clearSettles \+= 1;\s*return shown;/);
  assert.match(
    zeus,
    /Math\.abs\(scroller\.scrollTop - away\.scrollTop\) > viewport\.height \* 0\.6/,
  ); // A still page gets one more look, so a held step does not stay off a
  // clear home until the next scroll.
  assert.match(zeus, /const ZEUS_STEP_RECHECK_MS = 900;/);
  assert.match(
    zeus,
    /if \(stepAway\.current\?\.clearSettles === 1 && placementTimer\.current == null\) \{/,
  );
});

test("a page-wide flip waits for the third step up; edge docks clamp on the resting size", () => {
  assert.match(zeus, /const ZEUS_FLIP_MAX_PX = 480;/);
  assert.match(
    zeus,
    /if \(Math\.abs\(mirrorX - preferred\.x\) > ZEUS_FLIP_MAX_PX\) \{[\s\S]*?candidates\.splice\(4, 0, \.\.\.candidates\.splice\(8, 1\)\);/,
  );
  assert.match(zeus, /readBounds\(viewport, restingSize\(button\)\)/);
});

test("disclosures and dialog scrolls re-place it, through passive listeners", () => {
  assert.match(
    zeus,
    /document\.addEventListener\("toggle", onLayoutChange, \{ capture: true, passive: true \}\)/,
  );
  assert.match(
    zeus,
    /document\.addEventListener\("scroll", onInnerScroll, \{ capture: true, passive: true \}\)/,
  );
  assert.match(
    zeus,
    /document\.removeEventListener\("toggle", onLayoutChange, \{ capture: true \}\)/,
  );
  assert.match(
    zeus,
    /document\.removeEventListener\("scroll", onInnerScroll, \{ capture: true \}\)/,
  );
  // Page rails never trigger the work; only the button's own dialog.
  assert.match(zeus, /if \(!dialog\.contains\(event\.target as Node\)\) return;\s*onScroll\(\);/);
});

test("placements glide on translate, gated by reduced motion and economy", () => {
  assert.match(
    zeus,
    /button\.dataset\.relocating = "true";\s*button\.style\.translate = "0px 0px";/,
  );
  assert.match(
    zeus,
    /delete button\.dataset\.relocating;\s*button\.style\.removeProperty\("translate"\);/,
  );
  const gated = chrome.slice(
    chrome.indexOf(
      '@media (prefers-reduced-motion: no-preference) {\n  html:not([data-world-effects="economy"]) body .zeus-button-aura::before',
    ),
  );
  assert.match(
    gated,
    /html:not\(\[data-world-effects="economy"\]\) body \.zeus-button\[data-relocating="true"\] \{\s*transition: translate 0\.22s/,
  );
  // Only the settle, toggle and dock paths glide; never the drag itself.
  assert.doesNotMatch(
    zeus.slice(zeus.indexOf("const finishPointer"), zeus.indexOf("return (\n    <button")),
    /startGlide\(/,
  );
});

test("the hold fills in, MOVE rides above the finger, landscape takes the phone size", () => {
  assert.match(
    chrome,
    /\.zeus-button:is\(\[data-holding="true"\], \[data-dragging="true"\]\) \.zeus-button-aura::before \{\s*clip-path: inset\(0 0 0 0\);/,
  );
  assert.match(
    chrome,
    /\.zeus-button\[data-dragging="true"\] \.zeus-button-move \{\s*top: auto;\s*bottom: calc\(100% \+ 12px\);/,
  );
  assert.match(chrome, /\.zeus-button\[data-dragging="true"\] \{\s*contain: layout style;/);
  assert.match(
    chrome,
    /@media \(max-height: 500px\) and \(orientation: landscape\) \{\s*html body \.zeus-button \{\s*--zeus-button-size: 60px;/,
  );
  const forced = chrome.slice(chrome.lastIndexOf("@media (forced-colors: active)"));
  assert.match(
    forced,
    /\.zeus-button-aura::before \{\s*border-color: Highlight;\s*background: none;/,
  );
  assert.match(zeus, /const HOLD_CUE_MS = 160;/);
  // 2026-09-29 review: 320 left a 320-420ms touch press doing nothing; a
  // slow tap now counts up to 380, and a mouse click always counts.
  assert.match(zeus, /const TAP_MAX_MS = 380;/);
  assert.match(
    zeus,
    /event\.pointerType !== "mouse" && event\.timeStamp - pressStartedAt\.current > TAP_MAX_MS/,
  );
});
