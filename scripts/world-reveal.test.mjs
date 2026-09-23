import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const readCss = async () => stripComments(await read("src/styles-world-reveal.css"));

// The reveal's own gate: everything Mirage switches off except rail locks,
// under which the reveal holds still (see the body clip rule).
const GATE =
  'html:not([data-world-effects="economy"]):not([data-side-menu-open]):not([data-loading]):not(:has(dialog[open])) .site-shell.film-edition.mirage-edition';
// Mirage's gate, which owns --mr-finale; the finale headline rides on it.
const MIRAGE_GATE =
  'html:not([data-world-effects="economy"]):not([data-side-menu-open]):not([data-rail-lock]):not([data-loading]):not(:has(dialog[open])) .site-shell.film-edition.mirage-edition';
const flat = (text) =>
  text.replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").trim();

// Every style rule with the at-rule preludes it sits in, and every keyframe
// block with its stops. The sheet has no nested style rules.
function parse(css) {
  const rules = [];
  const keyframes = {};
  const stack = [];
  let prelude = "";
  let index = 0;
  while (index < css.length) {
    const character = css[index];
    if (character === "{") {
      const head = flat(prelude);
      prelude = "";
      const keyframe = stack.at(-1)?.match(/^@keyframes\s+([\w-]+)/);
      if (head.startsWith("@")) {
        stack.push(head);
        index += 1;
        continue;
      }
      const end = css.indexOf("}", index);
      const body = css.slice(index + 1, end);
      if (keyframe) (keyframes[keyframe[1]] ??= []).push({ stop: head, body });
      else rules.push({ selector: head, body, context: [...stack] });
      index = end + 1;
      continue;
    }
    if (character === "}") {
      stack.pop();
      prelude = "";
    } else if (character === ";") prelude = "";
    else prelude += character;
    index += 1;
  }
  return { rules, keyframes };
}

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

