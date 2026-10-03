import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/* 2026-10-03 rx3: Final Stage, the Lamplight (灯) edition
   (src/styles-final-stage-lamplight.css). The station finished and brought
   back to life: grain, chalk and enamel; the lamp hand round the clock, the
   chapter lamp in the bar, the read's route, the record's platform doors and
   board; states for the controls. These pin its safety properties: where it
   loads, what it may select, how every beat is gated and how long it runs,
   what its keyframes touch, that swaps never fade through black, the
   ornaments' markup, the 12px floor, generated text and forced colours. */

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const SHEET = "src/styles-final-stage-lamplight.css";

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
const timed = (body) => declarations(body, "animation-timeline").length > 0;
const animated = (body) =>
  declarations(body, "animation").some((value) => value !== "none") ||
  declarations(body, "animation-name").length > 0;

const SCOPED =
  /^(?:html|html\[data-press-ready\]|html body|html:not\(\[data-world-effects="economy"\]\)(?::not\(\[[\w-]+\]\))*) \.fst-page\.fst-page/;
const ECONOMY_GATE = /^html:not\(\[data-world-effects="economy"\]\)/;
const FULL_GATE =
  /^html:not\(\[data-world-effects="economy"\]\):not\(\[data-side-menu-open\]\):not\(\[data-loading\]\):not\(\[data-dialog-open\]\) \.fst-page\.fst-page\[data-motion-ready="true"\]/;

