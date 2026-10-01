import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/* World refine (styles-world-refine.css): the /world page from the hero to
   the footer as one edition. The sheet is paint and layout only, scoped to
   the World page root, and never reaches the annex, RISING / RE DIVE, the
   side menu or the announcement dialog. These pins cover the whole file, so
   a block appended later (the header locator) passes the same gates. */

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const route = read("src/routes/world.tsx");
const source = read("src/styles-world-refine.css");
const css = source.replace(/\/\*[\s\S]*?\*\//g, "");

/* A small block parser: every style rule with its at-rule context. */
function parse(text) {
  const rules = [];
  const keyframes = [];
  const stack = [];
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "{") {
      // Prettier wraps a long gate as `:not(\n [data-dialog-open]\n )`.
      const prelude = text
        .slice(start, i)
        .trim()
        .replace(/\s+/g, " ")
        .replace(/\(\s+/g, "(")
        .replace(/\s+\)/g, ")");
      stack.push({ prelude, bodyStart: i + 1, children: [] });
      start = i + 1;
    } else if (ch === "}") {
      const block = stack.pop();
      const parent = stack.at(-1);
      const context = stack.map((entry) => entry.prelude);
      if (block.prelude.startsWith("@keyframes")) keyframes.push(block.prelude);
      else if (!block.prelude.startsWith("@") && !context.some((c) => c.startsWith("@keyframes"))) {
        rules.push({ selector: block.prelude, body: text.slice(block.bodyStart, i), context });
      }
      if (parent) parent.children.push(block);
      start = i + 1;
    } else if (ch === ";" && stack.length === 0) {
      start = i + 1;
    }
  }
  assert.equal(stack.length, 0, "balanced braces");
  return { rules, keyframes };
}

const { rules, keyframes } = parse(css);

/* Top-level commas only (not those inside :is() / :not()). */
const selectorsOf = (selector) => {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const ch of selector) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else current += ch;
  }
  parts.push(current.trim());
  return parts;
};

const ROOT = "main.site-shell.film-edition.mirage-edition";
// The full scroll-linked gate (the header locator's timelines).
const GATE =
  'html:not([data-world-effects="economy"]):not([data-side-menu-open]):not([data-loading]):not([data-dialog-open])';
const scoped = (part) =>
  part.startsWith(ROOT) ||
  part.startsWith(`html:not([data-world-effects="economy"]) ${ROOT}`) ||
  part.startsWith(`html[data-world-effects="economy"] ${ROOT}`) ||
  part.startsWith(`${GATE} ${ROOT}`);

