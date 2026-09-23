import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const readCss = async () =>
  (await read("src/styles-world-mirage.css")).replace(/\/\*[\s\S]*?\*\//g, "");

const splitSelectors = (group) => {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const character of group) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (character === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else current += character;
  }
  return [...parts, current.trim()];
};

// Style rules with their selector and body, skipping keyframe stops.
const styleRules = (css) =>
  [...css.matchAll(/(?:^|[{};])\s*([^{};@\s][^{};]*)\{([^{}]*)\}/g)]
    .map((match) => ({ selector: match[1].trim().replace(/\s+/g, " "), body: match[2] }))
    .filter(
      ({ selector }) => !/^(?:from|to|[\d.]+%)(?:\s*,\s*(?:from|to|[\d.]+%))*$/.test(selector),
    );

const keyframes = (css) =>
  Object.fromEntries(
    [...css.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g)].map((match) => [
      match[1],
      match[2],
    ]),
  );

const SCOPES = [
  ".site-shell.film-edition.mirage-edition",
  'html:not([data-world-effects="economy"]) .site-shell.film-edition.mirage-edition',
  'html:not([data-world-effects="economy"]) .site-shell.film-edition.motion-on.mirage-edition',
  'html:is([data-loading], [data-opening-handoff-active]):not([data-world-effects="economy"]) .site-shell.film-edition.mirage-edition',
  "html .site-shell.film-edition.mirage-edition > .hero",
  'html[data-mode="world"]:not([data-rail-lock]):not([data-loading]) body:has(.site-shell.film-edition.mirage-edition)',
];

