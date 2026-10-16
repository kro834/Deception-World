import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import ts from "typescript";

/* 2026-10-16 rx18: Rexonance, FORGE — the special site's type and chrome
   (src/styles-rexonance-forge.css, public/fonts/rexonance-*.woff2). The
   owner asked for the Rexonance site's typography and the rest of its
   presentation to be brushed up a great deal: the name and every figure
   are forged in a self-hosted Latin face (Saira, OFL), the instrument
   labels etched in Michroma, the chrome speaks the engines' grammar
   (chips, guideways, molten gold). These pin the route-only delivery of
   the sheet and the faces, the scope (never the bar, the menu, the calls
   or the operable controls), the 12px floor, metal only behind
   @supports with a solid twin, forced colours and more contrast, the
   motion discipline (rxf-* keyframes, the full gate, transient keys, the
   chip riding RESONANCE's own draw), and that the owner's copy renders
   unchanged. Every assertion here: owner request 2026-10-16: FORGE (rx18). */

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const bytes = (path) => readFileSync(new URL(`../${path}`, import.meta.url));
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const css = strip(read("src/styles-rexonance-forge.css"));
const resonance = strip(read("src/styles-rexonance-resonance.css"));
const route = read("src/routes/rexonance-saga.tsx");
const page = read("src/components/rexonance-saga/rexonance-saga.tsx");
const script = read("src/lib/rexonance-resonance.js");

const flat = (text) =>
  text.replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").trim();