test("the edition loads on Final Stage only, after the motion sheet and before the cinematic sheet", async () => {
  const route = await read("src/routes/final-stage.tsx");
  assert.match(route, /import finalStageLamplightCssUrl from "@\/styles-final-stage-lamplight\.css\?url";/);
  const links = route.slice(route.search(/links:\s*\[/));
  const kiro = links.indexOf("href: finalStageKiroCssUrl");
  const motion = links.indexOf("href: motionEditionCssUrl");
  const lamplight = links.indexOf("href: finalStageLamplightCssUrl");
  const cinematic = links.indexOf("CINEMATIC_STYLESHEET_LINK");
  assert.ok(kiro > 0 && kiro < motion && motion < lamplight && lamplight < cinematic);
  for (const path of [
    "src/lib/world-head.ts",
    "src/routes/__root.tsx",
    "src/routes/world.tsx",
    "src/routes/dream-chapter.tsx",
    "src/routes/rexonance-saga.tsx",
    "src/routes/extreme-saga.tsx",
  ]) {
    assert.doesNotMatch(await read(path), /final-stage-lamplight|finalStageLamplight/, path);
  }
});

test("every rule is scoped to the Final Stage page", async () => {
  const { rules } = parse(await read(SHEET));
  assert.ok(rules.length > 80, String(rules.length));
  for (const { selector } of rules) {
    for (const part of splitTopLevel(selector)) assert.match(part, SCOPED, part);
  }
  // !important only where the shared frosted sheet paints the slide
  // control with it (paint, never geometry).
  for (const { selector, body } of rules) {
    if (!body.includes("!important")) continue;
    assert.match(selector, /^html body \.fst-page\.fst-page \.fst-pickup-plus/, selector);
    for (const declaration of splitTopLevel(body, ";")) {
      if (declaration.includes("!important")) {
        assert.match(declaration, /^(?:background|box-shadow)\s*:/, declaration);
      }
    }
  }
});

test("motion is gated, finite or scroll-linked on named timelines, and never loops", async () => {
  const source = await read(SHEET);
  const css = strip(source);
  const { rules } = parse(source);
  assert.doesNotMatch(css, /\binfinite\b|animation-iteration-count/);
  let finite = 0;
  let linked = 0;
  for (const { selector, body, context } of rules) {
    const parts = splitTopLevel(selector);
    if (!animated(body)) {
      // A rule that only staggers a beat is gated like the beat itself.
      if (declarations(body, "animation-delay").length || declarations(body, "animation-range").length || declarations(body, "animation-timeline").length) {
        assert.ok(context.includes("@media (prefers-reduced-motion: no-preference)"), selector);
        for (const part of parts) assert.match(part, ECONOMY_GATE, part);
      }
      continue;
    }
    assert.ok(context.includes("@media (prefers-reduced-motion: no-preference)"), selector);
    for (const part of parts) assert.match(part, ECONOMY_GATE, part);
    if (timed(body)) {
      linked += 1;
      assert.ok(
        context.some((at) => /^@supports \((?:animation-timeline: view\(\)|timeline-scope: --fsl-story)\)/.test(at)),
        selector,
      );
      for (const part of parts) assert.match(part, FULL_GATE, part);
      for (const timeline of splitTopLevel(declarations(body, "animation-timeline").at(-1))) {
        assert.match(timeline, /^--(?:fst-plate|fsl-[\w-]+)$/, selector);
      }
      assert.equal(declarations(body, "animation-range").length, 1, selector);
      continue;
    }
    finite += 1;
    for (const value of declarations(body, "animation")) {
      for (const layer of splitTopLevel(value)) {
        const times = [...layer.matchAll(/(\d+)ms/g)].map((match) => Number(match[1]));
        assert.ok(times.length >= 1, `${selector}: ${layer}`);
        const [duration, ...offsets] = times;
        assert.ok(duration <= 1000, `${selector}: ${layer}`);
        assert.ok(duration + Math.max(0, ...offsets) <= 2000, `${selector}: ${layer}`);
      }
    }
    // The clock's lamp hand plays once the load gate hands over; every
    // other beat answers the reader's own action (a record, a tab).
    for (const part of parts) {
      if (part.includes(".fsk-map")) assert.match(part, /:not\(\[data-loading\]\)/, part);
      else
        assert.match(
          part,
          /\.fst-pickup-dialog\[open\]|\.fst-cast-detail|\.fst-cast-copy|\.fst-pickup-record/,
          part,
        );
    }
  }
  assert.ok(finite >= 12, String(finite));
  assert.ok(linked >= 3, String(linked));
});

test("staggers and ranges never run outside their beat's gate", async () => {
  const { rules } = parse(await read(SHEET));
  for (const { selector, body, context } of rules) {
    if (!declarations(body, "animation-range").length && !declarations(body, "animation-timeline").length) continue;
    for (const part of splitTopLevel(selector)) assert.match(part, FULL_GATE, part);
    assert.ok(context.includes("@media (prefers-reduced-motion: no-preference)"), selector);
  }
});

test("transitions answer the reader only, behind reduced motion and economy", async () => {
  const { rules } = parse(await read(SHEET));
  let count = 0;
  for (const { selector, body, context } of rules) {
    const transitions = declarations(body, "transition");
    if (!transitions.length) continue;
    count += 1;
    assert.ok(context.includes("@media (prefers-reduced-motion: no-preference)"), selector);
    for (const part of splitTopLevel(selector)) assert.match(part, ECONOMY_GATE, part);
    for (const layer of splitTopLevel(transitions.join(","))) {
      assert.match(layer, /^(?:scale|translate|border-color) \d+ms\b/, layer);
    }
  }
  assert.ok(count >= 4, String(count));
});

test("keyframes are the edition's own and move only opacity and transforms (one clip strike)", async () => {
  const { keyframes } = parse(await read(SHEET));
  assert.ok(keyframes.length >= 12, String(keyframes.length));
  const allowed = new Set(["opacity", "transform", "translate", "scale", "rotate"]);
  for (const { name, body } of keyframes) {
    assert.match(name, /^fsl-/, name);
    const properties = new Set([...body.matchAll(/([\w-]+)\s*:/g)].map((match) => match[1]));
    for (const property of properties) {
      if (property === "clip-path") assert.equal(name, "fsl-strike", name);
      else assert.ok(allowed.has(property), `${name} animates ${property}`);
    }
    assert.doesNotMatch(body, /filter|background|color/, name);
    // One rise and one fall of opacity at most (a single flash pair).
    const opacities = [...body.matchAll(/opacity:\s*([\d.]+)/g)].map((match) => Number(match[1]));
    let turns = 0;
    for (let index = 2; index < opacities.length; index += 1) {
      const before = Math.sign(opacities[index - 1] - opacities[index - 2]);
      const after = Math.sign(opacities[index] - opacities[index - 1]);
      if (before && after && before !== after) turns += 1;
    }
    assert.ok(turns <= 1, `${name}: ${opacities.join(" → ")}`);
  }
});

test("a swap never fades through black: portraits and stage art arrive opaque", async () => {
  const { rules, keyframes } = parse(await read(SHEET));
  const settle = keyframes.find(({ name }) => name === "fsl-settle");
  assert.ok(settle);
  assert.doesNotMatch(settle.body, /opacity|translate/);
  for (const target of [".fst-cast-detail figure", ".fst-pickup-record .rxs-stage-panel figure"]) {
    const rule = rules.find(
      ({ selector, body }) => selector.endsWith(target) && declarations(body, "animation").length,
    );
    assert.ok(rule, target);
    assert.match(declarations(rule.body, "animation")[0], /^fsl-settle \d+ms/);
  }
});

test("ornaments rest out of sight, so a still page shows nothing they draw", async () => {
  const { rules } = parse(await read(SHEET));
  const rest = (selector) =>
    rules.find((rule) => rule.selector === selector && !rule.context.length)?.body ?? "";
  assert.match(rest("html .fst-page.fst-page .fsk-map::after"), /opacity: 0/);
  assert.match(rest("html .fst-page.fst-page .fsl-route::after"), /opacity: 0/);
  assert.match(rest("html .fst-page.fst-page .fsl-route b::after"), /opacity: 0/);
  assert.match(rest("html .fst-page.fst-page .rxs-local-nav nav a::after"), /opacity: 0/);
  // The doors stand open (out of the sheet, which clips them) and never
  // take a pointer.
  assert.match(rest("html .fst-page.fst-page .fsl-gate"), /pointer-events: none/);
  assert.match(rest("html .fst-page.fst-page .fsl-gate::before"), /translate: -101% 0/);
  assert.match(rest("html .fst-page.fst-page .fsl-gate::after"), /translate: 101% 0/);
});

test("the chapter timelines keep the elevation's --fst-section beside their own", async () => {
  const { rules } = parse(await read(SHEET));
  for (const [id, name] of [
    ["story", "--fsl-story"],
    ["characters", "--fsl-cast"],
    ["riders", "--fsl-riders"],
  ]) {
    const rule = rules.find(({ selector }) => selector === `html .fst-page.fst-page #${id}`);
    assert.ok(rule, id);
    assert.deepEqual(declarations(rule.body, "view-timeline-name"), [`--fst-section, ${name}`]);
  }
});

test("the ornaments are textless and hidden from assistive tech", async () => {
  const component = await read("src/components/final-stage/final-stage.tsx");
  assert.equal((component.match(/className="fsl-/g) ?? []).length, 3);
  // The pass's tear line: an empty <i> between the keyed portrait and the
  // keyed copy, itself unkeyed so it stays put while a tab prints the pass.
  assert.match(
    component,
    /<\/figure>\s*\{\/\*[\s\S]*?\*\/\}\s*<i className="fsl-tear" aria-hidden="true" \/>\s*<div key=\{`\$\{activeCast\.id\}-copy`\} className="fst-cast-copy">/,
  );
  // The record's doors: an empty <i>, the dialog's first child.
  assert.match(
    component,
    /<dialog[\s\S]*?>\s*\{\/\*[\s\S]*?\*\/\}\s*<i className="fsl-gate" aria-hidden="true" \/>\s*<button\s+type="button"\s+className="form-pickup-close"/,
  );
  // The read's route: one empty station per paragraph, inside the story
  // index, which is itself hidden.
  assert.match(
    component,
    /<div className="fst-story-index" aria-hidden="true">\s*<span>FINAL<\/span>\s*<span>STAGE<\/span>\s*<i \/>\s*\{\/\*[\s\S]*?\*\/\}\s*<div className="fsl-route">\s*\{STORY\.paragraphs\.map\(\(_, index\) => \(\s*<b key=\{index\} \/>\s*\)\)\}\s*<\/div>\s*<\/div>/,
  );
});

test("the 12px floor, silent figures and forced colours", async () => {
  const css = strip(await read(SHEET));
  for (const [, size] of css.matchAll(/font(?:-size)?:[^;]*?(\d+(?:\.\d+)?)px/g)) {
    assert.ok(Number(size) >= 12, size);
  }
  assert.doesNotMatch(css, /font-size:\s*(?:0?\.\d+|1(?:\.0*)?)(?:em|rem)\b/);
  // Generated text: only the gates' platform numbers, each silent.
  for (const [, value] of css.matchAll(/content:\s*([^;]+);/g)) {
    assert.match(value.trim(), /^(?:""|"0[12]" \/ "")$/, value);
  }
  const forced = css.slice(css.indexOf("@media (forced-colors: active)"));
  for (const ornament of [
    ".fsk-map::after",
    ".fsl-gate",
    ".fsl-route::after",
    ".fsl-tear::before",
    ".fst-pickup-card::before",
    ".rxs-local-nav nav a::after",
  ]) {
    assert.ok(forced.slice(0, forced.indexOf("display: none")).includes(ornament), ornament);
  }
  assert.match(forced, /background: Canvas;/);
  assert.match(forced, /ButtonText/);
});

test("opaque swaps paint on their first frame: the alternates are warmed with the element's own candidates", async () => {
  const source = await read("src/components/final-stage/final-stage.tsx");
  // One candidate helper for the portrait element and its warm-up.
  assert.match(source, /const castImage = \(source: string\) => \(\{ \.\.\.dossierImage\(source\), \.\.\.rexonanceImage\(source\) \}\);/);
  assert.match(source, /<img\s+src=\{person\.image\}\s+\{\.\.\.castImage\(person\.image\)\}/);
  // Portraits warm near the cast rail; stage art once its record opens.
  assert.match(source, /warmRexonanceStages\(\s*rail,\s*CAST\.slice\(1\)[\s\S]*?castImage,\s*\)/);
  assert.match(
    source,
    /warmRexonanceStages\(\s*rail\.closest\("dialog"\) \?\? rail,\s*FFS_STAGE_ORDER\.filter\(\(key\) => key !== "middle"\)/,
  );
  // The stage element and its warm-up ask for the same candidates.
  assert.match(source, /\{\.\.\.rexonanceImage\(activeStage\.image\)\}/);
});
