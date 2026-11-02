// The liquid glass's second research pass (owner, 2026-11-02:
// 「あらゆるリキッドグラスの情報を集めてさらに仕上げて」). Pins what it
// added: SwiftUI's documented springs as the sheet's curves, the room's
// light leaning with the pointer, the scroll and (only if already allowed)
// the tilt, the lens materializing in steps, the switch lens magnifying its
// track, the slide-to-open lens giving its stretch back on the spring, the
// Clear / Tinted variant and its early head script, and the lens-less
// engines' rim light.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import {
  BUTTON_STYLE_SCRIPT,
  GLASS_VARIANT_STORAGE_KEY,
  getGlassVariantServerSnapshot,
  normalizeGlassVariant,
} from "../src/lib/button-style.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const glass = read("src/styles-liquid-glass.css");
const controls = read("src/styles-liquid-glass-controls.css");
const clean = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

async function load(path) {
  const code = ts.transpileModule(read(path), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
}

test("springs: SwiftUI's presets, sampled into the sheet's linear() curves", async () => {
  const lib = await load("src/lib/liquid-glass-springs.ts");
  // Spring(duration: 0.5, bounce: 0.3): stiffness 157.9, damping 17.6 (Apple's Spring page).
  const k = ((2 * Math.PI) / 0.5) ** 2;
  const c = (4 * Math.PI * (1 - 0.3)) / 0.5;
  assert.ok(Math.abs(k - 157.9) < 0.05 && Math.abs(c - 17.6) < 0.05);
  assert.deepEqual(lib.SPRING_SMOOTH, { duration: 0.5, bounce: 0 });
  assert.deepEqual(lib.SPRING_SNAPPY, { duration: 0.5, bounce: 0.15 });
  assert.deepEqual(lib.SPRING_BOUNCY, { duration: 0.5, bounce: 0.3 });
  // Bouncy overshoots once, by e^(-πζ/√(1-ζ²)) with ζ = 0.7: 4.6%.
  let peak = 0;
  for (let t = 0; t < 1.5; t += 0.001) peak = Math.max(peak, lib.springPosition(lib.SPRING_BOUNCY, t));
  assert.ok(Math.abs(peak - 1.046) < 0.002, String(peak));
  // Smooth never overshoots.
  for (let t = 0; t < 1.5; t += 0.01) assert.ok(lib.springPosition(lib.SPRING_SMOOTH, t) <= 1 + 1e-9);
  const root = clean(glass).match(/html\[data-button-style="liquid"\] \{([^}]*)\}/)[1];
  for (const [name, spec] of [
    ["spring", lib.SPRING_BOUNCY],
    ["snappy", lib.SPRING_SNAPPY],
    ["smooth", lib.SPRING_SMOOTH],
  ]) {
    const { css, ms } = lib.springLinear(spec);
    assert.ok(root.includes(`--lg-${name}: ${css};`), `--lg-${name} matches the generator`);
    assert.ok(root.includes(`--lg-${name}-ms: ${ms}ms;`), `--lg-${name}-ms is ${ms}ms`);
  }
  // The selection glides on .snappy.
  assert.match(controls, /--lg-seg-ease: var\(--lg-snappy\);/);
});

test("the room's light: pointer, scroll and an already-granted tilt, throttled, never prompting", async () => {
  const src = read("src/lib/liquid-glass-light.ts");
  assert.doesNotMatch(src, /requestPermission/);
  assert.doesNotMatch(src, /getBoundingClientRect|getComputedStyle|scrollY|scrollTop|offset(Width|Height|Top|Left)/);
  assert.match(src, /prefers-reduced-motion: reduce/);
  assert.match(src, /data-world-effects/);
  assert.match(src, /root\.style\.removeProperty\("--lg-lx"\);/);
  const lib = await load("src/lib/liquid-glass-light.ts");
  assert.deepEqual(lib.lightFor({ x: 0, y: 0 }, 0, { x: 0, y: 0 }), { x: -0.55, y: -1 });
  // Leaning stays in range and never drops the light below the horizon.
  const far = lib.lightFor({ x: 1, y: 1 }, 1, { x: 1, y: 1 });
  assert.ok(far.x <= 1 && far.y <= -0.35 && far.y >= -1);
  assert.ok(lib.WRITE_MS >= 60 && lib.STEP >= 0.03);
  const defs = read("src/components/liquid-glass-defs.tsx");
  assert.match(defs, /const stopLight = watchLiquidLight\(document\);/);
  assert.match(defs, /stopLight\(\);/);
});