function parse(text) {
  const rules = [];
  const keyframes = new Map();
  const faces = [];
  const stack = [];
  let prelude = "";
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === "{") {
      const head = flat(prelude);
      prelude = "";
      const frames = head.match(/^@keyframes\s+([\w-]+)$/);
      if (frames || head === "@font-face") {
        let depth = 1;
        let end = index + 1;
        for (; end < text.length && depth > 0; end += 1) {
          if (text[end] === "{") depth += 1;
          if (text[end] === "}") depth -= 1;
        }
        const body = text.slice(index + 1, end - 1);
        if (frames) keyframes.set(frames[1], body);
        else faces.push(flat(body));
        index = end - 1;
        continue;
      }
      if (head.startsWith("@")) {
        stack.push(head);
        continue;
      }
      const end = text.indexOf("}", index);
      rules.push({ selector: head, body: flat(text.slice(index + 1, end)), context: [...stack] });
      index = end;
      continue;
    }
    if (character === "}") {
      stack.pop();
      prelude = "";
    } else if (character === ";") prelude = "";
    else prelude += character;
  }
  return { rules, keyframes, faces };
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
const declaration = (body, property) =>
  body.match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`))?.[1].trim();

// Selector specificity [ids, classes/attributes/pseudo-classes, types].
function specificity(selector) {
  let ids = 0;
  let classes = 0;
  let types = 0;
  let rest = selector.replace(/::[\w-]+(?:\([^)]*\))?/g, () => {
    types += 1;
    return "";
  });
  // :is() / :not() count as their most specific argument.
  for (;;) {
    const match = rest.match(/:(is|not|where)\(/);
    if (!match) break;
    const start = match.index + match[0].length;
    let depth = 1;
    let end = start;
    for (; end < rest.length && depth > 0; end += 1) {
      if (rest[end] === "(") depth += 1;
      if (rest[end] === ")") depth -= 1;
    }
    const inner = rest.slice(start, end - 1);
    if (match[1] !== "where") {
      const best = splitTopLevel(inner)
        .map(specificity)
        .sort((a, b) => b[0] - a[0] || b[1] - a[1] || b[2] - a[2])[0];
      ids += best[0];
      classes += best[1];
      types += best[2];
    }
    rest = rest.slice(0, match.index) + " " + rest.slice(end);
  }
  rest = rest.replace(/\[[^\]]*\]/g, () => {
    classes += 1;
    return " ";
  });
  rest = rest.replace(/#[\w-]+/g, () => {
    ids += 1;
    return " ";
  });
  rest = rest.replace(/[.:][\w-]+(?:\([^)]*\))?/g, () => {
    classes += 1;
    return " ";
  });
  for (const token of rest.split(/[\s>+~]+/)) if (/^[a-z][\w-]*$/i.test(token)) types += 1;
  return [ids, classes, types];
}
const below = (a, b) =>
  a[0] < b[0] || (a[0] === b[0] && (a[1] < b[1] || (a[1] === b[1] && a[2] < b[2])));

const sheet = parse(css);
const REDUCED = /prefers-reduced-motion:\s*no-preference/;
const SUPPORTS_TIMELINE =
  /^@supports \(animation-timeline: view\(\)\) and \(animation-range: entry 0% entry 100%\)$/;
const SUPPORTS_CLIP =
  /^@supports \(\(background-clip: text\) or \(-webkit-background-clip: text\)\)$/;
const SCOPE =
  /^html\[data-family="special"\](?::not\(\[[^\]]+\]\))* body \.rxs-page\.rxs-page\.rxs-rexonance-page(?![\w-])/;
const FULL_GATE =
  /^html\[data-family="special"\]:not\(\[data-world-effects="economy"\]\):not\(\[data-side-menu-open\]\):not\(\[data-dialog-open\]\) body \.rxs-page\.rxs-page\.rxs-rexonance-page:not\(\[data-route-covered\]\)\[data-motion-ready="true"\]/;
const FORGE_FONT = "/fonts/rexonance-forge-20261016.woff2";
const OUTLINE_FONT = "/fonts/rexonance-forge-outline-20261016.woff2";
const ETCH_FONT = "/fonts/rexonance-etch-20261016.woff2";

const animated = (body) => {
  const animation = declaration(body, "animation") ?? declaration(body, "animation-name");
  return Boolean(animation) && animation !== "none";
};
const scrollLinked = ({ body }) => {
  const timeline = declaration(body, "animation-timeline");
  return Boolean(timeline) && !/^(?:auto|none)$/.test(timeline);
};

/* ---------------- part 1: route and files ---------------- */
test("the FORGE sheet loads after ZENITH, before the cinematic sheet, on its route only", () => {
  // owner request 2026-10-16: FORGE (rx18)
  assert.match(route, /import rexonanceForgeCssUrl from "@\/styles-rexonance-forge\.css\?url"/);
  const links = route.slice(route.search(/links:\s*\[/));
  const zenith = links.indexOf("href: rexonanceZenithCssUrl");
  const forge = links.indexOf("href: rexonanceForgeCssUrl");
  const cinematic = links.indexOf("CINEMATIC_STYLESHEET_LINK");
  assert.ok(zenith > 0 && zenith < forge && forge < cinematic);
  for (const path of [
    "src/lib/world-head.ts",
    "src/routes/__root.tsx",
    "src/routes/world.tsx",
    "src/routes/extreme-saga.tsx",
    "src/routes/final-stage.tsx",
    "src/routes/dream-chapter.tsx",
  ]) {
    assert.doesNotMatch(read(path), /rexonance-forge/, path);
  }
});

test("the forged face is preloaded on this route only; the files are small woff2 subsets under the OFL", () => {
  // owner request 2026-10-16: FORGE (rx18)
  const preload = new RegExp(
    String.raw`\{\s*rel: "preload",\s*as: "font",\s*type: "font/woff2",\s*href: "${FORGE_FONT.replace(/[./]/g, "\\$&")}",\s*crossOrigin: "anonymous",\s*\}`,
    "g",
  );
  assert.equal(route.match(preload)?.length, 1);
  assert.equal(route.match(/as: "font"/g)?.length, 1, "one font preload on the route");
  for (const path of [
    "src/routes/world.tsx",
    "src/routes/extreme-saga.tsx",
    "src/routes/final-stage.tsx",
    "src/routes/dream-chapter.tsx",
    "src/routes/__root.tsx",
    "src/lib/world-head.ts",
  ]) {
    assert.doesNotMatch(read(path), /rexonance-forge-2026/, path);
  }
  // owner request 2026-10-16: FORGE (rx18) — the outline instance holds
  // only the outlined letters (contours merged, so a stroke never shows
  // an inner contour); the etched subset only a-z and !.
  for (const [path, limit] of [
    [`public${FORGE_FONT}`, 40_000],
    [`public${OUTLINE_FONT}`, 4_000],
    [`public${ETCH_FONT}`, 4_000],
  ]) {
    assert.ok(existsSync(new URL(`../${path}`, import.meta.url)), path);
    const file = bytes(path);
    assert.equal(file.subarray(0, 4).toString("latin1"), "wOF2", path);
    assert.ok(file.length <= limit, `${path}: ${file.length}`);
  }
  const license = read("public/fonts/OFL.txt");
  assert.match(license, /Saira/);
  assert.match(license, /Michroma/);
  assert.match(license, /SIL Open Font License, Version 1\.1/);
});

/* ---------------- part 2: faces and scope ---------------- */
test("the faces swap, stay inside the Latin range, and the fallbacks are local grotesques", () => {
  // owner request 2026-10-16: FORGE (rx18)
  const remote = sheet.faces.filter((face) => /url\(/.test(face));
  const local = sheet.faces.filter((face) => !/url\(/.test(face));
  assert.equal(remote.length, 3);
  assert.equal(local.length, 2);
  for (const face of sheet.faces) {
    assert.match(face, /font-display: swap/, face);
    const range = declaration(face, "unicode-range");
    assert.ok(range, face);
    for (const [, from, to] of range.matchAll(/U\+([0-9A-F]+)(?:-([0-9A-F]+))?/gi)) {
      for (const point of [from, to ?? from].map((hex) => parseInt(hex, 16))) {
        assert.ok(
          point < 0x100 || [0xb7, 0xd7, 0x2212].includes(point),
          `${face}: U+${point.toString(16)}`,
        );
      }
    }
  }
  for (const face of local) {
    assert.match(face, /font-family: "Rexonance Forge Fallback"/);
    for (const source of splitTopLevel(declaration(face, "src")))
      assert.match(source, /^local\("[^"]+"\)$/, source);
    assert.match(face, /size-adjust: 109%/);
    assert.match(face, /ascent-override: 104%/);
    assert.match(face, /descent-override: 40%/);
  }
  const urls = [...css.matchAll(/url\(\s*"?([^")]+)"?\s*\)/g)].map(([, value]) => value);
  assert.deepEqual(
    urls.filter((value) => !value.startsWith("data:")).toSorted(),
    [ETCH_FONT, FORGE_FONT, OUTLINE_FONT].toSorted(),
  );
  assert.equal(
    urls.filter((value) => value.startsWith("data:image/svg+xml,")).length,
    1,
    "the chip",
  );
});

test("every rule is scoped to the Rexonance page and leaves the bar, the menu, the calls and the controls alone", () => {
  // owner request 2026-10-16: FORGE (rx18)
  assert.ok(sheet.rules.length > 60, String(sheet.rules.length));
  const allowedIds = new Set([
    "#performance",
    "#p14",
    "#stages",
    "#system",
    "#rxs-stage-panel",
    "#rxs-title",
  ]);
  for (const { selector, body } of sheet.rules) {
    for (const part of splitTopLevel(selector)) {
      assert.match(part, SCOPE, part);
      assert.doesNotMatch(
        part,
        /\.rxs-local-nav|\.rxs-menu-trigger|\.side-panel|#site-side-panel|\.rx-call|\.rx-suit|\.load-gate|\.rzn-frame|\.rzn-canvas|\.rzn-still|\.rzn-light|\.rzn-stamp|\.rzn-callout|\.rxs-p14-range|\.rxs-p14-ios|(?<![\w-])select\b|#top\b/,
        part,
      );
      for (const [id] of part.matchAll(/#[\w-]+/g)) assert.ok(allowedIds.has(id), `${part}: ${id}`);
    }
    // The stage tabs keep their operability contract: the face only.
    if (
      /\.rxs-stage-tabs(?![\w-])/.test(selector) &&
      !/\.rxs-stage-tabs\[[^\]]+\] ~/.test(selector)
    ) {
      for (const [, property] of body.matchAll(/(?:^|;)\s*([\w-]+)\s*:/g))
        assert.equal(property, "font-family", `${selector}: ${property}`);
    }
  }
  assert.doesNotMatch(css, /--dx-(?:hud|mono|display|body)\s*:/);
  assert.doesNotMatch(css, /!important/);
});

test("rules that paint a counted figure without a state stay below RESONANCE's counting rule", () => {
  // owner request 2026-10-16: FORGE (rx18) — the counting rule is (1,7,2);
  // a forge rule at (1,7,0) or more would keep its metal under the counter.
  const counted = [
    /#performance \.rxs-headline-metrics(?: > article(?: \+ article)?)? strong$/,
    /#p14 \.rxs-p14-copy dd$/,
    /\.rxs-specs strong$/,
  ];
  let checked = 0;
  for (const { selector } of sheet.rules) {
    for (const part of splitTopLevel(selector)) {
      if (/data-rsn-state/.test(part)) continue;
      if (!counted.some((pattern) => pattern.test(part)) && !/\.rsn-count$/.test(part)) continue;
      checked += 1;
      assert.ok(below(specificity(part), [1, 7, 0]), `${part}: ${specificity(part)}`);
    }
  }
  assert.ok(checked >= 6, String(checked));
  assert.deepEqual(
    specificity(
      'html[data-family="special"]:not([data-world-effects="economy"]) body .rxs-page.rxs-page.rxs-rexonance-page > :is(#performance, #p14, #system) [data-rsn-count]:is([data-rsn-state="armed"], [data-rsn-state="count"], [data-rsn-state="lock"])',
    ),
    [1, 7, 2],
  );
});

/* ---------------- part 3: type and paint ---------------- */
test("text keeps its 12px floor and generated text is silent or the wordmark's own", () => {
  // owner request 2026-10-16: FORGE (rx18)
  for (const [, value] of css.matchAll(/(?<![\w-])font(?:-size)?:\s*([^;]+);/g)) {
    for (const [, px] of value.matchAll(/(?<![\d.])(\d+(?:\.\d+)?)px/g))
      assert.ok(Number(px) >= 12, value);
    // An em size is wrapped in max(12px, …).
    for (const [match] of value.matchAll(/(?<![\w.-])\d*\.?\d+em\b/g)) {
      assert.match(value, new RegExp(`max\\(12px, ${match.replace(".", "\\.")}\\)`), value);
    }
  }
  const title = page.match(/<h1 id="rxs-title">\s*<span>([^<]+)<\/span>/)?.[1];
  assert.equal(title, "REXONANCE SAGA");
  for (const [, value] of css.matchAll(/(?<![\w-])content:\s*([^;]+);/g)) {
    assert.ok(
      ['""', '"" / ""', "none", `"${title}" / ""`].includes(value.trim()),
      `content: ${value}`,
    );
  }
  assert.equal(css.match(new RegExp(`content: "${title}" / ""`, "g"))?.length, 2);
});

test("metal sits behind @supports with its -webkit- twin and a solid colour on the same selector outside", () => {
  // owner request 2026-10-16: FORGE (rx18)
  const clipped = sheet.rules.filter(({ body }) => /(?:^|;)\s*background-clip: text/.test(body));
  assert.ok(clipped.length >= 8, String(clipped.length));
  for (const { selector, body, context } of clipped) {
    assert.ok(
      context.some((at) => SUPPORTS_CLIP.test(at)),
      selector,
    );
    assert.match(body, /-webkit-background-clip: text/, selector);
    // The text shows through its clipped paint: transparent here or on its twin.
    const clear = (text) => /(?:^|;)\s*(?:-webkit-text-fill-color|color): transparent/.test(text);
    assert.ok(
      clear(body) ||
        sheet.rules.some(
          (rule) =>
            splitTopLevel(rule.selector).some((part) => splitTopLevel(selector).includes(part)) &&
            clear(rule.body),
        ),
      selector,
    );
    const outer = context.filter((at) => !SUPPORTS_CLIP.test(at)).join("|");
    for (const part of splitTopLevel(selector)) {
      const solid = sheet.rules.some(
        (rule) =>
          !rule.context.some((at) => SUPPORTS_CLIP.test(at)) &&
          rule.context.join("|") === outer &&
          splitTopLevel(rule.selector).includes(part) &&
          /(?:^|;)\s*(?:color|-webkit-text-stroke)\s*:/.test(rule.body),
      );
      assert.ok(solid, `${part} has no solid colour outside @supports`);
    }
  }
});

test("forced colours drop every ornament and set the type in CanvasText; more contrast paints solid", () => {
  // owner request 2026-10-16: FORGE (rx18)
  const block = (pattern) =>
    sheet.rules
      .filter(({ context }) => context.some((at) => pattern.test(at)))
      .map(({ selector, body }) => `${selector} { ${body} }`)
      .join("\n");
  const forced = block(/forced-colors:\s*active/);
  const hidden = sheet.rules.find(
    ({ context, body }) =>
      context.some((at) => /forced-colors:\s*active/.test(at)) && /display: none/.test(body),
  );
  for (const ornament of [
    "> .rxf-mark",
    "h1 > span::before",
    "h1 > span::after",
    "> .rxs-section::after",
    ".rxs-stage-panel > figure > span",
    ".rzn-form-code",
  ]) {
    assert.ok(hidden.selector.includes(ornament), ornament);
  }
  const canvas = sheet.rules.find(
    ({ context, body }) =>
      context.some((at) => /forced-colors:\s*active/.test(at)) &&
      /color: CanvasText/.test(body) &&
      /background: none/.test(body),
  );
  for (const figure of [
    "h1 > span",
    ".rxs-headline-metrics strong",
    ".rxs-headline-metrics strong span",
    ".rxs-comparison-result b",
    ".rxs-p14-copy dd",
    ".rxs-p14-values strong",
    ".rxs-specs strong",
    ".rxs-specs strong span",
    ".rzn-percent",
  ]) {
    assert.ok(canvas.selector.includes(figure), figure);
  }
  assert.match(forced, /\.rxs-section-heading::before \{[^}]*-webkit-text-stroke: 1px CanvasText/);
  const contrast = block(/prefers-contrast:\s*more/);
  assert.match(
    contrast,
    /h1 > span::after \{ content: none; \}|h1 > span::after\s*\{\s*content: none/,
  );
  assert.match(
    contrast,
    /\.rxs-specs strong \{ color: #f2f7fb; -webkit-text-fill-color: currentcolor; background: none; \}/,
  );
  assert.match(
    contrast,
    /\.rxs-specs strong span \{ color: #f2d896; -webkit-text-fill-color: currentcolor; background: none; \}/,
  );
  assert.match(
    contrast,
    /\.rxs-section-heading::before \{ color: #f2d896;[^}]*-webkit-text-stroke: 0; background: none; \}/,
  );
  assert.match(
    contrast,
    /> \.rsn-count \{ color: var\(--dx-text, #f2f7fb\); -webkit-text-fill-color: currentcolor; background: none; \}/,
  );
  assert.doesNotMatch(contrast, /gradient/);
});

/* ---------------- part 4: motion ---------------- */
test("keyframes are this sheet's own, move only opacity and transforms, and turn opacity at most once", () => {
  // owner request 2026-10-16: FORGE (rx18)
  assert.doesNotMatch(css, /\binfinite\b|animation-iteration-count/);
  assert.doesNotMatch(css, /(?:^|[;{\s])transition(?:-[\w-]+)?\s*:/);
  assert.doesNotMatch(
    css,
    /view-timeline|scroll-timeline|timeline-scope|will-change|backdrop-filter|mix-blend-mode/,
  );
  assert.doesNotMatch(css, /(?<![\w-])filter\s*:/);
  assert.ok(sheet.keyframes.size >= 6, String(sheet.keyframes.size));
  for (const [name, body] of sheet.keyframes) {
    assert.match(name, /^rxf-/, name);
    for (const [, property] of body.matchAll(/([\w-]+)\s*:/g)) {
      assert.ok(
        ["opacity", "transform", "translate", "scale", "rotate"].includes(property),
        `${name}: ${property}`,
      );
    }
    const opacities = [...body.matchAll(/opacity:\s*([\d.]+)/g)].map(([, value]) => Number(value));
    let turns = 0;
    let direction = 0;
    for (let index = 1; index < opacities.length; index += 1) {
      const step = Math.sign(opacities[index] - opacities[index - 1]);
      if (step && direction && step !== direction) turns += 1;
      if (step) direction = step;
    }
    assert.ok(turns === 0, `${name} turns its opacity`);
  }
});

test("time-based beats are gated, keyed to RESONANCE's transient flags, finite and quick", () => {
  // owner request 2026-10-16: FORGE (rx18) — the arrival flag is held
  // ARRIVE_MS, the hit HIT_MS from the lock, which lasts LOCK_MS.
  const ARRIVE_MS = Number(script.match(/const ARRIVE_MS = (\d+);/)[1]);
  const HIT_MS = Number(script.match(/const HIT_MS = (\d+);/)[1]);
  const LOCK_MS = Number(script.match(/const LOCK_MS = (\d+);/)[1]);
  let arrivals = 0;
  let hits = 0;
  for (const rule of sheet.rules) {
    const { selector, body, context } = rule;
    if (scrollLinked(rule) || !animated(body)) continue;
    assert.ok(
      context.some((at) => REDUCED.test(at)),
      selector,
    );
    for (const part of splitTopLevel(selector)) {
      assert.match(part, FULL_GATE, part);
      assert.match(part, /\[data-rsn-arrive\]|\[data-rsn-hit\]/, part);
    }
    const arrival = /\[data-rsn-arrive\]/.test(selector);
    for (const layer of splitTopLevel(declaration(body, "animation"))) {
      const times = [...layer.matchAll(/(\d+)ms(?![^(]*\* )/g)].map((match) => Number(match[1]));
      const [duration, delay = 0] = times;
      const stagger = layer.match(/var\(--rxf-i, 0\) \* (\d+)ms/);
      const last = delay + (stagger ? 8 * Number(stagger[1]) : 0);
      assert.ok(duration > 0 && duration <= 680, `${selector}: ${layer}`);
      if (arrival) {
        arrivals += 1;
        assert.ok(last + duration <= 1720 && last + duration < ARRIVE_MS, `${selector}: ${layer}`);
      } else {
        hits += 1;
        assert.equal(delay, 0, `${selector}: ${layer}`);
        assert.ok(duration <= HIT_MS - LOCK_MS, `${selector}: ${layer}`);
        assert.match(
          selector,
          /\[data-rsn-hit\] > \[data-rsn-count\]\[data-rsn-state="done"\] > \.rsn-count$/,
        );
      }
    }
  }
  assert.ok(arrivals >= 5, String(arrivals));
  assert.equal(hits, 1);
  // Nine motes, one per letter, staggered by order.
  for (let index = 1; index <= 9; index += 1) {
    const mote = sheet.rules.find(({ selector }) =>
      selector.endsWith(`> .rxf-mark > i:nth-child(${index})`),
    );
    assert.equal(declaration(mote.body, "--rxf-i"), String(index - 1));
  }
});

test("the molten lock is a paint state on RESONANCE's clock, as its counter is", () => {
  // owner request 2026-10-16: FORGE (rx18)
  const molten = sheet.rules.filter(({ body }) => /var\(--rxf-molten\)/.test(body));
  assert.equal(molten.length, 1);
  const [{ selector, context }] = molten;
  assert.ok(
    context.some((at) =>
      /^@media screen and \(prefers-reduced-motion: no-preference\) and \(forced-colors: none\)$/.test(
        at,
      ),
    ),
  );
  assert.match(
    selector,
    /^html\[data-family="special"\]:not\(\[data-world-effects="economy"\]\) body \.rxs-page\.rxs-page\.rxs-rexonance-page > :is\(#performance, #p14, #system\) \[data-rsn-count\]:is\(\[data-rsn-state="lock"\], \[data-rsn-state="done"\]\) > \.rsn-count$/,
  );
});

test("the seam's chip rides RESONANCE's draw: the same timeline, range and easing, behind the full gate", () => {
  // owner request 2026-10-16: FORGE (rx18)
  const draw = parse(resonance).rules.find(
    ({ selector, body }) =>
      /> \.rxs-section::before$/.test(selector) && /animation-name: rsn-draw/.test(body),
  );
  assert.ok(draw, "RESONANCE's seam draw");
  const scroll = sheet.rules.filter(scrollLinked);
  assert.equal(scroll.length, 1);
  const [{ selector, body, context }] = scroll;
  assert.ok(
    context.some((at) => SUPPORTS_TIMELINE.test(at)),
    selector,
  );
  assert.ok(
    context.some((at) => REDUCED.test(at)),
    selector,
  );
  for (const part of splitTopLevel(selector)) {
    assert.match(part, FULL_GATE, part);
    assert.match(part, /> \.rxs-section::after$/, part);
  }
  assert.equal(declaration(body, "animation-name"), "rxf-run");
  assert.equal(declaration(body, "animation-duration"), "auto");
  for (const property of [
    "animation-timeline",
    "animation-range",
    "animation-timing-function",
    "animation-fill-mode",
  ])
    assert.equal(declaration(body, property), declaration(draw.body, property), property);
  assert.equal(declaration(draw.body, "transform-origin"), "0 50%");
});

/* ---------------- part 5: the component ---------------- */
test("the ghost is silent, last in the hero copy, and nine letters of the name", () => {
  // owner request 2026-10-16: FORGE (rx18)
  assert.match(page, /const FORGE_MARK = \[\.\.\."REXONANCE"\];/);
  assert.match(
    page,
    /<span className="rxf-mark" aria-hidden="true">\s*\{FORGE_MARK\.map\(\(letter, index\) => \(\s*<i key=\{index\}>\{letter\}<\/i>\s*\)\)\}\s*<\/span>\s*<\/div>\s*<div className="rxs-hero-visual" aria-hidden="true">/,
  );
  const copy = page.slice(page.indexOf('<div className="rxs-hero-copy">'));
  assert.match(copy, /^<div className="rxs-hero-copy">\s*<p>\s*THE NEXT GENERATION/);
  for (const name of [
    "rzn-readout",
    "rzn-percent",
    "rzn-chip",
    "rzn-line",
    "rzn-form-code",
    "rsn-count",
    "rzn-tri-lock",
  ])
    assert.match(page, new RegExp(`className=(?:"|\\{\`)[^"\`]*\\b${name}\\b`), name);
});

