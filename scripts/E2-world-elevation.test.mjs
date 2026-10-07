import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const css = stripComments(read("src/styles-world-programme-sections.css"));
const MIRAGE = "main.site-shell.film-edition.mirage-edition";

// The body of the first rule whose selector ends with `selector`, in `text`.
const rule = (text, selector) => {
  const start = text.indexOf(`${selector} {`);
  assert.ok(start >= 0, selector);
  return text.slice(text.indexOf("{", start) + 1, text.indexOf("}", start));
};
// Every @media block that opens with exactly `query`.
const mediaBlocks = (text, query) => {
  const blocks = [];
  for (let start = text.indexOf(`@media ${query} {`); start >= 0;) {
    let depth = 0;
    for (let index = text.indexOf("{", start); index < text.length; index += 1) {
      if (text[index] === "{") depth += 1;
      if (text[index] === "}") depth -= 1;
      if (depth === 0) {
        blocks.push(text.slice(start, index + 1));
        break;
      }
    }
    start = text.indexOf(`@media ${query} {`, start + 1);
  }
  assert.ok(blocks.length, query);
  return blocks;
};
const mediaRule = (query, selector) => {
  const block = mediaBlocks(css, query).find((text) => text.includes(`${selector} {`));
  assert.ok(block, `${query} ${selector}`);
  return rule(block, selector);
};

test("the Mirage overrides outrank Mirage from the earlier sheet, which stays last", () => {
  const route = read("src/routes/world.tsx");
  const links = route.slice(
    route.indexOf("stylesheetLinks: ["),
    route.indexOf("],", route.indexOf("stylesheetLinks: [")),
  );
  const order = [...links.matchAll(/href: (\w+)/g)].map((match) => match[1]);
  assert.ok(order.indexOf("worldProgrammeSectionsCssUrl") < order.indexOf("worldMirageCssUrl"));
  assert.equal(order.at(-1), "worldMirageCssUrl");
  // Every rule that restyles a Mirage surface carries the leading `main`.
  assert.doesNotMatch(css, /(^|\n)\s*\.site-shell\.film-edition\.mirage-edition/);
});

test("the rider description breaks between phrases over its pinned word-break", () => {
  const description = rule(css, ".site-shell.film-edition .rider-description");
  assert.match(description, /word-break: auto-phrase;/);
  assert.match(description, /text-wrap: pretty;/);
  // The pinned base rule stays as it was (rider-overview-responsive.test.mjs).
  assert.match(read("src/styles-world/06.css"), /\.rider-description \{[^}]*word-break: normal;/);
});

