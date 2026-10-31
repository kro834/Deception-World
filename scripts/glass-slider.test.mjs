// The slide-to-open control's liquid-glass lens (owner, 2026-10-31:
// 「横選択スライダーを長押ししたらリキッドグラスの様に拡大して、スライダーの形も
// リキッドグラス形にして」). Pins its scope (the glass option only), the rule that
// the measured boxes are never scaled, and its fallbacks.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const control = read("src/components/world/slide-open-control.tsx");
const glass = read("src/styles-liquid-glass.css");
const addon = read("src/styles-world-addon.css");

const lensSection = glass.slice(glass.indexOf("The slider's lens"));

/** Every rule (selector + body) in a sheet, comments stripped, @media flattened. */
function rules(css) {
  const out = [];
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = re.exec(clean))) out.push({ selector: match[1].trim(), body: match[2] });
  return out;
}

test("the lens layer is decorative and sits before the thumb (the thumb stays last)", () => {
  const lens = control.indexOf('className="ios-slide-open-lens"');
  const thumb = control.indexOf('className="ios-slide-open-thumb"');
  assert.ok(lens > 0 && thumb > lens, "the lens precedes the thumb");
  assert.match(control.slice(lens - 10, lens + 80), /aria-hidden="true"/);
  assert.match(control, /data-lens="off"/);
});

test("the lens is hidden unless the glass option draws it", () => {
  assert.match(addon, /\.ios-slide-open-lens \{\s*display: none;\s*\}/);
  for (const { selector } of rules(lensSection)) {
    if (!/ios-slide-open|rxs-p14/.test(selector)) continue;
    assert.match(selector, /html\[data-button-style="liquid"\]/, selector);
  }
});

test("neither the button nor the thumb is ever scaled: the swell lives on the lens body", () => {
  for (const { selector, body } of rules(glass)) {
    if (
      !/\bscale\s*:/.test(body) ||
      /scale:\s*1(\s*!important)?;/.test(body.match(/\bscale\s*:[^;]*;/)?.[0] ?? "")
    )
      continue;
    const last = selector.split(",").map((part) => part.trim());
    for (const part of last) {
      assert.doesNotMatch(
        part,
        /\.ios-slide-open(:[^\s]*)?(\[[^\]]*\])*(:not\([^)]*\))*$|\.ios-slide-open-thumb(:not\([^)]*\))*$/,
        `scale on a measured box: ${part}`,
      );
    }
  }
  assert.match(
    lensSection,
    /\[data-lens="on"\]\s*\.ios-slide-open-lens-body[^{]*\{[^}]*scale: 1\.34/,
  );
  // The drag still measures the thumb itself.
  assert.match(control, /const thumbRect = thumb\.getBoundingClientRect\(\);/);
});

test("the swell waits for a hold, or starts as soon as the thumb travels", () => {
  const ms = Number(control.match(/const LENS_SWELL_MS = (\d+);/)?.[1]);
  assert.ok(ms >= 180 && ms <= 250, `hold ${ms}ms`);
  assert.match(control, /next > LENS_SWELL_TRAVEL/);
  // Lens geometry is written once per press, from the press's measurements.
  const start = control.indexOf("const startDrag");
  const drag = control.indexOf("const drag =");
  assert.ok(control.slice(start, drag).includes('"--slide-lens-x"'));
  const move = control.slice(
    control.indexOf("const moveToPointer"),
    control.indexOf("const complete"),
  );
  assert.doesNotMatch(move, /getBoundingClientRect|clientWidth|getComputedStyle/);
});

test("fallbacks: reduced motion, economy and forced colours", () => {
  assert.match(
    lensSection,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.ios-slide-open-lens-body[\s\S]*?scale: 1 !important;\s*transition: none !important;/,
  );
  assert.match(
    lensSection,
    /\[data-world-effects="economy"\][^{]*\.ios-slide-open-lens-body[^{]*\{[^}]*backdrop-filter: none;/,
  );
  assert.match(
    lensSection,
    /@media \(forced-colors: active\)[\s\S]*?\.ios-slide-open-lens:not[^{]*\{\s*display: none !important;/,
  );
  // Only Chromium (html[data-liquid-lens]) gets the SVG displacement.
  for (const { selector, body } of rules(lensSection)) {
    if (/url\(#dw-liquid-lens/.test(body))
      assert.match(selector, /\[data-liquid-lens\]:not\(\[data-world-effects="economy"\]\)/);
  }
});

test("keyboard activation still completes without the lens", () => {
  assert.match(control, /complete\("keyboard"\)/);
  const complete = control.slice(
    control.indexOf("const complete"),
    control.indexOf("const startDrag"),
  );
  assert.doesNotMatch(complete, /setLens\("on"\)/);
});
