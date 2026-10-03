import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/* 2026-10-04 rx4: Rexonance, the Armour edition
   (src/styles-rexonance-armour.css). The page drawn the way the suit-up
   renders its armour: bevelled plates with a specular edge and a sheen,
   metal numerals, a lattice ground with light behind the figure. These pin
   where it loads, that every rule is scoped to the Rexonance page, that it
   is paint only, that it keeps the measured geometry alone, the 12px floor,
   and that forced colours and more contrast restate system text. */

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const source = read("src/styles-rexonance-armour.css");
const css = strip(source);
const route = read("src/routes/rexonance-saga.tsx");

// Top-level selectors with their at-rule context.
function rules(text) {
  const out = [];
  const stack = [];
  let prelude = "";
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === "{") {
      const head = prelude.replace(/\s+/g, " ").trim();
      prelude = "";
      if (head.startsWith("@")) {
        stack.push(head);
        continue;
      }
      let depth = 1;
      let end = i + 1;
      for (; end < text.length && depth > 0; end += 1) {
        if (text[end] === "{") depth += 1;
        if (text[end] === "}") depth -= 1;
      }
      out.push({ selector: head, body: text.slice(i + 1, end - 1).trim(), context: [...stack] });
      i = end - 1;
    } else if (c === "}") {
      stack.pop();
      prelude = "";
    } else prelude += c;
  }
  return out;
}
const sheet = rules(css);
const splitTopLevel = (text) => {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const ch of text) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else current += ch;
  }
  return [...parts, current.trim()].filter(Boolean);
};

test("the armour sheet loads after the couture sheet, before the cinematic sheet, on its route only", () => {
  assert.match(route, /import rexonanceArmourCssUrl from "@\/styles-rexonance-armour\.css\?url"/);
  const links = route.slice(route.search(/links:\s*\[/));
  const couture = links.indexOf("href: rexonanceCoutureCssUrl");
  const armour = links.indexOf("href: rexonanceArmourCssUrl");
  const cinematic = links.indexOf("CINEMATIC_STYLESHEET_LINK");
  assert.ok(couture > 0 && couture < armour && armour < cinematic);
  for (const path of [
    "src/lib/world-head.ts",
    "src/routes/__root.tsx",
    "src/routes/world.tsx",
    "src/routes/final-stage.tsx",
    "src/routes/extreme-saga.tsx",
    "src/routes/dream-chapter.tsx",
  ]) {
    assert.doesNotMatch(read(path), /rexonance-armour/, path);
  }
});

test("every rule is scoped to the Rexonance page, so Extreme and Final Stage never see it", () => {
  assert.ok(sheet.length > 40, String(sheet.length));
  for (const { selector } of sheet) {
    for (const part of splitTopLevel(selector)) {
      assert.match(
        part,
        /^(?:html(?::not\(\[[^\]]+\]\))* )?\.rxs-page\.rxs-page\.rxs-rexonance-page\b/,
        part,
      );
      assert.doesNotMatch(part, /\.exs-|\.fst-/, part);
    }
  }
});

test("paint only: no keyframes, no animation, no timelines, no filter, no generated text, nothing fetched", () => {
  assert.doesNotMatch(
    css,
    /@keyframes|\binfinite\b|(?<![\w-])animation(?:-[\w-]+)?\s*:|view-timeline|scroll-timeline/,
  );
  assert.doesNotMatch(
    css,
    /(?<![\w-])content\s*:|backdrop-filter|mix-blend-mode|background-attachment|\bfilter\s*:/,
  );
  assert.doesNotMatch(css, /url\((?!"#|'#)/);
  assert.doesNotMatch(
    css,
    /touch-action\s*:|overscroll-behavior\s*:|scroll-snap-|pointer-events\s*:|::selection/,
  );
  // Static placement never uses transform (the still tiers force it off).
  assert.doesNotMatch(css, /(?<![\w-])transform\s*:/);
});

test("state transitions are short, paint-only and behind reduced motion and economy", () => {
  const transitions = sheet.filter(({ body }) => /(?:^|;)\s*transition/.test(body));
  assert.ok(transitions.length >= 1);
  for (const { selector, body, context } of transitions) {
    assert.ok(
      context.some((at) => /prefers-reduced-motion:\s*no-preference/.test(at)),
      selector,
    );
    assert.match(selector, /^html:not\(\[data-world-effects="economy"\]\)/);
    const value = body.match(/transition:\s*([^;]+)/)[1];
    assert.match(value, /^(?:box-shadow|border-color|color)(?:\s|,)/);
    for (const ms of value.matchAll(/(\d+)ms/g)) assert.ok(Number(ms[1]) <= 240, value);
  }
});

test("the measured geometry is left alone and text keeps its 12px floor", () => {
  // The local nav, the liquid rail, the P14 slider and pills, the selects
  // and the stage copy start keep the earlier sheets' boxes.
  for (const { selector, body } of sheet) {
    if (
      /rxs-local-nav|rxs-stage-tabs|liquid-swipe|rxs-p14-ios-(?:slider|thumb)|rxs-p14-range-labels|select\b|rxs-stage-panel > div(?!\s*>\s*small)/.test(
        selector,
      )
    ) {
      assert.doesNotMatch(
        body,
        /(?:^|;)\s*(?:height|width|padding|margin|top|left|right|bottom|inset|gap|font-size|line-height)\s*:/,
        selector,
      );
    }
  }
  for (const [, value] of css.matchAll(/font-size:\s*([^;]+);/g)) {
    const px = value.match(/^(\d+(?:\.\d+)?)px$/);
    assert.ok(px && Number(px[1]) >= 12, value);
  }
});

test("forced colours restate system surfaces and text; more contrast drops the sheen, lattice and metal text", () => {
  const forced = sheet.filter(({ context }) =>
    context.some((at) => /forced-colors:\s*active/.test(at)),
  );
  assert.ok(forced.length >= 4);
  const text = forced.find(({ selector }) => /rxs-headline-metrics strong/.test(selector));
  assert.match(text.body, /color:\s*CanvasText/);
  assert.match(text.body, /background:\s*none/);
  const plates = forced.find(
    ({ selector }) =>
      /rxs-system .rxs-system-grid article/.test(selector) && /rxs-comparison/.test(selector),
  );
  assert.match(plates.body, /clip-path:\s*none/);
  assert.match(plates.body, /outline:\s*1px solid CanvasText/);
  const more = sheet.filter(({ context }) =>
    context.some((at) => /prefers-contrast:\s*more/.test(at)),
  );
  const tokens = more.find(({ selector }) => selector === ".rxs-page.rxs-page.rxs-rexonance-page");
  assert.match(tokens.body, /--ra-sheen:\s*none/);
  assert.match(tokens.body, /--ra-lattice:\s*none/);
  // Metal text is gradient-clipped only where a solid colour is restated.
  const clipped = sheet.filter(
    ({ body, context }) => /background-clip:\s*text/.test(body) && !context.length,
  );
  assert.ok(clipped.length >= 6);
  for (const { body } of clipped) assert.match(body, /color:\s*transparent/);
});
