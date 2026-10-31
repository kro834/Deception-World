// The liquid glass spread to the selection controls (owner, 2026-10-31:
// 「リキッドグラスを横スライダーなど様々なところに波及させて」): range sliders,
// segmented and tab groups, rails, switches and selects. Pins the scope (the
// glass option only, so the site is unchanged with it off), the rule that no
// measured box is scaled, the budgets and the fallbacks.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const css = read("src/styles-liquid-glass-controls.css");
const script = read("src/lib/liquid-glass-controls.ts");
const defs = read("src/components/liquid-glass-defs.tsx");
const root = read("src/routes/__root.tsx");

const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");

/** Every style rule (selector + body), @media and @supports flattened. */
function rules(source) {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = re.exec(source))) {
    const selector = match[1].trim().replace(/^@[^{]*$/, "");
    out.push({ selector, body: match[2] });
  }
  return out;
}

/** The text between an @-rule's opening brace and its matching close. */
function blocks(source, at) {
  const out = [];
  let index = source.indexOf(at);
  while (index !== -1) {
    let depth = 0;
    let start = source.indexOf("{", index);
    for (let i = start; i < source.length; i += 1) {
      if (source[i] === "{") depth += 1;
      else if (source[i] === "}" && --depth === 0) {
        out.push(source.slice(start + 1, i));
        break;
      }
    }
    index = source.indexOf(at, index + at.length);
  }
  return out;
}

const styleRules = rules(clean).filter(
  ({ selector }) => selector && !/^(from|to|\d+%)$/.test(selector),
);

test("every rule waits for the option: html[data-button-style=\"liquid\"]", () => {
  assert.ok(styleRules.length > 40);
  for (const { selector } of styleRules) {
    for (const part of selector.split(/,(?![^(]*\))/)) {
      assert.match(part.trim(), /^html\[data-button-style="liquid"\]/, part.trim());
    }
  }
});

test("the root links the sheet after the buttons' glass, and the defs start the script only while on", () => {
  assert.match(
    root,
    /\{ rel: "stylesheet", href: liquidGlassCss \},\s*(?:\/\/[^\n]*\n\s*)*\{ rel: "stylesheet", href: liquidGlassControlsCss \},/,
  );
  // The script starts inside the effect that runs only while `on`.
  const effect = defs.slice(defs.indexOf("if (!on) return;"));
  assert.match(effect, /watchLiquidControls\(document\)/);
  assert.match(effect, /stopControls\(\)/);
});

