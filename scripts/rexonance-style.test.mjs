import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/* 2026-10-03 rx3: Rexonance, the Couture edition
   (src/styles-rexonance-couture.css). A paint, type and composition layer:
   one lacquered ground with a fine grain, editorial chapter heads, thin
   numerals, ink-glass instruments. These pin its safety properties: route
   and scope, no motion of its own, gated state transitions, the 12px floor,
   no geometry on measured controls, no generated text, forced colours and
   increased contrast, and the P14 intro's unchanged text. */

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const source = read("src/styles-rexonance-couture.css");
const couture = strip(source);
const route = read("src/routes/rexonance-saga.tsx");
const page = read("src/components/rexonance-saga/rexonance-saga.tsx");

const flat = (text) =>
  text.replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").trim();

// Style rules with their at-rule context (keyframes are collected apart).
function parse(css) {
  const rules = [];
  const keyframes = [];
  const stack = [];
  let prelude = "";
  for (let index = 0; index < css.length; index += 1) {
    const character = css[index];
    if (character === "{") {
      const head = flat(prelude);
      prelude = "";
      if (/^@(?:-webkit-)?keyframes\b/.test(head)) {
        keyframes.push(head);
        let depth = 1;
        let end = index + 1;
        for (; end < css.length && depth > 0; end += 1) {
          if (css[end] === "{") depth += 1;
          if (css[end] === "}") depth -= 1;
        }
        index = end - 1;
        continue;
      }
      if (head.startsWith("@")) {
        stack.push(head);
        continue;
      }
      const end = css.indexOf("}", index);
      rules.push({ selector: head, body: flat(css.slice(index + 1, end)), context: [...stack] });
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
}

const splitTopLevel = (value, separator = ",") => {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const character of value) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (character === separator && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else current += character;
  }
  return [...parts, current.trim()].filter(Boolean);
};

const declarations = (body) =>
  splitTopLevel(body, ";").map((item) => {
    const colon = item.indexOf(":");
    return [item.slice(0, colon).trim(), item.slice(colon + 1).trim()];
  });

const sheet = parse(couture);

test("the couture sheet loads after the premiere sheet, before the cinematic sheet, on its route only", () => {
  assert.match(route, /import rexonanceCoutureCssUrl from "@\/styles-rexonance-couture\.css\?url"/);
  const links = route.slice(route.search(/links:\s*\[/));
  const premiere = links.indexOf("href: rexonancePremiereCssUrl");
  const couture = links.indexOf("href: rexonanceCoutureCssUrl");
  const cinematic = links.indexOf("CINEMATIC_STYLESHEET_LINK");
  assert.ok(premiere > 0 && premiere < couture && couture < cinematic);
  for (const path of [
    "src/lib/world-head.ts",
    "src/routes/__root.tsx",
    "src/routes/world.tsx",
    "src/routes/final-stage.tsx",
    "src/routes/extreme-saga.tsx",
    "src/routes/dream-chapter.tsx",
  ]) {
    assert.doesNotMatch(read(path), /rexonance-couture/, path);
  }
});

test("every rule is scoped to the Rexonance page, so Extreme and Final Stage never see it", () => {
  assert.ok(sheet.rules.length > 60, String(sheet.rules.length));
  for (const { selector } of sheet.rules) {
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

test("paint only: no keyframes, no animation, no timelines, no loops, no generated text", () => {
  assert.equal(sheet.keyframes.length, 0);
  assert.doesNotMatch(
    couture,
    /\binfinite\b|(?<![\w-])animation(?:-[\w-]+)?\s*:|view-timeline|scroll-timeline|(?<![\w-])content\s*:/,
  );
  assert.doesNotMatch(couture, /touch-action\s*:|overscroll-behavior\s*:|scroll-snap-|pointer-events\s*:/);
  // No blur, blend or fixed layer behind the grain.
  assert.doesNotMatch(couture, /backdrop-filter|mix-blend-mode|background-attachment|\bfilter\s*:/);
  // No ancestor-scoped highlight pseudo: it made every element on the page
  // resolve a ::selection style on each subtree recalc (rx3 perf trace).
  assert.doesNotMatch(couture, /::selection|::target-text|::highlight\(/);
});

test("state transitions are short, colour-only and behind reduced motion and economy", () => {
  const transitions = sheet.rules.filter(({ body }) => /(?:^|;)\s*transition/.test(body));
  assert.ok(transitions.length >= 1);
  for (const { selector, body, context } of transitions) {
    assert.ok(
      context.some((at) => /prefers-reduced-motion:\s*no-preference/.test(at)),
      selector,
    );
    for (const part of splitTopLevel(selector)) {
      assert.match(part, /^html:not\(\[data-world-effects="economy"\]\) /, part);
    }
    const value = declarations(body).find(([property]) => property === "transition")[1];
    for (const layer of splitTopLevel(value)) {
      const [property, duration] = layer.split(/\s+/);
      assert.ok(["border-color", "color", "background-color"].includes(property), layer);
      assert.ok(Number.parseFloat(duration) <= 220, layer);
    }
  }
});

test("text keeps its 12px floor", () => {
  for (const [, value] of couture.matchAll(/font-size:\s*([^;]+);/g)) {
    const px = value.match(/^(\d+(?:\.\d+)?)px$/);
    if (px) assert.ok(Number(px[1]) >= 12, value);
    const clamp = value.match(/^clamp\((\d+(?:\.\d+)?)px,/);
    if (clamp) assert.ok(Number(clamp[1]) >= 12, value);
    assert.ok(px || clamp, `unchecked font-size ${value}`);
  }
});

test("the measured controls keep their geometry", () => {
  const protectedControl =
    /\.rxs-stage-tabs|\.liquid-|\.rxs-p14-ios-|\bselect\b|\.rxs-local-nav\b|\.rxs-menu-trigger|\.rxs-p14-range-labels|\.rxs-section\[id\]|\.rxs-stage-panel > div$/;
  const geometry =
    /^(?:width|height|min-|max-|inset|top|left|right|bottom|margin|padding|grid|display|position|font-size|line-height|border-width|border$|scroll-margin|flex)/;
  for (const { selector, body } of sheet.rules) {
    for (const part of splitTopLevel(selector)) {
      if (!protectedControl.test(part)) continue;
      // The local nav's links may take tracking on wide screens only; the
      // bar, its inner grid and the trigger take paint.
      for (const [property] of declarations(body)) {
        assert.doesNotMatch(property, geometry, `${part}: ${property}`);
      }
    }
  }
  // The P14 slider's track is repainted, never resized.
  const track = sheet.rules.filter(({ selector }) => /\.rxs-p14-ios-track/.test(selector));
  assert.ok(track.length >= 1);
  for (const { body } of track) {
    for (const [property] of declarations(body)) assert.equal(property, "background");
  }
});

test("!important only answers the trigger's forced paint; one inline grain, nothing fetched", () => {
  for (const block of couture.match(/[^{}]+\{[^}]*!important[^}]*\}/g) ?? []) {
    assert.match(block, /\.rxs-menu-trigger/, block);
  }
  // One url(): the inline grain (its own filter reference is inside it).
  const urls = [...couture.matchAll(/url\(\s*["']?([^"')]*)/g)].map((match) => match[1]);
  assert.deepEqual(
    urls.filter((url) => !url.startsWith("%23")).map((url) => url.slice(0, 19)),
    ["data:image/svg+xml,"],
  );
  assert.match(couture, /--rc-grain: url\("data:image\/svg\+xml,[^"]+"\);/);
  assert.ok(source.length < 60_000);
});

test("forced colours restate the system surfaces; more contrast drops the grain", () => {
  const forced = sheet.rules
    .filter(({ context }) => context.some((at) => /forced-colors:\s*active/.test(at)))
    .map(({ selector, body }) => `${selector} { ${body} }`)
    .join("\n");
  for (const surface of [
    ".rxs-hero",
    ".rxs-section",
    ".rxs-footer",
    ".rxs-local-nav",
    ".rxs-chapter-index",
    ".rxs-comparison",
    ".rxs-p14-comparator",
    ".rxs-p14-metrics article",
    ".rxs-system-grid article",
    ".rxs-processing-comparison > div > section",
  ]) {
    assert.ok(forced.includes(surface), surface);
  }
  assert.match(forced, /background: Canvas/);
  assert.match(forced, /outline: 1px solid CanvasText/);
  assert.match(forced, /\.rxs-section-heading > p::after \{ display: none; \}/);
  assert.match(forced, /\.rxs-menu-trigger \{[^}]*background: ButtonFace !important/);
  assert.match(forced, /background: ButtonFace/);
  const contrast = sheet.rules.find(({ context }) =>
    context.some((at) => /prefers-contrast:\s*more/.test(at)),
  );
  assert.ok(contrast);
  assert.match(contrast.body, /--rc-grain: none/);
  assert.match(contrast.body, /--rc-body: var\(--rc-ivory\)/);
});

test("the colour story is ice, violet and gold; magenta stays ULTRA's own", () => {
  assert.doesNotMatch(couture, /#ff5cc8|#ff72da|255 92 200|255 114 218/i);
  for (const token of ["--rc-ice: #7ae8ff", "--rc-violet: #b6a3ff", "--rc-gold: #e3c185"]) {
    assert.ok(couture.includes(token), token);
  }
  // The showcase's Apple neutrals follow the lacquer on this page only.
  assert.match(couture, /--sc-ink: var\(--rc-ink\);/);
  assert.match(couture, /--sc-tile: var\(--rc-plate\);/);
  assert.match(couture, /--sc-prism: var\(--rc-prism\);/);
});

test("the P14 intro keeps its exact text; only phrase units were wrapped", () => {
  const intro = page.match(
    /<h2 id="rxs-p14-title">[\s\S]*?<\/h2>\s*<span>([\s\S]*?)<\/span>\s*<\/header>/,
  )?.[1];
  assert.ok(intro);
  const text = intro.replace(/<[^>]+>/g, "").replace(/\s*\n\s*/g, "");
  assert.equal(
    text,
    "P14は、出力変換・位相制御・能力間調停を一体化した第14世代演算基盤です。同じエーテル量からP1の9倍に相当する性能を引き出し、熱・位相ノイズ・能力間干渉による損失を合計7%まで抑えます。",
  );
  assert.match(intro, /<span className="rxp-nowrap">一体化した<\/span>/);
  assert.match(intro, /<span className="rxp-nowrap">第14世代<\/span>/);
});
