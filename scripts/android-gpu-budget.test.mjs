import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// The Android lite tier keeps /world under the tile budget of Android GPUs at
// DPR 3-3.5 (measured: 145-204 MB of active tiles before, 70-120 MB after).
// These pins keep the heavy layers from coming back.

const read = async (path) =>
  (await readFile(new URL(`../${path}`, import.meta.url), "utf8")).replaceAll("\r\n", "\n");
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const ANDROID_FULL = 'html:not([data-world-effects="economy"])[data-android-renderer]';

const flatten = (selector) =>
  selector.trim().replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")");

// Style rules with their selector and body, including those nested in
// @supports and @media, skipping keyframe stops. The lookbehind lets a rule
// start right after the previous rule's closing brace.
const styleRules = (css) =>
  [...css.matchAll(/(?<=^|[{};])\s*([^{};@\s][^{};]*)\{([^{}]*)\}/g)]
    .map((match) => ({ selector: flatten(match[1]), body: match[2] }))
    .filter(
      ({ selector }) => !/^(?:from|to|[\d.]+%)(?:\s*,\s*(?:from|to|[\d.]+%))*$/.test(selector),
    );

const declaration = (body, property) =>
  body
    .match(new RegExp(`(?:^|;)\\s*${property}:\\s*([^;]+);`))?.[1]
    .trim()
    .replace(/\s+/g, " ");

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
  return [...parts, current.trim()];
};

// Blur radius of each shadow: the third length (offset-x, offset-y, blur).
const blurRadii = (shadows) =>
  splitTopLevel(shadows).map((shadow) => {
    const lengths = shadow
      .replace(/(?:rgb|rgba|hsl|color-mix|var)\([^)]*\)/g, "")
      .split(/\s+/)
      .filter((token) => /^-?[\d.]+(?:px)?$/.test(token));
    return Number.parseFloat(lengths[2] ?? "0");
  });

const mirageTier = async () => {
  const css = await read("src/styles-world-mirage.css");
  const start = css.indexOf("   Android lite tier\n");
  assert.ok(start > 0, "Mirage keeps its Android lite tier section");
  return stripComments(css.slice(css.lastIndexOf("/*", start)));
};

// The :not(...) and [...] qualifiers on the leading html compound.
const htmlQualifiers = (selector) => {
  const compound = selector.slice(0, selector.indexOf(" "));
  const parts = [];
  let depth = 0;
  let current = "";
  for (const character of compound.slice(4)) {
    if ((character === ":" || character === "[") && depth === 0 && current) {
      parts.push(current);
      current = "";
    }
    if (character === "(" || character === "[") depth += 1;
    if (character === ")" || character === "]") depth -= 1;
    current += character;
  }
  return current ? [...parts, current] : parts;
};

const androidRule = (rules, target) =>
  rules.find(({ selector }) => selector.startsWith(ANDROID_FULL) && selector.endsWith(target));

test("the Mirage Android tier is scoped to capable Android and appended last", async () => {
  const css = await read("src/styles-world-mirage.css");
  const tier = await mirageTier();
  const rules = styleRules(tier);
  assert.ok(rules.length >= 10, String(rules.length));
  for (const { selector } of rules) {
    for (const part of splitTopLevel(selector)) assert.ok(part.startsWith(ANDROID_FULL), part);
  }
  // Nothing after the tier: it refines every earlier Mirage rule.
  assert.equal(stripComments(css).trimEnd().endsWith(tier.trimEnd()), true);
});

test("the Tron floor, the curtains and the bracket overlays leave the Android layer tree", async () => {
  const rules = styleRules(await mirageTier());
  assert.equal(declaration(androidRule(rules, ".mr-hero-floor").body, "display"), "none");
  assert.equal(
    declaration(
      androidRule(rules, ":is(.story-section, .riders-section, .records-section)::after").body,
      "display",
    ),
    "none",
  );
  const overlays = androidRule(
    rules,
    ":is(.story-layout, .threat-panel, .world-column, .episode-archive, .rider-console)::after",
  );
  assert.equal(declaration(overlays.body, "content"), "none");
  // The brackets are painted into each panel's own background instead.
  for (const panel of [".story-layout", ".threat-panel", ".world-column", ".rider-console"]) {
    const rule = rules.find(
      ({ selector }) =>
        selector === `${ANDROID_FULL} .site-shell.film-edition.mirage-edition ${panel}`,
    );
    assert.ok(rule, panel);
    assert.match(declaration(rule.body, "background"), /^var\(--mr-brackets\),/, panel);
    assert.equal(declaration(rule.body, "background-repeat"), "no-repeat", panel);
    // styles-world/13.css and 25.css screen-blend these panels' layers; the
    // overlays drew the brackets normally, so the strokes must too.
    if (panel !== ".story-layout") {
      assert.equal(declaration(rule.body, "background-blend-mode"), "normal", panel);
    }
  }
  // The record bay's overlay spans the bay again (Mirage undoes 06.css's
  // 2 x 68px box, 2026-09-29), so its background paints the four corners.
  const bay = rules.filter(
    ({ selector }) =>
      selector === `${ANDROID_FULL} .site-shell.film-edition.mirage-edition .episode-archive`,
  );
  assert.equal(bay.length, 2, "the record bay, in both transparency modes");
  for (const { body } of bay) {
    assert.match(
      declaration(body, "background"),
      /^var\(--mr-brackets\),/,
    );
    assert.equal(declaration(body, "background-repeat"), "no-repeat");
    assert.equal(declaration(body, "background-blend-mode"), "normal");
  }
  const archive = await read("src/styles-world/06.css");
  assert.match(archive, /\.episode-archive::after \{[^}]*width: 2px;\s*height: 68px;/);
});

