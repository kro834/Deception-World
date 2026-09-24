import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { hasConstrainedResources } from "../src/lib/rendering-profile.js";
import {
  CALM_EDGE_BOX,
  CALM_EDGE_SEED,
  CALM_EDGE_SEED_B,
  CALM_EDGE_STRIP,
  CALM_FLAME_SEATS,
  burnEdge,
  calmEdgeAhead,
} from "../src/components/world/rising-calm.ts";
import {
  RISING_ART_ASPECT,
  RISING_COMPACT_PIXEL_BUDGET,
  RISING_PROBE_BUDGET_MS,
  RISING_READY_TIMEOUT_MS,
  RISING_RESOLUTION_RUNGS,
  RISING_TIMING,
  RISING_WORLD_FOCUS,
  RISING_WORLD_POSITION,
  pickRisingTier,
  portalEase,
  risingFramesPerDraw,
  risingProbeRung,
  risingUniformsAt,
} from "../src/components/world/rising-timing.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "");
// Comments stripped, and prettier's line breaks inside :not( ... ) undone.
const readCss = async () =>
  stripComments(await read("src/styles-world-rising.css"))
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")");
// Splits a selector list on the commas outside :is() / :not() parentheses.
const selectorList = (selector) => {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < selector.length; index += 1) {
    const char = selector[index];
    if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    else if (char === "," && depth === 0) {
      parts.push(selector.slice(start, index));
      start = index + 1;
    }
  }
  return [...parts, selector.slice(start)].map((part) => part.trim());
};

const ALLOWED_WORDS = new Set([
  "RISING THE WORLD",
  "EP7",
  "REXONANCE",
  "EP7 REXONANCE",
  "CLOSE",
  "SKIP",
  "もう一度",
]);

