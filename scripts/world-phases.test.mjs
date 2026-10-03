import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/* World phases (styles-world-phases.css, 2026-10-03): each chapter of /world
   takes its own colour and air — the hero's ice, STORY's dusk, the 六詠
   archive's bruise, RIDERS' steel and prism, RECORDS' sepia, the annex's
   verdigris and the finale's ember — by restating the Mirage, Neo and
   exhibition tokens per section, with static grounds. These pins keep it a
   still, scoped, legible colour layer: no motion, no text, no :has(), forced
   colours untouched, calm modes flat, fire never a red field, every accent
   at AA on its ground, and the Android story record on paper. */

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const route = read("src/routes/world.tsx");
const head = read("src/lib/world-head.ts");
const root = read("src/routes/__root.tsx");
const source = read("src/styles-world-phases.css");
const css = source.replace(/\/\*[\s\S]*?\*\//g, "");

function parse(text) {
  const rules = [];
  const stack = [];
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "{") {
      const prelude = text.slice(start, i).trim().replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")");
      stack.push({ prelude, bodyStart: i + 1 });
      start = i + 1;
    } else if (ch === "}") {
      const block = stack.pop();
      const context = stack.map((entry) => entry.prelude);
      if (!block.prelude.startsWith("@")) {
        rules.push({ selector: block.prelude, body: text.slice(block.bodyStart, i), context });
      }
      start = i + 1;
    } else if (ch === ";" && stack.length === 0) {
      start = i + 1;
    }
  }
  assert.equal(stack.length, 0, "balanced braces");
  return rules;
}

const rules = parse(css);
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
const declarations = (body) =>
  body
    .split(/;(?![^(]*\))/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => [part.slice(0, part.indexOf(":")).trim(), part.slice(part.indexOf(":") + 1).trim()]);
const tokens = (selectorNeedle) => {
  const rule = rules.find(
    (candidate) =>
      candidate.context.length === 0 &&
      candidate.selector === `main.site-shell.film-edition.mirage-edition ${selectorNeedle}` &&
      /--mr-ice:/.test(candidate.body),
  );
  assert.ok(rule, `tokens for ${selectorNeedle}`);
  return Object.fromEntries(declarations(rule.body));
};

const SCOPE = "main.site-shell.film-edition.mirage-edition";
const NOT_ANDROID_LITE = ':where(html:not([data-android-renderer]), html[data-world-effects="economy"])';
const ANDROID_LITE = 'html:not([data-world-effects="economy"])[data-android-renderer]';

