import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
const css = read("src/styles-liquid-glass.css");
const root = read("src/routes/__root.tsx");
const defs = read("src/components/liquid-glass-defs.tsx");
const libSource = read("src/lib/liquid-glass.ts");

async function loadLib() {
  const code = ts.transpileModule(libSource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
}

/** Splits a selector list at its top-level commas. */
function splitList(list) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < list.length; i += 1) {
    if (list[i] === "(") depth += 1;
    else if (list[i] === ")") depth -= 1;
    else if (list[i] === "," && depth === 0) {
      parts.push(list.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(list.slice(start));
  return parts.map((part) =>
    part.replace(/\s+/g, " ").replace(/\( /g, "(").replace(/ \)/g, ")").trim(),
  );
}

/** Top-level rules (selector text before each block), with @media/@supports unwrapped. */
function selectors(source) {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "{") {
      const prelude = text.slice(start, i).trim();
      if (!prelude.startsWith("@")) out.push(prelude);
      depth += 1;
      start = i + 1;
    } else if (ch === "}") {
      depth -= 1;
      start = i + 1;
    } else if (ch === ";" && depth > 0) start = i + 1;
  }
  return out;
}

test('every rule waits for the option: html[data-button-style="liquid"]', () => {
  // Keyframes are inert definitions (only scoped rules name them); their
  // steps are not selectors. Only the glass's own (lg-) keyframes exist.
  for (const [, name] of css.matchAll(/@keyframes\s+([\w-]+)/g)) assert.match(name, /^lg-/);
  const rules = selectors(css.replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, ""));
  assert.ok(rules.length > 20);
  for (const rule of rules)
    for (const part of splitList(rule))
      assert.match(
        part,
        /^html\[data-button-style="liquid"\]/,
        `unscoped selector: ${part.slice(0, 80)}`,
      );
  // No bare custom properties leak out with the option off.
  assert.doesNotMatch(css, /:root\s*\{/);
});

