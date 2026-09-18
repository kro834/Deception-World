import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/styles-ios27-enhancements.css", import.meta.url), "utf8");

test("iOS 27 motion is strictly feature and preference gated", () => {
  assert.match(css, /html\[data-ios27-enhanced="true"\]/);
  assert.match(css, /@supports \(animation-timeline: view\(block\)\)/);
  assert.match(css, /\(animation-range: entry 0% entry 100%\)/);
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\), \(forced-colors: active\)/);
});

test("Rexonance uses a named hero timeline before its transform-only consumer", () => {
  const owner = css.indexOf("view-timeline-name: --rxs-ios27-hero");
  const consumer = css.indexOf("animation-timeline: --rxs-ios27-hero");
  assert.ok(owner >= 0 && consumer > owner);
  assert.match(css, /animation-range: exit 0% exit 100%/);
  assert.match(
    css,
    /@keyframes rxs-ios27-hero-depth[\s\S]*?translate3d\(0, 20px, 0\) scale\(1\.015\)/,
  );
});

test("native entry motion is limited to non-interactive Rexonance headings", () => {
  assert.match(css, /\.rxs-section-heading\.rxs-reveal/);
  assert.doesNotMatch(
    css,
    /\.rxs-(?:comparison|p14-comparator|stage-switcher|stage-tabs|stage-panel|headline-metrics)/,
  );
  assert.match(css, /opacity: 0\.82/);
  assert.match(css, /translate3d\(0, 10px, 0\)/);
  assert.match(css, /transition: none/);
});

test("enhancements stay on compositor-safe finite properties", () => {
  assert.doesNotMatch(
    css,
    /\binfinite\b|backdrop-filter|\bfilter\s*:|animation-timeline:\s*scroll/,
  );
  assert.doesNotMatch(
    css,
    /@keyframes[\s\S]*?\b(?:width|height|top|right|bottom|left|margin|padding)\s*:/,
  );
  assert.doesNotMatch(css, /pointer-events\s*:/);
});