test("materialize: the lens bends in by steps, its rim and edge light rise with it", () => {
  assert.match(glass, /@property --lg-lens-stage \{\s*syntax: "\*";\s*inherits: false;/);
  const kf = glass.slice(glass.indexOf("@keyframes lg-materialize"), glass.indexOf("@media", glass.indexOf("@keyframes lg-materialize")));
  assert.match(kf, /0% \{[^}]*--lg-rim: 0;[^}]*--lg-lens-stage: saturate\(1\);/);
  assert.match(kf, /30% \{\s*--lg-lens-stage: var\(--lg-lens-mat, url\(#dw-liquid-lens-round-m\)\);/);
  assert.match(kf, /60% \{\s*--lg-lens-stage: var\(--lg-lens, url\(#dw-liquid-lens-round\)\);/);
  assert.equal((glass.match(/var\(--lg-lens-stage, var\(--lg-lens, url\(#dw-liquid-lens-(round|capsule)\)\)\)/g) ?? []).length, 4);
  const curvature = read("src/lib/liquid-glass-curvature.ts");
  assert.match(curvature, /export const MATERIALIZE_STRENGTH = 0\.45;/);
  assert.match(curvature, /--lg-lens-mat: \$\{halfUrl\};/);
  assert.match(read("src/components/liquid-glass-defs.tsx"), /id="dw-liquid-lens-round-m"/);
  assert.match(glass, /calc\(var\(--lg-edge-glow, 0\.07\) \* var\(--lg-mat\)\)/);
  assert.match(glass, /html\[data-button-style="liquid"\]:not\(\[data-liquid-lens\]\) \{\s*--lg-edge-glow: 0\.11;/);
});

test("the switch lens magnifies its track, following the knob without a backdrop layer", () => {
  const c = clean(controls);
  assert.match(c, /@property --lg-knob-x \{\s*syntax: "<length>";\s*inherits: false;\s*initial-value: 0px;/);
  const knob = c.match(/\.side-panel-zeus-toggle\s*> i\s*u:not\(#lg-glass\):not\(#lg-glass\):not\(#lg-glass\) \{([^}]*)\}/)[1];
  assert.match(knob, /translate: var\(--lg-knob-x\) 0;/);
  assert.match(knob, /var\(--lg-knob-track-b\) calc\(-3px - var\(--lg-knob-x\)\) -3px \/ 70px 28px no-repeat !important;/);
  assert.match(knob, /--lg-knob-x var\(--lg-spring-ms\) var\(--lg-spring\)/);
  assert.doesNotMatch(knob, /backdrop-filter/);
});

test("slide-to-open: let go, the lens gives its stretch back on the spring", () => {
  const block = clean(glass).match(/\.ios-slide-open\[data-lens="settle"\]\s*\.ios-slide-open-lens[^{]*\{([^}]*)\}/)[1];
  assert.match(block, /scale var\(--lg-spring-ms\) var\(--lg-spring\)/);
});

test("Clear / Tinted: applied before paint, pinned values, accessibility still wins", () => {
  assert.equal(GLASS_VARIANT_STORAGE_KEY, "dw-glass-variant");
  assert.equal(normalizeGlassVariant("tinted"), "tinted");
  for (const v of [null, undefined, "clear", "Tinted", "1"]) assert.equal(normalizeGlassVariant(v), "clear");
  assert.equal(getGlassVariantServerSnapshot(), "clear");
  const run = (store) => {
    const attrs = new Map();
    vm.runInNewContext(BUTTON_STYLE_SCRIPT, {
      document: { documentElement: { setAttribute: (k, v) => attrs.set(k, v), removeAttribute: (k) => attrs.delete(k) } },
      window: { localStorage: { getItem: (k) => store[k] ?? null } },
    });
    return attrs;
  };
  assert.equal(run({ "dw-button-style": "liquid", "dw-glass-variant": "tinted" }).get("data-glass-variant"), "tinted");
  assert.equal(run({ "dw-button-style": "liquid" }).has("data-glass-variant"), false);
  const toggle = read("src/components/button-style-toggle.tsx");
  assert.match(toggle, /aria-pressed=\{variant === value\}/);
  assert.match(toggle, /\{on && \(/);
  const tinted = glass.slice(glass.indexOf("@media not (prefers-reduced-transparency: reduce)"));
  assert.match(tinted, /^@media not \(prefers-reduced-transparency: reduce\) \{\s*@media not \(prefers-contrast: more\) \{/);
  assert.match(tinted, /\[data-glass-variant="tinted"\] \{\s*--lg-fill-alpha: 0\.58;/);
  // Glass off is untouched: every tinted rule needs the liquid style.
  for (const line of glass.split("\n").filter((l) => l.includes('[data-glass-variant="tinted"]')))
    assert.match(line, /html\[data-button-style="liquid"\]\[data-glass-variant="tinted"\]/);
});
