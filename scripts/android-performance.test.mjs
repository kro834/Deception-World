import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { prefersLightweightRendering } from "../src/lib/rendering-profile.js";

const PIXEL_9 =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";
const GALAXY_S24 =
  "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";
const SAMSUNG_INTERNET =
  "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36";
const WEBVIEW =
  "Mozilla/5.0 (Linux; Android 12; SM-A536B; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.0.0 Mobile Safari/537.36";

const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("capable Android Chrome, Samsung Internet and WebView keep the full renderer", () => {
  for (const userAgent of [PIXEL_9, GALAXY_S24, SAMSUNG_INTERNET, WEBVIEW]) {
    for (const hardwareConcurrency of [6, 8, 9, 10]) {
      assert.equal(
        prefersLightweightRendering({ userAgent, deviceMemory: 8, hardwareConcurrency }),
        false,
        `${userAgent} ${hardwareConcurrency}`,
      );
    }
  }
  // Chrome may withhold the hints entirely; the model name never decides.
  assert.equal(prefersLightweightRendering({ userAgent: PIXEL_9 }), false);
});

test("weak Android hardware and constrained networks select the lightweight renderer", () => {
  for (const hints of [
    { hardwareConcurrency: 4, deviceMemory: 4 },
    { hardwareConcurrency: 4, deviceMemory: 8 },
    { hardwareConcurrency: 2 },
    { hardwareConcurrency: 8, deviceMemory: 2 },
    { hardwareConcurrency: 8, deviceMemory: 8, connection: { saveData: true } },
    { hardwareConcurrency: 8, deviceMemory: 8, connection: { effectiveType: "2g" } },
    { hardwareConcurrency: 8, deviceMemory: 8, connection: { effectiveType: "slow-2g" } },
  ]) {
    for (const userAgent of [PIXEL_9, SAMSUNG_INTERNET, WEBVIEW]) {
      assert.equal(
        prefersLightweightRendering({ userAgent, ...hints }),
        true,
        `${userAgent} ${JSON.stringify(hints)}`,
      );
    }
  }
});

test("iPhone, iPad and desktop keep the full renderer without resource constraints", () => {
  for (const userAgent of [
    "iPhone OS 26",
    "iPad; CPU OS 27",
    "Macintosh; Intel Mac OS X",
    "Windows NT 10.0",
  ]) {
    assert.equal(prefersLightweightRendering({ userAgent, hardwareConcurrency: 8 }), false);
  }
  // Four cores is a weak-Android signal only; it says nothing about a desktop.
  assert.equal(
    prefersLightweightRendering({ userAgent: "Windows NT 10.0", hardwareConcurrency: 4 }),
    false,
  );
});

test("resource hints still select the lightweight renderer independently of platform", () => {
  for (const hints of [
    { deviceMemory: 2 },
    { hardwareConcurrency: 2 },
    { connection: { saveData: true } },
    { connection: { effectiveType: "2g" } },
  ]) {
    assert.equal(prefersLightweightRendering(hints), true);
  }
  assert.equal(prefersLightweightRendering({}), false);
});

