// The liquid glass's curvature (owner, 2026-11-01: 「ガラスの湾曲はfableで
// 作って」): the per-shape displacement maps (Chromium's lens) and rim light
// (every engine). Pins its scope (the glass option only), that a shape's
// maps are deterministic and keyed by size and radius, the physics of the
// bezel (flat centre, inward refraction at the rim) and the fallbacks.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const mapSource = read("src/lib/liquid-glass-curvature-map.ts");
const watcher = read("src/lib/liquid-glass-curvature.ts");
const defs = read("src/components/liquid-glass-defs.tsx");
const glass = read("src/styles-liquid-glass.css");
const controls = read("src/styles-liquid-glass-controls.css");

async function loadMaps() {
  const code = ts.transpileModule(mapSource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
}

/** Every rule (selector + body) in a sheet, comments stripped, @media flattened. */
function rules(css) {
  const out = [];
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = re.exec(clean))) out.push({ selector: match[1].trim(), body: match[2] });
  return out;
}

test("glass-only scope: the curvature starts with the option and every rule reading it is scoped", () => {
  // The watcher is started inside the effect that returns early while the
  // option is off, after the lens attribute is decided, and stopped with it.
  const effect = defs.slice(defs.indexOf("if (!on) return;"), defs.indexOf("}, [on]);"));
  assert.match(effect, /root\.setAttribute\(LIQUID_LENS_ATTRIBUTE, ""\)[\s\S]*watchLiquidCurvature\(document\)/);
  assert.match(effect, /stopCurvature\(\);[\s\S]*root\.removeAttribute\(LIQUID_LENS_ATTRIBUTE\)/);
  // Every sheet rule that reads the shape's properties is under the option.
  for (const sheet of [glass, controls]) {
    for (const { selector, body } of rules(sheet)) {
      if (!/--lg-rim-map|--lg-lens/.test(body)) continue;
      if (/^@property/.test(selector)) continue;
      assert.match(selector, /^html\[data-button-style="liquid"\]/, selector);
    }
  }
  // The pure module touches no DOM; the watcher undoes everything it wrote.
  assert.doesNotMatch(mapSource, /\bdocument\b|\bwindow\b|createElement/);
  assert.match(watcher, /style\.remove\(\);\s*svg\?\.remove\(\);/);
  assert.match(watcher, /for \(const entry of \[\.\.\.tracked\.values\(\)\]\) detach\(entry\);/);
  assert.match(watcher, /removeAttribute\(entry\.range \? CURVE_THUMB_ATTRIBUTE : CURVE_ATTRIBUTE\)/);
});

test("map generation is deterministic", async () => {
  const lib = await loadMaps();
  const shape = lib.quantizeShape(96, 40, 999, 2);
  const a = lib.surfaceMaps(shape);
  const b = lib.surfaceMaps(shape);
  assert.deepEqual(a.shape, b.shape);
  assert.equal(a.scale, b.scale);
  assert.equal(a.maxShift, b.maxShift);
  assert.deepEqual([...a.lens.data], [...b.lens.data]);
  assert.deepEqual([...a.rim.data], [...b.rim.data]);
  assert.equal(a.lens.cols, 96);
  assert.equal(a.lens.rows, 40);
  assert.equal(a.rim.cols, 192);
  assert.equal(a.rim.rows, 80);
});

test("maps are keyed by size and radius, quantised so near boxes share one", async () => {
  const lib = await loadMaps();
  const key = (w, h, r, d = 1) => lib.curvatureKey(lib.quantizeShape(w, h, r, d));
  assert.equal(key(96, 40, 20), key(97, 41, 21));
  assert.equal(key(96, 40, 999), key(96, 40, 20), "a 999px pill is its half-height");
  assert.notEqual(key(96, 40, 20), key(96, 40, 8), "radius changes the key");
  assert.notEqual(key(96, 40, 20), key(160, 40, 20), "width changes the key");
  assert.notEqual(key(96, 40, 20), key(96, 56, 20), "height changes the key");
  assert.notEqual(key(96, 40, 20, 1), key(96, 40, 20, 2), "density changes the rim");
  assert.match(key(96, 40, 20, 2), /^v\d+-w96-h40-r20-x2$/);
  // The filter ids and the attribute rules carry the key.
  assert.match(watcher, /LENS_ID_PREFIX = "dw-lens-"/);
  assert.match(watcher, /rule\(`\[\$\{CURVE_ATTRIBUTE\}="\$\{key\}"\]`, body\)/);
  // Built once per key; a control whose key is unchanged is left alone.
  assert.match(watcher, /if \(entry\.key === key\) return;/);
  assert.match(watcher, /if \(!built\.has\(key\)\) build\(key, item\.shape\);/);
});