test("Mirage layer and its HUD face load last on /world only", async () => {
  const route = await read("src/routes/world.tsx");
  assert.match(route, /import worldMirageCssUrl from "@\/styles-world-mirage\.css\?url";/);
  assert.match(route, /family=Michroma&display=swap&text=/);
  const links = route.slice(route.search(/stylesheetLinks:\s*\[/));
  assert.match(links, /^stylesheetLinks:\s*\[\s*\.\.\.WORLD_STYLESHEET_LINKS/);
  const order = [
    "href: otherArtworkCssUrl",
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
  for (const path of [
    "src/lib/world-head.ts",
    "src/routes/__root.tsx",
    "src/routes/dream-chapter.tsx",
  ]) {
    assert.doesNotMatch(await read(path), /mirage/i, path);
  }
});

test("the World page carries the edition hooks without new headings, paragraphs or images", async () => {
  const source = await read("src/components/world/world-home.tsx");
  assert.match(source, /className="site-shell motion-on film-edition mirage-edition"/);
  assert.match(source, /useMirageBoot\(shellRef\);/);
  assert.match(source, /<div className="mr-hero-hud" aria-hidden="true">/);
  assert.match(source, /<i className="mr-word" data-text="DECEPTION">\s*DECEPTION\s*<\/i>/);
  assert.match(source, /<i className="mr-word" data-text="WORLD">\s*WORLD\s*<\/i>/);
  assert.match(source, /<i className="mr-redact">欺瞞<\/i>でできている。/);
  assert.match(source, /<MirageTicker variant="open" records=\{EPISODES\.length\} \/>/);
  assert.match(source, /<MirageTicker variant="close" records=\{EPISODES\.length\} \/>/);
  assert.match(source, /<div className="mr-endmark" aria-hidden="true">/);
  assert.doesNotMatch(source, /<(?:p|h[1-6]|img)\b[^>]*className="mr-/);
  const ticker = await read("src/components/world/mirage-ticker.tsx");
  assert.match(ticker, /aria-hidden="true"/);
  for (const phrase of [
    "THE SECOND SAGA",
    "THIS IS NOT A DREAM",
    "POWER BEYOND THE BORDER",
    "THE STORY CONTINUES",
  ]) {
    assert.ok(source.includes(phrase), phrase);
  }
  const boot = await read("src/components/world/use-mirage-boot.ts");
  assert.match(boot, /MIRAGE_BOOT_SENTINEL = "mr-boot-seal"/);
  assert.match(boot, /prefersLightweightRendering\(navigator\)/);
  assert.match(boot, /prefers-reduced-motion: reduce/);
});

test("every rule stays inside the edition scope", async () => {
  const rules = styleRules(await readCss());
  assert.ok(rules.length > 100, String(rules.length));
  for (const { selector } of rules) {
    for (const part of splitSelectors(selector)) {
      assert.ok(
        SCOPES.some(
          (scope) =>
            part === scope ||
            part.startsWith(`${scope} `) ||
            part.startsWith(`${scope}:`) ||
            part.startsWith(`${scope}[`) ||
            part.startsWith(`${scope}::`),
        ),
        part,
      );
    }
  }
});

test("scroll choreography binds to the document, never to a clipping panel", async () => {
  const css = await readCss();
  // <body> would otherwise capture every view timeline and freeze it.
  assert.match(
    css,
    /html\[data-mode="world"\]:not\(\[data-rail-lock\]\):not\(\[data-loading\]\)\s+body:has\(\.site-shell\.film-edition\.mirage-edition\) \{\s*overflow: visible;\s*overflow-x: clip;/,
  );
  const gate = css.indexOf("@supports (animation-timeline: view())");
  assert.ok(gate > 0);
  assert.doesNotMatch(css.slice(0, gate), /animation-timeline|view-timeline/);
  const clipping =
    /\.hero |\.hero-backdrop|\.mr-hero|\.threat-panel|\.threat-copy|\.world-column|\.rider-detail|\.rider-monogram|\.episode-archive|\.finale-sticky|\.finale-content|\.signal|\.other-archive-card|\.dante-visual|\.episode-grid|\.orbit|\.mr-word/;
  for (const { selector, body } of styleRules(css)) {
    if (!/animation-timeline:\s*view\(/.test(body)) continue;
    assert.doesNotMatch(selector, clipping, selector);
  }
  for (const name of ["--mr-hero", "--mr-archive", "--mr-column", "--mr-records", "--mr-finale"]) {
    assert.match(css, new RegExp(`view-timeline: ${name} block;`), name);
  }
});

test("motion is gated, finite and compositor-friendly", async () => {
  const css = await readCss();
  const firstGate = css.indexOf(
    "@media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)",
  );
  assert.ok(firstGate > 0);
  assert.doesNotMatch(css.slice(0, firstGate), /animation:(?!\s*none)/);
  assert.doesNotMatch(css, /infinite|animation-iteration-count/);
  for (const { selector, body } of styleRules(css)) {
    if (!/(?:^|;)\s*animation(?:-name)?:(?!\s*none)/.test(body)) continue;
    for (const part of splitSelectors(selector)) {
      assert.match(part, /^html(?::not\(\[data-world-effects="economy"\]\)|:is\()/, part);
    }
  }
  const frames = keyframes(css);
  assert.ok(Object.keys(frames).length >= 25);
  for (const [name, body] of Object.entries(frames)) {
    assert.match(name, /^mr-/, name);
    const properties = [...body.matchAll(/([\w-]+)\s*:/g)].map((match) => match[1]);
    for (const property of properties) {
      const allowed = [
        "opacity",
        "translate",
        "scale",
        "rotate",
        "clip-path",
        "--mr-sweep",
        "--mr-pct",
      ];
      if (name === "mr-par-floor") allowed.push("transform");
      assert.ok(allowed.includes(property), `${name}: ${property}`);
    }
  }
  // Flicker budget for time-based keyframes: at most two opacity reversals a second.
  for (const match of css.matchAll(/animation: (mr-[\w-]+) (\d+)ms/g)) {
    const [, name, ms] = match;
    const values = [...(frames[name] ?? "").matchAll(/opacity:\s*([\d.]+)/g)].map((value) =>
      Number(value[1]),
    );
    let reversals = 0;
    for (let index = 2; index < values.length; index += 1) {
      const before = Math.sign(values[index - 1] - values[index - 2]);
      const after = Math.sign(values[index] - values[index - 1]);
      if (before && after && before !== after) reversals += 1;
    }
    assert.ok(reversals / (Number(ms) / 1000) <= 2, `${name}: ${reversals} in ${ms}ms`);
  }
  // Scroll-linked keyframes are monotonic in opacity, except two faint bands.
  for (const match of css.matchAll(
    /animation: (mr-[\w-]+) (?:linear|steps|var)[^;]*;\s*animation-timeline/g,
  )) {
    const name = match[1];
    if (["mr-curtain", "mr-iris"].includes(name)) continue;
    const values = [...(frames[name] ?? "").matchAll(/opacity:\s*([\d.]+)/g)].map((value) =>
      Number(value[1]),
    );
    const rising = values.every((value, index) => index === 0 || value >= values[index - 1]);
    const falling = values.every((value, index) => index === 0 || value <= values[index - 1]);
    assert.ok(rising || falling, name);
  }
});

test("boot holds under covers, and its sentinel never disappears", async () => {
  const css = await readCss();
  assert.match(css, /\.mr-hero-hud \{\s*animation: mr-boot-seal 2200ms linear both;/);
  assert.match(
    css,
    /html:is\(\[data-loading\], \[data-opening-handoff-active\]\)[\s\S]*?animation-play-state: paused;/,
  );
  for (const { selector, body } of styleRules(css)) {
    if (!/display:\s*none|visibility:\s*hidden/.test(body)) continue;
    for (const part of splitSelectors(selector)) {
      assert.doesNotMatch(part, /\.mr-hero-hud$/, part);
    }
  }
});

test("ornaments never take input, and pinned controls are left alone", async () => {
  const css = await readCss();
  const hud = css.slice(css.indexOf(".site-shell.film-edition.mirage-edition .mr-hero-hud {"));
  assert.match(hud, /^[^}]*position: absolute;[^}]*pointer-events: none;/);
  for (const selector of [".mr-ticker {", ".mr-endmark {", ".mr-hero-hud > * {"]) {
    const start = css.indexOf(`.site-shell.film-edition.mirage-edition ${selector}`);
    assert.ok(start > 0, selector);
    assert.match(css.slice(start, css.indexOf("}", start)), /pointer-events: none;/, selector);
  }
  assert.match(
    css,
    /\.site-shell\.film-edition\.mirage-edition \.orbit \{\s*display: none;\s*pointer-events: none;/,
  );
  for (const match of css.matchAll(
    /([^{}]*\.orbit[^{}]*)\{([^{}]*animation(?:-name)?:(?!\s*none)[^{}]*)\}/g,
  )) {
    assert.match(match[1], /:not\(\.is-shuffling\)/, match[1]);
  }
  assert.doesNotMatch(css, /touch-action:|overscroll-behavior:|scroll-snap|@layer/);
  assert.doesNotMatch(css, /backdrop-filter:(?!\s*none)/);
  assert.doesNotMatch(
    css,
    /ios-slide-open|liquid-selection-lens|liquid-rail-surface|rider-tabs|episode-pickup-plus/,
  );
  for (const match of css.matchAll(/([^;{}]+)!important/g)) {
    assert.match(match[1], /^\s*(?:background|box-shadow):/, match[0]);
  }
  const heading = css.slice(
    css.indexOf(".site-shell.film-edition.mirage-edition .story-heading h2 {"),
  );
  assert.doesNotMatch(heading.slice(0, heading.indexOf("}")), /transparent|background-clip/);
});

test("type never drops below 12px and generated duplicates stay silent", async () => {
  const css = await readCss();
  const sizes = [...css.matchAll(/font(?:-size)?:\s*([^;]+);/g)].map((match) => match[1]);
  assert.ok(sizes.length > 30, String(sizes.length));
  for (const size of sizes) {
    for (const value of size.matchAll(/(?:clamp\()?(\d+(?:\.\d+)?)px/g)) {
      if (/line-height|\/\s*[\d.]+$/.test(value[0])) continue;
      const pixels = Number(value[1]);
      // Font shorthand line-heights such as "12px/1.6" are unitless here.
      assert.ok(pixels >= 12, size);
    }
  }
  for (const match of css.matchAll(/(?:^|[;{\s])content:\s*([^;]+);/g)) {
    const value = match[1].trim();
    if (value === '""' || value === "none") continue;
    assert.match(value, /\/ ""$/, value);
  }
});

test("accessibility modes are restated", async () => {
  const css = await readCss();
  assert.match(css, /@media \(prefers-reduced-transparency: reduce\)/);
  assert.match(css, /@media \(prefers-contrast: more\)/);
  assert.match(css, /@media \(forced-colors: active\)[\s\S]*-webkit-text-fill-color: CanvasText;/);
  assert.match(
    css,
    /\.topbar nav a\[aria-current="location"\] \{\s*text-decoration: underline 2px;/,
  );
});
