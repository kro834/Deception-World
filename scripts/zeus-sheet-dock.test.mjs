import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/* 2026-10-22 (chrome round 2): on a phone the quick search spans the screen
   and its results scroll under every other spot, so the Zeus button rests at
   the far end of the sheet's foot, which the sheet keeps free for it; the
   field, the close plate and the 404's recovery tiles are stepped off. */

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replaceAll("\r\n", "\n");
const zeus = read("src/components/zeus-button.tsx");
const sheet = read("src/styles-quick-search.css");

test("the quick search's field, close plate and the 404 tiles are controls", () => {
  const avoid = zeus.slice(zeus.indexOf("const ZEUS_AVOID_SELECTOR"), zeus.indexOf('].join(",")'));
  for (const selector of [
    '".quick-search-field"',
    '".quick-search-close"',
    '".recovery-tiles > a"',
    '".app-load-error-actions :is(button, a)"',
  ])
    assert.ok(avoid.includes(selector), selector);
});

test("the dock holds the button only on a screen-wide band, until the reader moves it", () => {
  assert.match(zeus, /const ZEUS_DOCK_SELECTOR = "dialog\.quick-search \.quick-search-foot";/);
  assert.match(zeus, /const ZEUS_DOCK_MIN_SHARE = 0\.85;/);
  // A floating sheet (tablet, desktop), a short band or a band under the keyboard: no dock.
  assert.match(
    zeus,
    /if \(rect\.width < viewport\.width \* ZEUS_DOCK_MIN_SHARE \|\| rect\.height < size\.height\) return null;/,
  );
  assert.match(zeus, /return Math\.abs\(placed\.y - dock\.y\) > 2 \? null : placed;/);
  // Only the position it arrived with: a drop saves a new one and the dock lets go.
  // Owner (2026-10-22): main's Zeus rewrite owns `dock` (an edge drop) and the placement report; the sheet dock is renamed and passed third.
  assert.match(
    zeus,
    /const sheetDock =\s*next === arrivedAt\.current \? readDock\(button, viewport, size, bounds\) : null;/,
  );
  assert.match(
    zeus,
    /const safeCenter = avoidCriticalControls\(\s*sheetDock \?\? \{ x: centerX, y: centerY \},\s*report,\s*sheetDock !== null,\s*\);/,
  );
  assert.match(zeus, /if \(!button \|\| docked\) return preferred;/);
  // The band moves as the results grow while typing (no scroll): it is followed.
  assert.match(zeus, /new ResizeObserver\(followDock\)/);
  assert.match(zeus, /dockObserver\?\.disconnect\(\);/);
});

test("the sheet keeps its foot free for the button on phones only", () => {
  const lane = sheet.slice(sheet.indexOf("/* The Zeus button's band"));
  assert.match(
    lane,
    /@media \(max-width: 640px\) \{\s*dialog\.quick-search:has\(> \.zeus-button\) \{\s*--qs-zeus: 60px;\s*\}\s*dialog\.quick-search:has\(> \.zeus-button\) \.quick-search-foot \{\s*min-height: calc\(var\(--qs-zeus\) \+ 24px\);\s*padding-right: calc\(var\(--qs-zeus\) \+ 36px\);/,
  );
  // 561-640px: the button's own size there (clamp(72px, 7vw, 92px)).
  assert.match(
    lane,
    /@media \(min-width: 561px\) and \(max-width: 640px\) \{[\s\S]*?--qs-zeus: 72px;/,
  );
});