const hex = (value) => {
  const m = value.match(/^#([0-9a-f]{6})$/i);
  assert.ok(m, `hex colour ${value}`);
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
};
const lin = (v) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const blend = (top, under, alpha) => top.map((v, i) => v * alpha + under[i] * (1 - alpha));

test("the phases sheet loads on /world only, after the exhibition sheet and before the HUD face and Mirage, which stays last", () => {
  assert.match(route, /import worldPhasesCssUrl from "@\/styles-world-phases\.css\?url";/);
  const links = route.slice(route.search(/stylesheetLinks:\s*\[/));
  const order = [
    "href: worldExhibitionCssUrl",
    "href: worldPhasesCssUrl",
    "href: MIRAGE_FONTS_URL",
    "href: worldMirageCssUrl",
  ].map((needle) => links.indexOf(needle));
  assert.ok(order.every((index, i) => index > 0 && (i === 0 || index > order[i - 1])), String(order));
  assert.equal(
    links.lastIndexOf('rel: "stylesheet"'),
    links.lastIndexOf('{ rel: "stylesheet", href: worldMirageCssUrl }') + 2,
  );
  assert.doesNotMatch(head, /mirage|phases/i);
  assert.doesNotMatch(root, /styles-world-phases/);
});

test("every rule is scoped to the World page", () => {
  for (const rule of rules) {
    for (const selector of selectorsOf(rule.selector)) {
      assert.ok(
        selector.startsWith(SCOPE) ||
          selector.startsWith(`${NOT_ANDROID_LITE} ${SCOPE}`) ||
          selector.startsWith(`${ANDROID_LITE} ${SCOPE}`),
        selector,
      );
    }
  }
});

test("a still colour layer: no motion, no text, no :has(), no paint effects, nothing under 12px", () => {
  assert.doesNotMatch(css, /@keyframes|animation|transition|view-timeline|scroll-timeline|will-change/);
  assert.doesNotMatch(css, /:has\(/);
  assert.doesNotMatch(css, /(?:^|[;{\s])(?:filter|backdrop-filter|mix-blend-mode|mask|-webkit-mask|clip-path)\s*:/);
  assert.doesNotMatch(css, /(?:^|[;{\s])content\s*:/);
  assert.doesNotMatch(css, /font(?:-size)?\s*:/);
  assert.doesNotMatch(css, /!important/);
});

test("outside forced-colors: none only tokens are declared, so forced colours keep the system palette", () => {
  for (const rule of rules) {
    const gated = rule.context.some((context) => /forced-colors: none/.test(context));
    if (gated) continue;
    for (const [property] of declarations(rule.body)) {
      assert.ok(property.startsWith("--"), `${rule.selector}: ${property} outside forced-colors: none`);
    }
  }
});

test("each chapter has its own accent, none of them the hero's ice, and every accent holds AA on its ground", () => {
  const phases = {
    story: { tokens: tokens("#story"), ground: "#0a1126" },
    archive: { tokens: tokens("#manager-archive"), ground: "#180b22" },
    riders: { tokens: tokens("#riders"), ground: "#191d24" },
    records: { tokens: tokens("#records"), ground: "#20160c" },
    annex: { tokens: tokens(":is(.wa-contents, .world-annex)"), ground: "#0b1a15" },
    finale: { tokens: tokens(":is(.finale-section, .mr-ticker.is-close, footer)"), ground: "#0c0604" },
  };
  const accents = Object.values(phases).map(({ tokens: t }) => t["--mr-ice"].toLowerCase());
  assert.equal(new Set(accents).size, accents.length, accents.join(" "));
  assert.ok(!accents.includes("#7ae8ff"));
  for (const [name, { tokens: t, ground }] of Object.entries(phases)) {
    for (const key of ["--mr-ice", "--mr-ice-hi"]) {
      const ratio = contrast(hex(t[key]), hex(ground));
      assert.ok(ratio >= 4.5, `${name} ${key} ${ratio.toFixed(2)}`);
    }
    // Body copy keeps the shell's text tokens.
    assert.ok(contrast(hex("#b9cad8"), hex(ground)) >= 4.5, name);
  }
});

test("the paper sheets keep their ink at AA, the dimmed prints included", () => {
  const story = tokens("#story");
  assert.ok(contrast(hex(story["--we-print"]), hex(story["--we-paper"])) >= 7);
  assert.ok(contrast(hex(story["--we-teal"]), hex(story["--we-paper"])) >= 4.5);
  assert.ok(contrast(hex("#2f3a66"), hex(story["--we-paper"])) >= 4.5);
  const records = tokens("#records");
  const deck = hex(records["--mr-deck"]);
  // Inactive episode prints sit at opacity .64 over the bay (styles-world/21.css).
  const paper = blend(hex(records["--we-paper"]), deck, 0.64);
  const ink = blend(hex(records["--we-teal"]), deck, 0.64);
  assert.ok(contrast(ink, paper) >= 4.5, contrast(ink, paper).toFixed(2));
  assert.ok(contrast(hex(records["--we-print"]), hex(records["--we-paper"])) >= 7);
  const glossary = tokens("#glossary");
  for (const key of ["--mr-text", "--mr-text-2", "--mr-text-3", "--mr-ice", "--mr-gold"]) {
    assert.ok(contrast(hex(glossary[key]), hex(glossary["--we-paper"])) >= 4.5, key);
  }
});

test("fire is amber light, never a saturated red field", () => {
  const finale = rules.filter((rule) => /finale|mr-ticker\.is-close|footer|mr-endmark/.test(rule.selector));
  assert.ok(finale.length >= 4);
  for (const rule of finale) {
    for (const [, r, g, b] of rule.body.matchAll(/rgb\((\d+) (\d+) (\d+)/g)) {
      const [lr, lg, lb] = [r, g, b].map(Number).map(lin);
      const share = lr / Math.max(1e-6, lr + lg + lb);
      assert.ok(share < 0.8, `${rule.selector}: rgb(${r} ${g} ${b}) is a saturated red`);
    }
  }
});

test("calm modes flatten the grounds and drop the textures", () => {
  const calm = rules.filter((rule) =>
    rule.context.some((context) => /prefers-reduced-transparency: reduce/.test(context) && /prefers-contrast: more/.test(context)),
  );
  for (const needle of ["#story", "#riders", "#records", ".world-annex", ".finale-section"]) {
    const rule = calm.find((candidate) => candidate.selector.includes(needle));
    assert.ok(rule, needle);
    assert.doesNotMatch(rule.body, /repeating|radial-gradient/, needle);
  }
});

test("the story record is paper on every tier, with its brackets painted in on Android lite", () => {
  const android = rules.find((rule) => rule.selector.startsWith(ANDROID_LITE) && rule.selector.endsWith("#story .story-layout"));
  assert.ok(android);
  assert.match(android.body, /var\(--we-paper\);/);
  for (const corner of ["0 0", "100% 0", "0 100%", "100% 100%"]) {
    assert.equal(android.body.match(new RegExp(`\\) ${corner} \\/ (?:24px 2px|2px 24px) no-repeat`, "g"))?.length, 2, corner);
  }
  // verify-world-mirage counts the lite tier's ten linear layers on this plate.
  assert.equal(android.body.split("linear-gradient").length - 1, 10);
  // Plates whose brackets the lite tier paints in their own background are
  // left to it (the phase tokens recolour that background).
  for (const plate of ["#manager-archive", "#story .world-column", "#riders .rider-console", "#records .episode-archive"]) {
    const rule = rules.find((candidate) => candidate.selector.endsWith(plate) && /background:/.test(candidate.body));
    assert.ok(rule && rule.selector.startsWith(NOT_ANDROID_LITE), plate);
  }
});

test("the topbar takes the chapter accent through the links' own aria-current, with no new listener", () => {
  for (const id of ["story", "riders", "records"]) {
    assert.match(css, new RegExp(`\\.topbar nav a\\[href="#${id}"\\] \\{\\s*--mr-ice: #[0-9a-f]{6};\\s*--neo-cyan: #[0-9a-f]{6};`));
  }
  assert.doesNotMatch(read("src/components/world/world-home.tsx"), /data-phase|phase-/);
});