test("the rider art's edge fade paints above the art and runs into the deck", () => {
  assert.match(rule(css, `${MIRAGE} .rider-visual::before`), /^\s*z-index: 2;\s*$/);
  // No transparent rule: it showed the visual's near-black ground as a hairline.
  assert.match(rule(css, `${MIRAGE} .rider-visual`), /border-color: var\(--mr-deck\);/);
  assert.match(
    mediaRule("(max-width: 1120px)", `${MIRAGE} .rider-visual::before`),
    /linear-gradient\(\s*0deg,\s*var\(--mr-deck\) 0%,/,
  );
  const desktop = mediaRule("(min-width: 1121px)", `${MIRAGE} .rider-visual::before`);
  assert.match(desktop, /linear-gradient\(\s*90deg,\s*var\(--mr-deck\) 0%,/);
  assert.doesNotMatch(desktop, /radial-gradient/);
  // Static: the image keeps its own selection fade.
  assert.doesNotMatch(css, /\.rider-visual[^{]*\{[^}]*(transition|animation|opacity)/);
});

test("chapter links land flush under the measured header, 六詠 with a little air", () => {
  const chapters = ".site-shell.film-edition :is(#story, #riders, #records)";
  const archive =
    ".site-shell.film-edition :is(#manager-archive, #manager-archive-unmanaged, #manager-archive-other)";
  assert.match(
    rule(css, chapters),
    /scroll-margin-top: calc\(var\(--film-topbar-height, calc\(76px \+ env\(safe-area-inset-top\)\)\) - 1px\);/,
  );
  // The dossier return anchors land the 六詠 panel where the side menu does.
  assert.match(
    rule(css, archive),
    /scroll-margin-top: calc\(var\(--film-topbar-height, calc\(76px \+ env\(safe-area-inset-top\)\)\) \+ 14px\);/,
  );
  // A cold hash load on a phone lands before the header is measured: the
  // fallback is the phone header's 64px, as in styles-world-neo.css.
  const [phones] = mediaBlocks(
    css,
    "(max-width: 760px), (max-width: 920px) and (max-height: 560px) and (orientation: landscape)",
  );
  const flat = phones.replace(/\s+/g, " ");
  assert.match(
    flat,
    /:is\(#story, #riders, #records\) \{ scroll-margin-top: calc\(var\(--film-topbar-height, calc\(64px \+ env\(safe-area-inset-top\)\)\) - 1px\); \}/,
  );
  assert.match(
    flat,
    /:is\(#manager-archive, #manager-archive-unmanaged, #manager-archive-other\) \{ scroll-margin-top: calc\( ?var\(--film-topbar-height, calc\(64px \+ env\(safe-area-inset-top\)\)\) \+ 14px ?\); \}/,
  );
  // styles-world/21.css keeps its pinned 96px (related-return-navigation);
  // this sheet outranks it with the shell's two classes.
  assert.match(
    read("src/styles-world/21.css"),
    /\.site-shell #manager-archive-unmanaged,\s*\.site-shell #manager-archive-other \{[^}]*scroll-margin-top: calc\(96px \+ env\(safe-area-inset-top\)\);/,
  );
  // WorldSectionNav still reads the landing and publishes the header height.
  const home = read("src/components/world/world-home.tsx");
  assert.match(
    home,
    /shell\?\.style\.setProperty\("--film-topbar-height", `\$\{topbarHeight\}px`\)/,
  );
});

test("the header numbers its chapters on tablets and desktops only", () => {
  const nav = `${MIRAGE} .topbar nav`;
  assert.match(mediaRule("(min-width: 761px)", nav), /counter-reset: dw-chapter;/);
  assert.match(mediaRule("(min-width: 761px)", `${nav} a`), /counter-increment: dw-chapter;/);
  const numeral = mediaRule("(min-width: 761px)", `${nav} a::before`);
  assert.match(numeral, /content: counter\(dw-chapter, decimal-leading-zero\);/);
  assert.match(numeral, /font-variant-numeric: tabular-nums;/);
  assert.doesNotMatch(numeral, /transition/);
  // At rest: Mirage's 12px HUD mono floor and 4.5:1 on the header (#03060c),
  // as the rider tab numbers hold.
  assert.match(numeral, /font-size: 12px;/);
  assert.match(numeral, /color: rgb\(122 232 255 \/ 56%\);/);
  const lin = (value) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (rgb) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
  const header = [3, 6, 12];
  const resting = [122, 232, 255].map((value, index) => value * 0.56 + header[index] * 0.44);
  assert.ok((luminance(resting) + 0.05) / (luminance(header) + 0.05) >= 4.5);
  // Forced colours underline the current word; no numeral splits the mark.
  assert.match(
    mediaRule("(min-width: 761px) and (forced-colors: active)", `${nav} a::before`),
    /^\s*content: none;\s*$/,
  );
  assert.match(
    mediaRule("(min-width: 761px)", `${nav} a[aria-current="location"]::before`),
    /color: var\(--mr-ice\);/,
  );
  // The colour change eases only for viewers who allow motion.
  assert.match(
    mediaRule("(min-width: 761px) and (prefers-reduced-motion: no-preference)", `${nav} a::before`),
    /transition: color 0\.25s;/,
  );
});

test("no chapter is current once the last one has scrolled past the marker", () => {
  const home = read("src/components/world/world-home.tsx");
  const start = home.indexOf("const syncActiveSection = () => {");
  const sync = home.slice(start, home.indexOf("const requestSectionSync = () => {", start));
  const cleared = sync.indexOf(
    "if (sections[sections.length - 1].getBoundingClientRect().bottom <= marker) current = null;",
  );
  assert.ok(cleared > sync.indexOf("sections.forEach((section) => {"), "after the chapter loop");
  assert.ok(cleared < sync.indexOf("if (current === lastActiveRef.current) return;"));
});

test("desktop column tabs step up one size; phones keep the pinned 11px", () => {
  const tab = '.site-shell.film-edition .world-column-tabs.liquid-swipe-tabs > button[role="tab"]';
  assert.match(mediaRule("(min-width: 900px)", `${tab} b`), /font-size: 13px;/);
  assert.match(mediaRule("(min-width: 900px)", `${tab} small`), /font-size: 12px;/);
  assert.match(
    read("src/styles-world-addon.css"),
    /@media \(max-width: 440px\) \{[\s\S]*?\.world-column-tabs\.liquid-swipe-tabs > button\[role="tab"\] b \{\s*font-size: 11px;/,
  );
});

test("record art is square and the selected card has one emphasis", () => {
  assert.match(
    css,
    new RegExp(
      `${MIRAGE.replaceAll(".", "\\.")} \\.episode-thumbnail,\\s*${MIRAGE.replaceAll(".", "\\.")} \\.episode-thumbnail img \\{\\s*border-radius: 0;`,
    ),
  );
  const active = `${MIRAGE} .episode-card.is-active .episode-card-surface`;
  const normal = rule(css, active);
  assert.match(normal, /border-color: rgb\(122 232 255 \/ 48%\);/);
  assert.doesNotMatch(normal, /0 0 48px/);
  // More contrast or less transparency: the selected card keeps full ice,
  // above the 70% rule every card gets there (styles-world-neo.css).
  assert.match(
    mediaRule("(prefers-contrast: more), (prefers-reduced-transparency: reduce)", active),
    /border-color: var\(--mr-ice\);/,
  );
});

test("archive cards share one square chip and vacant slots stay quiet but legible", () => {
  const chip = rule(css, `${MIRAGE} .other-archive-card::after`);
  // The 六詠 chip's size (26px border-box); its position stays the base one.
  assert.match(chip, /width: 26px;\s*height: 26px;/);
  assert.match(chip, /border-radius: 0;/);
  assert.doesNotMatch(chip, /\b(top|right|background-image|background):/);
  const slot = rule(css, `${MIRAGE} .archive-placeholder`);
  assert.match(slot, /border-color: color-mix\(in srgb, currentColor 34%, transparent\);/);
  assert.match(
    rule(css, `${MIRAGE} .archive-placeholder::before`),
    /mask: linear-gradient\(180deg, transparent 0%, #000 55%\);/,
  );
  // The unresolved numerals and marks keep the 4.5:1 colours Mirage sets.
  for (const part of ["span", "b"]) {
    assert.doesNotMatch(rule(css, `${MIRAGE} .archive-placeholder ${part}`), /opacity|color:/);
  }
});

test("the footer ends on the gate's void and its hairline sits in its border", () => {
  const footer = rule(css, `${MIRAGE} > footer`);
  assert.match(footer, /border-top-color: transparent;/);
  assert.match(footer, /top \/ 100% 1px no-repeat border-box,/);
  assert.match(footer, /var\(--mr-void\);\s*$/);
  // The side tints are glows from the top corners, spent before the foot.
  assert.match(footer, /radial-gradient\(70% 120% at 0% 0%,[^)]*\)[^)]*transparent 70%\)/);
  assert.doesNotMatch(footer, /linear-gradient\(\s*90deg,\s*rgb\(122 232 255 \/ 6%\)/);
});
