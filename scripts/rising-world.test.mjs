import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { hasConstrainedResources } from "../src/lib/rendering-profile.js";
import {
  RISING_ART_ASPECT,
  RISING_READY_TIMEOUT_MS,
  RISING_TIMING,
  RISING_WORLD_FOCUS,
  RISING_WORLD_POSITION,
  pickRisingTier,
  portalEase,
  risingFramesPerDraw,
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
  assert.ok(markup.includes("<dialog") && markup.includes("rw-calm-defs"));
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
  const shader = await read("src/components/world/rising.frag.glsl");
  assert.match(shader, /#ifdef GL_FRAGMENT_PRECISION_HIGH\s+precision highp float;/);
  for (const [, a, b] of shader.matchAll(/smoothstep\((-?[\d.]+),\s*(-?[\d.]+)/g)) {
    assert.ok(Number(a) < Number(b), `smoothstep(${a}, ${b}) is undefined in GLSL ES 1.00`);
  }
  // The Hoskins hash (no large sin() products that collapse at FP16).
  assert.match(shader, /fract\(vec3\(p\.xyx\) \* 0\.1031\)/);
  assert.doesNotMatch(shader, /sin\([^)]*43758/);
  assert.match(shader, /uniform float uHeat;/);
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
  // One image upload path (resized bitmaps), plus the noise tile's storage,
  // which is allocated empty (null) and filled on the GPU by the bake.
  assert.equal([...fire.matchAll(/texImage2D\(/g)].length, 2, "image upload + noise target");
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
    "html:not([data-side-menu-open]):not([data-rail-lock]):not([data-loading]):not(:has(dialog[open]))";
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
  // The same compact test as the renderer's pixel budget (rising-sequence.ts).
  assert.match(art, /\(any-pointer: coarse\)"\)\.matches \|\| window\.innerWidth < 760/);
  const sequence = await read("src/components/world/rising-sequence.ts");
  assert.match(sequence, /\(any-pointer: coarse\)"\)\.matches \|\| window\.innerWidth < 760/);
  assert.doesNotMatch(art, /^import /m, "static and dependency-free");
  const component = await read("src/components/world/rising-world.tsx");
  assert.match(component, /import \{ RISING_BURN_ART, risingBurnArt \} from "\.\/rising-art";/);
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
  const shader = await read("src/components/world/rising.frag.glsl");
  assert.match(shader, /uniform sampler2D uNoise;/);
  // Scroll offsets wrap (fract), so FP16 texture coordinates never lose the tile.
  for (const [offset] of shader.matchAll(/-fract\(T \* [\d.]+\)/g)) assert.ok(offset);
  assert.doesNotMatch(shader, /nz\([^;]*[-+] T \*/, "unwrapped time offsets in a noise fetch");
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

test("the calm tier's fire: compositor-only, finite, and off under reduced motion", async () => {
  const sequence = stripComments(await read("src/components/world/rising-sequence.ts"));
  const calm = sequence.slice(sequence.indexOf('if (tier === "css") {'));
  const block = calm.slice(0, calm.indexOf("\n    add(calm, ["));
  // Keyframes move only transform parts and opacity (the compositor runs
  // them); fill is a timing option (a smoke billow's later rounds fill forwards only).
  const options = ["offset", "delay", "duration", "easing", "fill", "length"];
  for (const [, property] of block.matchAll(/[{,]\s*([a-zA-Z]+):/g)) {
    assert.ok(["opacity", "scale", "translate", "rotate", ...options].includes(property), property);
  }
  for (const group of ["tongues", "embers", "puffs"])
    assert.match(block, new RegExp(`${group}\\.forEach`));
  assert.match(block, /add\(edgeA, /);
  assert.match(block, /add\(edgeB, /);
  assert.match(block, /fill: round \? "forwards" : "both"/);
  assert.doesNotMatch(block, /iterations/);
  const css = await readCss();
  assert.match(
    css,
    /\.rw-viewport\[data-tier="reduced"\]\s*:is\(\.rw-calm-flames, \.rw-calm-smoke, \.rw-calm-embers\) \{\s*display: none;/,
  );
  // The char under the burn layer never lets its bottom edge rise into view.
  assert.match(css, /\.rw-calm-burn::after \{[^}]*top: 99\.5%;[^}]*background: #070203;/);
  // Tongue roots fade into the ember bed; landscape deepens the tears, and the
  // tongues are seated with the same factor.
  assert.match(
    css,
    /\.rw-calm-flames i \{[^}]*(?<!-webkit-)mask-image: linear-gradient\(0deg, transparent, #000 24%\);/,
  );
  assert.match(css, /\.rw-calm-char > svg \{[^}]*transform: scaleY\(var\(--rw-edge-k\)\);/);
  assert.match(
    css,
    /@media \(min-aspect-ratio: 1\/1\) \{\s*\.site-shell\.film-edition\.mirage-edition \.rw-calm-burn \{\s*--rw-edge-k: 1\.8;/,
  );
  const component = await read("src/components/world/rising-world.tsx");
  // Two fractal edges from fixed seeds (the server render and every run agree),
  // each carrying its tongues, drawn from three shared flame symbols.
  assert.match(component, /burnEdge\(edgeIndex \? 0x51c3 : 0x2b17\)/);
  assert.doesNotMatch(component.slice(component.indexOf("function burnEdge")), /Math\.random\(/);
  assert.match(component, /className=\{`rw-calm-char rw-calm-char-\$\{id\}`\}/);
  assert.match(component, /bottom: `calc\(80\.5% - \$\{dip\}% \* var\(--rw-edge-k\)\)`/);
  assert.match(component, /<use href=\{`#rw-flame-\$\{shape\}`\} fill="url\(#rw-flame-body\)" \/>/);
  assert.equal([...component.matchAll(/^ {2}"M[\d .CMZ-]+Z",$/gm)].length, 3, "three flame shapes");
});
