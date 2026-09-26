import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Usability round, final walkthrough (2026-09-26): a jump inside a dossier
// lands on its section even while the records above it are still
// placeholders, and a native in-page link keeps its history key, so Back from
// a dossier returns to where the reader was on the World.

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replaceAll("\r\n", "\n");

const loadGate = read("src/components/load-gate.tsx");

test("a reader or contents jump in a dossier is aligned again while the page settles", () => {
  assert.match(
    loadGate,
    /const DOSSIER_SECTION_LINK =\s*\/\^#\(\?:character-section-\[\\w-\]\+\|dossier-profile\|dossier-index\|identity-records\|form-records\)\$\/;/,
  );
  // The native jump itself runs; the settle starts a frame later, instantly.
  assert.match(
    loadGate,
    /const onClick = \(event: globalThis\.MouseEvent\) => \{\s*if \(event\.defaultPrevented \|\| event\.button !== 0\) return;\s*if \(event\.metaKey \|\| event\.ctrlKey \|\| event\.shiftKey \|\| event\.altKey\) return;\s*if \(!DETAIL_ROUTE\.test\(window\.location\.pathname\)\) return;[\s\S]{0,200}?if \(!DOSSIER_SECTION_LINK\.test\(href\)\) return;\s*const releaseJumpMotion = holdRouteScrollMotion\(\);\s*window\.requestAnimationFrame\(\(\) => \{\s*void settleRouteHash\(href\.slice\(1\)\)\.finally\(\(\) =>\s*window\.setTimeout\(releaseJumpMotion, 360\),\s*\);\s*\}\);\s*\};\s*document\.addEventListener\("click", onClick\);/,
  );
  assert.doesNotMatch(loadGate, /preventDefault\(\);\s*const releaseJumpMotion/);
});

test("only the latest hash landing keeps aligning", () => {
  assert.match(loadGate, /let routeHashSettle = 0;/);
  assert.match(
    loadGate,
    /async function settleRouteHash\(hash: string\) \{[\s\S]{0,400}?const settle = \+\+routeHashSettle;/,
  );
  assert.match(
    loadGate,
    /const align = \(\) => \{\s*if \(settle !== routeHashSettle\) userInteracted = true;\s*if \(!userInteracted\) \{/,
  );
});

test("a native in-page link keeps the router's key, so Back restores the reader's place", () => {
  const subscribe = loadGate.slice(loadGate.indexOf("return router.history.subscribe("));
  const traversal = subscribe.indexOf("historyTraversal.current = pop && !repeated");
  const stamp = subscribe.indexOf(
    'if (pop && window.history.state == null && location.state.__TSR_key) {\n        History.prototype.replaceState.call(window.history, location.state, "");\n      }',
  );
  assert.ok(traversal > 0, "the traversal check is still there");
  // Read before stamping: the arrival itself is still a link, not Back/Forward.
  assert.ok(stamp > traversal, "the entry is stamped after the traversal check");
  // The router's own wrapper would announce a REPLACE and load the route again.
  assert.doesNotMatch(subscribe.slice(0, 1200), /window\.history\.replaceState\(/);
});