test("the rising sheet is linked before the Mirage face, so Mirage stays last", async () => {
  const route = await read("src/routes/world.tsx");
  assert.match(route, /import worldRisingCssUrl from "@\/styles-world-rising\.css\?url";/);
  const links = route.slice(route.search(/stylesheetLinks:\s*\[/));
  const order = [
    "href: otherArtworkCssUrl",
    "href: worldRisingCssUrl",
    "href: MIRAGE_FONTS_URL",
    "href: worldMirageCssUrl",
  ].map((needle) => links.indexOf(needle));
  assert.ok(
    order.every((index) => index > 0),
    String(order),
  );
  assert.deepEqual(
    [...order].sort((a, b) => a - b),
    order,
  );
  assert.equal(
    links.lastIndexOf('rel: "stylesheet"'),
    links.lastIndexOf('{ rel: "stylesheet", href: worldMirageCssUrl }') + 2,
  );
});

test("the gate follows the footer, and the engine stays out of the World bundle", async () => {
  const home = await read("src/components/world/world-home.tsx");
  assert.match(home, /<\/footer>\s*<RisingWorld \/>/);
  assert.match(home, /import \{ RisingWorld \} from "\.\/rising-world";/);
  assert.doesNotMatch(home, /rising-(?:sequence|fire|timing)/);
  const component = await read("src/components/world/rising-world.tsx");
  // Only a type import and a dynamic import() reach the engine.
  assert.doesNotMatch(component, /^import (?!type )[^\n]*rising-(?:sequence|fire|timing)/m);
  assert.match(component, /import\("\.\/rising-sequence"\)/);
  assert.doesNotMatch(component, /<canvas/, "the canvas is created per run, not in the markup");
  const fire = await read("src/components/world/rising-fire.ts");
  assert.match(fire, /import FRAGMENT_SOURCE from "\.\/rising\.frag\.glsl\?raw";/);
});

test("only the supplied words reach the reader", async () => {
  const component = await read("src/components/world/rising-world.tsx");
  // The JSX of every component in the file (the calm fire has its own).
  const markup = [...component.matchAll(/\n {2}return \(\n {4}<>([\s\S]*?)\n {2}\);\n/g)]
    .map((match) => match[1])
    .join("\n");
  assert.ok(markup.includes("<dialog") && markup.includes("rw-calm-flames"));
  const text = [...markup.matchAll(/>([^<>{}]*)</g)]
    .map((match) => match[1].trim())
    .filter((token) => /[\p{L}\p{N}]/u.test(token));
  const labels = [...component.matchAll(/aria-label="([^"]*)"/g)].map((match) => match[1]);
  const announced = [...component.matchAll(/setLive\("([^"]+)"\)/g)].map((match) => match[1]);
  const visible = [...text, ...labels, ...announced];
  assert.ok(visible.length >= 8, visible.join(" | "));
  for (const word of visible) assert.ok(ALLOWED_WORDS.has(word), `unexpected text: ${word}`);
  for (const word of visible) {
    assert.doesNotMatch(word, /20\d\d|公開|COMING|予告|release|coming soon|配信/i);
  }
  assert.doesNotMatch(component, /20\d\d/, "no dates in the component");
  const css = await readCss();
  for (const [, content] of css.matchAll(/content:\s*("[^"]*"|'[^']*')/g)) {
    assert.match(content, /^["']{2}$/, "decorative pseudo-elements carry no text");
  }
});

test("the title is announced at the cut, and the dialog is named by the button", async () => {
  const component = await read("src/components/world/rising-world.tsx");
  const dialog = component.slice(component.indexOf("<dialog"), component.indexOf("</dialog>"));
  assert.match(dialog, /aria-label="RISING THE WORLD"/);
  assert.doesNotMatch(dialog, /aria-labelledby/);
  assert.match(dialog, /className="rw-title-wrap" aria-hidden="true"/);
  assert.match(dialog, /aria-live="polite"/);
  assert.match(
    dialog,
    /<span className="rw-title-ep">EP7<\/span>\{" "\}\s*<span className="rw-title-name">REXONANCE<\/span>/,
  );
  assert.match(component, /onTitle: \(\) => setLive\("EP7 REXONANCE"\)/);
  assert.match(
    component,
    /aria-label="RISING THE WORLD"[\s\S]*<button[\s\S]*className="rw-gate-button"/,
  );
  assert.doesNotMatch(component, /aria-expanded/);
  // WCAG 2.5.3: CLOSE is named by its visible label, with no aria-label.
  const close = component.slice(
    component.indexOf('className="rw-close"'),
    component.indexOf("</button>", component.indexOf('className="rw-close"')),
  );
  assert.doesNotMatch(close, /aria-label/);
  assert.match(close, /<span>CLOSE<\/span>/);
});

test("the dialog locks the page in step with showModal and close, and closes on cancel", async () => {
  const component = await read("src/components/world/rising-world.tsx");
  assert.match(
    component,
    /dialog\.showModal\(\);[^\n]*\n[\s\S]{0,400}?acquireViewportScrollLock\(\{ freezeBody: true \}\)/,
  );
  assert.match(component, /from "@\/lib\/viewport-scroll-lock\.js"/);
  // Not a passive effect: no frame with the page unlocked under an open dialog.
  for (const [effect] of component.matchAll(
    /useEffect\(\(\) => \{[\s\S]*?\n {2}\}, \[[^\]]*\]\);/g,
  )) {
    assert.doesNotMatch(effect, /acquireViewportScrollLock/);
  }
  assert.match(
    component,
    /onCancel=\{\(event\) => \{\s*event\.preventDefault\(\);\s*closeDialog\(\);/,
  );
  assert.match(component, /releaseLockRef\.current\?\.\(\);/);
  assert.match(component, /triggerRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(component, /addEventListener\("pagehide"/);
  // A close event left over from an earlier session never tears down a reopened one.
  assert.match(
    component,
    /onClose=\{\(\) => \{[\s\S]{0,200}?if \(!dialogRef\.current\?\.open\) finishClose\(\);/,
  );
  // Keyboard open focuses CLOSE, pointer open the dialog surface.
  assert.match(
    component,
    /\(keyboard \? closeRef\.current : dialog\)\?\.focus\(\{ preventScroll: true \}\)/,
  );
});

test("the rider art is the standard Rexonance artwork through the shared helpers", async () => {
  const component = await read("src/components/world/rising-world.tsx");
  assert.match(component, /rexonanceImage\(REXONANCE_SITE_ARTWORK\.standard\)/);
  assert.doesNotMatch(component, /rider-rexonance-(?:max|ultra)|\.webp"[^;]*rider/);
  const css = await readCss();
  assert.doesNotMatch(css, /url\(/, "no hard-coded image paths in the sheet");
  const home = await read("src/components/world/world-home.tsx");
  const episodes = home.slice(
    home.indexOf("const EPISODES"),
    home.indexOf("];", home.indexOf("const EPISODES")),
  );
  assert.doesNotMatch(episodes, /EP7|REXONANCE/i, "EP7 is not added to the episode archive");
});

test("the shader runs at high precision where available and avoids undefined smoothstep", async () => {
  for (const file of ["rising.frag.glsl", "rising-flames.frag.glsl", "rising-noise.frag.glsl"]) {
    const source = await read(`src/components/world/${file}`);
    assert.match(source, /#ifdef GL_FRAGMENT_PRECISION_HIGH\s+precision highp float;/, file);
    for (const [, a, b] of source.matchAll(/smoothstep\((-?[\d.]+),\s*(-?[\d.]+)/g)) {
      assert.ok(
        Number(a) < Number(b),
        `${file}: smoothstep(${a}, ${b}) is undefined in GLSL ES 1.00`,
      );
    }
    // fall(e0, e1, x) is 1 - smoothstep(e1, e0, x): its edges must fall, or
    // the smoothstep inside it runs reversed.
    for (const [, a, b] of source.matchAll(/\bfall\((-?[\d.]+),\s*(-?[\d.]+)/g)) {
      assert.ok(Number(a) > Number(b), `${file}: fall(${a}, ${b}) reverses its smoothstep`);
    }
  }
  const shader = await read("src/components/world/rising.frag.glsl");
  // The Hoskins hash (no large sin() products that collapse at FP16).
  assert.match(shader, /fract\(vec3\(p\.xyx\) \* 0\.1031\)/);
  assert.doesNotMatch(shader, /sin\([^)]*43758/);
  assert.match(shader, /uniform float uHeat;/);
  // Where a GPU has no highp in the fragment shader (mediump, FP16): no
  // exp() of a large positive argument (it overflows to inf, and mix(a, inf,
  // 0.0) is NaN), and no division by a squared width that is subnormal at FP16
  // and may flush to zero.
  const flames = await read("src/components/world/rising-flames.frag.glsl");
  assert.match(flames, /exp\(min\(hy, 0\.0\) \/ 0\.035\)/);
  assert.doesNotMatch(flames, /exp\(hy \//);
  assert.match(
    shader,
    /float lz = \(d \+ 0\.008\) \/ w;\s*float lipGlow = exp\(-lz \* lz\) \* run;/,
  );
});

test("the renderer is opaque, refuses software GL and never uploads an <img> mid-run", async () => {
  const fire = stripComments(await read("src/components/world/rising-fire.ts"));
  assert.match(fire, /alpha: false/);
  assert.match(fire, /powerPreference: "default"/);
  assert.match(fire, /failIfMajorPerformanceCaveat: true/);
  assert.doesNotMatch(fire, /high-performance/);
  assert.match(fire, /KHR_parallel_shader_compile/);
  assert.match(fire, /COMPLETION_STATUS_KHR/);
  // A Blob source decodes off the main thread; an <img> source would not (F2).
  assert.match(fire, /createImageBitmap\(await response\.blob\(\), \{/);
  assert.match(fire, /resizeQuality: "low"/);
  assert.doesNotMatch(fire, /createImageBitmap\(image/);
  assert.match(fire, /WEBGL_lose_context"\)\?\.loseContext\(\)/);
  // One image upload path (resized bitmaps), plus two render targets
  // allocated empty (null) and filled on the GPU: the noise tile (baked once)
  // and the flame pass (every frame of the burn).
  assert.equal(
    [...fire.matchAll(/texImage2D\(/g)].length,
    3,
    "image upload + noise target + flame target",
  );
  assert.match(
    fire,
    /texImage2D\(gl\.TEXTURE_2D, 0, gl\.RGBA, width, height, 0, gl\.RGBA, gl\.UNSIGNED_BYTE, null\)/,
  );
  assert.match(fire, /checkFramebufferStatus/);
  assert.match(
    fire,
    /texImage2D\(gl\.TEXTURE_2D, 0, gl\.RGB, gl\.RGB, gl\.UNSIGNED_BYTE, source\)/,
  );
  assert.match(
    fire,
    /NOISE_SIZE,\s*NOISE_SIZE,\s*0,\s*gl\.RGBA,\s*gl\.UNSIGNED_BYTE,\s*null,?\s*\)/,
  );
  assert.match(fire, /this\.texture\(assets\.world\.source\)/);
});

test("the controller picks the tier by capability and keeps the portal on the compositor", async () => {
  const sequence = stripComments(await read("src/components/world/rising-sequence.ts"));
  assert.match(sequence, /import \{ hasConstrainedResources \} from "@\/lib\/rendering-profile";/);
  assert.doesNotMatch(
    sequence,
    /prefersLightweightRendering|worldEffects|data-world-effects|economy|userAgent|Android|Galaxy|Pixel/i,
  );
  assert.doesNotMatch(sequence, /clipPath|clip-path/, "the portal is not a clip-path animation");
  assert.match(sequence, /transform: `scale\(/);
  // The portal is an iris: the art is counter-scaled, and its box stays the
  // viewport-sized cover fit that GL frame 0 and the calm layer share.
  assert.match(sequence, /portalArt\.animate\(/);
  assert.match(sequence, /transform: `scale\(\$\{\(1 \/ scale\)\.toFixed\(5\)\}\)`/);
  assert.match(sequence, /width: `\$\{width\}px`,\s*height: `\$\{height\}px`,/);
  assert.match(sequence, /risingFramesPerDraw\(stats\.cadenceMs\)/);
  assert.match(sequence, /document\.addEventListener\("visibilitychange", onVisibility\)/);
  assert.match(sequence, /addEventListener\("webglcontextlost", onContextLost\)/);
  assert.match(sequence, /const PRIME_TTL_MS = 1000;/);
  // The GL-ready deadline (the calm fallback on slow devices), end to end.
  assert.equal(RISING_READY_TIMEOUT_MS, 700);
  assert.match(
    sequence,
    /const deadline = openedAt \+ \(audit \? 5000 : RISING_READY_TIMEOUT_MS\);/,
  );
  assert.match(sequence, /await withDeadline\(prepareRisingAssets\(world, rider\), deadline\)/);
  assert.match(sequence, /await withDeadline\(compiled, deadline\)/);
  assert.match(sequence, /reject\(new Error\("not-ready"\)\)/);
});

test("the portal ease: cubic-bezier(0.7, 0, 0.84, 0), and the iris holds the art still", () => {
  assert.equal(portalEase(0), 0);
  assert.equal(portalEase(1), 1);
  assert.equal(portalEase(-1), 0);
  assert.equal(portalEase(2), 1);
  let previous = 0;
  for (let step = 1; step <= 200; step += 1) {
    const value = portalEase(step / 200);
    assert.ok(value >= previous - 1e-12, `not monotonic at ${step / 200}`);
    previous = value;
  }
  // An ease-in: y = t^3 on the curve, far below the diagonal at the midpoint.
  assert.ok(portalEase(0.5) < 0.2, String(portalEase(0.5)));
  // 32 samples, linear in between: scale x counter-scale stays within 2%.
  const STEPS = 32;
  for (const radius of [597, 908, 1200]) {
    const from = Math.min(1, Math.max(0.01, 28 / radius));
    const scales = Array.from(
      { length: STEPS + 1 },
      (_, index) => from + (1 - from) * portalEase(index / STEPS),
    );
    for (let index = 0; index < STEPS; index += 1) {
      const scale = (scales[index] + scales[index + 1]) / 2;
      const counter = (1 / scales[index] + 1 / scales[index + 1]) / 2;
      assert.ok(Math.abs(scale * counter - 1) <= 0.02, `radius ${radius}, sample ${index}`);
    }
  }
});

test("the prepared bitmaps are closed when the gate unmounts", async () => {
  const fire = stripComments(await read("src/components/world/rising-fire.ts"));
  const release = fire.slice(fire.indexOf("export function releaseRisingAssets"));
  assert.match(release, /prepared = null;/);
  assert.match(release, /image\.source\.close\(\)/);
  const sequence = await read("src/components/world/rising-sequence.ts");
  assert.match(
    sequence,
    /export function releaseRising\(\) \{\s*releasePrimed\(\);\s*releaseRisingAssets\(\);/,
  );
  const component = await read("src/components/world/rising-world.tsx");
  assert.match(
    component,
    /runRef\.current\?\.dispose\(\);\s*runRef\.current = null;\s*\/\/[^\n]*\n\s*engineModule\?\.releaseRising\(\);/,
  );
});

test("the controls: no key repeats, no double presses, SKIP while loading, a final failure", async () => {
  const component = await read("src/components/world/rising-world.tsx");
  const dialog = component.slice(component.indexOf("<dialog"), component.indexOf("</dialog>"));
  // A held Enter or Space clicks once (WCAG 2.3.1: SKIP / もう一度 swap the picture).
  assert.match(
    dialog,
    /onKeyDown=\{\(event\) => \{[\s\S]{0,200}?if \(event\.repeat && \(event\.key === "Enter" \|\| event\.key === " "\)\) event\.preventDefault\(\);/,
  );
  assert.match(component, /const SWAP_GUARD_MS = 600;/);
  assert.match(
    component,
    /const settled = \(\) => performance\.now\(\) - swappedAtRef\.current >= SWAP_GUARD_MS;/,
  );
  assert.match(component, /const skip = \(\) => \{\s*if \(!settled\(\)\) return;/);
  assert.match(component, /const replay = \(\) => \{\s*if \(!settled\(\)\) return;/);
  // Keyed, so focus really moves from SKIP to もう一度 and is announced.
  assert.match(
    dialog,
    /<button key="replay" type="button" className="rw-replay" onClick=\{replay\}>/,
  );
  assert.match(dialog, /<button key="skip" type="button" className="rw-skip" onClick=\{skip\}>/);
  // SKIP pressed while the engine chunk loads is kept, and applied to the run.
  assert.doesNotMatch(component, /onClick=\{\(\) => runRef\.current\?\.skip\(\)\}/);
  assert.match(component, /else skipRequestedRef\.current = true;/);
  assert.match(
    component,
    /module\.runRising\([\s\S]*?if \(skipRequestedRef\.current\) \{\s*skipRequestedRef\.current = false;\s*run\.skip\(\);/,
  );
  assert.match(component, /onEnd: markEnded,/);
  // A failed import is final: no retry that cannot work, and no もう一度.
  const load = component.slice(
    component.indexOf("const loadEngine"),
    component.indexOf("const prewarm"),
  );
  assert.doesNotMatch(load, /engine = null/);
  assert.match(dialog, /failed \? null : \(\s*<button key="replay"/);
});

test("capability tiers: reduced motion, constrained resources, everything else WebGL", () => {
  assert.equal(pickRisingTier({ reducedMotion: true, constrained: false }), "reduced");
  assert.equal(pickRisingTier({ reducedMotion: true, constrained: true }), "reduced");
  assert.equal(pickRisingTier({ reducedMotion: false, constrained: true }), "css");
  assert.equal(pickRisingTier({ reducedMotion: false, constrained: false }), "webgl");
  const pixel = {
    userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140.0 Mobile",
    deviceMemory: 8,
    hardwareConcurrency: 8,
    connection: { effectiveType: "4g" },
  };
  const galaxy = {
    userAgent: "Mozilla/5.0 (Linux; Android 14; SM-S921B) SamsungBrowser/25.0 Chrome/121.0 Mobile",
    deviceMemory: 8,
    hardwareConcurrency: 8,
  };
  const iphone18 = {
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) Version/18.5 Mobile/15E148",
    maxTouchPoints: 5,
  };
  for (const device of [pixel, galaxy, iphone18, {}]) {
    assert.equal(hasConstrainedResources(device), false, JSON.stringify(device));
  }
  for (const device of [
    { connection: { saveData: true } },
    { connection: { effectiveType: "2g" } },
    { connection: { effectiveType: "slow-2g" } },
    { deviceMemory: 2 },
    { deviceMemory: 1 },
    { hardwareConcurrency: 2 },
  ]) {
    assert.equal(hasConstrainedResources(device), true, JSON.stringify(device));
  }
});

test("draw cadence: about 60 draws a second, never 45 on a 90 Hz panel", () => {
  assert.equal(risingFramesPerDraw(1000 / 60), 1);
  assert.equal(risingFramesPerDraw(1000 / 90), 1);
  assert.equal(risingFramesPerDraw(1000 / 120), 2);
  assert.equal(risingFramesPerDraw(1000 / 144), 2);
  assert.equal(risingFramesPerDraw(1000 / 30), 1);
  assert.equal(risingFramesPerDraw(0), 1);
  assert.equal(risingFramesPerDraw(Number.NaN), 1);
});

test("the uniform schedule: heat only rises, one bloom, one cut, flames settle, ends by 10 s", () => {
  const s = RISING_TIMING.webgl;
  let heat = -1;
  let warpPeaks = 0;
  let previousWarp = 0;
  let rising = false;
  let flameAfterSettle = Infinity;
  for (let step = 0; step <= 900; step += 1) {
    const T = step / 100;
    const u = risingUniformsAt(T);
    assert.ok(u.uHeat >= heat - 1e-9, `uHeat fell at ${T}`);
    heat = u.uHeat;
    if (u.uWarp > previousWarp + 1e-9) rising = true;
    else if (rising && u.uWarp < previousWarp - 1e-9) {
      warpPeaks += 1;
      rising = false;
    }
    previousWarp = u.uWarp;
    if (T < s.title) assert.ok(u.uShock < 0, `shock before the cut at ${T}`);
    else assert.ok(u.uShock >= 0);
    if (T >= s.settle[0]) {
      assert.ok(u.uFlame <= flameAfterSettle + 1e-9, `uFlame rose after settle at ${T}`);
      flameAfterSettle = u.uFlame;
    }
    for (const value of Object.values(u)) assert.ok(Number.isFinite(value));
  }
  assert.equal(warpPeaks, 1);
  // The burn grew (2026-09-24), but the whole run, portal included, stays
  // within about ten seconds.
  for (const tier of Object.keys(RISING_TIMING)) {
    const t = RISING_TIMING[tier];
    assert.ok(t.portal + t.end <= 10.05, `${tier}: ${t.portal + t.end} s`);
    assert.ok(t.fade[1] <= t.end, tier);
  }
  assert.equal(s.title, 4.5);
  assert.ok(risingUniformsAt(s.title).uBurn > 0.25 && risingUniformsAt(s.title).uBurn < 0.6);
});

test("the sheet: finite, compositor-only, gated like Mirage, legible and scoped", async () => {
  const css = await readCss();
  assert.doesNotMatch(css, /infinite/);
  assert.doesNotMatch(css, /backdrop-filter|mix-blend-mode|will-change|(?<![-\w])filter\s*:/);
  assert.doesNotMatch(css, /data-world-effects|economy/, "the rise is not gated on economy");
  for (const [, body] of css.matchAll(/@keyframes [\w-]+ \{([\s\S]*?\n)\}/g)) {
    for (const [, property] of body.matchAll(/^\s+([a-z-]+):/gm)) {
      assert.ok(
        ["opacity", "translate", "scale", "rotate", "clip-path"].includes(property),
        property,
      );
    }
  }
  const gate = css.slice(css.indexOf("@supports (animation-timeline: view())"));
  const reduced = gate.indexOf("@media (prefers-reduced-motion: no-preference)");
  assert.ok(reduced > 0);
  const guard =
    "html:not([data-side-menu-open]):not([data-loading]):not([data-dialog-open])";
  for (const target of [".rw-gate-button {", ".rw-gate-horizon {", ".rw-gate-rule {"]) {
    const at = gate.indexOf(target);
    assert.ok(at > reduced, target);
    assert.ok(gate.slice(0, at).lastIndexOf(guard) > reduced, target);
  }
  assert.match(gate, /animation-timeline: --rw-gate;\s*animation-range: entry 12% entry 88%;/);
  assert.match(gate, /\.rw-gate-button:focus-visible \{\s*animation: none;/);
  assert.match(css, /view-timeline: --rw-gate block;/);
  assert.match(css, /\.rw-dialog \.zeus-button \{\s*display: none;/);
  assert.match(css, /\.rw-dialog::backdrop \{\s*background: #050203;/);
  const dialog = css.slice(css.indexOf(".mirage-edition .rw-dialog {"));
  assert.match(dialog.slice(0, dialog.indexOf("}")), /height: 100dvh;/);
  assert.doesNotMatch(css, /\blvh\b|100svh/);
  assert.match(css, /\.rw-portal \{[^}]*border-radius: 50%;[^}]*\}/);
  for (const [, size] of css.matchAll(/font(?:-size)?:[^;]*?(\d+(?:\.\d+)?)px/g)) {
    assert.ok(Number(size) >= 12, `font size ${size}px`);
  }
  // Every style rule, including those nested in @media / @supports; keyframe
  // stops are skipped. The sheet has no nested style rules.
  const stack = [];
  let prelude = "";
  let nested = 0;
  for (let index = 0; index < css.length; index += 1) {
    const character = css[index];
    if (character === "{") {
      const head = prelude.replace(/\s+/g, " ").trim();
      prelude = "";
      if (head.startsWith("@")) {
        stack.push(head);
        continue;
      }
      if (!stack.at(-1)?.startsWith("@keyframes")) {
        if (stack.length > 0) nested += 1;
        for (const part of selectorList(head)) {
          assert.match(
            part,
            /\.site-shell\.film-edition\.mirage-edition|^html:not/,
            `unscoped selector: ${part}`,
          );
        }
      }
      index = css.indexOf("}", index);
    } else if (character === "}") {
      stack.pop();
      prelude = "";
    } else if (character === ";") prelude = "";
    else prelude += character;
  }
  assert.ok(nested > 0, "nested rules were scope-checked");
  // The rise's keyframes exist (a renamed keyframe would silently drop it).
  assert.match(gate, /\.rw-gate-button \{\s*animation: rw-rise linear both;/);
  assert.match(css, /@keyframes rw-rise \{/);
  // WCAG 2.4.7 under forced colours (no box-shadow): a transparent outline,
  // painted in a system colour there, and a cross drawn in ButtonText.
  assert.match(css, /\.rw-gate-button:focus-visible \{\s*outline: 2px solid transparent;/);
  assert.match(
    css,
    /:is\(\.rw-controls button, \.rw-close\):focus-visible \{\s*outline: 2px solid transparent;/,
  );
  const forced = css.slice(css.indexOf("@media (forced-colors: active)"));
  assert.match(
    forced,
    /\.rw-close i::after \{\s*forced-color-adjust: none;\s*background: ButtonText;/,
  );
  // The landscape end still: the rider's sides are masked, no lit column.
  const landscape = css.slice(css.indexOf("@media (min-aspect-ratio: 3/4)"));
  const block = landscape.slice(0, landscape.indexOf("\n}\n"));
  assert.match(block, /\.rw-end-art \{[^}]*(?<!-webkit-)mask-image:\s*linear-gradient\(/);
  assert.match(block, /-webkit-mask-image:\s*linear-gradient\(/);
  // Its top melts into the dark as well (the shader fades the art the same).
  assert.match(
    block,
    /linear-gradient\(180deg, transparent, #000 16%\);\s*mask-composite: intersect;/,
  );
  assert.match(block, /-webkit-mask-composite: source-in;/);
  const shader = await read("src/components/world/rising.frag.glsl");
  assert.match(
    shader,
    /inFrame \*= mix\(1\.0, fall\(1\.0, 0\.84, ruv\.y\), step\(0\.75, aspect\)\);/,
  );
  assert.doesNotMatch(block, /\.rw-end::after/);
});

test("the Zeus button steps off the gate button", async () => {
  const zeus = await read("src/components/zeus-button.tsx");
  const list = zeus.slice(
    zeus.indexOf("const ZEUS_AVOID_SELECTOR = ["),
    zeus.indexOf('].join(",");'),
  );
  assert.match(list, /"\.rw-gate-button",/);
});

test("review guards: legible gate label, dark pending state, tap-only priming, visible css burn", async () => {
  const css = await readCss();
  // WCAG 1.4.3: the 14px label against the ember gradient across its text band.
  const hex = (value) => [1, 3, 5].map((index) => parseInt(value.slice(index, index + 2), 16));
  const channel = (value) => {
    const v = value / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const top = hex(css.match(/--rw-ember: (#[0-9a-f]{6});/)[1]);
  const bottom = hex(css.match(/--rw-ember-deep: (#[0-9a-f]{6});/)[1]);
  const label = luminance([255, 246, 238]);
  for (let t = 0.3; t <= 0.7; t += 0.05) {
    const background = top.map((value, index) => value + (bottom[index] - value) * t);
    const ratio = (label + 0.05) / (luminance(background) + 0.05);
    assert.ok(ratio >= 4.5, `gate label contrast ${ratio.toFixed(2)} at ${t.toFixed(2)}`);
  }
  assert.match(
    css,
    /rgb\(255 240 200 \/ 0\.24\), transparent 36%\)/,
    "hover sheen above the label",
  );
  // Until the engine chunk arrives there is no tier, and nothing but the void shows.
  assert.match(
    css,
    /\.rw-viewport:not\(\[data-tier\]\)\s*:is\(\.rw-end, \.rw-calm, \.rw-gl\) \{\s*visibility: hidden;/,
  );
  const component = await read("src/components/world/rising-world.tsx");
  assert.match(
    component,
    /delete viewportRef\.current\.dataset\.tier;[\s\S]*?await loadEngine\(\)/,
  );
  // A quick touch that turns into a scroll (pointercancel within
  // TOUCH_PRIME_DELAY_MS) creates no GL context; a resting touch may prime one
  // for PRIME_TTL_MS (the number DESIGN.md states).
  assert.match(component, /event\.pointerType !== "touch"/);
  assert.match(component, /const TOUCH_PRIME_DELAY_MS = 60;/);
  assert.match(component, /onPointerUp=\{primePending\}\s*onPointerCancel=\{cancelPrime\}/);
  // The calm tier's fire enters with the burn and is climbing at its title cut.
  const sequence = await read("src/components/world/rising-sequence.ts");
  const from = Number(sequence.match(/add\(calmBurn, \[\{ translate: "0 (\d+)%" \}/)[1]);
  assert.ok(from <= 70, `calm burn starts ${from}% down, below the frame for too long`);
  assert.match(css, new RegExp(`\\.rw-calm-burn \\{[^}]*translate: 0 ${from}%;`));
});

test("the burning image is the supplied rider art, shipped as-is plus a compact cut", async () => {
  const art = await read("src/components/world/rising-art.ts");
  assert.match(art, /export const RISING_BURN_ART = "\/rising-burn-rider-20260924\.webp";/);
  assert.match(
    art,
    /export const RISING_BURN_ART_COMPACT = "\/rising-burn-rider-20260924-683\.webp";/,
  );
  // Chosen by the image pixels a cover fit needs (2026-09-24 review), not by
  // pointer type: phones and touch laptops get the full file.
  assert.doesNotMatch(art, /any-pointer/);
  assert.doesNotMatch(art, /^import /m, "static and dependency-free");
  const component = await read("src/components/world/rising-world.tsx");
  assert.match(
    component,
    /import \{\s*RISING_BURN_ART,[^}]*\brisingBurnArt,?\s*\} from "\.\/rising-art";/,
  );
  assert.doesNotMatch(component, /deception-world-poster/, "the key visual no longer burns");
  // Chosen once at the press and used by the portal, the calm tier and the shader.
  assert.match(component, /artRef\.current = risingBurnArt\(\);/);
  assert.match(component, /world: artRef\.current,/);
  assert.equal([...component.matchAll(/src=\{open \? art : undefined\}/g)].length, 2);
  const original = await readFile(
    new URL("../public/rising-burn-rider-20260924.webp", import.meta.url),
  );
  assert.equal(
    createHash("sha256").update(original).digest("hex"),
    "7c75b9f5f3c6329330d103c05c0a5025b9524d0e94e3de4c7eb6494eabb5de00",
    "the supplied image, byte for byte",
  );
  const webpSize = (bytes) => {
    // VP8 (lossy) frame header: 14-bit width and height after the start code.
    const at = bytes.indexOf(Buffer.from([0x9d, 0x01, 0x2a]));
    assert.ok(at > 0, "VP8 frame");
    return [bytes.readUInt16LE(at + 3) & 0x3fff, bytes.readUInt16LE(at + 5) & 0x3fff];
  };
  assert.deepEqual(webpSize(original), [1024, 1536]);
  const compact = await readFile(
    new URL("../public/rising-burn-rider-20260924-683.webp", import.meta.url),
  );
  assert.deepEqual(webpSize(compact), [683, 1024]);
  assert.ok(Math.abs(683 / 1024 - RISING_ART_ASPECT) < 0.001 && 1024 / 1536 === RISING_ART_ASPECT);
});

test("the image is framed the same by the portal, the calm tier and the shader", async () => {
  const css = await readCss();
  const [x, y] = RISING_WORLD_POSITION.map((value) => `${Math.round(value * 100)}%`);
  for (const target of [".rw-calm-world", ".rw-portal-art"]) {
    const block = css.slice(css.indexOf(`${target} {`));
    assert.match(block.slice(0, block.indexOf("}")), new RegExp(`object-position: ${x} ${y};`));
  }
  const fire = stripComments(await read("src/components/world/rising-fire.ts"));
  assert.match(fire, /const \[px, py\] = RISING_WORLD_POSITION;/);
  assert.match(fire, /gl\.uniform2f\(at\.uFrame \?\? null, frame\[0\], frame\[1\]\)/);
  assert.match(fire, /RISING_WORLD_FOCUS\[0\], RISING_WORLD_FOCUS\[1\]/);
  // The dive's focus is the rider's chest core, inside the image.
  assert.ok(RISING_WORLD_FOCUS.every((value) => value > 0.3 && value < 0.8));
  const shader = await read("src/components/world/rising.frag.glsl");
  // Never past the image edge, whatever the zoom.
  assert.match(shader, /clamp\(mix\(uFrame, uFocus, [^;]+\), win, 1\.0 - win\)/);
});

test("the fire reads its turbulence from a baked, mipmapped noise tile", async () => {
  const noise = await read("src/components/world/rising-noise.frag.glsl");
  assert.match(noise, /#ifdef GL_FRAGMENT_PRECISION_HIGH\s+precision highp float;/);
  for (const [, a, b] of noise.matchAll(/smoothstep\((-?[\d.]+),\s*(-?[\d.]+)/g)) {
    assert.ok(Number(a) < Number(b), `smoothstep(${a}, ${b})`);
  }
  // Tileable: every lattice coordinate wraps with the period.
  assert.match(noise, /mod\(i, period\)/);
  const fire = stripComments(await read("src/components/world/rising-fire.ts"));
  assert.match(fire, /import NOISE_SOURCE from "\.\/rising-noise\.frag\.glsl\?raw";/);
  assert.match(fire, /const NOISE_SIZE = 256;/, "power of two: REPEAT and mipmaps in WebGL 1");
  assert.match(fire, /gl\.TEXTURE_WRAP_S, gl\.REPEAT/);
  assert.match(fire, /gl\.generateMipmap\(gl\.TEXTURE_2D\)/);
  assert.match(fire, /gl\.LINEAR_MIPMAP_LINEAR/);
  // Baked once: a ladder recompile keeps the tile.
  assert.match(fire, /const bake = this\.noiseBaked \? null : link\(NOISE_SOURCE\);/);
  assert.match(fire, /gl\.deleteTexture\(this\.noiseTexture\)/);
  for (const file of ["rising.frag.glsl", "rising-flames.frag.glsl"]) {
    const shader = await read(`src/components/world/${file}`);
    assert.match(shader, /uniform sampler2D uNoise;/, file);
    // Scroll offsets wrap (fract), so FP16 texture coordinates never lose the tile.
    assert.ok(shader.match(/fract\(T \* [\d.]+/g).length >= 3, file);
    assert.doesNotMatch(
      shader,
      /nz\([^;]*[-+] T \*/,
      `${file}: unwrapped time offsets in a noise fetch`,
    );
  }
});

test("no global strobe: every uniform turns at most once, flicker stays in the shader's space", () => {
  const names = Object.keys(risingUniformsAt(0)).filter((name) => name !== "uShock");
  for (const name of names) {
    let direction = 0;
    let turns = 0;
    let previous = risingUniformsAt(0)[name];
    for (let step = 1; step <= 1000; step += 1) {
      const value = risingUniformsAt(step / 100)[name];
      const delta = value - previous;
      if (Math.abs(delta) > 1e-6) {
        const next = Math.sign(delta);
        if (direction !== 0 && next !== direction) turns += 1;
        direction = next;
      }
      previous = value;
    }
    assert.ok(turns <= 1, `${name} turns ${turns} times`);
  }
});

test("the calm tier's fire: sprites on the compositor, finite, and off under reduced motion", async () => {
  const sequence = stripComments(await read("src/components/world/rising-sequence.ts"));
  const calm = sequence.slice(sequence.indexOf('if (tier === "css") {'));
  const block = calm.slice(0, calm.indexOf("\n    add(calm, ["));
  // Keyframes move only transform parts and opacity (the compositor runs
  // them); fill is a timing option (a smoke billow's later rounds fill forwards only).
  const options = ["offset", "delay", "duration", "easing", "fill", "length"];
  for (const [, property] of block.matchAll(/[{,]\s*([a-zA-Z]+):/g)) {
    assert.ok(["opacity", "scale", "translate", "rotate", ...options].includes(property), property);
  }
  for (const group of ["seats", "embers", "puffs"])
    assert.match(block, new RegExp(`${group}\\.forEach`));
  // Each seat's two sprite frames take turns (fake advection), on their own beat.
  assert.match(block, /seat\.querySelectorAll\("img"\)\.forEach\(\(frame, turn\) =>/);
  assert.match(block, /for \(const element of edge\) \{\s*add\(element, /);
  assert.match(block, /fill: round \? "forwards" : "both"/);
  assert.doesNotMatch(block, /iterations/);
  const css = await readCss();
  // Reduced motion hides the whole burn layer (flames, smoke, strips, char)
  // and the embers: nothing of it moves there, and hidden, its lazy sprites
  // (about 120 KB of strips and char) are never fetched.
  assert.match(
    css,
    /\.rw-viewport\[data-tier="reduced"\]\s*:is\(\.rw-calm-burn, \.rw-calm-embers\) \{\s*display: none;/,
  );
  // The char under the burn layer never lets its bottom edge rise into view.
  assert.match(css, /\.rw-calm-burn::after \{[^}]*top: 99\.5%;[^}]*background: #070203;/);
  // The strip spans its box as rising-calm.ts says; landscape deepens the tears.
  const top = (CALM_EDGE_STRIP.top / CALM_EDGE_BOX.height) * 100;
  const height = ((CALM_EDGE_STRIP.bottom - CALM_EDGE_STRIP.top) / CALM_EDGE_BOX.height) * 100;
  const origin =
    ((CALM_EDGE_BOX.mean - CALM_EDGE_STRIP.top) / (CALM_EDGE_STRIP.bottom - CALM_EDGE_STRIP.top)) *
    100;
  const edge = css.match(/\.rw-calm-edge \{([^}]*)\}/)[1];
  assert.match(edge, new RegExp(`top: ${top}%;`));
  assert.match(edge, new RegExp(`height: ${height}%;`));
  assert.match(edge, /transform: scaleY\(var\(--rw-edge-k\)\);/);
  assert.match(edge, new RegExp(`transform-origin: 50% ${origin.toFixed(1)}%;`));
  assert.match(
    css,
    /@media \(min-aspect-ratio: 1\/1\) \{\s*\.site-shell\.film-edition\.mirage-edition \.rw-calm-burn \{\s*--rw-edge-k: [\d.]+;/,
  );
  const component = await read("src/components/world/rising-world.tsx");
  // Raster sprites (scripts/render-rising-calm-sprites.mjs), not vector art;
  // lazy, so a WebGL run never fetches them.
  assert.doesNotMatch(component.slice(component.indexOf("const CalmFire")), /<svg|<path|<use/);
  const calmFire = component.slice(
    component.indexOf("const CalmFire"),
    component.indexOf("export function RisingWorld"),
  );
  for (const [image] of calmFire.matchAll(/<img[^>]*>/g)) assert.match(image, /loading="lazy"/);
  // Every sprite sits in the burn layer (the embers are CSS only), so the
  // reduced tier, which hides that layer, fetches none of them.
  const burnLayer = calmFire.slice(
    calmFire.indexOf('<span className="rw-calm-burn">'),
    calmFire.indexOf('<span className="rw-calm-embers">'),
  );
  assert.equal([...burnLayer.matchAll(/<img /g)].length, [...calmFire.matchAll(/<img /g)].length);
  assert.match(burnLayer, /backgroundImage: `url\(\$\{RISING_CALM_CHAR\}\)`/);
  // Flames sit behind the strip, so the char cuts their roots along the lip.
  assert.ok(
    calmFire.indexOf('className="rw-calm-flames"') < calmFire.indexOf('className="rw-calm-char"'),
  );
  assert.match(component, /bottom: `calc\(\d+% - \$\{dip\}% \* var\(--rw-edge-k\)\)`/);
  const renderer = await read("scripts/render-rising-calm-sprites.mjs");
  assert.match(
    renderer,
    /\[burnEdge\(CALM_EDGE_SEED\)\.ys, calmEdgeAhead\(\)\.ys\]/,
    "the strips draw the seats' profiles",
  );
  // A flame frame fades out towards its sides along a turbulent line, so a
  // squeezed or mirrored seat never shows its box's straight side as a seam.
  const flame = renderer.slice(
    renderer.indexOf("const FLAME = "),
    renderer.indexOf("const EDGE = "),
  );
  assert.match(flame, /float edgeX = min\(uv\.x, 1\.0 - uv\.x\) \+ \(n2 - 0\.5\) \* [\d.]+;/);
  assert.match(flame, /float fade = [^;]*smoothstep\(0\.0, 0\.[12]\d*, edgeX\)/);
});

test("the calm tier's burn edge: a fixed, smooth, ragged profile the flames are seated on", () => {
  const { ys } = burnEdge(CALM_EDGE_SEED);
  assert.equal(ys.length, 129);
  assert.deepEqual(burnEdge(CALM_EDGE_SEED).ys, ys, "a fixed seed: the server render agrees");
  // Ragged (tongues and bays across most of the box)...
  assert.ok(Math.max(...ys) - Math.min(...ys) > 100, `${Math.min(...ys)}..${Math.max(...ys)}`);
  // ...but low-passed: no zig-zag facets from one segment to the next.
  const kinks = ys.slice(1, -1).map((y, index) => Math.abs(ys[index] - 2 * y + ys[index + 2]));
  assert.ok(Math.max(...kinks) < 12, `second difference ${Math.max(...kinks).toFixed(1)}`);
  // Inside the strip, which the tiled char takes over from at its bottom.
  for (const y of ys)
    assert.ok(y > CALM_EDGE_STRIP.top + 30 && y < CALM_EDGE_STRIP.bottom - 60, String(y));
  // Irregular seats: sizes and gaps vary, and sprites alternate and mirror.
  const widths = new Set(CALM_FLAME_SEATS.map((seat) => seat.width));
  const heights = new Set(CALM_FLAME_SEATS.map((seat) => seat.height));
  const gaps = new Set(
    CALM_FLAME_SEATS.slice(1).map((seat, index) => seat.centre - CALM_FLAME_SEATS[index].centre),
  );
  assert.ok(widths.size >= 5 && heights.size >= 8 && gaps.size >= 3);
  assert.ok(new Set(CALM_FLAME_SEATS.map((seat) => seat.frame)).size >= 3);
  assert.ok(
    CALM_FLAME_SEATS.some((seat) => seat.mirror) && CALM_FLAME_SEATS.some((seat) => !seat.mirror),
  );
});

test("the burning image is chosen by the pixels a cover fit needs, not by pointer type", async () => {
  const { RISING_BURN_ART, RISING_BURN_ART_COMPACT, risingBurnArt } =
    await import("../src/components/world/rising-art.ts");
  const saved = {
    window: globalThis.window,
    navigator: Object.getOwnPropertyDescriptor(globalThis, "navigator"),
  };
  const pick = (innerWidth, innerHeight, devicePixelRatio, connection) => {
    globalThis.window = { innerWidth, innerHeight, devicePixelRatio };
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { connection } });
    return risingBurnArt();
  };
  try {
    assert.equal(pick(412, 915, 2.625), RISING_BURN_ART, "Pixel: about 1600 px across");
    assert.equal(pick(360, 780, 3), RISING_BURN_ART, "Galaxy");
    assert.equal(pick(1366, 768, 1), RISING_BURN_ART, "touch laptop");
    assert.equal(pick(1024, 1366, 2), RISING_BURN_ART, "large tablet");
    assert.equal(pick(1440, 900, 1), RISING_BURN_ART, "desktop");
    assert.equal(pick(640, 480, 1), RISING_BURN_ART_COMPACT, "a small, low-density window");
    assert.equal(pick(320, 740, 1), RISING_BURN_ART_COMPACT, "a 1x phone");
    assert.equal(pick(412, 915, 2.625, { saveData: true }), RISING_BURN_ART_COMPACT, "Save-Data");
    assert.equal(pick(412, 915, 2.625, { effectiveType: "slow-2g" }), RISING_BURN_ART_COMPACT);
    assert.equal(pick(412, 915, 2.625, { effectiveType: "2g" }), RISING_BURN_ART_COMPACT);
    assert.equal(pick(412, 915, 2.625, { effectiveType: "4g" }), RISING_BURN_ART);
  } finally {
    globalThis.window = saved.window;
    if (saved.navigator) Object.defineProperty(globalThis, "navigator", saved.navigator);
  }
});

test("every run starts sharp; a GPU probe during the portal picks the rung; the ladder drops whole layers", async () => {
  assert.ok(412 * 915 <= RISING_COMPACT_PIXEL_BUDGET, "Pixel: one pixel per CSS pixel");
  // A burn frame within the budget keeps rung 0 (the desktop's too: 1145 x 716
  // for a 1440 x 900 window, more pixels across than the 1024 px texture).
  assert.equal(risingProbeRung(0), 0);
  assert.equal(risingProbeRung(Number.NaN), 0, "no probe: no change");
  assert.equal(risingProbeRung(RISING_PROBE_BUDGET_MS), 0);
  // A slow GPU moves to the first resolution-only rung whose pixels fit.
  const area = (rung) => RISING_RESOLUTION_RUNGS[rung] ** 2;
  for (const ms of [9, 12, 16, 24, 40, 80]) {
    const rung = risingProbeRung(ms);
    assert.ok(rung >= 1 && rung <= RISING_RESOLUTION_RUNGS.length - 1, `${ms} ms -> ${rung}`);
    const fits = ms * area(rung) <= RISING_PROBE_BUDGET_MS;
    assert.ok(fits || rung === RISING_RESOLUTION_RUNGS.length - 1, `${ms} ms -> ${rung}`);
    if (rung > 1) assert.ok(ms * area(rung - 1) > RISING_PROBE_BUDGET_MS, `${ms} ms -> ${rung}`);
  }
  assert.equal(
    risingProbeRung(80),
    RISING_RESOLUTION_RUNGS.length - 1,
    "never past the last resize",
  );
  const fire = stripComments(await read("src/components/world/rising-fire.ts"));
  assert.match(fire, /this\.rung = 0;/);
  assert.match(fire, /const rung = risingProbeRung\(frameMs, this\.rung\);/);
  // The probe times one burn frame with a synchronous readPixels, less the
  // round trip on its own, each step in its own task.
  assert.match(fire, /gl\.readPixels\(0, 0, 1, 1, gl\.RGBA, gl\.UNSIGNED_BYTE, pixel\)/);
  assert.match(fire, /performance\.now\(\) - started - roundTrip/);
  assert.match(fire, /window\.setTimeout\(resolve, 0\)/);
  for (const [index, scale] of RISING_RESOLUTION_RUNGS.entries()) {
    assert.match(fire, new RegExp(`scale: RISING_RESOLUTION_RUNGS\\[${index}\\]`), String(scale));
  }
  // The sequence probes before the canvas shows, and puts frame 0 back. The
  // probe yields between its steps, and the context-lost listener only comes
  // after it: a context lost meanwhile falls back to the calm tier instead of
  // playing on a dead canvas.
  const sequence = stripComments(await read("src/components/world/rising-sequence.ts"));
  assert.match(
    sequence,
    /stats\.probeMs = await active\.probe\(\);\s*if \(stale\(\)\) return;\s*(?:\/\/[^\n]*\n\s*)*if \(active\.lost\) throw new Error\("context-lost"\);\s*active\.render\(0\);/,
  );
  assert.ok(
    sequence.indexOf("if (active.lost)") <
      sequence.indexOf('canvas.addEventListener("webglcontextlost", onContextLost)'),
  );
  // The last rungs buy GPU time: the second spark layer, the embers, the ash,
  // the haze and the smoke's detail go at octaves 3; smoke and sparks at 2.
  const shader = await read("src/components/world/rising.frag.glsl");
  const gated = (source, needle) => {
    const at = source.indexOf(needle);
    assert.ok(at > 0, needle);
    const before = source.slice(0, at);
    const open = [...before.matchAll(/#if OCTAVES >= (\d)|#endif/g)];
    const stack = [];
    for (const [token, level] of open) {
      if (token === "#endif") stack.pop();
      else stack.push(Number(level));
    }
    return Math.max(0, ...stack);
  };
  assert.equal(gated(shader, "ashSheet(p"), 4);
  assert.equal(gated(shader, "ashLayer(fq"), 4);
  assert.equal(gated(shader, "sparkLayer(p + vec2(0.31"), 4);
  assert.equal(gated(shader, "sparkLayer(p + vec2(0.13"), 4);
  assert.equal(gated(shader, "haze = hn *"), 4);
  assert.equal(gated(shader, "vec2 sp = sparkLayer(p,"), 3);
  assert.equal(gated(shader, "cf = nz("), 3);
  const flames = await read("src/components/world/rising-flames.frag.glsl");
  assert.equal(gated(flames, "float below = nz("), 4);
  assert.equal(gated(flames, "float s1 = nz("), 3);
  assert.equal(gated(flames, "float n2 = nz("), 3);
});

test("review 2026-09-24: char that cools slowly, lit smoke, a clean breakthrough, sparks, haze", async () => {
  const shader = await read("src/components/world/rising.frag.glsl");
  // The char glows and cools over seconds since the front passed (the front
  // climbs about 0.23 field units a second), not within a thin band behind it.
  assert.match(shader, /float since = max\(-d, 0\.0\) \* 4\.3;/);
  assert.match(shader, /float cool = exp\(-since \* 0\.55\);/);
  assert.doesNotMatch(shader, /exp\(-age \* 4\.2\)/);
  // Smoke is a lit medium that veils (at most about 0.6), not a black multiply.
  const veil = Number(shader.match(/col = mix\(col, smokeCol, smoke \* ([\d.]+)\);/)[1]);
  assert.ok(veil <= 0.65, String(veil));
  // Its shadowed side is still lighter than black (and than the night road).
  const base = shader
    .match(/smokeCol = mix\(vec3\(([\d.]+), ([\d.]+), ([\d.]+)\)/)
    .slice(1)
    .map(Number);
  assert.ok(Math.min(...base) >= 0.07, `smoke base ${base}`);
  // Blur taps jittered per pixel and per frame by white noise (fine moving
  // grain: no ghost copies, and no diagonal weave), stratified per tap.
  assert.match(shader, /float grain = hash12\(gl_FragCoord\.xy \+ fract\(T \* [\d.]+\) \* vec2\(/);
  assert.match(shader, /float k = \(float\(i\) \+ jitter\) \/ float\(BLUR_TAPS\);/);
  assert.doesNotMatch(shader, /52\.9829189/, "interleaved gradient noise weaves at the upscale");
  // The bloom multiplies what is lit (blacks stay black) and the breakthrough
  // opens from the core instead of popping from one zoom to the other.
  assert.match(shader, /col \*= 1\.0 \+ vec3\([\d., ]+\) \* bloom;/);
  const s = RISING_TIMING.webgl;
  for (let T = s.breakthrough - 0.3; T <= s.breakthrough + 0.5; T += 0.01) {
    const u = risingUniformsAt(T);
    assert.ok(u.uArrive >= 0.8 && u.uArrive <= 1, `uArrive ${u.uArrive} at ${T}`);
  }
  assert.ok(risingUniformsAt(s.breakthrough - 0.2).uOpen === 0);
  assert.ok(risingUniformsAt(s.breakthrough + 0.2).uOpen > 1.2, "open over the whole frame");
  assert.ok(risingUniformsAt(s.breakthrough).uWarp > 0.9, "the opening happens under the bloom");
  // Sparks: the scroll wraps (FP16), wind bends each path, tails are short.
  assert.match(shader, /g\.y -= fract\(uTime \* speed \* cells\.y \/ 16\.0\) \* 16\.0;/);
  assert.match(shader, /id\.y = mod\(id\.y, 16\.0\);/);
  // Dense over the flames, thinning with height: each particle goes out where
  // the share of live cells drops below its hash, so none pops mid-air.
  assert.match(shader, /float alive = smoothstep\(0\.0, 0\.05, h - \(1\.0 - keep\)\) \* twinkle;/);
  const keep = shader.match(/float keep = ([\d.]+) \+ ([\d.]+) \* exp\(-rise \/ ([\d.]+)\);/);
  assert.ok(keep, "spark density falls with the height above the fire");
  assert.ok(Number(keep[1]) < 0.15 && Number(keep[1]) + Number(keep[2]) >= 0.4, keep[0]);
  // Heat haze: a narrow band over the flames, mostly vertical, small.
  assert.match(shader, /haze = hn \* vec2\(0\.007, 0\.012\) \* hazeAmt;/);
  assert.match(shader, /exp\(-\(\(hy - 0\.12\) \* \(hy - 0\.12\)\) \/ 0\.02\)/);
  // The step to char is soft enough to survive an upscale, under the lip.
  assert.match(shader, /burnt = fall\(0\.0, -0\.02, d\);/);
});

test("review 3, 2026-09-24: flames rise straight up, capped and translucent; the burn reads as a print", async () => {
  const flames = await read("src/components/world/rising-flames.frag.glsl");
  // Height above the front straight below (three samples of the coarse
  // field, interpolated), not the field distance, which ringed every island.
  for (const offset of ["0.08", "0.2", "0.36"]) {
    assert.match(
      flames,
      new RegExp(`coarseField\\(bq - vec2\\(0\\.0, ${offset.replace(".", "\\.")}\\)\\)`),
    );
  }
  assert.match(
    flames,
    /float hv = g1 <= 0\.0 \? h1 : \(g2 <= 0\.0 \? h2 : \(g3 <= 0\.0 \? h3 : 1\.0\)\);/,
  );
  assert.match(flames, /float h = hv \/ H;/);
  // Capped at about 0.3 screen heights (lower on portrait), and a hard
  // envelope: nothing past 1.3 H, so no stray puffs high above the fire.
  const H = flames.match(
    /float H = \(([\d.]+) \+ ([\d.]+) \* smoothstep[^;]*\(0\.85 \+ ([\d.]+) \* pulse\)/,
  );
  assert.ok(H, "flame height");
  const top = (Number(H[1]) + Number(H[2])) * (0.85 + Number(H[3]));
  assert.ok(top <= 0.34 && Number(H[1]) >= 0.08, `H up to ${top.toFixed(2)}`);
  assert.match(flames, /\* fuel \* fall\(1\.3, 0\.95, h\)/);
  // Opacity from optical depth: thin edges and tips are dim and see-through.
  assert.match(flames, /float flame = 1\.0 - exp\(-6\.0 \* max\(dens, 0\.0\)\);/);
  // A dying flamelet stays orange; only its thin rim runs dull red.
  assert.match(flames, /temp = max\(temp, 0\.47\) - 0\.07 \* fall\(0\.1, 0\.0, dens\);/);
  // Tongue noise stretched upright; some stretches burn low with no sheet at
  // the lip (the scorch shows there); downward-burning edges and thin islands
  // burn low.
  assert.match(flames, /q \* vec2\(2\.4, 0\.9\)/);
  assert.match(flames, /float lively = smoothstep\(/);
  assert.match(flames, /\* lively \* \(1\.0 - downwards\) \* \(1\.0 - island\)/);
  // Smoke: few defined plumes rising off the tallest stretches, denser in
  // their cores; the veil stays about 0.3 outside them.
  assert.match(flames, /float body = smoothstep\(0\.5, 0\.58, sn\);/);
  assert.match(flames, /smoke = body \* \(0\.45 \+ 0\.55 \* thick\) \* envelope;/);
  // The flame pass is half resolution, composited in the main pass.
  const fire = stripComments(await read("src/components/world/rising-fire.ts"));
  assert.match(fire, /export const RISING_FLAME_PASS_SCALE = 0\.5;/);
  assert.match(fire, /import FLAMES_SOURCE from "\.\/rising-flames\.frag\.glsl\?raw";/);
  assert.match(fire, /gl\.bindFramebuffer\(gl\.FRAMEBUFFER, this\.fireFramebuffer\);/);
  // Only while something burns: the dive stays one pass.
  assert.match(fire, /if \(uniforms\.uFlame \+ uniforms\.uBurn > 0\.0001\) \{/);
  assert.match(fire, /gl\.deleteFramebuffer\(this\.fireFramebuffer\)/);

  const shader = await read("src/components/world/rising.frag.glsl");
  assert.match(shader, /uniform sampler2D uFire;/);
  // The breakthrough bloom leans to amber before it multiplies.
  assert.match(shader, /col = mix\(col, lumB \* vec3\(1\.0, 0\.62, 0\.3\), bloom \* 0\.4\);/);
  // Char: two plate sizes, most fissures shut, a minority gaping; the net
  // fades as the art emerges and on coarse rungs instead of stair-stepping.
  assert.match(shader, /float big = smoothstep\(0\.46, 0\.54, lowN\);/);
  assert.match(shader, /float net = smoothstep\([\d.]+, [\d.]+, platePx\) \* \(1\.0 - emerge\);/);
  assert.match(shader, /float open = smoothstep\(0\.58, 0\.7, plateN\)/);
  // Ash sheets: fibrous faces, dark (about 0.15 at most), a broken rim.
  assert.match(shader, /float fibre = 0\.5 \+ /);
  assert.match(
    shader,
    /vec3\(0\.02, 0\.018, 0\.017\) \+ vec3\(0\.13, 0\.122, 0\.115\) \* sheet\.y/,
  );
  // The ember lip glows unevenly along its length.
  assert.match(shader, /float run = 0\.3 \+ 0\.7 \* smoothstep\(/);
  // The ladder's blur taps: 12 in the dive (the burn is off then) on every
  // resolution rung, fewer on the two last resorts. (rising-fire.ts imports
  // GLSL with ?raw, which node cannot load, so the source is read.)
  assert.match(fire, /\{ scale: RISING_RESOLUTION_RUNGS\[0\], octaves: 4, taps: 12 \}/);
  const taps = [...fire.matchAll(/octaves: (\d), taps: (\d+) \}/g)].map((match) =>
    Number(match[2]),
  );
  assert.equal(taps.length, 6, "six rungs");
  assert.deepEqual(taps.slice(0, 4), [12, 12, 12, 12]);
  assert.ok(taps[4] < 12 && taps[5] < taps[4], String(taps));
});

test("review 3: the calm tier's front re-forms halfway up, burning forward only, with a scorch", async () => {
  const first = burnEdge(CALM_EDGE_SEED);
  const second = burnEdge(CALM_EDGE_SEED_B);
  const ahead = calmEdgeAhead();
  // Same mean depth, a different shape.
  const mean = (ys) => ys.reduce((sum, y) => sum + y, 0) / ys.length;
  assert.ok(Math.abs(mean(first.ys) - mean(second.ys)) < 6);
  const differs = first.ys.filter((y, index) => Math.abs(y - second.ys[index]) > 30).length;
  assert.ok(differs > first.ys.length / 3, `${differs} of ${first.ys.length} points differ`);
  // Never behind the first front (y is down): fading it in only burns forward.
  for (const [index, y] of ahead.ys.entries()) assert.ok(y <= first.ys[index] + 1e-9);
  for (const y of ahead.ys)
    assert.ok(y > CALM_EDGE_STRIP.top + 30 && y < CALM_EDGE_STRIP.bottom - 60, String(y));
  // The seats slide up onto the re-formed lip, never down.
  for (const seat of CALM_FLAME_SEATS) assert.ok(seat.dipB <= seat.dip, JSON.stringify(seat));
  const sequence = stripComments(await read("src/components/world/rising-sequence.ts"));
  assert.match(
    sequence,
    /for \(const element of reformed\) add\(element, \[\{ opacity: 0 \}, \{ opacity: 1 \}\], reform\);/,
  );
  assert.match(
    sequence,
    /add\(seat, \[\{ translate: "-50% 0" \}, \{ translate: `-50% \$\{shift\}cqh` \}\], reform\);/,
  );
  // The scorch sits under the flames, which sit under the strip.
  const component = await read("src/components/world/rising-world.tsx");
  const calmFire = component.slice(
    component.indexOf("const CalmFire"),
    component.indexOf("export function RisingWorld"),
  );
  const at = (name) => calmFire.indexOf(`className="${name}"`);
  assert.ok(at("rw-calm-scorch") > 0 && at("rw-calm-scorch") < at("rw-calm-flames"));
  assert.ok(at("rw-calm-flames") < at("rw-calm-char"));
  assert.match(
    sequence,
    /const edge = \[find\("\.rw-calm-scorch"\), find\("\.rw-calm-char"\), find\("\.rw-calm-flames"\)\];/,
  );
  const renderer = await read("scripts/render-rising-calm-sprites.mjs");
  assert.match(renderer, /\[burnEdge\(CALM_EDGE_SEED\)\.ys, calmEdgeAhead\(\)\.ys\]/);
  assert.match(renderer, /const SCORCH = /);
});
