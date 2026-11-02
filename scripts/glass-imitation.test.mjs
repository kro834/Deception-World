// The liquid glass as an imitation of the platform material (owner,
// 2026-11-02: 「リキッドグラスの外観を徹底検索し、完全に模倣する様に」).
// Pins what the research found and the sheet now does: the press swells and
// lights from the finger, the backdrop estimate (light/dark flip, busy), the
// switch and slider thumbs (white at rest, a clear lens when touched), the
// rail's droplet stretch, the hold's flex, materialize, and the accessibility
// fallbacks (Reduce Transparency frostier, Increase Contrast black/white with
// a border, Reduce Motion with no elastic motion).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const glass = read("src/styles-liquid-glass.css");
const controls = read("src/styles-liquid-glass-controls.css");
const toneSource = read("src/lib/liquid-glass-tone.ts");
const pointerSource = read("src/lib/liquid-glass.ts");
const holdSource = read("src/lib/liquid-glass-hold.ts");
const defs = read("src/components/liquid-glass-defs.tsx");
const boot = read("src/lib/liquid/boot.js");
const clean = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

async function loadTone() {
  const code = ts
    .transpileModule(toneSource, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    })
    .outputText.replace(/^import .*liquid-glass.*$/m, "const LIQUID_GLASS_TARGETS = [];");
  return import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
}

/** Every rule (selector + body), comments stripped, at-rules flattened. */
function rules(css) {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = re.exec(clean(css)))) out.push({ selector: match[1].trim(), body: match[2] });
  return out;
}

test("the backdrop estimate: luminance, hysteresis and parsing", async () => {
  const lib = await loadTone();
  assert.ok(Math.abs(lib.luminance(255, 255, 255) - 1) < 1e-9);
  assert.equal(lib.luminance(0, 0, 0), 0);
  // Near the threshold the tone holds (no flicker as the backdrop shifts).
  assert.equal(lib.toneFor(0.5, "dark"), "dark");
  assert.equal(lib.toneFor(0.5, "light"), "light");
  assert.equal(lib.toneFor(0.7, "dark"), "light");
  assert.equal(lib.toneFor(0.3, "light"), "dark");
  assert.deepEqual(lib.parseRgb("rgba(10, 20, 30, 0.5)"), { r: 10, g: 20, b: 30, a: 0.5 });
  assert.deepEqual(lib.parseRgb("rgb(10 20 30 / 40%)"), { r: 10, g: 20, b: 30, a: 0.4 });
  assert.equal(lib.parseRgb("transparent"), null);
});

test("the backdrop estimate is cheap: once per control, again only when a pinned bar's page rests", () => {
  // Started with the option, undone with it.
  assert.match(defs, /const stopTone = watchLiquidTone\(document\);/);
  assert.match(defs, /stopTone\(\);/);
  // Measured on first sight and resize (ResizeObserver), a few per frame.
  assert.match(toneSource, /new view\.ResizeObserver/);
  assert.match(toneSource, /const PER_FRAME = 6;/);
  // The scroll listener only arms a timer: nothing is read while it moves.
  const scrolled = toneSource.slice(toneSource.indexOf("const scrolled = "), toneSource.indexOf("const loaded = "));
  assert.doesNotMatch(scrolled, /getBoundingClientRect|getComputedStyle|elementsFromPoint/);
  assert.match(scrolled, /setTimeout\(rest, SCROLL_REST_MS\)/);
  // Only the pinned (fixed or sticky) controls look again after a scroll.
  assert.match(toneSource, /if \(entry\.pinned\) enqueue\(el\);/);
  // Every attribute it wrote is removed when the option goes off.
  assert.match(toneSource, /el\.removeAttribute\(TONE_ATTRIBUTE\);\s*el\.removeAttribute\(BUSY_ATTRIBUTE\);/);
  assert.match(toneSource, /for \(const el of \[\.\.\.tracked\.keys\(\)\]\) detach\(el\);/);
});

