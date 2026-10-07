import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const css = source("src/styles-viewport-chrome.css").replace(/\/\*[\s\S]*?\*\//g, "");
const normalise = (value) => value.replace(/\s+/g, " ").trim();
const rules = Array.from(css.matchAll(/([^{}]+)\{([^{}]*)\}/g), ([, selector, body]) => ({
  selector: normalise(selector),
  body,
}));
const bodyFor = (selector) => {
  const matches = rules.filter((rule) => rule.selector === normalise(selector));
  assert.equal(matches.length, 1, `expected one CSS rule for ${selector}`);
  return matches[0].body;
};
const ipadScope = 'html:root[data-ipad-viewport="contained"][data-ipad-menu="compact"]';
const scrollScope = `${ipadScope}[data-viewport-chrome]`;
const compactScope = `${ipadScope}[data-ipad-menu-scrolled="true"][data-viewport-chrome]`;
const headers = ":is(.gallery-topbar, .topbar, .dream-site-header)";

// These are source-contract regressions, not a simulation of iPadOS native
// status-bar painting. Geometry, focus and paint still need browser/device QA.
test("compact chrome is iPad-gated and restricted to the shared route contract", () => {
  const compactRules = rules.filter((rule) => rule.selector.includes('[data-ipad-menu="compact"]'));
  assert.ok(compactRules.length >= 3);
  for (const rule of compactRules) {
    assert.ok(rule.selector.startsWith(ipadScope));
    assert.ok(rule.selector.includes("[data-viewport-chrome]"));
  }
  assert.match(bodyFor(".ipad-menu-toggle"), /display:\s*none\s*!important;/);
  assert.match(
    bodyFor('html:root[data-ipad-viewport="contained"] .ipad-menu-toggle'),
    /display:\s*flex\s*!important;/,
  );
});

test("headers follow the document scroll with no transformed launcher ancestor", () => {
  const header = bodyFor(`${scrollScope} ${headers}`);
  assert.match(header, /top:\s*calc\(0px - var\(--ipad-header-scroll, 0px\)\)\s*!important;/);
  for (const property of ["transform", "filter", "perspective"]) {
    assert.match(header, new RegExp(`${property}:\\s*none\\s*!important;`));
  }
  assert.match(header, /will-change:\s*auto\s*!important;/);
  assert.match(header, /transition:\s*none\s*!important;/);
  assert.doesNotMatch(header, /(?:^|;)\s*(?:display|height|contain|overflow(?:-[xy])?)\s*:/);
  const dreamIndex = bodyFor(`${scrollScope} .dream-chapter-nav`);
  assert.match(
    dreamIndex,
    /top:\s*calc\(var\(--ipad-header-height, 84px\) - var\(--ipad-header-scroll, 0px\)\)\s*!important;/,
  );
  assert.match(dreamIndex, /transition:\s*none\s*!important;/);
});

test("fully exited chrome loses all edge paint without collapsing containers or replacing scrolling", () => {
  const header = bodyFor(`${compactScope} ${headers}`);
  assert.match(header, /visibility:\s*hidden\s*!important;/);
  assert.match(header, /pointer-events:\s*none\s*!important;/);
  assert.match(header, /background:\s*transparent\s*!important;/);
  assert.doesNotMatch(
    header,
    /(?:^|;)\s*(?:display|overflow(?:-[xy])?|transform|contain|touch-action)\s*:/,
  );
  assert.doesNotMatch(css, /(?:^|[;{])\s*(?:overflow(?:-[xy])?|touch-action)\s*:/);
  const dreamIndex = bodyFor(`${compactScope} .dream-chapter-nav`);
  assert.match(dreamIndex, /visibility:\s*hidden\s*!important;/);
  assert.match(dreamIndex, /pointer-events:\s*none\s*!important;/);
  assert.match(dreamIndex, /box-shadow:\s*none\s*!important;/);
  const pseudo = bodyFor(
    `${compactScope} :is(.gallery-topbar, .topbar, .dream-site-header, .dream-chapter-nav)::before,
     ${compactScope} :is(.gallery-topbar, .topbar, .dream-site-header, .dream-chapter-nav)::after`,
  );
  assert.match(pseudo, /display:\s*none\s*!important;/);
  assert.match(pseudo, /content:\s*none\s*!important;/);
  assert.match(pseudo, /animation:\s*none\s*!important;/);
});

test("compact mode removes both the installed paint strip and its negative-overflow pseudo", () => {
  const cover = bodyFor(
    `${scrollScope} .viewport-chrome-cover, ${scrollScope} .viewport-chrome-cover::before`,
  );
  assert.match(cover, /display:\s*none\s*!important;/);
  assert.match(cover, /content:\s*none\s*!important;/);
});

test("the same launcher becomes a reachable opaque target below the shared menu layers", () => {
  const launcher = bodyFor(`${compactScope} ${headers} .side-panel-trigger`);
  assert.match(launcher, /position:\s*fixed;/);
  assert.match(launcher, /visibility:\s*visible\s*!important;/);
  assert.match(launcher, /pointer-events:\s*auto\s*!important;/);
  for (const dimension of ["width", "height", "min-width"]) {
    const value = launcher.match(new RegExp(`(?:^|;)\\s*${dimension}:\\s*(\\d+)px;`));
    assert.ok(value && Number(value[1]) >= 44, `${dimension} keeps a usable tap target`);
  }
  assert.match(
    launcher,
    /inset:\s*auto[^;]*env\(safe-area-inset-right\)[^;]*env\(safe-area-inset-bottom\)[^;]*auto;/,
  );
  assert.match(launcher, /background:\s*var\(--viewport-chrome-color\)\s*!important;/);
  assert.match(launcher, /clip-path:\s*none\s*!important;/);
  assert.match(launcher, /-webkit-backdrop-filter:\s*none\s*!important;/);
  assert.match(launcher, /(?:^|;)\s*backdrop-filter:\s*none\s*!important;/);
  const z = Number(launcher.match(/z-index:\s*(\d+);/)[1]);
  assert.ok(z < 60, "the launcher must not outrank the shared menu scrim");
  assert.match(
    bodyFor(`${compactScope} .side-panel-trigger:focus-visible`),
    /outline:\s*2px\s+solid/,
  );
});

test("only decorative children morph, leaving the launcher collision box stable from frame one", () => {
  const launcher = bodyFor(`${compactScope} ${headers} .side-panel-trigger`);
  assert.doesNotMatch(
    launcher,
    /(?:^|;)\s*(?:animation(?:-[\w-]+)?|transition(?:-[\w-]+)?|transform|translate|scale|rotate|filter|perspective|will-change)\s*:/,
  );
  const motion = css.match(/@media \(prefers-reduced-motion: no-preference\) \{([\s\S]*?)\n\}/)?.[1];
  assert.ok(motion);
  assert.match(motion, /\.side-panel-trigger-ring\s*\{\s*animation: ipad-menu-ribbon-fold 520ms/);
  assert.match(motion, /\.side-panel-trigger-glyph\s*\{\s*animation: ipad-menu-glyph-unfold 420ms/);
  assert.doesNotMatch(motion, /infinite|\.side-panel-trigger\s*\{/);
  assert.match(css, /@keyframes ipad-menu-ribbon-fold\s*\{[\s\S]*?border-radius: 4px;[\s\S]*?border-radius: 50%;/);
  assert.match(css, /@keyframes ipad-menu-glyph-unfold\s*\{[\s\S]*?transform: rotate\(75deg\) scale\(0.35, 0.8\);/);
  const sharedHeader = rules.find(
    (rule) =>
      rule.selector === `html:root[data-viewport-chrome] ${headers}` &&
      /backdrop-filter:/.test(rule.body),
  )?.body;
  assert.ok(sharedHeader);
  assert.match(sharedHeader, /-webkit-backdrop-filter:\s*none\s*!important;/);
  assert.match(sharedHeader, /(?:^|;)\s*backdrop-filter:\s*none\s*!important;/);
});

test("reduced motion disables the fold, glyph arrival and their inherited transitions", () => {
  const reduced = css.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/)?.[1];
  assert.ok(reduced);
  assert.match(reduced, /:is\(\.side-panel-trigger, \.side-panel-trigger-ring, \.side-panel-trigger-glyph\)/);
  assert.match(reduced, /\.side-panel-trigger-glyph i/);
  assert.match(reduced, /animation:\s*none\s*!important;/);
  assert.match(reduced, /transition:\s*none\s*!important;/);
});

test("each affected route keeps its one existing menu opener and controlled menu layer", () => {
  for (const [path, headerClass] of [
    ["src/components/gallery/gallery-page.tsx", "gallery-topbar"],
    ["src/components/gallery-tours/tours-page.tsx", "gallery-topbar"],
    ["src/components/world/world-home.tsx", "topbar"],
    ["src/components/dream-chapter/dream-chapter.tsx", "dream-site-header"],
  ]) {
    const component = source(path);
    const header = component.match(
      new RegExp(`<header className="${headerClass}">([\\s\\S]*?)</header>`),
    );
    assert.ok(header, `${path}: existing header remains`);
    assert.equal((header[1].match(/<SideMenuTrigger\b/g) ?? []).length, 1);
    assert.match(header[1], /<SideMenuTrigger open=\{[^}]+\} onOpenChange=\{[^}]+\}/);
    assert.match(component, /<SideMenuLayer\b[^>]*open=\{[^}]+\}[^>]*onOpenChange=\{[^}]+\}/);
  }
});

test("installed-iPad paint guard has positive in-viewport area below the interactive header", () => {
  const guard = bodyFor(
    'html:root[data-ipad-standalone-viewport="contained"] .viewport-chrome-cover',
  );
  assert.match(guard, /height:\s*max\(12px,\s*env\(safe-area-inset-top,\s*0px\)\);/);
  assert.match(guard, /z-index:\s*39;/);
  assert.match(bodyFor(".viewport-chrome-cover"), /top:\s*0;/);
  assert.match(bodyFor(".viewport-chrome-cover"), /pointer-events:\s*none;/);
  assert.doesNotMatch(guard, /(?:^|;)\s*(?:padding|margin|transform|overflow)\s*:/);
});

test("Zeus reconciles compact launcher changes immediately without changing the saved position", () => {
  const zeus = source("src/components/zeus-button.tsx");
  const marker = zeus.indexOf("const readCompactMenuFootprint = () =>");
  assert.ok(marker > 0);
  const start = zeus.lastIndexOf("const root = document.documentElement;", marker);
  const end = zeus.indexOf("const compactMenuObserver =", marker);
  assert.ok(start >= 0 && end > marker);
  const logic = zeus.slice(start, end);
  assert.doesNotMatch(
    logic,
    /requestAnimationFrame|setTimeout|schedulePlacement|onPositionChange|localStorage/,
  );
  const attributes = new Map();
  const calls = [];
  const position = { x: 0.95, y: 0.82 };
  const context = {
    document: { documentElement: { getAttribute: (key) => attributes.get(key) ?? null } },
    activePointer: { current: null },
    preferredPosition: { current: position },
    glideNext: { current: true },
    cancelPlacement: () => calls.push("cancel"),
    placeButton: (next) => {
      assert.equal(
        context.glideNext.current,
        false,
        "collision recovery must not glide through the launcher",
      );
      assert.equal(next, position, "retain the reader's existing preferred position");
      calls.push("place");
    },
  };
  vm.runInNewContext(`${logic}\nglobalThis.reconcile = reconcileCompactMenu;`, context);
  context.reconcile();
  attributes.set("data-viewport-chrome", "world");
  context.reconcile();
  assert.deepEqual(calls, [], "non-compact route changes do not trigger collision scans");
  attributes.set("data-ipad-menu", "compact");
  context.reconcile();
  assert.deepEqual(calls, [], "the full header has not moved yet");
  attributes.set("data-ipad-menu-scrolled", "true");
  context.reconcile();
  assert.deepEqual(calls, ["cancel", "place"]);
  context.reconcile();
  assert.equal(calls.length, 2, "unchanged footprint does not repeat the geometry scan");
  attributes.set("data-viewport-chrome", "dream");
  context.reconcile();
  assert.equal(calls.length, 4, "a compact launcher on the next route is rechecked");
  attributes.delete("data-ipad-menu");
  context.reconcile();
  assert.equal(calls.length, 6, "turning the setting off works without a scroll event");
  context.activePointer.current = 1;
  attributes.set("data-ipad-menu", "compact");
  context.reconcile();
  assert.equal(calls.length, 6, "an active pointer keeps ownership of its position");
  assert.equal(context.preferredPosition.current, position);
  assert.match(
    zeus,
    /compactMenuObserver\.observe\(root,\s*\{\s*attributes: true,\s*attributeFilter: \["data-ipad-menu", "data-ipad-menu-scrolled", "data-viewport-chrome"\]/,
  );
  assert.match(zeus, /return \(\) => \{\s*compactMenuObserver\.disconnect\(\);/);
});