test("the bezel is convex glass: flat centre, inward refraction growing to the rim, dispersion", async () => {
  const lib = await loadMaps();
  const maps = lib.surfaceMaps(lib.quantizeShape(200, 40, 20, 1));
  const { cols, rows, data } = maps.lens;
  const px = (col, row) => {
    const i = (row * cols + col) * 4;
    return { r: data[i], g: data[i + 1] };
  };
  const mid = Math.floor(rows / 2);
  // The centre rests at mid-grey: nothing moves there.
  assert.deepEqual(px(Math.floor(cols / 2), mid), { r: 128, g: 128 });
  // The left rim samples inward (to the right: R above mid), the right rim
  // to the left, the top rim downward, the bottom rim upward, each by most
  // of the largest shift once decoded (x' = x + scale × width × (R − ½)).
  const dx = (col, row) => ((px(col, row).r - 128) / 255) * maps.scale * 200;
  const dy = (col, row) => ((px(col, row).g - 128) / 255) * maps.scale * 40;
  const half = maps.maxShift * 0.5;
  assert.ok(dx(0, mid) > half, `left rim ${dx(0, mid)}`);
  assert.ok(dx(cols - 1, mid) < -half, `right rim ${dx(cols - 1, mid)}`);
  assert.ok(dy(Math.floor(cols / 2), 0) > half, `top rim ${dy(Math.floor(cols / 2), 0)}`);
  assert.ok(dy(Math.floor(cols / 2), rows - 1) < -half, `bottom rim ${dy(Math.floor(cols / 2), rows - 1)}`);
  // The shift falls monotonically from the rim to the flat centre.
  let last = Infinity;
  for (let col = 0; col < Math.floor(cols / 2); col++) {
    const shift = px(col, mid).r - 128;
    assert.ok(shift <= last, `col ${col}: ${shift} after ${last}`);
    last = shift;
  }
  // The shift is bounded by the glass's thickness (about the bezel).
  assert.ok(maps.maxShift > maps.bezel * 0.6 && maps.maxShift < maps.bezel * 1.1, `${maps.maxShift}`);
  // Snell: a steeper surface bends more; a flat one not at all.
  assert.equal(lib.refractionShift(0, 10), 0);
  assert.ok(lib.refractionShift(0.4, 10) < lib.refractionShift(0.8, 10));
  // The red channel is bent a little further (the fringe).
  assert.match(watcher, /DISPERSION = 1\.15/);
  assert.match(watcher, /bend\(maps\.scale \* DISPERSION, "bentRed"\)/);
});

test("the rim light comes from the same normals: lit on the light's side, dark band along the bezel", async () => {
  const lib = await loadMaps();
  const maps = lib.surfaceMaps(lib.quantizeShape(120, 48, 24, 1));
  const { cols, rows, data } = maps.rim;
  const at = (col, row) => {
    const i = (row * cols + col) * 4;
    return { lum: data[i], a: data[i + 3] };
  };
  // The flat centre is clear.
  assert.equal(at(Math.floor(cols / 2), Math.floor(rows / 2)).a, 0);
  // The upper-left rim (toward the light) is a bright arc; the lower-right
  // rim carries the band (dark) with the faint caustic.
  const lit = at(Math.floor(cols / 2), 1);
  const far = at(Math.floor(cols / 2), rows - 2);
  assert.ok(lit.a > 60 && lit.lum > 200, `lit rim ${JSON.stringify(lit)}`);
  assert.ok(far.a > 20 && far.lum < lit.lum, `far rim ${JSON.stringify(far)}`);
  // Light direction matches the sheet's rest values.
  assert.deepEqual(lib.LIGHT, { x: -0.55, y: -1, z: 0.9 });
  assert.match(glass, /--lg-lx: -0\.55;\s*--lg-ly: -1;/);
});