test("the sheet adapts: busy deepens the veil and shadow, a light backdrop flips the glass", () => {
  const busy = rules(glass).find(({ selector }) => /\[data-lg-busy\]/.test(selector));
  assert.ok(busy, "busy rule");
  assert.match(busy.selector, /^html\[data-button-style="liquid"\]/);
  assert.match(busy.body, /--lg-fill-alpha: 0\.56;/);
  assert.match(busy.body, /--lg-shadow-a: 0\.52;/);
  const light = rules(glass).find(({ selector }) => /^html[^{]*\[data-lg-tone="light"\]:not\(\.zeus-button\)/.test(selector));
  assert.ok(light, "light rule");
  assert.match(light.body, /--lg-fill: rgb\(250 251 253 \/ 0\.58\);/);
  assert.match(light.body, /color: rgb\(18 22 28\) !important;/);
  assert.match(light.body, /--lg-shadow-a: 0\.18;/);
  // The material reads the shadow strength and the regular veil.
  assert.match(glass, /0 6px 18px -6px rgb\(0 0 0 \/ var\(--lg-shadow-a\)\) !important;/);
  assert.match(glass, /--lg-fill-alpha: 0\.3;/);
  assert.match(glass, /@property --lg-shadow-a \{\s*syntax: "<number>";\s*inherits: false;/);
});

test("the press swells and lights from the finger, and the light spreads", () => {
  // The registered spread eases from a pool at the finger to the whole glass.
  assert.match(glass, /@property --lg-spread \{\s*syntax: "<number>";\s*inherits: false;\s*initial-value: 0;/);
  assert.match(glass, /radial-gradient\(\s*calc\(36% \+ 150% \* var\(--lg-spread\)\) calc\(52% \+ 190% \* var\(--lg-spread\)\) at var\(--lg-px\)/);
  const pressed = rules(glass).find(({ selector, body }) => /\[data-press="touch"\]/.test(selector) && /--lg-spread: 1;/.test(body));
  assert.ok(pressed, "pressed rule");
  assert.match(pressed.body, /--lg-glow: 0\.07;/);
  // The spread takes its own, slower curve while the press is in.
  assert.match(glass, /var\(--dw-dur-press\), 0\.42s;/);
  assert.match(glass, /--lg-tint-a, --lg-spread;/);
  // A touch sets the light's place once, at pointerdown, from one box read.
  const down = pointerSource.slice(pointerSource.indexOf("const down = (event: PointerEvent)"), pointerSource.indexOf("const up = () =>"));
  assert.equal((down.match(/getBoundingClientRect/g) ?? []).length, 1);
  assert.match(down, /setProperty\("--lg-px"/);
  assert.match(pointerSource, /untouch = view\.setTimeout\(clearTouch, 900\)/);
  // The touched light gathers at the edge (the label keeps its contrast).
  assert.match(glass, /inset 0 0 14px -3px rgb\(255 255 255 \/ calc\(max\(0, var\(--lg-rim\) - 0\.7\) \* 0\.9\)\)/);
});

test("the hold flexes toward the finger on the same spring", () => {
  assert.match(holdSource, /const PROPS = \["--lg-hold-s", "--lg-dx", "--lg-dy"\] as const;/);
  const follow = holdSource.slice(holdSource.indexOf("const follow = "), holdSource.indexOf("const startHold = "));
  assert.match(follow, /if \(p\.kind === "swell"\) \{\s*p\.target\.style\.setProperty\("--lg-dx", dx\);/);
  const flex = /scale: calc\(var\(--lg-hold-s, 1\) \* \(1 \+ 0\.07 \* max\(var\(--lg-dx, 0\), -1 \* var\(--lg-dx, 0\)\)\)\)/g;
  // The control and its light flex alike.
  assert.equal((controls.match(flex) ?? []).length, 2);
});

test("switch and slider thumbs: an opaque white capsule at rest, a clear lens when touched", () => {
  const c = clean(controls);
  // The switch's knob: wider than tall, white by --lg-knob, travel 30px (--lg-knob-x).
  const knob = c.match(/\.side-panel-zeus-toggle\s*> i\s*u:not\(#lg-glass\):not\(#lg-glass\):not\(#lg-glass\) \{([^}]*)\}/)[1];
  assert.match(knob, /width: 34px;\s*height: 22px;/);
  assert.match(knob, /--lg-knob: 1;/);
  assert.match(knob, /calc\(0\.06 \+ var\(--lg-knob\) \* 0\.9\)/);
  assert.match(c, /\.side-panel-zeus-toggle:is\(\[aria-pressed="true"\], \[aria-checked="true"\]\)\s*> i\s*u[^{]*\{\s*--lg-knob-x: 30px;/);
  assert.match(c, /\.side-panel-zeus-toggle:is\(:active, \[data-press="in"\], \[data-press="touch"\], \[data-lg-hold="on"\]\)\s*> i\s*u[^{]*\{\s*--lg-knob: 0;/);
  assert.match(c, /scale: 1\.42 1\.5;/);
  // Held, the track stays put: the knob is the lens.
  assert.match(c, /\.side-panel-zeus-toggle\[data-lg-hold="on"\]\s*> i[^{]*\{\s*scale: 1;/);
  // The range thumbs: white at rest, the white drained while touched or held.
  assert.equal((c.match(/linear-gradient\(rgb\(255 255 255 \/ calc\(var\(--lg-knob\) \* 0\.95\)\)/g) ?? []).length, 2);
  assert.equal((c.match(/\[type="range"\]:is\(:active, \[data-lg-hold="on"\]\)/g) ?? []).length, 2);
  // The slide-to-open thumb: opaque, so it samples no backdrop.
  const thumb = clean(glass).match(/\.ios-slide-open\s*\.ios-slide-open-thumb:not\(#lg-glass\):not\(#lg-glass\):not\(#lg-glass\) \{([^}]*)\}/)[1];
  assert.match(thumb, /linear-gradient\(rgb\(255 255 255 \/ 0\.97\), rgb\(240 243 246 \/ 0\.97\)\) !important;/);
  assert.match(thumb, /backdrop-filter: none !important;/);
});

test("the rail's droplet stretches along a fast drag and rests as a neutral capsule", () => {
  assert.match(boot, /lens\.style\.setProperty\('--liquid-lens-vx', clamp\(vx \/ 1\.6, -1, 1\)\.toFixed\(2\)\);/);
  assert.match(boot, /stretch\(0, 0\);\s*reset\(\);/);
  const stretch = boot.slice(boot.indexOf("const stretch = "), boot.indexOf("const process = "));
  assert.doesNotMatch(stretch, /getBoundingClientRect|getComputedStyle/);
  // Rest: a light neutral capsule; held: the clear lens with its fringes.
  assert.match(controls, /rgb\(255 255 255 \/ 0\.1\) !important;/);
  assert.match(controls, /inset 1\.6px 1\.4px 0 0 rgb\(255 166 120 \/ 0\.36\)/);
});

test("materialize: the glass lenses in with its dialog, only under full motion", () => {
  assert.match(glass, /@property --lg-mat \{\s*syntax: "<number>";\s*inherits: false;\s*initial-value: 1;/);
  assert.match(glass, /@keyframes lg-materialize \{\s*0% \{\s*opacity: 0;\s*scale: 0\.78;\s*--lg-mat: 0;/);
  const media = glass.slice(glass.indexOf("@keyframes lg-materialize"));
  const block = media.slice(media.indexOf("@media (prefers-reduced-motion: no-preference)"));
  assert.match(block, /^@media \(prefers-reduced-motion: no-preference\) \{\s*html\[data-button-style="liquid"\]:not\(\[data-world-effects="economy"\]\)/);
  // Backwards only: once in, the press owns `scale`.
  assert.match(block, /animation: lg-materialize var\(--lg-spring-ms\) var\(--lg-spring\) 0\.08s backwards;/);
  // The blur and the lift rise with it.
  assert.match(glass, /blur\(calc\(var\(--lg-blur\) \* var\(--lg-mat\)\)\)/);
  assert.match(glass, /rgb\(255 255 255 \/ calc\(var\(--lg-sheen\) \* var\(--lg-mat\)\)\)/);
});

test("accessibility: frostier under reduced transparency, black and white with a border under increased contrast", () => {
  assert.match(glass, /@media \(prefers-reduced-transparency: reduce\) \{\s*html\[data-button-style="liquid"\] \{\s*--lg-blur: 14px;\s*--lg-fill-alpha: 0\.84;/);
  const more = glass.slice(glass.indexOf("@media (prefers-contrast: more)"));
  assert.ok(more.length > 100, "an increased-contrast block");
  assert.match(more, /--lg-fill: rgb\(0 0 0 \/ 0\.9\);/);
  assert.match(more, /--lg-rim-map: none;/);
  assert.match(more, /outline: 1\.5px solid rgb\(255 255 255 \/ 0\.92\);/);
  assert.match(more, /--lg-fill: rgb\(255 255 255 \/ 0\.94\);\s*color: rgb\(0 0 0\) !important;/);
  for (const { selector } of rules(more.slice(0, more.indexOf("\n}\n") + 3)))
    if (selector && !selector.startsWith("@")) assert.match(selector, /html\[data-button-style="liquid"\]/, selector);
});

test("art that hit testing skips still counts as busy, and a press never thins a veil", () => {
  // /world's poster is pointer-events: none under its buttons: the estimate
  // looks for a stack node's own media child over the point.
  assert.match(toneSource, /function mediaUnder\(node: Element, el: HTMLElement, x: number, y: number\)/);
  assert.match(toneSource, /pointerEvents === "none"\) return media;/);
  assert.match(toneSource, /const hit = mediaUnder\(node, el, x, y\) \?\? node;/);
  // The press deepens the veil from its rest (busy, Tinted), by an addend.
  assert.match(glass, /--lg-fill: rgb\(12 18 26 \/ calc\(var\(--lg-fill-alpha\) \+ var\(--lg-veil-add, 0\)\)\);/);
  assert.match(glass, /--lg-rim: 1;\s*--lg-veil-add: 0\.06;\s*\}/);
  assert.doesNotMatch(glass, /--lg-fill-alpha: 0\.36;/);
  // Tinted: busy deeper still, and the bar chips keep less lift under their words.
  assert.match(glass, /\[data-glass-variant="tinted"\]\s*body\s*\[data-lg-busy\][^{]*\{\s*--lg-fill-alpha: 0\.76;/);
  assert.match(
    glass,
    /\[data-glass-variant="tinted"\]\s*body\s*:is\(\.topbar nav a, \.rxs-local-nav nav a, \.command-deck-header-nav a\) \{\s*--lg-fill-alpha: 0\.74;\s*--lg-sheen: 0\.015;\s*--lg-tint-a: 0\.035;/,
  );
});