function performance() {
  const tree = ts.createSourceFile(
    "page.tsx",
    page,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const statements = tree.statements.filter(
    (node) =>
      ts.isVariableStatement(node) &&
      node.declarationList.declarations.some((declaration) =>
        ["PERFORMANCE_BASELINES", "RexonancePerformance", "releaseControlFocus"].includes(
          declaration.name.getText(tree),
        ),
      ),
  );
  assert.equal(statements.length, 3);
  const compiled = ts.transpileModule(
    `${statements.map((node) => node.getText(tree)).join("\n")}\nglobalThis.control = RexonancePerformance; globalThis.catalog = PERFORMANCE_BASELINES;`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } },
  ).outputText;
  let state;
  let present = false;
  let reference;
  const context = {
    React,
    memo: (component) => component,
    useState(initial) {
      if (!present) {
        state = initial;
        present = true;
      }
      return [state, (value) => (state = typeof value === "function" ? value(state) : value)];
    },
    useRef: (initial) => (reference ??= { current: initial }),
    window: { requestAnimationFrame() {} },
    document: { activeElement: null },
  };
  runInNewContext(compiled, context);
  return { context, set: (value) => (state = value) };
}
const nodes = (root, predicate, result = []) => {
  if (!React.isValidElement(root)) return result;
  if (predicate(root)) result.push(root);
  React.Children.forEach(root.props.children, (child) => nodes(child, predicate, result));
  return result;
};
const text = (root) => {
  if (root == null || typeof root === "boolean") return "";
  if (Array.isArray(root)) return root.map(text).join("");
  return React.isValidElement(root) ? text(root.props.children) : String(root);
};

test("the owner's copy renders unchanged: the cut kickers and every processing line", () => {
  // owner request 2026-10-16: FORGE (rx18) — the nowrap units are markup only.
  const { context, set } = performance();
  context.control();
  for (const value of Object.keys(context.catalog)) {
    set(value);
    const root = context.control();
    const kickers = nodes(
      root,
      (node) => node.type === "small" && node.props.className == null,
    ).map(text);
    assert.deepEqual(kickers.slice(0, 2), ["REACTION / VS VINCULUM", "MOBILITY / VS EXTREME"]);
    const comparison = nodes(
      root,
      (node) => node.props.className === "rxs-processing-comparison",
    )[0];
    const items = nodes(comparison, (node) => node.type === "li").map(text);
    const { processing } = context.catalog[value];
    assert.deepEqual(items, [...processing.baseline, ...processing.rexonance], value);
    for (const item of nodes(comparison, (node) => node.type === "li")) {
      const units = nodes(item, (node) => node.props.className === "rxp-nowrap");
      if (text(item).includes(" · ")) assert.equal(units.length, text(item).split(" · ").length);
      else assert.equal(units.length, 0);
    }
  }
});