test("no blurred shadow over 48px on Android's poster frame, topbar or Zeus button", async () => {
  const rules = styleRules(await mirageTier());
  const poster = declaration(androidRule(rules, ".poster-frame").body, "box-shadow");
  assert.ok(poster, "poster frame shadow restated");
  for (const blur of blurRadii(poster)) assert.ok(blur <= 48, poster);
  const topbar = androidRule(rules, ".topbar").body;
  for (const blur of blurRadii(declaration(topbar, "box-shadow"))) assert.equal(blur, 0);
  assert.equal(declaration(topbar, "transition"), "none");

  // 2026-11-23 (owner: phones equal PC in high quality mode): the Zeus
  // button keeps its PC halo on capable Android; every Android Zeus rule is
  // now scoped to the lightweight renderer.
  const android = styleRules(stripComments(await read("src/styles-android-performance.css")));
  const zeus = android.filter(({ selector }) => /\.zeus-button/.test(selector));
  assert.ok(zeus.length > 0);
  for (const { selector } of zeus) {
    for (const part of splitTopLevel(selector)) {
      assert.match(part, /^html\[data-world-effects="economy"\]\[data-android-renderer\] /, part);
    }
  }

  // Every other renderer keeps the full halo.
  const base = styleRules(stripComments(await read("src/styles-world-mirage.css"))).find(
    ({ selector }) => selector === ".site-shell.film-edition.mirage-edition .poster-frame",
  );
  assert.ok(Math.max(...blurRadii(declaration(base.body, "box-shadow"))) >= 160);
});

// 2026-11-23 (owner: phones equal PC in high quality mode): the scroll
// reveals' PC keyframes are compositor-only now, so Android runs them as PC
// does and the clip-path stand-ins (mr-rise-in, mr-fade-in, mx-lift-flat) are
// gone. The Samsung Internet 28-30 limit (no composited clip-path) is now
// guarded on the keyframes themselves. The iris stays at rest on Android:
// it is part of the tile-memory budget.
test("Android animates no clip-path reveal and no iris", async () => {
  const rules = styleRules(await mirageTier());
  const all = styleRules(stripComments(await read("src/styles-world-mirage.css")));
  const target = ".finale-sticky::before";
  const rule = androidRule(rules, target);
  assert.equal(declaration(rule.body, "animation"), "none", target);
  // The override restates every gate of the scroll rule it refines, so it
  // applies exactly while that rule does.
  const refined = all.find(
    ({ selector, body }) =>
      !selector.startsWith(ANDROID_FULL) &&
      selector.endsWith(target) &&
      /animation-timeline/.test(body),
  );
  assert.ok(refined, target);
  const gates = htmlQualifiers(refined.selector);
  assert.ok(gates.length >= 3, refined.selector);
  const android = htmlQualifiers(rule.selector);
  for (const gate of gates) assert.ok(android.includes(gate), `${target} lacks ${gate}`);
  assert.ok(android.includes("[data-android-renderer]"), target);

  // Every scroll-linked Mirage reveal that Android now runs moves only
  // opacity and transforms, so none of them needs the main thread.
  const css = stripComments(await read("src/styles-world-mirage.css"));
  for (const target of [
    ":is(.signal > img, .other-archive-card > img, .dante-visual img)",
    ".threat-copy h3",
    ".threat-copy .system-label",
    ".finale-content > span",
    ".mr-endmark :is(span, b)",
  ]) {
    const reveal = all.find(
      ({ selector, body }) =>
        !selector.startsWith(ANDROID_FULL) &&
        selector.endsWith(target) &&
        /animation-timeline/.test(body),
    );
    assert.ok(reveal, target);
    assert.equal(androidRule(rules, target), undefined, `${target} has no Android stand-in`);
    const name = declaration(reveal.body, "animation").split(" ")[0];
    const frames = css.match(new RegExp(`@keyframes ${name} \\{([\\s\\S]*?\\})\\s*\\}`))?.[1];
    assert.ok(frames, name);
    for (const [, property] of frames.matchAll(/([\w-]+)\s*:/g)) {
      assert.ok(["opacity", "translate", "scale", "rotate", "transform"].includes(property), `${name}: ${property}`);
    }
  }

  const motion = stripComments(await read("src/styles-motion-edition.css"));
  assert.doesNotMatch(motion, /\[data-android-renderer\]/);
});

// 2026-11-23: the beam's screen blend was a perf trim outside the tile
// budget; Android now blends it as PC does.
test("Android blends the hero beam as PC does", async () => {
  const rules = styleRules(await mirageTier());
  assert.equal(androidRule(rules, ".mr-hero-beam"), undefined);
});

test("the hero HUD clips without becoming a composited scroller", async () => {
  const css = stripComments(await read("src/styles-world-mirage.css"));
  const hud = styleRules(css).find(
    ({ selector }) => selector === ".site-shell.film-edition.mirage-edition .mr-hero-hud",
  );
  assert.equal(declaration(hud.body, "overflow"), "clip");
});