test("Chromium gets the shape's lens with the capsule as fallback; the rim is a background layer everywhere", () => {
  // Every lens rule names the shape's filter first and falls back to the
  // shared maps, and stays gated to Chromium outside economy.
  let lensRules = 0;
  for (const sheet of [glass, controls]) {
    for (const { selector, body } of rules(sheet)) {
      if (!/url\(#dw-liquid-lens-(capsule|round)\)/.test(body)) continue;
      lensRules++;
      assert.match(body, /var\(--lg-lens, url\(#dw-liquid-lens-(capsule|round)\)\)/, selector);
      assert.match(selector, /\[data-liquid-lens\]:not\(\[data-world-effects="economy"\]\)/, selector);
    }
  }
  assert.ok(lensRules >= 5, `${lensRules} lens rules`);
  // The filters exist only where the engine draws them.
  assert.match(watcher, /const withLens = root\.hasAttribute\(LIQUID_LENS_ATTRIBUTE\);/);
  assert.match(watcher, /if \(withLens\) \{\s*svg = doc\.createElementNS/);
  assert.match(watcher, /\$\{lensUrl \? ` --lg-lens: \$\{lensUrl\};` : ""\}/);
  // The rim map is a plain background layer: no backdrop-filter rides on it.
  const rimLayers = [glass, controls].flatMap((sheet) =>
    rules(sheet).filter(({ body }) => /var\(--lg-rim-map, none\)/.test(body)),
  );
  assert.ok(rimLayers.length >= 4, `${rimLayers.length} rim layers`);
  for (const { selector, body } of rimLayers) {
    assert.match(body, /var\(--lg-rim-map, none\) center \/ 100% 100% no-repeat/, selector);
  }
  // The thumb's lens never inherits the track's.
  assert.match(glass, /@property --lg-lens \{\s*syntax: "\*";\s*inherits: false;\s*\}/);
});

test("the slider's lens, the thumbs and the hold's lens targets wear the curvature", () => {
  assert.match(watcher, /"\.ios-slide-open-thumb",\s*"\.ios-slide-open-lens-body",\s*"\.lg-lens-target"/);
  assert.match(watcher, /el\.classList\.contains\("lg-lens-target"\)/);
  assert.match(
    glass,
    /:is\(\.ios-slide-open \.ios-slide-open-lens-body, \.lg-lens-target\[data-lg-curve\]\)[^{]*\{[^}]*var\(--lg-lens, url\(#dw-liquid-lens-capsule\)\)/,
  );
  // Range thumbs: measured from the pseudo-element, keyed on the input.
  assert.match(watcher, /getComputedStyle\(el, "::-webkit-slider-thumb"\)/);
  assert.match(watcher, /::-webkit-slider-thumb`, body\)/);
  assert.match(watcher, /::-moz-range-thumb`, body\)/);
});

test("budgets: measured by ResizeObserver, built a few milliseconds a frame, no per-frame reads", () => {
  assert.match(watcher, /new view\.ResizeObserver/);
  assert.match(watcher, /resize\.observe\(el, \{ box: "border-box" \}\)/);
  assert.match(watcher, /entry\.borderBoxSize\?\.\[0\]/);
  assert.match(watcher, /FRAME_BUDGET_MS = 6/);
  assert.match(watcher, /if \(performance\.now\(\) - start > FRAME_BUDGET_MS\) break;/);
  // No pointer, scroll or animation-frame loop: nothing runs while a control
  // is held or dragged.
  assert.doesNotMatch(watcher, /addEventListener\("(pointer|scroll|touch)/);
  // Economy keeps the rim images at 1x.
  assert.match(watcher, /const dpr = economy\(\) \? 1 : \(view!\.devicePixelRatio \|\| 1\);/);
});

test("fallbacks: forced colours, reduced transparency and economy", () => {
  // Forced colours paint the system button over everything (the rim layer
  // sits in the same shorthand the forced rule overrides).
  assert.match(glass, /@media \(forced-colors: active\)[\s\S]*background: ButtonFace !important;/);
  // Reduced transparency: the defs never mark the lens attribute, so the
  // watcher builds no filters (the rim light alone remains).
  assert.match(defs, /if \(lensSupported\(window\) && !clearer\) root\.setAttribute\(LIQUID_LENS_ATTRIBUTE/);
  // Economy: no lens rule matches (all are :not(economy)); the slider lens
  // samples nothing.
  assert.match(
    glass,
    /\[data-world-effects="economy"\][^{]*\.ios-slide-open-lens-body[^{]*\{[^}]*backdrop-filter: none;/,
  );
});
