import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getViewportChrome,
  getViewportChromeColor,
  VIEWPORT_CHROME_COLORS,
} from "../src/lib/viewport-chrome.js";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const css = source("src/styles-viewport-chrome.css");

test("all three entrances and tours share a route-resolved opaque canvas", () => {
  for (const [path, tone] of [
    ["/world", "world"],
    ["/dream-chapter", "dream"],
    ["/gallery", "gallery"],
    ["/gallery-tours", "gallery"],
  ]) {
    assert.equal(getViewportChrome(path), tone);
    assert.equal(getViewportChrome(`${path}/`), tone);
    assert.equal(getViewportChromeColor(path), VIEWPORT_CHROME_COLORS[tone]);
    assert.ok(css.includes(`[data-viewport-chrome="${tone}"]`));
    assert.ok(css.includes(`--viewport-chrome-color: ${VIEWPORT_CHROME_COLORS[tone]};`));
  }
  for (const path of ["/", "/library", "/riders/saga", "/dream-chapter/unknown"]) {
    assert.equal(getViewportChrome(path), undefined);
    assert.equal(getViewportChromeColor(path), "#000000");
  }
});

test("first paint and route navigation use one root cover, without client effects or portals", () => {
  const root = source("src/routes/__root.tsx");
  assert.match(root, /getViewportChromeColor\(matches\.at\(-1\)\?\.routeId/);
  assert.match(root, /href: viewportChromeCss/);
  assert.match(root, /data-viewport-chrome=\{chrome\}/);
  assert.match(root, /useRouterState\(\{ select: \(state\) => state\.location\.pathname \}\)/);
  assert.match(
    root,
    /<body[^>]*>\s*<SkipLink \/>\s*<ContentProtection \/>\s*\{chrome && <div className="viewport-chrome-cover" aria-hidden="true" \/>\}/,
  );
  for (const path of [
    "src/components/gallery/gallery-page.tsx",
    "src/components/gallery-tours/tours-page.tsx",
  ]) {
    assert.doesNotMatch(source(path), /gallery-statusbar-cover|createPortal/);
  }
});

test("canvas, scroll states and device fallbacks cannot make the viewport edge translucent", () => {
  assert.match(
    css,
    /html:root\[data-viewport-chrome\] body\s*\{[^}]*background: var\(--viewport-chrome-color\) !important;/,
  );
  const chrome = css.match(
    /html:root\[data-viewport-chrome\] :is\(\.gallery-topbar, \.topbar, \.dream-site-header\)\s*\{([^}]+)\}/,
  )[1];
  assert.match(
    chrome,
    /background-color: var\(--world-atmosphere-base, var\(--viewport-chrome-color\)\) !important;/,
  );
  assert.match(chrome, /-webkit-backdrop-filter: none !important;/);
  assert.match(chrome, /\n\s*backdrop-filter: none !important;/);
  assert.match(
    css,
    /\.viewport-chrome-cover\s*\{[^}]*position: fixed;[^}]*z-index: 59;[^}]*top: 0;/,
  );
  assert.match(css, /height: max\(1px, env\(safe-area-inset-top, 0px\)\)/);
  assert.match(css, /\.viewport-chrome-cover::before\s*\{[^}]*inset: -96px 0 100%;/);
  assert.match(
    css,
    /\[data-ipad-viewport="contained"\]\[data-viewport-chrome\] body\s*\{[^}]*overscroll-behavior-y: none;/,
  );
  // No nested scroller, synthetic status-bar height or per-scroll JS. These
  // would break anchors, restored positions, zoom or short landscape headers.
  assert.doesNotMatch(css, /overflow:\s*(auto|hidden)|touch-action:\s*none|height:\s*100/);
  assert.match(css, /@media \(forced-colors: active\)/);
});
