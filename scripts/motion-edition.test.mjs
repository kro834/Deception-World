import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const readCss = async () =>
  (await read("src/styles-motion-edition.css")).replace(/\/\*[\s\S]*?\*\//g, "");

test("motion layer is linked by the four story routes, before the cinematic sheet", async () => {
  for (const route of ["rexonance-saga", "extreme-saga", "final-stage", "world"]) {
    const source = await read(`src/routes/${route}.tsx`);
    assert.match(source, /styles-motion-edition\.css\?url/, route);
    const links = source.slice(source.search(/(?:stylesheetLinks|links):\s*\[/));
    const motion = links.indexOf("href: motionEditionCssUrl");
    assert.ok(motion > 0, route);
    const cinematic = links.indexOf("CINEMATIC_STYLESHEET_LINK");
    if (cinematic >= 0) assert.ok(motion < cinematic, route);
  }
  for (const path of [
    "src/lib/world-head.ts",
    "src/routes/__root.tsx",
    "src/routes/dream-chapter.tsx",
  ]) {
    assert.doesNotMatch(await read(path), /motionEdition|motion-edition/);
  }
});

test("every animation is scroll-linked, gated and finite", async () => {
  const css = await readCss();
  const gate = css.indexOf("@supports (animation-timeline: view())");
  assert.ok(gate > 0);
  assert.match(
    css.slice(gate),
    /^@supports[^{]*\{\s*@media \(prefers-reduced-motion: no-preference\)/,
  );
  // Outside the gate only the legacy loops are switched off.
  const outside = css.slice(0, gate);
  assert.doesNotMatch(outside, /animation:(?!\s*none)/);
  const rules = [...css.matchAll(/animation:\s*([^;]+);/g)].map((match) => match[1]);
  assert.ok(rules.length >= 15);
  for (const rule of rules.filter((rule) => rule !== "none")) {
    assert.doesNotMatch(rule, /infinite|\d+m?s\b/, rule);
  }
  const timelines =
    css.match(/animation-timeline:\s*(?:view\(block\)|scroll\(root block\)|--mx-[\w-]+)/g) ?? [];
  assert.equal(timelines.length, rules.filter((rule) => rule !== "none").length);
  assert.doesNotMatch(css, /touch-action:|overscroll-behavior:|backdrop-filter:|(?<!-)filter\s*:/);
  assert.doesNotMatch(css, /pointer-events:(?!\s*none)/);
});

test("motion is withheld in economy rendering and until each page grants it", async () => {
  const css = await readCss();
  const gate = css.slice(css.indexOf("@supports"));
  const selectors = [...gate.matchAll(/[{};]\s*([^{};@]+)\{/g)]
    .map((match) => match[1].trim())
    .filter((selector) => !/^(?:from|to|\d+%)$/.test(selector));
  assert.ok(selectors.length > 15);
  for (const group of selectors) {
    for (const selector of group.split(/,(?![^(]*\))/).map((part) => part.trim())) {
      assert.match(selector, /^html:not\(\[data-world-effects="economy"\]\)/, selector);
      assert.match(
        selector,
        /\.rxs-page(?:\.exs-page)?\[data-motion-ready="true"\]|\.site-shell\.film-edition\.motion-on/,
        selector,
      );
    }
  }
});

test("keyframes animate only compositor properties", async () => {
  const css = await readCss();
  const keyframes = [...css.matchAll(/@keyframes\s+(mx-[\w-]+)\s*\{([\s\S]*?\})\s*\}/g)];
  assert.ok(keyframes.length >= 8);
  for (const [, name, body] of keyframes) {
    for (const [, property] of body.matchAll(/([\w-]+)\s*:/g)) {
      assert.ok(["opacity", "translate", "scale"].includes(property), `${name}: ${property}`);
    }
  }
});

test("elements that already own motion or measured geometry are left alone", async () => {
  const css = await readCss();
  for (const owned of [
    /\.rxs-hero-visual\s*\{/,
    /\.rxs-section-heading\s*\{/,
    /\.rxs-section-heading\.rxs-reveal/,
    /\.rxs-stage-panel\s*>\s*div/,
    /\.rxs-stage-panel figure\s*(?:>|\{)/,
    /\.rxs-stage-scan/,
    /\.rxs-comparison-metrics/,
    /\.rxs-p14-metrics/,
    /\.rxs-p14-overview\s*(?:figure\s*)?\{/,
    /\.rxs-stage-tabs|\.liquid-/,
    /\.rxs-local-nav-inner|\.rxs-menu-trigger/,
    /data-film-reveal|\.film-hero-identity|\.section-index|\.hero h1/,
    /\.rider-visual|\.world-column-copy|\.poster-/,
  ]) {
    assert.doesNotMatch(css, owned, String(owned));
  }
});

test("World timelines follow the page, not a clipping panel", async () => {
  const css = await readCss();
  // Anonymous view() binds to the nearest scroll container; these panels clip instead.
  assert.match(
    css,
    /:is\(\.hero, \.threat-panel, \.episode-archive\) \{\s*overflow: hidden;\s*overflow: clip;/,
  );
  assert.match(css, /\.episode-grid \{\s*view-timeline: --mx-episodes block;/);
  assert.match(css, /\.episode-card \{[^}]*animation-timeline: --mx-episodes;/);
  assert.match(css, /\.finale-sticky \{\s*view-timeline: --mx-finale block;/);
  assert.match(css, /\.finale-content \{[^}]*animation-timeline: --mx-finale;/);
  assert.match(css, /\.finale-backdrop\s+img \{[^}]*animation-timeline: --mx-finale;/);
  // The sticky stage keeps its own overflow; only its timeline is named.
  assert.doesNotMatch(css, /finale-sticky[^{]*\{[^}]*overflow:/);
  for (const [, name] of css.matchAll(/animation-timeline:\s*(--[\w-]+)/g)) {
    assert.match(css, new RegExp(`view-timeline: ${name} block`), name);
  }
});