test("the sheet's target list and the pointer light's list are the same", async () => {
  const lib = await loadLib();
  const block = css.match(/\/\* lg:targets \*\/([\s\S]*?)\/\* \/lg:targets \*\//)[1];
  const fromCss = block
    .split(/,\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  assert.deepEqual(fromCss, [...lib.LIQUID_GLASS_TARGETS]);
  for (const control of [
    ".side-panel-trigger",
    ".manager-back",
    ".cine-btn",
    ".cine-skip",
    ".rw-skip",
    ".ios-slide-open",
    ".form-pickup-close",
    ".rw-close",
    ".command-deck-enter",
    ".zeus-button",
    ".rxs-local-nav nav a",
    ".opening-notice .opening-notice-close",
  ])
    assert.ok(
      fromCss.some((s) => s.startsWith(control)),
      `${control} wears the glass`,
    );
});

test("the lens is Chromium-only and never in economy; blur and specular are the fallback", () => {
  const lensRules = selectors(css).filter((rule) =>
    /url\(#dw-liquid-lens/.test(css.slice(css.indexOf(rule))),
  );
  assert.ok(lensRules.length);
  for (const match of css.matchAll(
    /([^{}]+)\{[^{}]*url\(#dw-liquid-lens-(capsule|round)\)[^{}]*\}/g,
  )) {
    const selector = match[1].replace(/\/\*[\s\S]*?\*\//g, "");
    // A keyframe (materialize's lens stages) only runs on the lens rules.
    if (/^\s*(\d+%|from|to)\s*$/.test(selector)) continue;
    assert.match(selector, /\[data-liquid-lens\]/);
    assert.match(selector, /:not\(\[data-world-effects="economy"\]\)/);
  }
  // The base material blurs without any url().
  const base = css.match(
    /:not\(#lg-glass\):not\(#lg-glass\):not\(#lg-glass\) \{\n {2}border-color[\s\S]*?\n\}/,
  )[0];
  // (the blur rises from nothing as the glass materializes: --lg-mat)
  assert.match(base, /-webkit-backdrop-filter: blur\(calc\(var\(--lg-blur\) \* var\(--lg-mat\)\)\) saturate/);
  assert.match(base, /backdrop-filter: blur\(calc\(var\(--lg-blur\) \* var\(--lg-mat\)\)\) saturate/);
  assert.doesNotMatch(base, /url\(/);
  // The lens attribute: only where userAgentData (Chromium) and CSS.supports agree,
  // and not under reduced transparency.
  assert.match(libSource, /userAgentData/);
  assert.match(defs, /prefers-reduced-transparency: reduce/);
  assert.match(defs, /lensSupported\(window\) && !clearer/);
  assert.match(defs, /id="dw-liquid-lens-capsule"/);
  assert.match(defs, /id="dw-liquid-lens-round"/);
});

test("motion, economy, forced colours and touch budgets", () => {
  // The press: only under no-preference, through the shared press driver. It
  // swells (interactive Liquid Glass scales up and bounces), never squashes.
  const motion = css.match(/@media \(prefers-reduced-motion: no-preference\) \{\n {2}html\[data-button-style="liquid"\]\n {4}body\n {4}:is\([\s\S]*?\n\}\n/)[0];
  assert.match(motion, /--dw-press-scale: 1\.06;/);
  for (const [, value] of css.matchAll(/--dw-press-scale: ([^;]+);/g)) {
    const parts = value.trim().split(/\s+/).map(Number);
    assert.equal(parts.length, 1, `uniform swell: ${value}`);
    assert.ok(parts[0] > 1 && parts[0] <= 1.12, `a little larger: ${value}`);
  }
  assert.match(motion, /var\(--lg-spring\)/);
  assert.equal(css.match(/--dw-press-scale:/g).length, motion.match(/--dw-press-scale:/g).length);
  // Ciel's button and the slide-to-open pills are never squashed (their drags measure the box).
  for (const rule of motion.split("}")) {
    if (!/--dw-press-scale|scale: var/.test(rule)) continue;
    assert.doesNotMatch(rule, /zeus-button|ios-slide-open/);
  }
  // Economy: specular only, no spring.
  assert.match(
    css,
    /\[data-world-effects="economy"\][\s\S]*?\[data-press="out"\][\s\S]*?var\(--dw-ease-out\)/,
  );
  // Forced colours: nothing sampled or drawn.
  const forced = css.match(/@media \(forced-colors: active\) \{[\s\S]*?\n\}\n/)[0];
  assert.match(forced, /backdrop-filter: none !important/);
  assert.match(forced, /box-shadow: none !important/);
  // Touch: a smaller blur.
  assert.match(
    css,
    /@media \(pointer: coarse\) \{\n {2}html\[data-button-style="liquid"\] \{\n {4}--lg-blur: 6px;/,
  );
  // The iPad compact launcher and the phone-landscape trigger keep their own shells.
  const flat = css.replace(/\s+/g, " ").replace(/\( /g, "(").replace(/ \)/g, ")");
  const all = flat.split(".side-panel-trigger").length - 1;
  // The compact launchers wear the glass in their bar, never while they
  // fly into the menu or stand in for the scrolled-away bar (those shells
  // are styles-liquid-glass-surfaces.css's lgs:compact), and never scale.
  const inBar =
    flat.split(
      '.side-panel-trigger:not(:is([data-ipad-menu="compact"]:is([data-ipad-menu-scrolled="true"], [data-ipad-menu-motion]), [data-phone-landscape-menu="true"]:is([data-phone-landscape-hidden="true"], [data-phone-landscape-motion])) *)',
    ).length - 1;
  const neverScaled =
    flat.split(
      '.side-panel-trigger:not(:is([data-ipad-menu="compact"], [data-phone-landscape-menu="true"]) *)',
    ).length - 1;
  assert.ok(all >= 6);
  assert.equal(neverScaled, 1);
  assert.match(flat, /\.side-panel-trigger:not\(:is\(\[data-ipad-menu="compact"\], \[data-phone-landscape-menu="true"\]\) \*\),[^{]*\{ --dw-press-scale: 1\.1;/);
  assert.equal(inBar + neverScaled, all);
});

test("the root links the sheet last and mounts the defs, which run nothing while off", () => {
  assert.match(
    root,
    /\[\{ rel: "stylesheet", href: futureSpectrumCss \}\]\),\s*(?:\/\/[^\n]*\n\s*)*\{ rel: "stylesheet", href: liquidGlassCss \},/,
  );
  assert.match(root, /<LiquidGlassDefs \/>/);
  // The filters are static markup from the server on (the head script
  // marks the lens before the first paint); every watcher waits for the option.
  assert.doesNotMatch(defs, /if \(!on\) return null;/);
  assert.match(defs, /if \(!on\) return;\s*const root = document\.documentElement;/);
  assert.match(defs, /attributeFilter: \[BUTTON_STYLE_ATTRIBUTE\]/);
});

test("the pointer light is for a fine pointer only", async () => {
  assert.match(libSource, /\(hover: hover\) and \(pointer: fine\)/);
  assert.match(libSource, /event\.pointerType !== "mouse"/);
  const lib = await loadLib();
  assert.equal(lib.BUTTON_STYLE_ATTRIBUTE, "data-button-style");
  assert.equal(lib.LIQUID_BUTTON_STYLE, "liquid");
  for (const map of [lib.LENS_MAP_CAPSULE, lib.LENS_MAP_ROUND]) {
    assert.match(map, /^data:image\/svg\+xml,/);
    assert.match(decodeURIComponent(map), /fill="#808000"/);
  }
});
