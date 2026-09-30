import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/* The Final Stage 帰路 (KIRO) edition (styles-final-stage-kiro.css): the
   way home drawn over the cinema's arrival. These pins keep it safe: where
   it loads, what it may select, how every beat is gated, what its keyframes
   touch, the map's markup (ornament only), the 12px floor and forced
   colours. */

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const SHEET = "src/styles-final-stage-kiro.css";

// Style rules with their at-rule context, and keyframe blocks by name.
function parse(source) {
  const css = strip(source);
  const flat = (text) =>
    text.replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").trim();
  const rules = [];
  const keyframes = [];
  const stack = [];
  let prelude = "";
  for (let index = 0; index < css.length; index += 1) {
    const character = css[index];
    if (character === "{") {
      const head = flat(prelude);
      prelude = "";
      const frames = head.match(/^@keyframes\s+([\w-]+)$/);
      if (frames) {
        let depth = 1;
        let end = index + 1;
        for (; end < css.length && depth > 0; end += 1) {
          if (css[end] === "{") depth += 1;
          if (css[end] === "}") depth -= 1;
        }
        keyframes.push({ name: frames[1], body: css.slice(index + 1, end - 1) });
        index = end - 1;
        continue;
      }
      if (head.startsWith("@")) {
        stack.push(head);
        continue;
      }
      const end = css.indexOf("}", index);
      rules.push({ selector: head, body: css.slice(index + 1, end), context: [...stack] });
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

const declarations = (body, property) =>
  [...body.matchAll(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, "g"))].map((match) =>
    match[1].trim(),
  );
const timed = (body) => declarations(body, "animation-timeline").length > 0;

const SCOPE = /^html \.fst-page\.fst-page/;
const GATED =
  /^html:not\(\[data-world-effects="economy"\]\)(?::not\(\[[\w-]+\]\))* \.fst-page\.fst-page/;
const FULL_GATE =
  /^html:not\(\[data-world-effects="economy"\]\):not\(\[data-side-menu-open\]\):not\(\[data-loading\]\):not\(\[data-dialog-open\]\) \.fst-page\.fst-page\[data-motion-ready="true"\]/;

test("the edition loads on the Final Stage route only, between the cinema and the motion sheets", async () => {
  const route = await read("src/routes/final-stage.tsx");
  assert.match(route, /styles-final-stage-kiro\.css\?url/);
  const links = route.slice(route.search(/links:\s*\[/));
  const cinema = links.indexOf("href: finalStageCinemaCssUrl");
  const kiro = links.indexOf("href: finalStageKiroCssUrl");
  const motion = links.indexOf("href: motionEditionCssUrl");
  assert.ok(cinema > 0 && cinema < kiro && kiro < motion);
  for (const path of [
    "src/lib/world-head.ts",
    "src/routes/__root.tsx",
    "src/routes/world.tsx",
    "src/routes/dream-chapter.tsx",
    "src/routes/rexonance-saga.tsx",
    "src/routes/extreme-saga.tsx",
  ]) {
    assert.doesNotMatch(await read(path), /final-stage-kiro/, path);
  }
});

test("the map is twelve textless strokes hidden from assistive tech, and the only markup added", async () => {
  const component = await read("src/components/final-stage/final-stage.tsx");
  assert.match(component, /const MAP_STROKES = Array\.from\(\{ length: 12 \}, \(_, index\) => index\);/);
  assert.match(
    component,
    /<div className="fsk-map" aria-hidden="true">\s*\{MAP_STROKES\.map\(\(stroke\) => \(\s*<i key=\{stroke\} \/>\s*\)\)\}\s*<\/div>\s*<div className="rxs-hero-visual fst-hero-logo" aria-hidden="true">/,
  );
  // No other element of the edition's family is in the markup: everything
  // else is drawn on pseudo-elements of the page's own elements.
  assert.equal((component.match(/fsk-/g) ?? []).length, 1);
});

test("every rule is scoped to the page; motion is gated; nothing loops", async () => {
  const source = await read(SHEET);
  const css = strip(source);
  const { rules } = parse(source);
  assert.ok(rules.length > 60);
  assert.doesNotMatch(css, /\binfinite\b|animation-iteration-count/);
  let finite = 0;
  let linked = 0;
  for (const { selector, body, context } of rules) {
    for (const part of splitTopLevel(selector)) {
      assert.ok(SCOPE.test(part) || GATED.test(part), part);
    }
    const animations = declarations(body, "animation").filter((value) => value !== "none");
    if (!animations.length && !declarations(body, "animation-name").length) {
      // A rule may set only a delay for a staggered beat; that beat's own
      // rule is gated the same way (checked by its selector below).
      if (declarations(body, "animation-delay").length) {
        assert.ok(context.includes("@media (prefers-reduced-motion: no-preference)"), selector);
        for (const part of splitTopLevel(selector)) assert.match(part, GATED, part);
      }
      continue;
    }
    assert.ok(context.includes("@media (prefers-reduced-motion: no-preference)"), selector);
    for (const part of splitTopLevel(selector)) assert.match(part, GATED, part);
    if (timed(body)) {
      linked += 1;
      assert.ok(
        context.some((at) => at.startsWith("@supports (animation-timeline: view())")),
        selector,
      );
      for (const part of splitTopLevel(selector)) assert.match(part, FULL_GATE, part);
      for (const timeline of splitTopLevel(declarations(body, "animation-timeline").at(-1))) {
        assert.match(timeline, /^--(?:fsk|fst)-[\w-]+$/, selector);
      }
      assert.equal(declarations(body, "animation-range").length, 1, selector);
      continue;
    }
    finite += 1;
    for (const value of animations) {
      for (const layer of splitTopLevel(value)) {
        const times = [...layer.matchAll(/(\d+)ms/g)].map((match) => Number(match[1]));
        assert.ok(times.length >= 1, `${selector}: ${layer}`);
        const [duration, ...offsets] = times;
        assert.ok(duration <= 1000, `${selector}: ${layer}`);
        assert.ok(duration + Math.max(0, ...offsets) <= 2000, `${selector}: ${layer}`);
      }
    }
    // The hero's map plays once the load gate hands over; the cast and
    // record beats answer the reader's own action.
    const arrival = splitTopLevel(selector).some((part) => part.includes(".fsk-map"));
    for (const part of splitTopLevel(selector)) {
      if (arrival) assert.match(part, /:not\(\[data-loading\]\)/, part);
      else assert.match(part, /\.fst-cast-detail|\.fst-pickup-dialog\[open\]/, part);
    }
  }
  assert.ok(finite >= 16, String(finite));
  assert.ok(linked >= 9, String(linked));
});

test("the scroll beats ride named timelines declared on the page's own elements", async () => {
  const { rules } = parse(await read(SHEET));
  const declared = new Set();
  for (const { body } of rules) {
    for (const value of declarations(body, "view-timeline")) declared.add(value.split(" ")[0]);
  }
  assert.deepEqual(
    [...declared].sort(),
    ["--fsk-end", "--fsk-gate", "--fsk-map", "--fsk-para", "--fsk-sign"],
  );
  for (const { body, selector } of rules) {
    for (const timeline of declarations(body, "animation-timeline")) {
      // --fst-section is the elevation's own timeline on .rxs-section.
      assert.ok(declared.has(timeline) || timeline === "--fst-section", selector);
    }
  }
});

test("keyframes move only opacity and transforms", async () => {
  const { keyframes } = parse(await read(SHEET));
  assert.ok(keyframes.length >= 14);
  const allowed = new Set(["opacity", "transform", "translate", "scale", "rotate"]);
  for (const { name, body } of keyframes) {
    assert.match(name, /^fsk-/);
    for (const [, property] of body.matchAll(/([\w-]+)\s*:/g)) {
      assert.ok(allowed.has(property), `${name} animates ${property}`);
    }
    // A perspective flip is still a transform; no filter, no clip.
    assert.doesNotMatch(body, /clip-path|filter|background|color/);
  }
});

test("the shutter rests lifted, so a still page never covers the rider's art", async () => {
  const { rules } = parse(await read(SHEET));
  const rest = rules.find(
    ({ selector, context }) =>
      selector === "html .fst-page.fst-page .fst-pickup-visual::before" && !context.length,
  );
  assert.ok(rest);
  assert.match(rest.body, /translate:\s*0 -102%/);
  assert.match(rest.body, /pointer-events:\s*none/);
  const shutter = rules.find(
    ({ body, selector }) => timed(body) && selector.endsWith(".fst-pickup-visual::before"),
  );
  assert.match(shutter.body, /animation:\s*fsk-shutter linear both/);
  assert.match(shutter.body, /animation-range:\s*entry 12% entry 96%/);
});

test("the 12px floor, and forced colours", async () => {
  const css = strip(await read(SHEET));
  for (const [, size] of css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) {
    assert.ok(Number(size) >= 12, size);
  }
  assert.doesNotMatch(css, /font-size:\s*(?:0?\.\d+|1(?:\.0*)?)(?:em|rem)\b/);
  const forced = css.slice(css.indexOf("@media (forced-colors: active)"));
  assert.match(forced, /\.fsk-map,[\s\S]*display: none;/);
  assert.match(forced, /\.rxs-section-heading > p,[\s\S]*border-color: CanvasText;\s*color: CanvasText;\s*background: Canvas;/);
  assert.match(forced, /\.fst-story-copy p::before,[\s\S]*border: 1px solid CanvasText;/);
});
