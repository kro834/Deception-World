import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const readCss = async (path) => (await read(path)).replace(/\/\*[\s\S]*?\*\//g, "");

test("showcase layer is linked by both saga routes after their own skin and before the cinematic sheet", async () => {
  for (const [route, own] of [
    ["rexonance-saga", "resonanceMotionCssUrl"],
    ["extreme-saga", "extremeSagaCssUrl"],
  ]) {
    const source = await read(`src/routes/${route}.tsx`);
    assert.match(source, /styles-saga-showcase\.css\?url/);
    const links = source.slice(source.search(/links:\s*\[/));
    const showcase = links.indexOf("href: sagaShowcaseCssUrl");
    assert.ok(links.indexOf(`href: ${own}`) < showcase, route);
    assert.ok(showcase < links.indexOf("CINEMATIC_STYLESHEET_LINK"), route);
  }
  for (const path of [
    "src/lib/world-head.ts",
    "src/routes/final-stage.tsx",
    "src/routes/world.tsx",
    "src/routes/dream-chapter.tsx",
    "src/routes/__root.tsx",
  ]) {
    assert.doesNotMatch(await read(path), /sagaShowcase|saga-showcase/);
  }
});

test("showcase is a static skin: no motion, media, blur or gesture ownership", async () => {
  const css = await readCss("src/styles-saga-showcase.css");
  assert.doesNotMatch(
    css,
    /touch-action:|overscroll-behavior:|scroll-snap-|animation|@keyframes|url\(|(?<!-)filter\s*:(?!\s*none)|pointer-events\s*:/,
  );
  assert.doesNotMatch(css, /backdrop-filter:/);
  assert.match(css, /focus-visible/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /@media \(prefers-contrast: more\), \(prefers-reduced-transparency: reduce\)/);
});

test("showcase outranks the cinematic sheet and never restyles Final Stage", async () => {
  const css = await readCss("src/styles-saga-showcase.css");
  // A selector is whatever sits between a brace and the next "{" without a
  // declaration or at-rule in between.
  const selectors = [...`}${css}`.matchAll(/[{}]\s*([^{};@]+)\{/g)].flatMap((match) =>
    match[1].split(",").map((selector) => selector.trim()),
  );
  assert.ok(selectors.length > 40);
  for (const selector of selectors) {
    assert.match(selector, /^\.rxs-page\.rxs-page/, selector);
  }
  assert.doesNotMatch(css, /\.fst-/);
  assert.match(css, /\.rxs-page\.rxs-page\.exs-page\s*\{[^}]*--rxs-cyan/);
});

test("showcase leaves rail, slider, select, nav and landscape hero geometry to the earlier sheets", async () => {
  const css = await readCss("src/styles-saga-showcase.css");
  assert.doesNotMatch(css, /\.liquid-(?:selection-lens|rail-surface|selection-surface)/);
  const geometry =
    /\b(?:width|height|min-width|min-height|max-width|padding|margin|gap|grid-template-columns|display|flex|font-size|font|appearance|inset|top|right|bottom|left|position|transform|translate|scale)\s*:/;
  const guarded = css.match(
    /\.rxs-page\.rxs-page[^{]*(?:\.rxs-stage-tabs|\.rxs-p14-ios-(?:slider|track|thumb)|\.rxs-comparison-selector select|\.rxs-p14-native-select select|\.rxs-p14-range-labels button|\.rxs-local-nav-inner|\.rxs-menu-trigger)[^{]*\{[^}]*\}/g,
  );
  assert.ok(guarded && guarded.length >= 6);
  for (const block of guarded) assert.doesNotMatch(block, geometry, block);
  // !important is reserved for the menu trigger, whose frosted material is
  // forced by the root sheet the same way.
  assert.doesNotMatch(css.replace(/\.rxs-menu-trigger[^}]*\}/g, ""), /!important/);
  // The 761–1440 landscape hero grid is measured by verify-cinematic-edition;
  // the column hero applies only outside that range.
  const columnHero = css.match(/@media \(max-width: 760px\),[\s\S]*?\{[\s\S]*?\.rxs-hero \{/);
  assert.ok(columnHero);
  assert.match(columnHero[0], /\(min-width: 1441px\)/);
  assert.match(columnHero[0], /\(orientation: portrait\)/);
});

test("showcase keeps readable floors and the two-neutral palette", async () => {
  const css = await readCss("src/styles-saga-showcase.css");
  assert.doesNotMatch(css, /font-size:\s*(?:[0-9]|1[01])(?:\.\d+)?px\b/);
  // Two neutrals stay; the elevation sheet adds one accent light per site (documented exception).
  assert.match(css, /--sc-ink: #000;/);
  assert.match(css, /--sc-tile: #1d1d1f;/);
  assert.match(css, /--sc-secondary: #86868b;/);
  assert.doesNotMatch(css, /text-shadow:(?!\s*none)/);
});

// Style rules with their at-rule context, and keyframe blocks by name.
const parseCss = (source) => {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const flat = (text) =>
    text.replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").trim();
  const rules = [];
  const keyframes = [];
  const stack = [];
  let prelude = "";
  for (let index = 0; index < css.length; index += 1) {
    const character = css[index];
    if (character === "{") {
      const head = flat(prelude);
      prelude = "";
      const frames = head.match(/^@keyframes\s+([\w-]+)$/);
      if (frames) {
        let depth = 1;
        let end = index + 1;
        for (; end < css.length && depth > 0; end += 1) {
          if (css[end] === "{") depth += 1;
          if (css[end] === "}") depth -= 1;
        }
        keyframes.push({ name: frames[1], body: css.slice(index + 1, end - 1) });
        index = end - 1;
        continue;
      }
      if (head.startsWith("@")) {
        stack.push(head);
        continue;
      }
      const end = css.indexOf("}", index);
      rules.push({ selector: head, body: css.slice(index + 1, end), context: [...stack] });
      index = end;
      continue;
    }
    if (character === "}") {
      stack.pop();
      prelude = "";
    } else if (character === ";") prelude = "";
    else prelude += character;
  }
  return { rules, keyframes };
};

const splitTopLevel = (value) => {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const character of value) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (character === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else current += character;
  }
  return [...parts, current.trim()].filter(Boolean);
};

const declarations = (body, property) =>
  [...body.matchAll(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, "g"))].map((match) =>
    match[1].trim(),
  );

test("showcase elevation keeps the discipline", async () => {
  // Linked by both saga routes after the showcase and the Michroma subset,
  // before the motion sheet; Final Stage and the root never load it.
  for (const route of ["rexonance-saga", "extreme-saga"]) {
    const source = await read(`src/routes/${route}.tsx`);
    assert.match(source, /styles-showcase-elevation\.css\?url/, route);
    const links = source.slice(source.search(/links:\s*\[/));
    const showcase = links.indexOf("href: sagaShowcaseCssUrl");
    const fonts = links.indexOf("href: DOSSIER_HUD_FONTS_URL");
    const elevation = links.indexOf("href: showcaseElevationCssUrl");
    const motion = links.indexOf("href: motionEditionCssUrl");
    assert.ok(showcase > 0 && showcase < fonts && fonts < elevation && elevation < motion, route);
  }
  for (const path of [
    "src/routes/final-stage.tsx",
    "src/lib/world-head.ts",
    "src/routes/__root.tsx",
  ]) {
    assert.doesNotMatch(await read(path), /showcase-elevation|showcaseElevation/, path);
  }

  const source = await read("src/styles-showcase-elevation.css");
  const css = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const { rules, keyframes } = parseCss(source);
  assert.ok(rules.length > 60);

  // Every selector doubles the page class, optionally behind the html gates;
  // the only others give <body> clip instead of a scroller on these pages.
  const scoped =
    /^(?:html body |html(?::not\(\[[^\]]+\]\))+ |html\[data-world-effects="economy"\] )?\.rxs-page\.rxs-page/;
  const documentClip =
    /^html\[data-mode="world"\][^\s]* body:has\(> main\.rxs-page:not\(\.fst-page\)\)$/;
  for (const { selector, body } of rules) {
    for (const part of splitTopLevel(selector)) {
      if (documentClip.test(part)) assert.match(body, /overflow(?:-x)?:\s*clip/, part);
      else assert.match(part, scoped, part);
    }
  }

  // Readable floor, forced colours, nothing loops.
  assert.doesNotMatch(css, /font-size:\s*(?:[0-9]|1[01])(?:\.\d+)?px\b/);
  assert.match(css, /@media \(forced-colors: active\)/);
  assert.doesNotMatch(css, /\binfinite\b/);

  // One light per site, from the site tokens only.
  assert.match(css, /\.rxs-page\.rxs-page\.rxs-page \{[^}]*--sc-light: #7ae8ff;/);
  assert.match(css, /\.rxs-page\.rxs-page\.rxs-page\.exs-page \{[^}]*--sc-light: #ffd57a;/);
  const hexes = new Set(css.match(/#[0-9a-f]{3,8}\b/gi).map((hex) => hex.toLowerCase()));
  const allowed = [
    "#7ae8ff",
    "#dff9ff",
    "#a48bff",
    "#ff5cc8",
    "#f0cf86",
    "#ffd57a",
    "#fff0b5",
    "#fff",
    "#000",
    "#6e6e73",
    "#3a3a3c",
  ];
  for (const hex of hexes) assert.ok(allowed.includes(hex), hex);

  // Scroll-linked ornament only: named timelines behind the full gate.
  for (const { selector, body, context } of rules) {
    const timed = declarations(body, "animation-timeline").some((v) => !/^(?:auto|none)$/.test(v));
    if (!timed && !/view-timeline\s*:/.test(body)) continue;
    assert.ok(
      context.some((at) => at.startsWith("@supports (animation-timeline: view())")),
      selector,
    );
    assert.ok(context.includes("@media (prefers-reduced-motion: no-preference)"), selector);
    for (const part of splitTopLevel(selector)) {
      assert.match(part, /^html[^\s]*:not\(\[data-dialog-open\]\)/, part);
      assert.match(part, /\[data-motion-ready="true"\]/, part);
    }
  }
  for (const { selector, body } of rules) {
    if (!declarations(body, "animation").some((v) => v !== "none")) continue;
    assert.ok(declarations(body, "animation-timeline").length > 0, `${selector} is time-based`);
  }
  assert.ok(keyframes.length >= 2);
  for (const { name, body } of keyframes) {
    const properties = new Set([...body.matchAll(/([\w-]+)\s*:/g)].map((match) => match[1]));
    for (const property of properties) {
      assert.ok(["opacity", "scale", "translate", "transform-origin"].includes(property), name);
    }
  }

  // Transitions run only with motion allowed and outside economy rendering.
  for (const { selector, body, context } of rules) {
    if (!declarations(body, "transition").some((v) => v !== "none")) continue;
    assert.ok(
      context.some((at) => at.includes("(prefers-reduced-motion: no-preference)")),
      selector,
    );
    for (const part of splitTopLevel(selector)) {
      assert.match(part, /^html:not\(\[data-world-effects="economy"\]\)/, part);
    }
  }

  // !important only answers the frosted sheet's rail and slider paint, and
  // the inline overflow a rail drag puts on <body>.
  for (const { selector, body } of rules) {
    if (!body.includes("!important")) continue;
    assert.match(
      selector,
      /\.liquid-|\.rxs-p14-ios-|^html\[data-mode="world"\]\[data-rail-lock\]/,
      selector,
    );
  }

  // No drop shadows or glows: every shadow layer is inset.
  for (const { selector, body } of rules) {
    for (const value of declarations(body, "box-shadow")) {
      for (const layer of splitTopLevel(value.replace(/\s*!important$/, ""))) {
        assert.match(layer, /^(?:none$|inset\b)/, `${selector}: ${layer}`);
      }
    }
  }
});