test("the refine sheet sits after the pickup cinema sheet and before the Mirage face, which stays last", () => {
  assert.match(route, /import worldRefineCssUrl from "@\/styles-world-refine\.css\?url";/);
  const links = route.slice(route.search(/stylesheetLinks:\s*\[/));
  const order = [
    "PICKUP_CINEMA_STYLESHEET_LINK",
    "href: worldRefineCssUrl",
    "href: MIRAGE_FONTS_URL",
    "href: worldMirageCssUrl",
  ].map((needle) => links.indexOf(needle));
  assert.ok(
    order.every((index, i) => index > 0 && (i === 0 || index > order[i - 1])),
    String(order),
  );
  assert.equal(
    links.lastIndexOf('rel: "stylesheet"'),
    links.lastIndexOf('{ rel: "stylesheet", href: worldMirageCssUrl }') + 2,
  );
  // Never shared: the dossiers, Dream and the special sites do not get it.
  assert.doesNotMatch(read("src/lib/world-head.ts"), /refine/i);
  assert.doesNotMatch(read("src/routes/__root.tsx"), /styles-world-refine/);
});

test("every selector in the sheet is scoped to the World page root", () => {
  assert.ok(rules.length > 40, String(rules.length));
  for (const rule of rules) {
    for (const part of selectorsOf(rule.selector)) {
      assert.ok(scoped(part), part);
    }
  }
});

test("never the annex, RISING / RE DIVE, the side menu or the announcement dialog", () => {
  for (const rule of rules) {
    assert.doesNotMatch(rule.selector, /\.(?:wa|rw)-|\.re-dive/, rule.selector);
    assert.doesNotMatch(rule.selector, /#site-side-panel|#site-announcement-dialog/, rule.selector);
    // The RE DIVE section reuses the 六詠 archive markup: archive rules name
    // #manager-archive (or exclude the clone).
    if (
      /\.(?:threat-panel|signal|manager-slot-grid|other-card|dante-|archive-placeholder)/.test(
        rule.selector,
      )
    ) {
      for (const part of selectorsOf(rule.selector)) {
        assert.match(part, /#manager-archive|:not\(\.re-dive-archive\)/, part);
      }
    }
  }
  assert.doesNotMatch(css, /:has\(dialog\[open\]\)|\[data-rail-lock\]/);
});

test("type stays at 12px or above", () => {
  for (const [, value] of css.matchAll(/font-size:\s*([^;]+);/g)) {
    const pixels = [...value.matchAll(/(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
    const first = pixels[0];
    // clamp()/max() lead with their floor; a bare length is the size itself.
    if (first !== undefined) assert.ok(first >= 12, value);
    assert.doesNotMatch(value, /\b(?:em|rem)\b|%/, value);
  }
});

test("still paint: no loops, no blur, no images; motion only behind both gates", () => {
  assert.doesNotMatch(css, /infinite/);
  assert.doesNotMatch(css, /backdrop-filter/);
  assert.doesNotMatch(css, /url\(/);
  assert.doesNotMatch(css, /blur\(/);
  for (const name of keyframes) assert.match(name, /^@keyframes wr-/, name);
  for (const rule of rules) {
    const moving =
      /(?:^|;)\s*animation(?:-name)?:\s*(?!none\b)\S/.test(rule.body) ||
      /(?:^|;)\s*transition(?:-property)?:\s*(?!none\b)\S/.test(rule.body) ||
      /(?:^|;)\s*translate:\s*(?!none\b)\S/.test(rule.body);
    if (!moving) continue;
    assert.ok(
      rule.context.some((c) => /prefers-reduced-motion: no-preference/.test(c)),
      `${rule.selector}: reduced-motion gate`,
    );
    for (const part of selectorsOf(rule.selector)) {
      assert.ok(
        part.startsWith('html:not([data-world-effects="economy"])'),
        `${part}: economy gate`,
      );
    }
    // Only compositor properties move.
    for (const [, list] of rule.body.matchAll(/transition(?:-property)?:\s*([^;]+);/g)) {
      for (const property of list.split(",").map((p) => p.trim().split(/\s+/)[0])) {
        assert.match(
          property,
          /^(?:opacity|transform|translate|scale|rotate|clip-path)$/,
          property,
        );
      }
    }
    if (/animation-timeline/.test(rule.body)) {
      for (const part of selectorsOf(rule.selector)) {
        assert.match(
          part,
          /:not\(\[data-side-menu-open\]\):not\(\[data-loading\]\):not\(\[data-dialog-open\]\)/,
          part,
        );
      }
    }
  }
});

test("one warm focus family: #fff0b5 on every listed /world control", () => {
  assert.match(read("src/styles-world-mirage.css"), /--mr-focus: #fff0b5;/);
  const focus = (needle) =>
    rules.filter(
      (rule) =>
        !rule.context.some((c) => c.includes("forced-colors")) &&
        selectorsOf(rule.selector).some((part) => part.includes(needle)) &&
        /outline(?:-color)?:[^;]*var\(--mr-focus\)/.test(rule.body),
    );
  for (const needle of [
    '.world-column-slide-open.ios-slide-open[data-keyboard-focus="true"]:focus-visible',
    ".rider-dossier-open.ios-slide-open:focus-visible",
    '> button[role="tab"]:focus-visible',
    ".episode-grid:focus-visible",
    ".episode-card-select:focus-visible",
    ".episode-pickup-plus:focus-visible",
    ".episode-controls button:focus-visible",
    "footer > a:focus-visible",
  ]) {
    assert.ok(focus(needle).length > 0, needle);
  }
  // The HOLD + SLIDE ring is an outline (the frosted sheet's !important
  // shadow would beat a ring drawn as a box-shadow).
  const slide = focus('[data-keyboard-focus="true"]:focus-visible')[0].body;
  assert.match(slide, /outline: 2px solid var\(--mr-focus\);/);
  assert.doesNotMatch(slide, /box-shadow/);
  // The pointer-suppressed archive region keeps its own off switch: the
  // grid rule recolours only.
  const grid = focus(".episode-grid:focus-visible")[0].body;
  assert.doesNotMatch(grid, /outline(?:-style)?:\s*(?:2px )?solid/);
});

test("forced colours: rings in Highlight, ornament dropped, chrome ink in plain ink", () => {
  const forced = rules.filter((rule) =>
    rule.context.some((c) => c.includes("forced-colors: active")),
  );
  assert.ok(forced.some((rule) => /outline-color: Highlight/.test(rule.body)));
  assert.ok(forced.some((rule) => /CanvasText/.test(rule.body)));
  assert.ok(forced.some((rule) => /GrayText/.test(rule.body)));
});

test("the mounted print is painted on the contain images themselves, keyed by src", () => {
  // The outgoing copy has the same src but no .is-contain: a matte keyed on
  // the class or on the frame (:has) would pop at every autoplay step.
  assert.doesNotMatch(css, /is-contain|:has\(/);
  for (const code of ["07", "08", "15", "16", "19", "21"]) {
    assert.match(
      css,
      new RegExp(`\\.poster-image\\[src\\$="/poster-card-${code}\\.jpeg"\\]`),
      code,
    );
  }
  // Poster controls are never display: none (world-programme); no blurred
  // shadow on the frame (android-gpu-budget).
  assert.doesNotMatch(css, /poster-(?:controls|shuffle|reset|lock)[^{]*\{[^}]*display:\s*none/);
  assert.doesNotMatch(css, /\.poster-frame/);
});

test("the record dialogs are painted, never moved or clipped; grades stay static and gated", () => {
  for (const rule of rules) {
    for (const part of selectorsOf(rule.selector)) {
      // The Zeus button is portalled into the open dialog: the dialog box
      // itself takes no transform, clip or size from this sheet.
      if (/(?:#world-column-pickup|#episode-pickup-dialog)\)?$/.test(part)) {
        assert.doesNotMatch(
          rule.body,
          /transform|translate|clip-path|overflow|inset|width|height/,
          part,
        );
      }
    }
    assert.doesNotMatch(rule.body, /--pc-close\s*:/, rule.selector);
    if (/filter:\s*(?!none)/.test(rule.body)) {
      // Static grades only, and never under economy or forced colours.
      assert.doesNotMatch(rule.body, /blur\(/);
      const economy = selectorsOf(rule.selector).every(
        (part) =>
          part.startsWith('html:not([data-world-effects="economy"])') ||
          rule.context.some((c) => c.includes("forced-colors: active")),
      );
      const dialogGhost = /#world-column-pickup/.test(rule.selector);
      assert.ok(economy || dialogGhost, rule.selector);
      if (!dialogGhost) {
        assert.ok(
          rule.context.some((c) => c.includes("forced-colors: none")),
          rule.selector,
        );
      }
    }
  }
  // The chrome-ink title drops its ghost under economy, as the dialog title does.
  assert.ok(
    rules.some(
      (rule) =>
        rule.selector.startsWith(`html[data-world-effects="economy"] ${ROOT}`) &&
        /filter: none/.test(rule.body),
    ),
  );
});

test("the footer closes on the chapter column and one baseline", () => {
  const footer = rules.find((rule) => rule.selector === `${ROOT} > footer`);
  assert.ok(footer);
  assert.match(footer.body, /align-items: last baseline;/);
  assert.match(footer.body, /padding-inline: max\(8vw, calc\(\(100% - 1280px\) \/ 2\)\);/);
  // The hairline and the border stay the E2 sheet's (styles-world-programme-sections.css).
  assert.doesNotMatch(footer.body, /background|border/);
});

/* W5, the annex locator (the block appended by the world-annex package):
   a silent chip after RECORDS names 04 / 05 / 06 while that chapter is under
   the reading line. Generated text with an empty alternative only, opacity
   only, on named view timelines of the annex ids, behind the full gate. */
const LOCATOR = "W5. The annex locator";

test("the annex locator is one appended block, gated, silent and opacity-only", () => {
  const start = source.indexOf(LOCATOR);
  assert.ok(start > 0, "the locator block exists");
  // It is the sheet's last block: nothing of world-main's follows it.
  const block = parse(
    source.slice(source.lastIndexOf("/*", start)).replace(/\/\*[\s\S]*?\*\//g, ""),
  );
  assert.ok(block.rules.length >= 10, String(block.rules.length));
  for (const rule of block.rules) {
    // Behind @supports for timelines and anchors, from 1024px, reduced
    // motion no-preference, and the full scroll-linked gate on every part.
    assert.ok(
      rule.context.some((c) =>
        /@supports \(animation-timeline: view\(\)\) and \(anchor-name: --a\)/.test(c),
      ),
      rule.selector,
    );
    assert.ok(
      rule.context.some(
        (c) => /min-width: 1024px/.test(c) && /prefers-reduced-motion: no-preference/.test(c),
      ),
      rule.selector,
    );
    for (const part of selectorsOf(rule.selector)) {
      assert.ok(part.startsWith(`${GATE} ${ROOT}`), part);
      // By id or the header's own boxes: never an annex class.
      assert.doesNotMatch(part, /\.wa-/, part);
    }
    // Only opacity moves; the chip never takes a pointer.
    assert.doesNotMatch(
      rule.body,
      /transition|transform|translate|scale|rotate|clip-path/,
      rule.selector,
    );
  }
  // Exactly three generated strings, the chapter openers' own words, each
  // with an empty alternative (aria-current and the links are untouched).
  const generated = [
    ...block.rules.flatMap((rule) => [...rule.body.matchAll(/content:\s*([^;]+);/g)]),
  ].map((match) => match[1].trim());
  assert.deepEqual(generated.sort(), [
    '"04 CAST FILES" / ""',
    '"05 WORLD FILES" / ""',
    '"06 ARCHIVE LOG" / ""',
  ]);
  const annex = read("src/components/world/world-annex.tsx");
  for (const [no, label] of [
    ["04", "CAST FILES"],
    ["05", "WORLD FILES"],
    ["06", "ARCHIVE LOG"],
  ]) {
    assert.ok(annex.includes(`<ChapterOpener no="${no}" label="${label}" />`), no);
  }
  // Named view timelines on the annex ids, scoped to the World root.
  for (const [id, name] of [
    ["#cast-roster", "--wr-loc-04"],
    ["#world-brief", "--wr-loc-05"],
    ["#episode-notes", "--wr-loc-06"],
    ["#quotes", "--wr-loc-end"],
  ]) {
    const rule = block.rules.find((r) => r.selector.endsWith(`${ROOT} ${id}`));
    assert.ok(rule, id);
    assert.match(rule.body, new RegExp(`view-timeline: ${name} block;`), id);
  }
  assert.ok(
    block.rules.some(
      (r) =>
        r.selector === `${GATE} ${ROOT}` &&
        /timeline-scope: --wr-loc-04, --wr-loc-05, --wr-loc-06, --wr-loc-end;/.test(r.body),
    ),
  );
  // The chips are hidden unless their timeline lights them, and silent.
  const chips = block.rules.filter((r) => /opacity: 0;/.test(r.body));
  assert.equal(chips.length, 1);
  assert.match(chips[0].body, /pointer-events: none;/);
  assert.match(chips[0].body, /font-size: 12px;/);
  // Opacity-only keyframes, finite (scroll-linked), named wr-loc-*.
  const frames = [...css.matchAll(/@keyframes (wr-loc-[\w-]+) \{([\s\S]*?)\n\}/g)];
  assert.deepEqual(frames.map((m) => m[1]).sort(), ["wr-loc-off", "wr-loc-on"]);
  for (const [, , body] of frames) {
    const properties = new Set([...body.matchAll(/([\w-]+)\s*:/g)].map((m) => m[1]));
    assert.deepEqual([...properties], ["opacity"]);
  }
  for (const rule of block.rules.filter((r) => /animation:/.test(r.body))) {
    assert.match(rule.body, /animation-timeline: --wr-loc-/, rule.selector);
    assert.doesNotMatch(rule.body, /infinite/);
  }
});

/* Fixer review (2026-10-01): a focused SHUFFLE kept no ring while it ran,
   the + plate failed verify-pickup-contrast (translucent, imaged, ice
   cross), the + went ice or white on a Canvas plate in forced colours, the
   rider rail's resting numerals fell under 4.5:1, the sub-360 archive tabs
   crossed their capsule, and /world's HOLD + SLIDE stayed a capsule next
   to the square + and the files' square plate. */
const norm = (text) => text.replace(/\s+/g, " ").trim();
const topLevel = (selector) =>
  rules.filter((rule) => rule.selector === selector && rule.context.length === 0);

test("the poster keys keep their ring through disabled states", () => {
  const dropping = rules.filter(
    (rule) =>
      /poster-(?:reset|lock|shuffle)/.test(rule.selector) && /box-shadow:\s*none/.test(rule.body),
  );
  assert.ok(dropping.length > 0);
  for (const rule of dropping) {
    for (const part of selectorsOf(rule.selector)) {
      assert.match(part, /:not\(:focus-visible\)$/, part);
    }
  }
  // Forced colours drop box-shadow: the keys' ring becomes an inset outline.
  const forced = rules.find(
    (rule) =>
      rule.context.some((c) => c.includes("forced-colors: active")) &&
      rule.selector === `${ROOT} .poster-control-cluster > button:focus-visible`,
  );
  assert.ok(forced);
  assert.match(norm(forced.body), /outline: 2px solid Highlight; outline-offset: -2px;/);
});

test("the + plate is opaque and imageless under a white cross; ornaments ride ::after", () => {
  const plate = `${ROOT} .episode-pickup-plus.ios26-glass[data-liquid-pointer]`;
  const [rest] = topLevel(plate);
  assert.ok(rest);
  assert.match(rest.body, /background: rgb\(4 8 15\) !important;/);
  assert.doesNotMatch(rest.body, /gradient|url\(/);
  const hover = rules.find(
    (rule) => rule.selector === `${plate}:hover` && /background/.test(rule.body),
  );
  assert.match(
    hover.body,
    /background: color-mix\(in srgb, var\(--mr-ice\) 14%, rgb\(4 8 15\)\) !important;/,
  );
  const [ornament] = topLevel(`${plate}::after`);
  assert.match(norm(ornament.body), /content: ""; position: absolute; inset: 0;/);
  assert.match(ornament.body, /pointer-events: none;/);
  // The cross is recoloured only on hover and in forced colours (white at rest).
  for (const rule of rules.filter((r) => /episode-pickup-plus-icon/.test(r.selector))) {
    const forced = rule.context.some((c) => c.includes("forced-colors: active"));
    assert.ok(forced || /:hover/.test(rule.selector), rule.selector);
    if (forced) assert.match(rule.body, /color: ButtonText !important;/);
  }
  assert.ok(
    rules.some(
      (rule) =>
        rule.context.some((c) => c.includes("forced-colors: active")) &&
        rule.selector === `${plate}::after` &&
        /display: none;/.test(rule.body),
    ),
  );
});

test("HOLD + SLIDE on /world is the files' square plate: radius and paint, never geometry", () => {
  const controls = ":is(.world-column-slide-open, .rider-dossier-open).ios-slide-open";
  const radius = rules.filter(
    (rule) => rule.selector.includes(controls) && /border-radius/.test(rule.body),
  );
  assert.ok(radius.some((rule) => /border-radius: 4px !important;/.test(rule.body)));
  assert.ok(radius.some((rule) => /border-radius: 2px !important;/.test(rule.body)));
  for (const rule of rules.filter((r) => /ios-slide-open/.test(r.selector))) {
    // Box, travel and drag stay the control's own (verify-film-direction,
    // verify-anime-ui and verify-pickup-contrast measure them).
    assert.doesNotMatch(
      rule.body,
      /(?:^|[;\s])(?:width|height|min-width|min-height|padding|inset|left|right|top|bottom|transform|translate):/,
      rule.selector,
    );
  }
  // Both surfaces keep their own base under the brackets.
  assert.match(
    topLevel(`${ROOT} .world-column-slide-open.ios-slide-open`)[0].body,
    /linear-gradient\(155deg, #354351, #192331 70%, #202d3b\) !important;/,
  );
  assert.match(
    topLevel(`${ROOT} .rider-dossier-open.ios-slide-open`)[0].body,
    /#122132 !important;/,
  );
});

test("rider numerals rest at 4.5:1; archive tabs keep Mirage's sub-360 wrap", () => {
  const rest = topLevel(
    `${ROOT} .rider-tabs.liquid-swipe-tabs > button[role="tab"]:not([aria-selected="true"]) small`,
  )[0];
  const alpha = Number(rest.body.match(/rgb\(122 232 255 \/ (\d+)%\)/)[1]);
  assert.ok(alpha >= 80, String(alpha));
  // No negative tracking or word spacing anywhere (it pushed the one-line
  // codes across the capsule's curve and changed the tabs' height).
  assert.doesNotMatch(css, /(?:letter|word)-spacing:\s*-/);
  assert.ok(
    !rules.some(
      (rule) => /manager-archive-tabs/.test(rule.selector) && /white-space|padding/.test(rule.body),
    ),
  );
});

/* Fixer review 2 (2026-10-01): DANTE's 26px corner plate (top 14px, so its
   foot is at 40px) ran into the ANOMALOUS RECORD chip on 178px cards
   (1024: 10px into it). The copy is anchored to the card's foot, so the
   chip's top is the card less the stack under it. */
test("DANTE's corner plate stands clear of the ANOMALOUS RECORD chip", () => {
  const plate = topLevel(`${ROOT} #manager-archive .dante-archive::after`)[0].body;
  const plateFoot =
    Number(plate.match(/(?:^|[;\s])top: (\d+)px;/)[1]) +
    Number(plate.match(/(?:^|[;\s])height: (\d+)px;/)[1]);
  const copy = (part) => topLevel(`${ROOT} #manager-archive .dante-copy ${part}`.trim());
  const lineHeight = (part) =>
    Number(
      copy(part)
        .find((rule) => /line-height/.test(rule.body))
        .body.match(/line-height: ([\d.]+);/)[1],
    );
  const titleLeading = lineHeight("b");
  const chipLeading = lineHeight("small");
  const accessGap = Number(
    copy("i")
      .find((rule) => /margin-top/.test(rule.body))
      .body.match(/margin-top: (\d+)px;/)[1],
  );
  // The stack on a 178px card (1px border, 16px padding; Mirage's 12px
  // chip, name and ACCESS at 1.5, the chip's 2px padding; the base 5px and
  // 3px gaps). The chip breaks on these cards up to 1120px, where DANTE is
  // 2.6vw = 29.12px. Above 1120px the hugging chip clears the plate to its
  // left (measured 8.7px or more); from about 1366px it is one line.
  const chip = 2 * 12 * chipLeading + 4;
  const stack = chip + 5 + 29.12 * titleLeading + 3 + 18 + accessGap + 18;
  const chipTop = 178 - 1 - 16 - stack;
  assert.ok(chipTop >= plateFoot + 6, `chip top ${chipTop.toFixed(1)} vs plate foot ${plateFoot}`);
  // The chip hugs its longer word once it breaks (the measure is about 160px).
  assert.match(copy("")[0]?.body ?? "", /container: wr-dante \/ inline-size;/);
  const hug = rules.find(
    (rule) =>
      rule.selector === `${ROOT} #manager-archive .dante-copy small` &&
      rule.context.some((c) => /^@container wr-dante \(width < (\d+)px\)$/.test(c)),
  );
  assert.ok(hug, "the chip hugs its longer word");
  assert.ok(Number(hug.context[0].match(/(\d+)px/)[1]) >= 160);
  assert.match(hug.body, /width: min-content;/);
});
