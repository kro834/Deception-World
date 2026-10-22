import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";

/* 2026-10-21/22 ZENITH: Final Stage, the final cut
   (src/styles-final-stage-zenith.css over STAGE). These pin its safety
   properties: where it loads, what it may select, how every beat is gated,
   what its keyframes touch, the one !important it may carry, the 12px floor,
   the calls' list semantics and the Royal visual's shared candidates. */

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const SHEET = "src/styles-final-stage-zenith.css";

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

const declarations = (body, property) =>
  [...body.matchAll(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, "g"))].map((match) =>
    match[1].trim(),
  );

const SCOPED =
  /^html\[data-family="special"\](?::not\(\[[\w-]+(?:="[\w-]+")?\]\))* body \.rxs-page\.rxs-page\.fst-page(?:\[data-motion-ready="true"\])?(?=[\s>:]|$)/;
const ECONOMY_GATE = /^html\[data-family="special"\]:not\(\[data-world-effects="economy"\]\)/;
const FULL_GATE =
  /^html\[data-family="special"\]:not\(\[data-world-effects="economy"\]\):not\(\[data-side-menu-open\]\):not\(\[data-loading\]\):not\(\[data-dialog-open\]\) body \.rxs-page\.rxs-page\.fst-page\[data-motion-ready="true"\]/;