test("the script writes only data-lg-* attributes and --lg-* properties, and removes them all", () => {
  for (const [, name] of script.matchAll(/setAttribute\(\s*([A-Z_]+|"[^"]+")/g))
    assert.ok(/^[A-Z_]+$/.test(name) || /^"data-lg-/.test(name) || name === '"aria-hidden"', name);
  for (const [, prop] of script.matchAll(/setProperty\("([^"]+)"/g))
    assert.match(prop, /^--lg-(seg|rail)-/, prop);
  for (const constant of [
    "SEG",
    "SEG_MODE",
    "SEG_READY",
    "SEG_GEL",
    "SEG_STATIC",
    "RAIL_HOST",
    "RAIL_HOST_STATIC",
    "RAIL_START",
    "RAIL_END",
  ])
    assert.match(script, new RegExp(`\\b${constant}\\b[^\\n]*removeAttribute|removeAttribute\\(name\\)`));
  assert.match(script, /for \(const prop of SEG_PROPS\) el\.style\.removeProperty\(prop\)/);
  assert.match(script, /for \(const prop of RAIL_PROPS\) rail\.host\.style\.removeProperty\(prop\)/);
  // The pills live in pseudo-elements: no node is left in a React tree (the
  // origin probe is appended and removed in the same task).
  assert.match(script, /el\.appendChild\(probe\);(?:\s*const [a-zA-Z]+ = probe\.[a-zA-Z]+(?:\(\))?;)+\s*probe\.remove\(\);/);
});

test("no layout is read per frame: no scroll listener, the indicator rides a scroll timeline", () => {
  assert.doesNotMatch(script, /addEventListener\("scroll"/);
  assert.doesNotMatch(script, /scrollLeft\s*[^=]*=/);
  assert.match(script, /IntersectionObserver/);
  assert.match(clean, /scroll-timeline: --lg-rail x/);
  assert.match(clean, /@supports \(animation-timeline: scroll\(\)\)/);
  assert.match(clean, /animation-timeline: --lg-rail/);
});

test("only transform-class properties animate: translate, scale, transform and opacity", () => {
  for (const { body } of styleRules) {
    const transition = body.match(/transition:\s*([^;]+);/)?.[1];
    if (!transition || /none/.test(transition)) continue;
    for (const item of transition.split(/,(?![^(]*\))/)) {
      const prop = item.trim().split(/\s+/)[0];
      assert.ok(
        ["translate", "scale", "transform", "opacity", "visibility"].includes(prop),
        `animated: ${prop}`,
      );
    }
  }
  for (const frames of blocks(clean, "@keyframes")) {
    for (const [, prop] of frames.matchAll(/([a-z-]+)\s*:/g))
      assert.ok(["scale", "translate"].includes(prop), `keyframed: ${prop}`);
  }
});

test("nothing a drag or a scroll measures is scaled", () => {
  for (const { selector, body } of styleRules) {
    const scale = body.match(/(?:^|;|\s)scale\s*:\s*([^;]+);/)?.[1] ?? body.match(/transform:\s*scale\(([^;]+)\);/)?.[1];
    if (!scale || /^1(\s*!important)?$/.test(scale.trim())) continue;
    for (const part of selector.split(/,(?![^(]*\))/)) {
      const subject = part.trim();
      // Allowed: the pills' pseudo-elements, the native range thumbs (the
      // engine maps the value from layout), the switch's decorative knob
      // and the tab rails' surface (inside the positioned lens).
      assert.match(
        subject,
        /::(before|after)$|::-webkit-slider-thumb$|::-moz-range-thumb$|> i\s+u(:not\([^)]*\))*$|\.liquid-selection-surface(:not\([^)]*\))*$/,
        `scale on a measured box: ${subject}`,
      );
    }
  }
});

test("touch screens draw the pills without sampling; the lens is Chromium-only and never in economy", () => {
  const backdrop = styleRules.filter(({ body }) => /backdrop-filter:\s*(?!none\b)[a-z]/.test(body));
  for (const { selector, body } of backdrop) {
    if (/url\(#dw-liquid-lens/.test(body)) {
      assert.match(selector, /\[data-liquid-lens\]:not\(\[data-world-effects="economy"\]\)/, selector);
      continue;
    }
    assert.match(selector, /:not\(\[data-world-effects="economy"\]\)/, selector);
  }
  const fine = blocks(clean, "@media (hover: hover) and (pointer: fine)").join("\n");
  assert.match(fine, /backdrop-filter: blur\(4px\)/);
  // The rails' caps and indicator never sample.
  for (const { selector, body } of styleRules)
    if (/data-lg-rail-host/.test(selector)) assert.doesNotMatch(body, /backdrop-filter:\s*(?!none\b)[a-z]/, selector);
});

test("fallbacks: reduced motion, economy, reduced transparency, forced colours", () => {
  const reduced = blocks(clean, "@media (prefers-reduced-motion: reduce)").join("\n");
  assert.match(reduced, /animation: none !important;\s*scale: 1 !important;\s*transition: none !important;/);
  assert.match(reduced, /::-webkit-slider-thumb\s*\{\s*transform: none !important;/);
  assert.match(reduced, /> i\s+u:not[^{]*\{\s*scale: 1 !important;/);
  // The gel and the swells exist only under no-preference.
  const motion = blocks(clean, "@media (prefers-reduced-motion: no-preference)").join("\n");
  assert.match(motion, /animation: lg-seg-gel-a/);
  assert.match(motion, /transform: scale\(1\.5, 1\.42\)/);
  let outside = clean;
  for (const block of blocks(clean, "@media (prefers-reduced-motion: no-preference)"))
    outside = outside.replace(block, "");
  assert.doesNotMatch(outside, /animation: lg-seg-gel-/);

  const economy = styleRules.filter(({ selector }) => /\[data-world-effects="economy"\]/.test(selector) && !/:not\(\[data-world-effects/.test(selector));
  assert.ok(economy.some(({ body }) => /animation: none !important/.test(body) && /backdrop-filter: none/.test(body)));

  const transparency = blocks(clean, "@media (prefers-reduced-transparency: reduce)").join("\n");
  assert.match(transparency, /rgb\(14 24 36 \/ 0\.94\)/);
  assert.match(transparency, /background-color: rgb\(8 15 24 \/ 0\.94\) !important/);

  const forced = blocks(clean, "@media (forced-colors: active)").join("\n");
  assert.match(forced, /outline: 2px solid Highlight/);
  // The selected option: the system's button, ringed in Highlight (a
  // Highlight fill would put HighlightText on the white text backplate).
  assert.match(forced, /border-color: Highlight !important;\s*background: ButtonFace !important;\s*color: ButtonText !important;\s*outline: 2px solid Highlight;/);
  assert.match(forced, /ButtonFace/);
  assert.match(forced, /\[data-lg-rail-host\][^{]*::after\s*\{\s*display: none;/);
});

test("the controls it covers", () => {
  for (const group of [
    ".rzn-movie-speeds",
    ".side-panel-links fieldset",
    ".chapter-switch",
    ".ics-compare-pick",
    ".rxs-p14-range-labels",
    ".gallery-filters",
    ".wm-filters",
  ])
    assert.ok(script.includes(`"${group}"`), group);
  for (const bezel of [".episode-grid", ".dream-poster-thumbnails", ".gallery-stage-candidates", ".chapter-reel"])
    assert.ok(script.includes(`"${bezel}"`), bezel);
  assert.match(clean, /\.rzn-movie-seek > input, \.lab-seek input, \.dream-chapter-stage-slider input/);
  assert.match(clean, /\.side-panel-zeus-toggle:is\(\[aria-pressed="true"\], \[aria-checked="true"\]\)\s*> i\s*u/);
  assert.match(clean, /\.gallery-order select/);
  assert.match(clean, /\.liquid-swipe-tabs\s*> \.liquid-selection-lens\s*> \.liquid-selection-surface/);
});
