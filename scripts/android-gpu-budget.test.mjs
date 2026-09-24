import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// The Android lite tier keeps /world under the tile budget of Android GPUs at
// DPR 3-3.5 (measured: 145-204 MB of active tiles before, 70-120 MB after).
// These pins keep the heavy layers from coming back.

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
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
  }
});

test("no blurred shadow over 48px on Android's poster frame, topbar or Zeus button", async () => {
  const rules = styleRules(await mirageTier());
  const poster = declaration(androidRule(rules, ".poster-frame").body, "box-shadow");
  assert.ok(poster, "poster frame shadow restated");
  for (const blur of blurRadii(poster)) assert.ok(blur <= 48, poster);
  const topbar = androidRule(rules, ".topbar").body;
  for (const blur of blurRadii(declaration(topbar, "box-shadow"))) assert.equal(blur, 0);
  assert.equal(declaration(topbar, "transition"), "none");

  const android = styleRules(stripComments(await read("src/styles-android-performance.css")));
  const zeus = android.find(({ selector }) =>
    /^html[^ ]*\[data-android-renderer\] \.zeus-button/.test(selector),
  );
  assert.ok(zeus?.selector.startsWith(ANDROID_FULL), zeus?.selector);
  // Dragging and the return spinner keep their own glow.
  assert.match(
    zeus.selector,
    /:not\(\[data-dragging="true"\]\):not\(\[data-return-loading="true"\]\)$/,
  );
  for (const blur of blurRadii(declaration(zeus.body, "box-shadow"))) assert.equal(blur, 0);

  // Every other renderer keeps the full halo.
  const base = styleRules(stripComments(await read("src/styles-world-mirage.css"))).find(
    ({ selector }) => selector === ".site-shell.film-edition.mirage-edition .poster-frame",
  );
  assert.ok(Math.max(...blurRadii(declaration(base.body, "box-shadow"))) >= 160);
});

test("Android animates no image clip-path, no iris and no panel opacity surface", async () => {
  const rules = styleRules(await mirageTier());
  const all = styleRules(stripComments(await read("src/styles-world-mirage.css")));
  for (const target of [
    ":is(.signal > img, .other-archive-card > img, .dante-visual img)",
    ".finale-sticky::before",
  ]) {
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
  }

  const motion = stripComments(await read("src/styles-motion-edition.css"));
  const motionRules = styleRules(motion);
  const lift = motionRules.find(
    ({ selector }) =>
      selector ===
      `${ANDROID_FULL} .site-shell.film-edition.motion-on :is(.story-layout, .threat-panel, .world-column, .rider-console, .episode-archive)`,
  );
  assert.equal(declaration(lift.body, "animation-name"), "mx-lift-flat");
  const flat = motion.match(/@keyframes mx-lift-flat \{([\s\S]*?\})\s*\}/)?.[1] ?? "";
  assert.match(flat, /translate:/);
  assert.doesNotMatch(flat, /opacity/);
  const settle = motionRules.find(
    ({ selector }) =>
      selector === `${ANDROID_FULL} .site-shell.film-edition.motion-on .finale-backdrop img`,
  );
  assert.equal(declaration(settle.body, "animation"), "none");
});

test("the compositor reveals keep the timeline, range and cadence of the wipes they replace", async () => {
  const all = styleRules(stripComments(await read("src/styles-world-mirage.css")));
  const rises = styleRules(await mirageTier()).filter(({ body }) =>
    /animation: mr-(?:rise|fade)-in /.test(body),
  );
  assert.equal(rises.length, 5);
  const members = (selector) => {
    const target = selector.slice(
      selector.indexOf(".site-shell.film-edition.mirage-edition ") + 40,
    );
    return /^:is\(.*\)$/.test(target) ? splitTopLevel(target.slice(4, -1)) : [target];
  };
  for (const rise of rises) {
    const wipe = all.find(
      ({ selector, body }) =>
        !selector.startsWith(ANDROID_FULL) &&
        members(rise.selector).every((member) => members(selector).includes(member)) &&
        /animation-timeline/.test(body),
    );
    assert.ok(wipe, rise.selector);
    assert.match(declaration(wipe.body, "animation"), /^mr-(?:type|wipe) /);
    for (const property of ["animation-timeline", "animation-range"]) {
      assert.equal(declaration(rise.body, property), declaration(wipe.body, property), property);
    }
    // Same easing or steps: the labels keep their typing cadence.
    const timing = (value) => value.replace(/^mr-[\w-]+ /, "");
    assert.equal(
      timing(declaration(rise.body, "animation")),
      timing(declaration(wipe.body, "animation")),
    );
  }
  for (const name of ["mr-rise-in", "mr-fade-in"]) {
    const frames = (await mirageTier()).match(
      new RegExp(`@keyframes ${name} \\{([\\s\\S]*?\\})\\s*\\}`),
    )?.[1];
    assert.ok(frames, name);
    for (const [, property] of frames.matchAll(/([\w-]+)\s*:/g)) {
      assert.ok(["opacity", "translate"].includes(property), property);
    }
  }
  // An inline box ignores translate, and a reveal that animates it there
  // falls back to the main thread: the inline archive label only fades.
  const label = styleRules(await mirageTier()).find(({ selector }) =>
    selector.endsWith(".threat-copy .system-label"),
  );
  assert.match(declaration(label.body, "animation"), /^mr-fade-in /);
});

test("no blend mode on a layer that animates on Android", async () => {
  const css = stripComments(await read("src/styles-world-mirage.css"));
  const rules = styleRules(css);
  const key = (selector) => selector.split(" ").at(-1);
  const animated = new Set(
    rules
      .filter(({ body }) => /(?:^|;)\s*animation(?:-name)?:(?!\s*none)/.test(body))
      .flatMap(({ selector }) => splitTopLevel(selector).map(key)),
  );
  const blended = rules.filter(
    ({ selector, body }) =>
      !selector.startsWith(ANDROID_FULL) &&
      /mix-blend-mode:\s*(?!normal)/.test(body) &&
      animated.has(key(selector)),
  );
  assert.ok(blended.length > 0);
  for (const { selector } of blended) {
    const android = androidRule(rules, ` ${key(selector)}`);
    assert.equal(declaration(android?.body ?? "", "mix-blend-mode"), "normal", selector);
  }
});

test("the hero HUD clips without becoming a composited scroller", async () => {
  const css = stripComments(await read("src/styles-world-mirage.css"));
  const hud = styleRules(css).find(
    ({ selector }) => selector === ".site-shell.film-edition.mirage-edition .mr-hero-hud",
  );
  assert.equal(declaration(hud.body, "overflow"), "clip");
});
