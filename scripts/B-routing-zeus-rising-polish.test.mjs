import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const router = read("src/router.tsx");
const loadGate = read("src/components/load-gate.tsx");
const transitions = read("src/styles-route-transitions.css");
const cutIns = read("src/styles-world/22.css");
const zeus = read("src/components/zeus-button.tsx");
const rising = read("src/components/world/rising-world.tsx");
const tapThroughGuard = read("src/lib/tap-through-guard.ts");
const risingStyles = read("src/styles-world-rising.css");
const reDive = read("src/styles-world-re-dive.css");
const specialSites = read("src/styles-rexonance-saga.css");

test("Back and Forward into the world keep the reading position; fresh entries start at the top", () => {
  assert.match(router, /scrollRestoration: true,[\s\S]*?scrollRestorationBehavior: "instant"/);
  assert.match(
    loadGate,
    /router\.history\.subscribe\(\(\{ action, location \}\) => \{\s*const pop = action\.type === "BACK" \|\| action\.type === "FORWARD" \|\| action\.type === "GO";\s*const repeated = pop && location\.href === previousHref;\s*previousHref = location\.href;/,
  );
  // A native href="#top" click is a pop onto an unkeyed entry (still a reset);
  // only Back/Forward onto a router-keyed entry keeps the restored position.
  assert.match(
    loadGate,
    /historyTraversal\.current = pop && !repeated && window\.history\.state\?\.__TSR_key != null;/,
  );
  assert.doesNotMatch(loadGate, /historyTraversal\.current =\s*action\.type === "BACK"/);
  // Pressed again at /world#top, the link changes no location: the reset is
  // asked for explicitly, so every press jumps instead of gliding up.
  assert.match(
    loadGate,
    /if \(repeated && location\.pathname === "\/world" && location\.hash === "#top"\) \{\s*setTopRepeat\(\(count\) => count \+ 1\);/,
  );
  assert.match(loadGate, /\}, \[locationHash, pathname, topRepeat\]\);/);
  // Read once and cleared, so a later PUSH to /world still resets.
  assert.match(
    loadGate,
    /const fromHistory = historyTraversal\.current;\s*historyTraversal\.current = false;/,
  );
  assert.match(
    loadGate,
    /\(pathname === "\/world" && \(!locationHash \|\| locationHash === "top"\) && !fromHistory\)/,
  );
});

test("a keyboard activation focuses the destination in every navigation branch", () => {
  assert.match(loadGate, /focusDestination\?: boolean;/);
  assert.match(
    loadGate,
    /void go\(\{ to, hash, assets, transition, focusDestination: e\.detail === 0 \}\)/,
  );
  // Plain, rider dive / cut-in, Zeus and archive branches.
  assert.equal(
    (loadGate.match(/if \(focusDestination\) focusRouteDestination\(hash\);/g) ?? []).length,
    4,
  );
  assert.match(
    loadGate,
    /await navigate\(\{ to: to as never, hash \}\);\s*if \(focusDestination\) focusRouteDestination\(hash\);\s*if \(hash\) await settleRouteHash\(hash\);/,
  );
  assert.match(loadGate, /target\.focus\(\{ preventScroll: true \}\);/);
  assert.match(transitions, /\[data-route-focus="true"\]:focus \{\s*outline: none;\s*\}/);
});

test("the Zeus button returns home after a dodge and steps off the closing controls", () => {
  assert.match(zeus, /const preferredPosition = useRef\(position\);/);
  assert.match(zeus, /preferredPosition\.current = position;/);
  assert.match(
    zeus,
    /placementFrame\.current = null;\s*if \(activePointer\.current != null\) return;\s*placeButton\(preferredPosition\.current\);/,
  );
  assert.match(zeus, /\{ x: preferred\.x, y: preferred\.y - lift \* 2 \},/);
  const avoid = zeus.slice(zeus.indexOf("const ZEUS_AVOID_SELECTOR"), zeus.indexOf('].join(",")'));
  for (const selector of [
    '".rw-gate-button",',
    "'.manager-archive-tabs [role=\"tab\"]'",
    "'.world-column-tabs [role=\"tab\"]'",
    '".finale-content .primary-action"',
    '"footer > a"',
    '".manager-pagination > a > span:last-child"',
    '".dossier-index-return"',
    '".dossier-read-link"',
    '".rxs-footer > a"',
  ]) {
    assert.ok(avoid.includes(selector), selector);
  }
});

test("the Zeus button stays under the ENTER THE WORLD still and the route overlays", () => {
  assert.match(
    transitions,
    /html\[data-opening-handoff-active\] \.zeus-button \{\s*z-index: 2147483100;/,
  );
  assert.match(
    transitions,
    /body:has\(\.load-gate\) \.zeus-button:not\(\[data-navigating="true"\]\) \{\s*visibility: hidden;\s*opacity: 0;\s*pointer-events: none;/,
  );
});

test("dives dissolve out of their exit light and the Leddic caption clears the door pulls", () => {
  assert.match(
    transitions,
    /\.load-gate\.archive-route-dive\.is-arriving \{\s*animation: dw-gate-dissolve 0\.5s cubic-bezier\(0\.4, 0, 0\.2, 1\) both;/,
  );
  assert.match(
    transitions,
    /@keyframes dw-gate-dissolve \{\s*0%,\s*52% \{\s*opacity: 1;\s*\}\s*to \{\s*opacity: 0;/,
  );
  const reduced = transitions.slice(transitions.indexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(
    reduced,
    /\.load-gate\.archive-route-dive\.is-arriving \{\s*animation-duration: 0\.16s;/,
  );
  assert.match(
    cutIns,
    /\.is-leddic-cutin \.rider-cutin-caption \{\s*top: calc\(50% \+ clamp\(78px, 11vmin, 128px\)\);/,
  );
});

test("the form-archive switcher labels and the special-site scroll cue are legible and tappable", () => {
  assert.match(
    transitions,
    /\.form-archive-switcher button small \{\s*font-size: 0\.6875rem;\s*letter-spacing: 0\.14em;/,
  );
  assert.match(transitions, /\.form-archive-switcher button b \{\s*font-size: 0\.8125rem;/);
  assert.doesNotMatch(transitions, /font-size: 0\.44rem/);
  assert.match(specialSites, /html \.rxs-page\.rxs-page \.rxs-scroll-cue \{\s*contain: layout;/);
  assert.match(
    specialSites,
    /html \.rxs-page\.rxs-page \.rxs-scroll-cue::before \{\s*position: absolute;\s*inset: -12px -10px;\s*content: "";/,
  );
});

test("a pointer CLOSE swallows the double tap's second press; keyboard closes are immediate", () => {
  // The guard is shared with the Zeus button (src/lib/tap-through-guard.ts).
  assert.match(tapThroughGuard, /const TAP_THROUGH_GUARD_MS = 450;/);
  assert.match(tapThroughGuard, /const types = \["pointerdown", "mousedown", "click"\] as const;/);
  assert.match(rising, /import \{ guardTapThrough \} from "@\/lib\/tap-through-guard";/);
  assert.match(
    rising,
    /className="rw-close"\s*onClick=\{\(event\) => \{\s*if \(event\.detail > 0\) guardTapThrough\(\);\s*closeDialog\(\);/,
  );
});

test("RISING's controls answer hover and press, and the landscape title clears RE DIVE", () => {
  assert.match(
    risingStyles,
    /@media \(max-height: 540px\) \{\s*\.site-shell\.film-edition\.mirage-edition \.rw-title-wrap \{\s*padding-bottom: calc\(max\(24px, calc\(env\(safe-area-inset-bottom\) \+ 16px\)\) \+ 124px\);/,
  );
  assert.match(risingStyles, /font-size: clamp\(44px, min\(14\.6cqw, 26cqh\), 224px\);/);
  assert.match(
    risingStyles,
    /@media \(hover: hover\) and \(pointer: fine\) \{[\s\S]*?:is\(\.rw-controls button, \.rw-close\):hover:not\(:focus-visible, :active\)/,
  );
  assert.match(risingStyles, /:is\(\.rw-controls button, \.rw-close\):active \{\s*scale: 0\.97;/);
  // The press rule sits before the keyboard ring so the ring still wins.
  assert.ok(
    risingStyles.indexOf(":is(.rw-controls button, .rw-close):active {") <
      risingStyles.indexOf(":is(.rw-controls button, .rw-close):focus-visible {"),
  );
  assert.match(reDive, /\.rw-redive-button:hover:not\(:focus-visible\) \{/);
  assert.match(reDive, /\.rw-redive-button:active \{\s*scale: 0\.97;/);
});

test("RE DIVE's FRONT / 01 label is content-sized and 欠番 matches the names beside it", () => {
  const tab = reDive.slice(reDive.indexOf(".re-dive-tab {"), reDive.indexOf(".re-dive-tab small"));
  assert.match(tab, /justify-self: start;/);
  assert.match(tab, /min-width: 112px;/);
  assert.match(tab, /align-items: center;/);
  assert.match(reDive, /\.re-dive-tab small \{\s*font: 400 11px \/ 1/);
  assert.match(
    reDive,
    /\.re-dive-section \.signal\.is-vacant > b \{\s*color: rgb\(255 226 206 \/ 0\.74\);\s*font-size: 16px;/,
  );
  assert.match(
    reDive,
    /@media \(max-width: 760px\) \{\s*\.site-shell\.film-edition\.mirage-edition \.re-dive-section \.signal\.is-vacant > b \{\s*font-size: 14px;/,
  );
});