test("lightweight glass exits before shader setup and texture generation", () => {
  const source = readSource("src/lib/liquid/boot.js");
  assert.match(
    source,
    /activate\(root\) \{[\s\S]*?prefersLightweightRendering\(navigator\)[\s\S]*?return false;[\s\S]*?this\.ensure\(\)/,
  );
});

test("frosted controls keep capable Android on the CSS lens (no WebGL)", () => {
  assert.match(readSource("src/styles-frosted-controls.css"), /:root \{\s*--liquid-frosted: 1;/);
  assert.match(
    readSource("src/lib/liquid/boot.js"),
    /activate\(root\) \{[\s\S]*?--liquid-frosted'\)\.trim\(\) === '1'\)[\s\S]*?return false;[\s\S]*?this\.ensure\(\)/,
  );
});

test("Android keeps compositor-driven reading progress, independent of economy", () => {
  const mode = readSource("src/components/world/use-world-mode.ts");
  const supports = mode.match(/const supportsNativeProgress =([\s\S]*?);/)?.[1] ?? "";
  assert.match(supports, /\/Android\/i\.test\(userAgent\)/);
  assert.doesNotMatch(supports, /economy/i);
  const css = readSource("src/styles-android-performance.css");
  assert.match(
    css,
    /html\[data-native-scroll-progress="true"\][\s\S]*?animation-timeline: scroll\(root block\)/,
  );
  // One line: wherever Motion draws its compositor-driven prism (::before),
  // the hairline goes, on the native and the script path alike, so capable
  // Android shows the same line as iOS. The prism itself is never hidden.
  assert.match(
    css,
    /html:not\(\[data-world-effects="economy"\]\)\s*\.site-shell\.film-edition\.motion-on\s*\.topbar::after \{\s*content: none;/,
  );
  assert.doesNotMatch(css, /\.topbar::before \{\s*content: none;/);
  const motion = readSource("src/styles-motion-edition.css");
  assert.match(
    motion,
    /html:not\(\[data-world-effects="economy"\]\) \.site-shell\.film-edition\.motion-on \.topbar::before \{[\s\S]*?animation-timeline: scroll\(root block\);/,
  );
});

test("capable Android keeps the key art and the Mirage boot; only economy freezes decoration", () => {
  const css = readSource("src/styles-android-performance.css");
  const hidden =
    css.match(
      /html\[data-android-renderer\]\s*:is\(([^)]*)\)\s*\{\s*display: none !important;/,
    )?.[1] ?? "";
  assert.match(hidden, /\.grain/);
  assert.doesNotMatch(hidden, /\.hero-backdrop-layer/);
  // Every animation freeze (it used to stop the boot's mr-project beat on
  // .poster-media) is scoped to weak Android.
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const freezes = [...rules.matchAll(/([^{}]+)\{[^{}]*animation: none !important;/g)];
  assert.ok(freezes.length > 0);
  for (const [, selector] of freezes) {
    assert.match(selector, /html\[data-android-renderer\]/);
    assert.doesNotMatch(
      selector,
      /html\[data-android-renderer\](?!\[data-world-effects="economy"\])/,
      selector,
    );
  }
});

test("the Android lite tier touches only the floor, halo, curtains, bracket overlays, clip-path reveals and iris", () => {
  const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
  const mirage = readSource("src/styles-world-mirage.css");
  const header = mirage.indexOf("   Android lite tier\n");
  assert.ok(header > 0);
  const tier = strip(mirage.slice(mirage.lastIndexOf("/*", header)));
  const rules = [...tier.matchAll(/(?<=^|[{};])\s*([^{};@\s][^{};]*)\{([^{}]*)\}/g)]
    .map((match) => ({ selector: match[1].trim().replace(/\s+/g, " "), body: match[2].trim() }))
    .filter(({ selector }) => !/^(?:from|to|[\d.]+%)$/.test(selector));
  const changes = rules.map(({ selector, body }) => {
    const target = selector.slice(selector.indexOf(".site-shell.film-edition.mirage-edition") + 40);
    const properties = [...body.matchAll(/(?:^|;)\s*([\w-]+):/g)].map((match) => match[1]);
    return `${target} {${properties.join(",")}}`;
  });
  assert.deepEqual(changes, [
    ".mr-hero-floor {display}",
    ".mr-hero-beam {mix-blend-mode}",
    ".poster-frame {box-shadow}",
    ":is(.story-section, .riders-section, .records-section)::after {display}",
    ":is(.story-layout, .threat-panel, .world-column, .episode-archive, .rider-console)::after {content}",
    ".story-layout {background,background-repeat,background-origin}",
    ".threat-panel {background,background-repeat}",
    ".world-column {background,background-repeat}",
    ".rider-console {background,background-repeat,background-origin}",
    ".topbar {box-shadow,transition}",
    ":is(.story-layout, .threat-panel, .world-column) {background,background-repeat}",
    ".rider-console {background,background-repeat}",
    ":is( .section-index > small, .story-heading .eyebrow > span, .records-heading .eyebrow > span ) {animation,animation-timeline,animation-range}",
    ".section-title .eyebrow > span {animation}",
    ".threat-copy h3 {animation,animation-timeline,animation-range}",
    ".threat-copy .system-label {animation,animation-timeline,animation-range}",
    ":is(.signal > img, .other-archive-card > img, .dante-visual img) {animation}",
    ".finale-sticky::before {animation}",
    ".finale-content > span {animation,animation-timeline,animation-range}",
    ".mr-endmark :is(span, b) {animation,animation-timeline,animation-range}",
  ]);
  // Every clip-path reveal it replaces keeps its timeline and range, on the compositor.
  for (const { body } of rules) {
    const name = body.match(/animation: (mr-[\w-]+) /)?.[1];
    if (name) assert.equal(name, "mr-rise-in", body);
  }
  assert.match(
    tier,
    /@keyframes mr-rise-in \{\s*from \{\s*opacity: 0;\s*translate: 0 8px;\s*\}\s*\}/,
  );
  // The boot, the key art and the typed headings and copy are the same on every renderer.
  const boot = strip(
    mirage.slice(mirage.indexOf("Boot: finite"), mirage.indexOf("Scroll-linked choreography")),
  );
  assert.doesNotMatch(boot, /data-android-renderer/);
  assert.doesNotMatch(
    tier,
    /hero-backdrop|poster-media|poster-image|mr-word|mr-redact|tr-c|data-text-reveal/,
  );
  // Motion keeps every timeline; the panels only lose their fade and the finale art its settle.
  const motion = strip(readSource("src/styles-motion-edition.css"));
  const android = [...motion.matchAll(/\[data-android-renderer\]([^{]*)\{([^}]*)\}/g)].map(
    (match) => `${match[1].trim().replace(/\s+/g, " ")} {${match[2].trim()}}`,
  );
  assert.deepEqual(android, [
    ".site-shell.film-edition.motion-on :is(.story-layout, .threat-panel, .world-column, .rider-console, .episode-archive) {animation-name: mx-lift-flat;}",
    ".site-shell.film-edition.motion-on .finale-backdrop img {animation: none;}",
  ]);
});

test("Android keeps the edge stretch and uses small-viewport min-heights", () => {
  const css = readSource("src/styles-world/18.css");
  const root = css.match(/html\[data-android-renderer\] \{([^}]*)\}/)?.[1] ?? "";
  assert.match(root, /overscroll-behavior-y: contain;/);
  assert.doesNotMatch(css, /html\[data-android-renderer\][^{]*\{[^}]*overscroll-behavior-y: none/);
  assert.doesNotMatch(css, /html\[data-android-renderer\][^{]*\{[^}]*min-height: 100dvh/);
});

test("the Android display fixes stay pinned", () => {
  // Unblurred finale key art (a blurred full-screen layer rastered late on phones).
  const scene = readSource("src/styles-world/07.css");
  const start = scene.indexOf(".finale-backdrop img {");
  const finale = scene.slice(start, scene.indexOf("}", start));
  assert.ok(start >= 0);
  assert.doesNotMatch(finale, /filter:\s*blur\(/);
  assert.match(finale, /filter: saturate\(1\.1\);/);
  // Samsung Internet's forced dark mode leaves the dark page alone.
  assert.match(readSource("src/routes/__root.tsx"), /\{ name: "color-scheme", content: "dark" \}/);
  assert.match(
    readSource("src/styles.css"),
    /@media \(prefers-color-scheme: dark\) \{\s*:root \{\s*color-scheme: dark;/,
  );
  // Touch browsers keep :hover after a tap: the pickup plus hovers only on a real hover.
  const pickup = readSource("src/styles-pickup-visibility.css");
  assert.doesNotMatch(pickup, /\.episode-pickup-plus:hover,/);
  assert.match(
    pickup,
    /@media \(hover: hover\) \{\s*:where\(html body\) \.episode-pickup-plus:hover \{/,
  );
  // The column rail labels fit at 360-440px (checked in a browser by verify-column-frame).
  assert.match(
    readSource("src/styles-world-addon.css"),
    /@media \(max-width: 440px\) \{[\s\S]*?\.world-column-tabs\.liquid-swipe-tabs > button\[role="tab"\] b \{[^}]*letter-spacing: 0;[^}]*"palt"/,
  );
});