test("the reveal sheet loads on /world after the artwork layer and before Mirage", async () => {
  const route = await read("src/routes/world.tsx");
  assert.match(route, /import worldRevealCssUrl from "@\/styles-world-reveal\.css\?url";/);
  const links = route.slice(route.search(/stylesheetLinks:\s*\[/));
  const order = [
    "href: otherArtworkCssUrl",
    "href: worldRevealCssUrl",
    "href: MIRAGE_FONTS_URL",
    "href: worldMirageCssUrl",
  ].map((needle) => links.indexOf(needle));
  assert.ok(
    order.every((position) => position > 0),
    String(order),
  );
  assert.deepEqual(
    [...order].sort((a, b) => a - b),
    order,
  );
  for (const path of ["src/lib/world-head.ts", "src/routes/__root.tsx"]) {
    assert.doesNotMatch(await read(path), /styles-world-reveal/, path);
  }
});

test("reveal motion is scroll-linked, gated and bound to named timelines", async () => {
  const css = await readCss();
  const { rules } = parse(css);
  assert.doesNotMatch(css, /\[data-reveal/);
  let animated = 0;
  let finale = 0;
  for (const { selector, body, context } of rules) {
    // Anonymous timelines would bind to the nearest clipping panel.
    assert.doesNotMatch(
      body,
      /view\(|scroll\(|infinite|animation-iteration-count|animation-duration|animation-delay/,
      selector,
    );
    const moves =
      /(?:^|;)\s*animation(?:-name)?:(?!\s*none\s*(?:;|$))/.test(body) ||
      /animation-timeline|animation-range|view-timeline/.test(body);
    if (!moves) continue;
    animated += 1;
    assert.ok(
      context.some((prelude) => prelude.startsWith("@supports (animation-timeline: view())")),
      `${selector} is not behind the timeline @supports`,
    );
    assert.ok(
      context.includes("@media (prefers-reduced-motion: no-preference)"),
      `${selector} ignores reduced motion`,
    );
    const timeline = body.match(/animation-timeline:\s*([^;]+)/)?.[1].trim();
    const finaleRule =
      timeline === "--mr-finale" || /\.finale-content \[data-text-reveal\] \.tr-c$/.test(selector);
    for (const part of splitSelectors(selector)) {
      if (finaleRule) {
        // --mr-finale exists only under Mirage's gate; a character whose
        // timeline vanished mid-animation would be left paused at its ghost.
        assert.ok(part.startsWith(`${MIRAGE_GATE} .finale-content`), part);
        finale += 1;
      } else {
        assert.ok(part.startsWith(GATE), `${part} lacks the reveal gate`);
        assert.match(part, /\[data-text-reveal(?:="copy")?\]:not\(\.finale-content \*\)/, part);
      }
    }
    if (timeline) assert.match(timeline, /^--(?:tr|mr-finale)$/, selector);
  }
  assert.equal(
    animated,
    4,
    "view timelines, chapter characters, finale characters, unpinned finale",
  );
  assert.equal(finale, 2);
  // Where the finale stage is not pinned its contain range is empty, so the
  // headline would pop at once: that layout gets a cover range of its own,
  // under the exact media query that unpins the stage.
  const UNPINNED = "@media (orientation: landscape) and (max-height: 520px)";
  const inUnpinned = rules.filter(({ context }) => context.includes(UNPINNED));
  const unpinned = inUnpinned.filter(({ selector }) =>
    /\.finale-content \[data-text-reveal\] \.tr-c$/.test(selector),
  );
  assert.equal(unpinned.length, 1);
  assert.match(
    flat(unpinned[0].body),
    /^animation-range: cover calc\([^;]+\) cover calc\([^;]+\);$/,
  );
  // The same short screens: a nav jump lands a heading at 83-86% of the
  // viewport, so headings there are lit sooner (variables only).
  const shortHeadings = inUnpinned.filter((rule) => !unpinned.includes(rule));
  assert.equal(shortHeadings.length, 1);
  assert.ok(shortHeadings[0].selector.startsWith(GATE), shortHeadings[0].selector);
  assert.match(
    shortHeadings[0].selector,
    /\[data-text-reveal="heading"\]:not\(\.finale-content \*\)$/,
  );
  const shortVars = Object.fromEntries(
    [...shortHeadings[0].body.matchAll(/(--tr-(?:from|span|fade)):\s*([\d.]+)svh;/g)].map(
      ([, name, value]) => [name, Number(value)],
    ),
  );
  assert.deepEqual(Object.keys(shortVars).sort(), ["--tr-fade", "--tr-from", "--tr-span"]);
  assert.equal(
    flat(shortHeadings[0].body)
      .replace(/--tr-(?:from|span|fade): [\d.]+svh;/g, "")
      .trim(),
    "",
  );
  const shortLine = shortVars["--tr-from"] + shortVars["--tr-span"] + shortVars["--tr-fade"];
  assert.ok(shortLine <= 12, `short landscape headings lit by ${shortLine}svh`);
  assert.match(
    stripComments(await read("src/styles-world/11.css")),
    /@media \(orientation: landscape\) and \(max-height: 520px\) \{[^@]*\.finale-sticky \{\s*position: relative;/,
  );
  // The finale reuses Mirage's pinned timeline instead of redeclaring it.
  assert.doesNotMatch(css, /finale-section[^{]*\{[^}]*view-timeline/);
  assert.match(css, /view-timeline: --tr block;/);
  // Paused regions (styles-world/21.css) must not freeze scroll-linked ink.
  const playing = rules.filter(({ body }) => /animation-play-state/.test(body));
  assert.equal(playing.length, 2);
  for (const { body } of playing) {
    assert.match(body, /animation-play-state: running !important;/);
  }
});

test("the reveal finishes at 26svh: headings and copy are whole with their top at 74%", async () => {
  const { rules } = parse(await readCss());
  const readVars = (rule) =>
    Object.fromEntries(
      [...rule.body.matchAll(/(--tr-(?:from|span|fade)):\s*([\d.]+)svh;/g)].map(
        ([, name, value]) => [name, Number(value)],
      ),
    );
  const base = rules.find(
    ({ body, context }) =>
      /view-timeline: --tr block;/.test(body) &&
      !context.some((prelude) => prelude.includes("orientation: landscape")),
  );
  assert.ok(base, "the view-timeline rule");
  const heading = readVars(base);
  const copyRule = rules.find(({ selector }) =>
    selector.endsWith('[data-text-reveal="copy"]:not(.finale-content *)'),
  );
  assert.ok(copyRule, "the copy rule");
  // Copy inherits --tr-from from the base rule.
  const copy = { ...heading, ...readVars(copyRule) };
  for (const [name, vars] of [
    ["heading", heading],
    ["copy", copy],
  ]) {
    assert.equal(vars["--tr-from"] + vars["--tr-span"] + vars["--tr-fade"], 26, name);
  }
  const design = await read("DESIGN.md");
  assert.match(design, /fully typed when their top reaches 74% of the viewport/);
});

test("rail locks clip <body> on /world so the reveal holds still under them", async () => {
  const css = await readCss();
  const { rules } = parse(css);
  const clip = rules.filter(({ body }) => /overflow/.test(body));
  assert.equal(clip.length, 1);
  assert.equal(
    clip[0].selector,
    'html[data-mode="world"][data-rail-lock]:not([data-loading]):not([data-side-menu-open]) body:has(.site-shell.film-edition.mirage-edition):not(:has(dialog[open]))',
  );
  assert.equal(flat(clip[0].body), "overflow: clip !important;");
  assert.deepEqual(clip[0].context, []);
  // Panels keep overflow:hidden: clipping .finale-sticky would revive a scale
  // animation on its blurred image, and no revealed block needs it.
  assert.doesNotMatch(css, /\.(?:threat-panel|world-column|rider-detail|finale-sticky)\b/);
  // The lock itself is untouched: body is still hidden inline.
  const lock = await read("src/lib/viewport-scroll-lock.js");
  assert.match(lock, /body\.style\.overflow = "hidden";/);
});

test("only colour and the cursor cell are animated, per inline character, and full-contrast modes opt out", async () => {
  const css = await readCss();
  const { rules, keyframes } = parse(css);
  assert.deepEqual(Object.keys(keyframes).sort(), ["tr-caret", "tr-ink"]);
  const properties = (name) => [
    ...new Set(
      keyframes[name].flatMap(({ body }) => [...body.matchAll(/([\w-]+)\s*:/g)].map((m) => m[1])),
    ),
  ];
  assert.deepEqual(properties("tr-ink"), ["color"]);
  assert.deepEqual(properties("tr-caret"), ["background-color"]);
  // Typing: a character is invisible until its turn, then appears at once at
  // its own colour (the implicit `to`); the ice cursor holds its cell for one step.
  assert.deepEqual(
    keyframes["tr-ink"].map(({ stop }) => stop),
    ["from"],
  );
  assert.match(keyframes["tr-ink"][0].body, /color: transparent/);
  assert.match(keyframes["tr-caret"][0].body, /color-mix\(in oklab, var\(--mr-ice/);
  for (const { body } of rules.filter(({ body }) => /animation:\s*tr-ink/.test(body))) {
    assert.match(body, /tr-ink steps\(1, end\) both,\s*tr-caret steps\(1, end\) none/);
    assert.match(body, /var\(--tr-d, 0\)/);
  }
  for (const { selector, body } of rules) {
    if (!/\.tr-c(?![\w-])/.test(selector)) continue;
    assert.doesNotMatch(
      body,
      /(?:^|;)\s*(?:display|position|transform|translate|scale|rotate|filter|opacity|text-shadow|will-change)\s*:/,
      selector,
    );
  }
  const optOut = rules.find(({ context }) =>
    context.includes(
      "@media (prefers-contrast: more), (forced-colors: active), (prefers-reduced-transparency: reduce)",
    ),
  );
  assert.ok(optOut);
  assert.equal(flat(optOut.body), "animation: none;");
  // The same selectors as the animation rules, later, so they outrank them.
  const animatedSelectors = rules
    .filter(({ body }) => /animation:\s*tr-ink/.test(body))
    .flatMap(({ selector }) => splitSelectors(selector));
  assert.deepEqual(splitSelectors(optOut.selector), animatedSelectors);
  // No other sheet styles the character spans.
  for (const path of ["src/styles-world-mirage.css", "src/styles-motion-edition.css"]) {
    assert.doesNotMatch(await read(path), /\.tr-c\b|data-text-reveal/, path);
  }
});

test("Mirage hands the revealed blocks over instead of stacking a second entrance", async () => {
  const mirage = stripComments(await read("src/styles-world-mirage.css"));
  assert.doesNotMatch(
    mirage,
    /:is\(\.story-heading h2, \.section-title h2, \.records-heading h2\)/,
  );
  assert.doesNotMatch(mirage, /:is\(\.story-copy > p, \.section-title > p\)/);
  assert.match(
    mirage,
    /:is\(\.story-copy > \.story-lead-sequel, \.section-title > \.eyebrow\) \{\s*animation: mr-rise-soft/,
  );
  // The archive title is not revealed, so it keeps its wipe.
  assert.match(mirage, /\.threat-copy\s+h3 \{\s*animation: mr-wipe/);
  assert.match(mirage, /@keyframes mr-wipe \{/);
});

test("World marks the revealed blocks and keeps every word in its JSX", async () => {
  const source = await read("src/components/world/world-home.tsx");
  assert.match(source, /import \{ RevealText \} from "\.\/reveal-text";/);
  assert.match(source, /import \{ revealLabel \} from "\.\/reveal-label";/);
  assert.doesNotMatch(source, /\bdata-reveal\b/);
  // Headings are module-scope constants: RevealText is memoised, so a
  // WorldHome commit hands it the same element and React skips it.
  const titles = {
    STORY_TITLE: ["救うべき世界は、", "<em>現実</em>にある。"],
    RIDERS_TITLE: ["八人が、世界へ。"],
    RECORDS_TITLE: ["到達点は、", "ひとつではない。"],
    FINALE_TITLE: ["サーガは、", "まだ終わらない。"],
  };
  const componentStart = source.indexOf("export function WorldHome()");
  for (const [name, words] of Object.entries(titles)) {
    const declaration = source.search(new RegExp(`^const ${name} = `, "m"));
    assert.ok(declaration > 0 && declaration < componentStart, name);
    const value = source.slice(declaration, source.indexOf(";\n", declaration));
    for (const word of words) assert.ok(value.includes(word), `${name}: ${word}`);
    assert.ok(
      source.includes(`data-text-reveal="heading" aria-label={revealLabel(${name})}>\n`),
      name,
    );
    assert.ok(source.includes(`<RevealText>{${name}}</RevealText>`), name);
  }
  const headings = source.match(/data-text-reveal="heading"/g) ?? [];
  assert.equal(headings.length, 4, "story, riders, records and finale headings");
  const copies = source.match(/<p data-text-reveal="copy">\s*<RevealText copy>/g) ?? [];
  assert.equal(copies.length, 3, "story copy ×2 and riders copy");
  assert.equal((source.match(/data-text-reveal="copy"/g) ?? []).length, 3);
  for (const literal of [
    "世界、概念、領域、物語、法則。あらゆるものを管轄する管理人。",
    "シエル、ベル、ローア、レックス、華火、真守、ジェームズ、リュシアン。",
    "主人公、帰還者、二人の管理人、刑事、怪盗、英国支部のエージェント、潜入情報官。",
  ]) {
    assert.ok(source.includes(literal), literal);
  }
  // Left whole: the blocks a rail changes, the sequel lead (its spans are
  // blocks), the hero, the h1 and the episode titles.
  assert.match(source, /<p className="rider-description">\{rider\.desc\}<\/p>/);
  assert.match(source, /<p>\{item\.body\}<\/p>/);
  assert.match(source, /<h3>\s*\{managerTab === 0 \? \(\s*<>\s*SIX SIGNALS/);
  for (const pattern of [
    /<p className="story-lead story-lead-sequel"[^>]*data-text-reveal/,
    /className="hero-lead"[^>]*data-text-reveal/,
    /<h1\b[^>]*data-text-reveal/,
    /<h4\b[^>]*data-text-reveal/,
    /id="episode-archive-title"[^>]*data-text-reveal/,
    /<RisingWorld[^>]*data-text-reveal|<RevealText[^>]*>\s*<RisingWorld/,
  ]) {
    assert.doesNotMatch(source, pattern);
  }
  assert.match(source, /<p className="story-lead story-lead-sequel">\s*<span>/);
});

test("RevealText is memoised, hydration-stable and readable by screen readers", async () => {
  const strip = (text) => text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  const source = strip(await read("src/components/world/reveal-text.tsx"));
  const label = strip(await read("src/components/world/reveal-label.ts"));
  assert.match(source, /export const RevealText = memo\(function RevealText\(/);
  assert.match(label, /export function revealLabel\(/);
  assert.match(source, /import \{ BLANK, revealLabel, splittable \} from "\.\/reveal-label";/);
  // Code points, not ICU: server and browser always split alike.
  assert.doesNotMatch(source, /Segmenter/);
  assert.match(source, /Array\.from\(String\(child\), \(part, key\) =>/);
  assert.match(source, /className="tr-c"/);
  assert.match(source, /"--tr-p": \(index\+\+ \/ Math\.max\(1, total - 1\)\)\.toFixed\(3\)/);
  assert.match(source, /"--tr-d": \(1 \/ Math\.max\(1, total - 1\)\)\.toFixed\(3\)/);
  // Inline host elements are split through; aria-hidden ones are passed on.
  assert.match(label, /new Set\(\["em", "strong", "b", "i", "span", "small"\]\)/);
  assert.match(label, /!\(node as Parent\)\.props\["aria-hidden"\]/);
  const heading = source.slice(source.indexOf("if (!copy)"));
  const headingReturn = heading.slice(0, heading.indexOf(";"));
  assert.doesNotMatch(headingReturn, /aria-hidden|visually-hidden/);
  const copy = heading.slice(heading.indexOf(";"));
  assert.match(copy, /<span className="visually-hidden">\{revealLabel\(children\)\}<\/span>/);
  assert.match(copy, /<span aria-hidden="true">\{split\(children\)\}<\/span>/);
  // No per-character layout: spans stay inline and unstyled.
  assert.doesNotMatch(source + label, /display|inline-block|transform|opacity/);
});

test("the reveal is documented with the Mirage edition", async () => {
  const design = await read("DESIGN.md");
  const mirage = design.indexOf("## Mirage edition (World)");
  const reveal = design.indexOf("### Scroll-lit type", mirage);
  assert.ok(mirage > 0 && reveal > mirage);
  const next = design.indexOf("\n## ", reveal);
  const section = design.slice(reveal, next < 0 ? undefined : next);
  for (const phrase of ["styles-world-reveal.css", "reveal-text.tsx", "verify-world-reveal.mjs"]) {
    assert.ok(section.includes(phrase), phrase);
  }
});
