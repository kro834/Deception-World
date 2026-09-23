import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

/* Scroll paint budget (Samsung Internet performance plan, A1-A3).

   Scroll- and view-timeline animations run on every scroll frame. Three
   things turn that into page-wide main-thread work:
   - animating background-color: Chromium 142+ (current Chrome, Samsung
     Internet 30) treats it as compositable and repaints the page under it
     every frame; color is allowed only for the typing ink (tr-ink, stepped);
     clip-path is main-thread paint, allowed only where it is still listed;
   - gating motion on html:not(:has(dialog[open])): every DOM insertion then
     restyles the whole document; html[data-dialog-open] is set instead
     (src/lib/dialog-open-flag.js);
   - gating motion on [data-rail-lock]: every rail tap restyled and restarted
     every scroll animation twice. A rail lock clips <body> instead
     (styles-world-reveal.css), so the timelines stay on the document. */

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const cssFiles = [
  ...readdirSync(new URL("src/", root))
    .filter((name) => name.endsWith(".css"))
    .map((name) => `src/${name}`),
  ...readdirSync(new URL("src/styles-world/", root))
    .filter((name) => name.endsWith(".css"))
    .map((name) => `src/styles-world/${name}`),
].sort();

// Timeline keyframes that still animate clip-path (main-thread paint).
// Shrink this list; never grow it.
const CLIP_PATH_ALLOWED = new Set(["mr-type", "mr-wipe", "mr-materialize"]);

const flat = (text) =>
  text.replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").trim();

// Style rules with their at-rule context, and keyframe blocks by name.
function parse(source) {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [];
  const keyframes = [];
  const stack = [];
  let prelude = "";
  for (let index = 0; index < css.length; index += 1) {
    const character = css[index];
    if (character === "{") {
      const head = flat(prelude);
      prelude = "";
      const frames = head.match(/^@(?:-webkit-)?keyframes\s+([\w-]+)$/);
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

const declaration = (body, property) =>
  body.match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`))?.[1].trim();

const sheets = cssFiles.map((path) => ({ path, ...parse(read(path)) }));
const keyframeProperties = new Map();
for (const { path, keyframes } of sheets) {
  for (const { name, body } of keyframes) {
    const properties = [...body.matchAll(/([\w-]+)\s*:/g)].map((match) => match[1]);
    const entry = keyframeProperties.get(name) ?? { paths: [], properties: new Set() };
    entry.paths.push(path);
    properties.forEach((property) => entry.properties.add(property));
    keyframeProperties.set(name, entry);
  }
}

// Every rule that binds an animation to a scroll or view timeline, with the
// keyframe names it plays.
const timelineRules = sheets.flatMap(({ path, rules }) =>
  rules
    .filter(({ body }) => {
      const timeline = declaration(body, "animation-timeline");
      return timeline && !/^(?:auto|none)$/.test(timeline);
    })
    .map((rule) => {
      const shorthand = declaration(rule.body, "animation");
      const longhand = declaration(rule.body, "animation-name");
      const names = splitTopLevel(longhand ?? shorthand ?? "")
        .map((layer) => splitTopLevel(layer, " ").find((token) => keyframeProperties.has(token)))
        .filter(Boolean);
      return { path, ...rule, names };
    }),
);

test("the budget sees every scroll-linked animation on the site", () => {
  const names = new Set(timelineRules.flatMap(({ names }) => names));
  for (const name of ["tr-ink", "tr-caret", "mr-par-back", "mx-lift", "mx-progress"]) {
    assert.ok(names.has(name), name);
  }
  assert.ok(names.size >= 30, String(names.size));
  // A timeline rule with no resolvable keyframes would escape the budget.
  for (const { path, selector, body, names } of timelineRules) {
    const played = declaration(body, "animation") ?? declaration(body, "animation-name");
    if (played && played !== "none") assert.ok(names.length > 0, `${path}: ${selector}`);
  }
});

test("scroll-linked keyframes never repaint the page every frame", () => {
  const checked = new Set();
  for (const { names } of timelineRules) {
    for (const name of names) {
      if (checked.has(name)) continue;
      checked.add(name);
      const { paths, properties } = keyframeProperties.get(name);
      const where = `${name} (${paths.join(", ")})`;
      assert.ok(!properties.has("background-color"), `${where} animates background-color`);
      assert.ok(!properties.has("background"), `${where} animates the background shorthand`);
      if (name !== "tr-ink") assert.ok(!properties.has("color"), `${where} animates color`);
      if (!CLIP_PATH_ALLOWED.has(name)) {
        assert.ok(!properties.has("clip-path"), `${where} animates clip-path`);
      }
    }
  }
  // The allowlist only names keyframes that still exist and still need it.
  for (const name of CLIP_PATH_ALLOWED) {
    assert.ok(keyframeProperties.get(name)?.properties.has("clip-path"), name);
  }
  // The typing ink is stepped: one colour change per character, not a fade.
  const ink = timelineRules.find(({ names }) => names.includes("tr-ink"));
  assert.match(ink.body, /tr-ink steps\(1, end\)/);
  assert.match(ink.body, /tr-caret steps\(1, end\)/);
});