test("ZENITH loads on Final Stage only, over STAGE and before the cinematic sheet", async () => {
  const route = await read("src/routes/final-stage.tsx");
  assert.match(
    route,
    /import finalStageZenithCssUrl from "@\/styles-final-stage-zenith\.css\?url";/,
  );
  const links = route.slice(route.search(/links:\s*\[/));
  const stage = links.indexOf("href: stageFinalStageCssUrl");
  const zenith = links.indexOf("href: finalStageZenithCssUrl");
  const cinematic = links.indexOf("CINEMATIC_STYLESHEET_LINK");
  assert.ok(stage > 0 && stage < zenith && zenith < cinematic);
  for (const path of [
    "src/lib/world-head.ts",
    "src/routes/__root.tsx",
    "src/routes/world.tsx",
    "src/routes/rexonance-saga.tsx",
    "src/routes/extreme-saga.tsx",
    "src/routes/dream-chapter.tsx",
  ]) {
    assert.doesNotMatch(await read(path), /final-stage-zenith|finalStageZenith/, path);
  }
});

test("every rule is scoped to the Final Stage page as STAGE scopes it", async () => {
  const { rules } = parse(await read(SHEET));
  assert.ok(rules.length > 60, String(rules.length));
  for (const { selector } of rules) {
    for (const part of splitTopLevel(selector)) assert.match(part, SCOPED, part);
  }
});

test("its one !important restores an inline name word inside the record's gradient name", async () => {
  const { rules } = parse(await read(SHEET));
  const important = rules.filter(({ body }) => body.includes("!important"));
  assert.equal(important.length, 1);
  const [{ selector, body }] = important;
  assert.match(selector, /\.fst-pickup-heading h2 b \.name-word--protected$/);
  assert.equal(body.replace(/;$/, ""), "display: inline !important");
});

test("motion is scroll-linked on named timelines or a press, gated, and never loops", async () => {
  const source = await read(SHEET);
  assert.doesNotMatch(strip(source), /\binfinite\b|animation-iteration-count/);
  const { rules } = parse(source);
  let linked = 0;
  for (const { selector, body, context } of rules) {
    const animations = declarations(body, "animation").filter((value) => value !== "none");
    const transitions = declarations(body, "transition");
    if (!animations.length && !transitions.length && !declarations(body, "animation-range").length)
      continue;
    assert.ok(context.includes("@media (prefers-reduced-motion: no-preference)"), selector);
    for (const part of splitTopLevel(selector)) assert.match(part, ECONOMY_GATE, part);
    if (transitions.length) {
      for (const layer of splitTopLevel(transitions.join(","))) {
        assert.match(layer, /^(?:scale|border-color|background-color) \d+ms\b/, layer);
      }
      continue;
    }
    linked += 1;
    assert.ok(
      context.some((at) => /^@supports \(animation-timeline: view\(\)\)/.test(at)),
      selector,
    );
    for (const part of splitTopLevel(selector)) assert.match(part, FULL_GATE, part);
    assert.match(
      declarations(body, "animation-timeline").at(-1),
      /^--(?:fsk-end|fsz-card|fst-section)$/,
    );
    assert.equal(declarations(body, "animation-range").length, 1, selector);
    for (const value of animations) assert.doesNotMatch(value, /\d+m?s\b/, value);
  }
  assert.ok(linked >= 3, String(linked));
});

test("keyframes are ZENITH's own and move only opacity and transforms", async () => {
  const { keyframes } = parse(await read(SHEET));
  assert.ok(keyframes.length >= 3, String(keyframes.length));
  const allowed = new Set(["opacity", "transform", "translate", "scale"]);
  for (const { name, body } of keyframes) {
    assert.match(name, /^fsz-/, name);
    for (const [, property] of body.matchAll(/([\w-]+)\s*:/g))
      assert.ok(allowed.has(property), `${name}: ${property}`);
  }
});

test("labels hold the 12px floor", async () => {
  const { rules } = parse(await read(SHEET));
  for (const { selector, body } of rules) {
    for (const value of declarations(body, "font-size")) {
      const px = Number(value.match(/^(\d+(?:\.\d+)?)px$/)?.[1] ?? 12);
      assert.ok(px >= 12, `${selector}: ${value}`);
    }
    for (const value of declarations(body, "font")) {
      const size = value.match(/(\d+(?:\.\d+)?)px\s*\//);
      if (size) assert.ok(Number(size[1]) >= 12, `${selector}: ${value}`);
    }
  }
});

test("the phone chapter strip keeps its focus rings and the record tabs the 44px floor", async () => {
  const { rules } = parse(await read(SHEET));
  // An overflow box on the strip clipped each link's outline (3px outside it).
  const strip = rules.filter(({ selector }) =>
    /> \.rxs-local-nav nav(?:::[\w-]+)?$/.test(selector),
  );
  assert.ok(strip.length > 0);
  for (const { selector, body } of strip) {
    assert.doesNotMatch(selector, /::-webkit-scrollbar/);
    for (const property of ["overflow", "overflow-x", "overflow-y"]) {
      for (const value of declarations(body, property)) assert.equal(value, "visible", selector);
    }
  }
  // Content-sized tabs, never narrower than a touch target.
  const tabs = rules.filter(({ selector }) => /> button\[role="tab"\]$/.test(selector));
  assert.ok(tabs.some(({ body }) => declarations(body, "min-width").length > 0));
  for (const { selector, body } of tabs) {
    for (const value of declarations(body, "min-width")) {
      assert.ok(Number(value.match(/^(\d+)px$/)?.[1] ?? 0) >= 44, `${selector}: ${value}`);
    }
  }
});

test("the end card's letterbox leaves forced colours and the calls' generated numbers are silent", async () => {
  const source = strip(await read(SHEET));
  const forced = source.slice(source.indexOf("@media (forced-colors: active)"));
  assert.match(forced, /\.fst-footer::before,/);
  assert.match(forced, /\.fst-footer::after,/);
  for (const [, value] of source.matchAll(/content:\s*("[^"]*"|counter\([^)]*\))([^;]*);/g)) {
    if (value === '""') continue;
    assert.match(
      source,
      new RegExp(`content:\\s*${value.replace(/[()]/g, "\\$&")}\\s*/\\s*""`),
      value,
    );
  }
});

test("the calls are a labelled list and the Royal visual shares the record-art candidates", async () => {
  const page = await read("src/components/final-stage/final-stage.tsx");
  assert.match(page, /<div className="fst-calls" role="list" aria-label=\{label\}>/);
  assert.match(page, /<b key=\{`\$\{call\}-\$\{index\}`\} role="listitem">/);
  assert.match(page, /import \{ FORM_RECORD_IMAGES \} from "@\/lib\/record-form-images";/);
  assert.match(page, /imageSet=\{royalVisualImage\(activeVisual\.image, activeVisual\.width\)\}/);
  assert.match(page, /\{\.\.\.royalVisualImage\(activeVisual\.image, activeVisual\.width\)\}/);
  for (const key of ["", "-wrath", "-abyss", "-birth", "-nehan"]) {
    for (const width of [480, 960]) {
      assert.ok(
        existsSync(
          new URL(`../public/record-art/realm-royal${key}-${width}.webp`, import.meta.url),
        ),
        `${key} ${width}`,
      );
    }
  }
});

// Owner (2026-10-22): round 2 — calls break only between shouts, the end card keeps the
// Zeus button's corner free on phones, the phone strip's ring stays inside its link.
test("a call breaks only between its shouts, with the data's characters unchanged", async () => {
  const page = await read("src/components/final-stage/final-stage.tsx");
  const shouts = page.match(
    /const callShouts = \(call: string\) => call\.match\((\/[^/]+\/g)\) \?\? \[call\];/,
  );
  assert.ok(shouts, "callShouts");
  const pattern = new RegExp(shouts[1].slice(1, -2), "g");
  const data = await read("src/components/final-stage/final-stage-data.ts");
  const calls = [...data.matchAll(/calls: \[([^\]]*)\]/g)].flatMap(([, list]) =>
    [...list.matchAll(/"([^"]+)"/g)].map(([, call]) => call),
  );
  assert.ok(calls.length > 20, String(calls.length));
  for (const call of calls) {
    const parts = call.match(pattern) ?? [call];
    assert.equal(parts.join(""), call);
  }
  assert.deepEqual("SA-GA！SA-GA！SA-GA！DEUS！！！".match(pattern), [
    "SA-GA！",
    "SA-GA！",
    "SA-GA！",
    "DEUS！！！",
  ]);
  assert.match(
    page,
    /\{callShouts\(call\)\.map\(\(shout, part\) => \(\s*<span key=\{part\}>\{shout\}<\/span>/,
  );
  const { rules } = parse(await read(SHEET));
  const nowrap = rules.find(({ selector }) => /\.fst-calls b > span > span$/.test(selector));
  assert.ok(nowrap && declarations(nowrap.body, "white-space").includes("nowrap"));
});

test("on phones the end card keeps the Zeus corner clear and the strip's ring inside its link", async () => {
  const { rules } = parse(await read(SHEET));
  const footer = rules.find(
    ({ selector, context }) =>
      /> \.fst-footer$/.test(selector) && context.includes("@media (max-width: 480px)"),
  );
  assert.ok(footer);
  const [padding] = declarations(footer.body, "padding-bottom");
  // 60px button + 12px edge + 10px control gap, with the safe area on top.
  const floor = Number(padding.match(/calc\((\d+)px \+ env\(safe-area-inset-bottom/)?.[1] ?? 0);
  assert.ok(floor >= 82, padding);
  const ring = rules.find(({ selector }) =>
    /> \.rxs-local-nav nav a:focus-visible$/.test(selector),
  );
  assert.ok(ring && ring.context.includes("@media (max-width: 599.98px)"));
  assert.equal(declarations(ring.body, "outline-offset").at(-1), "-3px");
});
