import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Usability round A (2026-09-26): phone input and history. A tap on the Zeus
// button no longer opens the card beneath it, Back/Forward into a dossier
// returns to the reading position, the opening ignores the second half of a
// double tap on スキップ, Tab stays inside RISING, and decorative generated
// text is silent.

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replaceAll("\r\n", "\n");

const guard = read("src/lib/tap-through-guard.ts");
const zeus = read("src/components/zeus-button.tsx");
const rising = read("src/components/world/rising-world.tsx");
const loadGate = read("src/components/load-gate.tsx");
const layer = read("src/styles-world/25.css");
const title = read("src/components/cinematic/title-sequence.tsx");

test("a touch on the Zeus button does not also open the control beneath it", () => {
  assert.match(guard, /export function guardTapThrough\(\) \{/);
  // A script's own .click() (the return closing the side menu) is never eaten.
  assert.match(
    guard,
    /const swallow = \(event: Event\) => \{[^}]*?if \(!event\.isTrusted\) return;\s*if \(performance\.now\(\) > until\) return;/,
  );
  assert.match(zeus, /import \{ guardTapThrough \} from "@\/lib\/tap-through-guard";/);
  assert.match(
    zeus,
    /if \(event\.pointerType !== "mouse"\) guardTapThrough\(\);\s*void onNavigate\(\);/,
  );
  // Keyboard presses (detail 0) navigate with no guard.
  assert.match(zeus, /if \(event\.detail === 0\) void onNavigate\(\);/);
  // RISING keeps the shared guard, not a copy of its own.
  assert.doesNotMatch(rising, /function guardTapThrough/);
});

test("Back/Forward into a dossier keeps the reading position, measured on the full layout", () => {
  assert.match(
    loadGate,
    /\(DETAIL_ROUTE\.test\(pathname\) && pathnameChanged && !isDossierSectionHash && !fromHistory\) \|\|/,
  );
  // Set as the history moves, before the router commits and restores.
  assert.match(
    loadGate,
    /if \(historyTraversal\.current && DETAIL_ROUTE\.test\(location\.pathname\)\) \{\s*document\.documentElement\.dataset\.routeRestoring = "true";/,
  );
  // Held for the restoration only, then let go; any other arrival drops it at once.
  assert.match(
    loadGate,
    /const historyDossier = fromHistory && DETAIL_ROUTE\.test\(pathname\);\s*let restoringTimer = 0;\s*if \(historyDossier\) \{\s*root\.dataset\.routeRestoring = "true";\s*restoringTimer = window\.setTimeout\(\(\) => \{\s*restoringTimer = 0;\s*delete root\.dataset\.routeRestoring;\s*\}, 1500\);\s*\} else \{\s*delete root\.dataset\.routeRestoring;\s*\}/,
  );
  // Leaving a dossier reached by Back/Forward keeps the exit hold every other
  // dossier has (the reset path's cleanup), so the outgoing page never glides.
  assert.match(
    loadGate,
    /if \(!resetRouteTop\) \{\s*if \(!historyDossier\) return releaseRestoring;[\s\S]{0,160}?return \(\) => \{\s*const releaseExitMotion = holdRouteScrollMotion\(\);\s*window\.setTimeout\(releaseExitMotion, 360\);\s*releaseRestoring\(\);\s*\};\s*\}/,
  );
  assert.match(loadGate, /stopResetting\(\);\s*releaseRestoring\(\);\s*\};/);
  assert.match(
    layer,
    /html\[data-route-restoring\]\s*:is\(\.manager-dossier, \.manager-archive-identity-records, \.rider-form-pickup-stack\) \{\s*content-visibility: visible;\s*\}/,
  );
});

test("the form-record placeholders match one pickup and two", () => {
  assert.match(
    layer,
    /\.manager-archive-identity-records \{\s*content-visibility: auto;\s*contain-intrinsic-size: auto 960px;\s*\}/,
  );
  assert.match(
    layer,
    /\.rider-form-pickup-stack \{\s*content-visibility: auto;\s*contain-intrinsic-size: auto 810px;\s*\}/,
  );
  assert.match(
    layer,
    /\.rider-form-pickup-stack:has\(> \.form-pickup \+ \.form-pickup\) \{\s*contain-intrinsic-size: auto 1640px;\s*\}/,
  );
  assert.doesNotMatch(
    layer,
    /:is\(\.manager-archive-identity-records, \.rider-form-pickup-stack\) \{/,
  );
});

test("a double tap on スキップ does not replay the opening", () => {
  assert.match(title, /const REPLAY_GUARD_MS = 600;/);
  assert.match(title, /setPhase\("complete"\);\s*completedAtRef\.current = performance\.now\(\);/);
  // Pointer presses only: the keyboard and the R shortcut replay at once.
  assert.match(
    title,
    /onClick=\{\(e\) => \{\s*if \(e\.detail > 0 && performance\.now\(\) - completedAtRef\.current < REPLAY_GUARD_MS\)\s*return;\s*keyboardFocusRef\.current = e\.detail === 0;\s*replay\(\);/,
  );
});

test("Tab from RISING's CLOSE goes on to the dialog's first control, and Shift+Tab back", () => {
  assert.match(
    rising,
    /const FIRST_CONTROL = "\.rw-controls button:not\(:disabled\), \.rw-redive-button";/,
  );
  const close = rising.slice(rising.indexOf('className="rw-close"'));
  assert.match(
    close,
    /onKeyDown=\{\(event\) => \{[^}]*?if \(event\.key !== "Tab" \|\| event\.shiftKey\) return;\s*const first = dialogRef\.current\?\.querySelector<HTMLButtonElement>\(FIRST_CONTROL\);\s*if \(!first\) return;\s*event\.preventDefault\(\);\s*first\.focus\(\);/,
  );
  // After the click handler, so CLOSE's pointer guard stays where it was.
  assert.ok(
    rising.indexOf("if (event.detail > 0) guardTapThrough();") <
      rising.indexOf('if (event.key !== "Tab" || event.shiftKey) return;'),
  );
  // The dialog sends Shift+Tab from that first control round to CLOSE.
  assert.match(
    rising,
    /if \(event\.key !== "Tab" \|\| !event\.shiftKey\) return;\s*if \(event\.target !== dialogRef\.current\?\.querySelector\(FIRST_CONTROL\)\) return;\s*event\.preventDefault\(\);\s*closeRef\.current\?\.focus\(\);/,
  );
});

test("decorative generated text has empty alternative text", () => {
  assert.match(
    layer,
    /\.section-index small::after \{\s*content: "NODE \/ ONLINE";\s*content: "NODE \/ ONLINE" \/ "";/,
  );
  assert.match(
    read("src/styles-world-neo.css"),
    /\.story-layout::before \{\s*content: "STORY \/\/ RECORD 01";\s*content: "STORY \/\/ RECORD 01" \/ "";/,
  );
});
