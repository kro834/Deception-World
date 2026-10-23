import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CLASH_MS, mountExtremeFightCard } from "../src/lib/extreme-fightcard.js";

/* FIGHT CARD (rx15) on /extreme-saga: src/styles-extreme-fightcard.css, the
   tale-of-the-tape engine src/lib/extreme-fightcard.js and the silent boxes
   it adds to the component (the billing, the VS mark, the other form beyond
   the seam). These pins keep it safe: where the sheet loads and what it may
   select; that nothing rides the scroll and every beat plays from a one-shot
   key behind every gate and ends by 2 s; that the seam's art stands still
   while the seam travels and always shows the other form; what keyframes
   touch; the 12px floor, silent ornaments, no blur, glow or blend; the
   forced-colours and reduced-transparency paths; the markup it relies on;
   and the engine's lifecycle. */

const slider = readFileSync(new URL("../src/components/special/form-slider.tsx", import.meta.url), "utf8");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const source = read("src/styles-extreme-fightcard.css");
const css = strip(source);
const overdrive = strip(read("src/styles-extreme-overdrive.css"));
const route = read("src/routes/extreme-saga.tsx");
const component = read("src/components/extreme-saga/extreme-saga.tsx");

// Style rules with their at-rule context, and keyframe blocks by name.
function parse(text) {
  const body = strip(text);
  const flat = (value) =>
    value.replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").trim();
  const rules = [];
  const keyframes = [];
  const stack = [];
  let prelude = "";
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index];
    if (character === "{") {
      const head = flat(prelude);
      prelude = "";
      const frames = head.match(/^@keyframes\s+([\w-]+)$/);
      if (frames) {
        let depth = 1;
        let end = index + 1;
        for (; end < body.length && depth > 0; end += 1) {
          if (body[end] === "{") depth += 1;
          if (body[end] === "}") depth -= 1;
        }
        keyframes.push({ name: frames[1], body: body.slice(index + 1, end - 1) });
        index = end - 1;
        continue;
      }
      if (head.startsWith("@")) {
        stack.push(head);
        continue;
      }
      const end = body.indexOf("}", index);
      rules.push({ selector: head, body: body.slice(index + 1, end), context: [...stack] });
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

const { rules, keyframes } = parse(source);
const SCOPE =
  /^html\[data-family="special"\](?::not\(\[[^\]]+\]\))* body \.rxs-page\.rxs-page\.exs-page(?:[\s[>:.#]|$)/;
const FULL_GATE =
  /^html\[data-family="special"\]:not\(\[data-world-effects="economy"\]\):not\(\[data-side-menu-open\]\):not\(\[data-loading\]\):not\(\[data-dialog-open\]\) body \.rxs-page\.rxs-page\.exs-page\[data-motion-ready="true"\]/;
const KEYS = /\[data-exi-(?:hit|impact|arrival)="true"\]|\[data-exf-clash="true"\]/;
const moving = (body) =>
  [...declarations(body, "animation"), ...declarations(body, "animation-name")].some(
    (value) => value !== "none",
  );

test("the sheet loads on /extreme-saga only, after the IMPACT layer and before the cinematic sheet", () => {
  assert.match(
    route,
    /import extremeFightCardCssUrl from "@\/styles-extreme-fightcard\.css\?url";/,
  );
  const links = route.slice(route.search(/links:\s*\[/));
  const impact = links.indexOf("href: extremeImpactCssUrl");
  const card = links.indexOf("href: extremeFightCardCssUrl");
  const cinematic = links.indexOf("CINEMATIC_STYLESHEET_LINK");
  assert.ok(impact > 0 && impact < card && card < cinematic);
  assert.equal(links.lastIndexOf('rel: "stylesheet"') < cinematic, true);
  for (const path of [
    "src/lib/world-head.ts",
    "src/routes/__root.tsx",
    "src/routes/world.tsx",
    "src/routes/rexonance-saga.tsx",
    "src/routes/final-stage.tsx",
    "src/routes/dream-chapter.tsx",
  ]) {
    assert.doesNotMatch(read(path), /extreme-fightcard|extremeFightCard/, path);
  }
});

test("every rule is scoped to the special family and the doubled Extreme page", () => {
  assert.ok(rules.length > 80, String(rules.length));
  for (const { selector } of rules) {
    for (const part of splitTopLevel(selector)) assert.match(part, SCOPE, part);
  }
  assert.doesNotMatch(
    css,
    /\.rxs-local-nav|\.rxs-menu-trigger|\.side-panel|#site-side-panel|\.rx-call|\.rx-suit|\.load-gate|\.fst-|\.rxs-rexonance-page|liquid-selection|liquid-rail/,
  );
  assert.doesNotMatch(css, /:has\(/);
});

test("nothing rides the scroll", () => {
  assert.doesNotMatch(css, /animation-timeline|view-timeline|scroll-timeline|animation-range/);
  assert.doesNotMatch(css, /position:\s*sticky/);
});

test("keyframes are its own, move only opacity and transforms, end, and turn opacity once at most", () => {
  assert.ok(keyframes.length >= 9, String(keyframes.length));
  for (const { name, body } of keyframes) {
    assert.match(name, /^exf-/, name);
    const properties = new Set([...body.matchAll(/([\w-]+)\s*:/g)].map((match) => match[1]));
    for (const property of properties)
      assert.ok(
        ["opacity", "transform", "translate", "scale", "rotate"].includes(property),
        `${name}: ${property}`,
      );
    const opacities = [...body.matchAll(/opacity:\s*([\d.]+)/g)].map((match) => Number(match[1]));
    let turns = 0;
    for (let index = 2; index < opacities.length; index += 1) {
      const before = Math.sign(opacities[index - 1] - opacities[index - 2]);
      const after = Math.sign(opacities[index] - opacities[index - 1]);
      if (before && after && before !== after) turns += 1;
    }
    assert.ok(turns <= 1, `${name}: ${opacities.join(" → ")}`);
  }
  assert.doesNotMatch(css, /\binfinite\b|animation-iteration-count/);
  const used = new Set(
    rules.flatMap(({ body }) =>
      declarations(body, "animation").flatMap((value) =>
        [...value.matchAll(/(?<![-\w])((?:exf|exi|exo|ex|mx|sx|sc|dxs)-[\w-]+)/g)].map(
          (match) => match[1],
        ),
      ),
    ),
  );
  assert.ok(used.size >= 8, String(used.size));
  for (const name of used)
    assert.ok(name.startsWith("exf-") && keyframes.some((frame) => frame.name === name), name);
});

test("every beat plays from a one-shot key behind every gate and ends by 2 s", () => {
  const ROW = 270; // the fourth row's stagger (--exf-row)
  let beats = 0;
  for (const { selector, body, context } of rules) {
    if (!moving(body)) continue;
    assert.ok(context.includes("@media (prefers-reduced-motion: no-preference)"), selector);
    for (const part of splitTopLevel(selector)) {
      assert.match(part, FULL_GATE, part);
      assert.match(part, KEYS, part);
    }
    for (const value of declarations(body, "animation")) {
      for (const layer of splitTopLevel(value)) {
        const times = [...layer.matchAll(/(\d+)ms/g)].map((match) => Number(match[1]));
        const [duration, ...offsets] = times;
        assert.ok(Number.isFinite(duration), `${selector}: ${layer}`);
        const delay =
          offsets.reduce((sum, ms) => sum + ms, 0) + (/--exf-row/.test(layer) ? ROW : 0);
        assert.ok(duration <= 1500, `${selector}: ${layer}`);
        assert.ok(duration + delay <= 2000, `${selector}: ${layer}`);
        beats += 1;
      }
    }
  }
  assert.ok(beats >= 10, String(beats));
  // The engine's key outlives the latest beat it starts.
  assert.ok(CLASH_MS >= ROW + 400 + 520, String(CLASH_MS));
  // The rules that stand the overdrive's comparator beats down only stop.
  const stops = rules.filter(({ body }) => declarations(body, "animation").length && !moving(body));
  assert.ok(stops.length >= 2);
  for (const { selector } of stops)
    for (const part of splitTopLevel(selector)) assert.match(part, FULL_GATE, part);
});

test("unreached beats are held back only while an engine waits on them", () => {
  // The rows: only while the fight-card engine marks one waiting (data-exf-clash="").
  const rows = rules.filter(({ selector }) => /\[data-exf-clash=""\]/.test(selector));
  assert.equal(rows.length, 2);
  // The sliver: only while the IMPACT engine is armed and the stage unreached.
  const sliver = rules.filter(({ selector }) =>
    /#exs-stage-panel\[data-exi-hit=""\]/.test(selector),
  );
  assert.equal(sliver.length, 2);
  for (const { selector, context, body } of [...rows, ...sliver]) {
    assert.ok(context.includes("@media (prefers-reduced-motion: no-preference)"), selector);
    assert.doesNotMatch(body, /animation/);
    for (const part of splitTopLevel(selector)) assert.match(part, FULL_GATE, part);
  }
  for (const { selector } of sliver) assert.match(selector, /\[data-exi-armed="true"\]/);
  // Pass 2: the end card's billing waits off the slab until the card is reached.
  const billing = rules.filter(({ selector }) =>
    /> \.rxs-footer\[data-exi-hit=""\] > \.exf-billing$/.test(selector),
  );
  assert.equal(billing.length, 1);
  assert.match(billing[0].body, /^\s*opacity: 0;\s*$/);
  assert.match(billing[0].selector, FULL_GATE);
  assert.match(billing[0].selector, /\[data-exi-armed="true"\]/);
  assert.ok(billing[0].context.includes("@media (prefers-reduced-motion: no-preference)"));
  // Nothing else waits on a scene key.
  assert.equal(rules.filter(({ selector }) => /data-exi-hit=""/.test(selector)).length, 3);
});

test("the seam's art stands still while it travels, and always shows the other form", () => {
  // Evaluate a translate expression of the box (in its 200% width) or the art
  // (in the figure's width) for a sliver s, in figure widths.
  const evaluate = (expression, s) => {
    const value = expression
      .replace(/^calc/, "")
      .replace(/var\(--exf-sliver\)/g, String(s))
      .replace(/%/g, "");
    assert.match(value, /^[\d\s.()+\-*]+$/, expression);
    return Function(`return (${value});`)() / 100;
  };
  const translateOf = (body) => {
    const value = declarations(body, "translate").at(-1);
    return value === undefined ? undefined : splitTopLevel(value, " ")[0];
  };
  const frames = Object.fromEntries(
    keyframes.map(({ name, body }) => [
      name,
      ["from", "to"].map((step) => {
        const block = body.match(new RegExp(`${step}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
        return translateOf(block);
      }),
    ]),
  );
  const rest = (form, art) =>
    translateOf(
      rules.find(({ selector }) =>
        selector.endsWith(`figure[data-form="${form}"] > .exf-rival${art ? " > span" : ""}`),
      ).body,
    );
  for (const s of [0.24, 0.2]) {
    // The box moves by its distance in its own (double) width; the art back by
    // the same distance in its own width: box × 2 + art = 0.
    for (const [box, art] of [
      ["exf-sliver-in", "exf-sliver-in-art"],
      ["exf-seam-ultra", "exf-seam-ultra-art"],
      ["exf-seam-middle", "exf-seam-middle-art"],
    ])
      for (const step of [0, 1])
        assert.ok(
          Math.abs(evaluate(frames[box][step], s) * 2 + evaluate(frames[art][step], s)) < 1e-9,
          `${box}/${art} ${step} @${s}`,
        );
    for (const form of ["middle", "ultra"])
      assert.ok(
        Math.abs(evaluate(rest(form, false), s) * 2 + evaluate(rest(form, true), s)) < 1e-9,
      );
    // Each journey ends where its form rests; a change of form starts where the
    // other form rested (the seam the reader saw).
    assert.equal(frames["exf-seam-ultra"][1], rest("ultra", false));
    assert.equal(frames["exf-seam-middle"][1], rest("middle", false));
    assert.equal(frames["exf-sliver-in"][1], rest("middle", false));
    // Middle at rest: the seam stands 1 - s across (Ultra beyond it); Ultra at
    // rest: s across (Middle before it).
    assert.ok(Math.abs(evaluate(rest("middle", false), s) * 2 - (1 - s)) < 1e-9);
    assert.ok(Math.abs(1 + evaluate(rest("ultra", false), s) * 2 - s) < 1e-9);
    assert.ok(Math.abs(1 + evaluate(frames["exf-seam-ultra"][0], s) * 2 - (1 - s)) < 1e-9);
    assert.ok(Math.abs(evaluate(frames["exf-seam-middle"][0], s) * 2 - s) < 1e-9);
  }
  // The other form's art: Ultra beyond Middle's seam, Middle beyond Ultra's.
  const backdrops = rules.filter(({ body }) => /url\(/.test(body));
  assert.equal(backdrops.length, 2);
  for (const { selector, body } of backdrops) {
    const form = selector.match(/figure\[data-form="(ultra|middle)"\] > \.exf-rival > span$/)?.[1];
    assert.ok(form, selector);
    assert.match(
      body,
      form === "middle"
        ? /url\("\/saga-extreme-ultra-20261006\.jpeg"\)/
        : /url\("\/saga-extreme-middle-20261006\.webp"\)/,
    );
  }
  // Review: the waiting form stands in its corner's shade (one pose in both
  // arts, so unshaded the sliver read as the same picture). On a change of
  // form the losing form keeps its light while the seam crosses the body and
  // steps into the shade only as the seam comes to rest, inside the impact
  // key (1000 ms), so the body never dips and rises.
  const shade = rules.find(
    ({ selector, context }) =>
      !context.length && selector.endsWith("> figure > .exf-rival > span::before"),
  );
  assert.ok(shade);
  assert.match(shade.body, /background: rgb\(5 4 3 \/ \d+%\);/);
  assert.doesNotMatch(shade.body, /animation|opacity/);
  const shadeIn = rules.filter(({ body }) => /exf-shade/.test(body));
  assert.equal(shadeIn.length, 1);
  assert.match(
    shadeIn[0].selector,
    /figure\[data-exi-impact="true"\] > \.exf-rival > span::before$/,
  );
  const [shadeMs, shadeDelay] = [...shadeIn[0].body.matchAll(/(\d+)ms/g)].map((m) => Number(m[1]));
  assert.ok(shadeDelay >= 500 && shadeMs + shadeDelay < 1000, `${shadeMs} @ ${shadeDelay}`);
  assert.match(
    keyframes.find(({ name }) => name === "exf-shade").body,
    /from\s*\{\s*opacity: 0;\s*\}\s*to\s*\{\s*opacity: 1;\s*\}/,
  );
  // The lit blade runs only on the way to Ultra (the way back darkens the art).
  const blades = rules.filter(({ body }) => /exf-blade/.test(body));
  assert.equal(blades.length, 1);
  assert.match(blades[0].selector, /figure\[data-form="ultra"\]\[data-exi-impact="true"\]/);
  // Pass 2: the overdrive's clipped wipe of the art never plays, before or
  // after the quake (as the impact key retired, the image fell back to the
  // wipe and was wiped in a second time a second after the change).
  const wipe = rules.find(({ selector }) =>
    selector.endsWith(
      '#exs-stage-panel[data-exo-cut="true"] > figure:not([data-exi-impact="true"]) > img',
    ),
  );
  assert.ok(wipe);
  assert.match(wipe.body, /^\s*animation: none;\s*$/);
  assert.match(wipe.selector, FULL_GATE);
});

// Pass 2: the corners. On wide screens the form switch stands inside the duel
// at the head of its copy column; the rows are shared through subgrid, the
// markup keeps its order, and without subgrid the tabs stand above the scene.
test("on wide screens the form switch stands inside the duel, in markup order, on the wrap", () => {
  const corner = rules.filter(({ context }) =>
    context.some((at) => at === "@supports (grid-template-rows: subgrid)"),
  );
  assert.ok(corner.length >= 6, String(corner.length));
  for (const { selector, context } of corner)
    assert.ok(context.includes("@media (min-width: 1100px)"), selector);
  const find = (end) => corner.find(({ selector }) => selector.endsWith(end));
  const switcher = find("> #stages .rxs-stage-switcher");
  assert.match(switcher.body, /grid-template-rows: auto auto minmax\(0, 1fr\);/);
  assert.match(
    switcher.body,
    /--exf-corner: max\(var\(--ext-gutter\), calc\(\(100vw - var\(--dxs-wrap\)\) \/ 2\)\);/,
  );
  const tabs = find("> .rxs-stage-tabs.liquid-swipe-tabs");
  const hint = find("> .rxs-stage-hint");
  for (const [rule, row] of [
    [tabs, 1],
    [hint, 2],
  ]) {
    assert.match(rule.body, new RegExp(`grid-column: 1;\\s*grid-row: ${row};`));
    assert.match(rule.body, /z-index: 5;/);
    assert.match(rule.body, /var\(--exf-corner\)/);
  }
  const panel = find("> #stages #exs-stage-panel");
  assert.match(
    panel.body,
    /grid-row: 1 \/ -1;\s*grid-template-columns: subgrid;\s*grid-template-rows: subgrid;/,
  );
  assert.match(find("#exs-stage-panel > figure").body, /grid-column: 2;\s*grid-row: 1 \/ -1;/);
  assert.match(find("#exs-stage-panel > div").body, /grid-column: 1;\s*grid-row: 3;/);
  // Geometry only: no motion rides the corners.
  for (const { body } of corner) assert.doesNotMatch(body, /animation|transition/);
  // The markup order the rail, the panel and the tests read is unchanged.
  // Owner (2026-10-23): 不要なセカンダリラベルを削除（レイアウトで説明）: the hint is read
  // to assistive tech only (visually-hidden); its place in the order stays.
  const order = [
    "ref={stageTabsRef}",
    'id="exs-stage-hint" className="rxs-stage-hint visually-hidden"',
    'id="exs-stage-panel"',
  ].map((needle) => component.indexOf(needle));
  assert.ok(order[0] > 0 && order[0] < order[1] && order[1] < order[2], String(order));
});

// Review: on wide screens the architectures span the formula's row and the
// rows' row; the rows' track is flexible so it takes their extra height (an
// auto track left 70-90px of ink between the formula and the first clash).
test("on wide screens the tape starts right under its formula", () => {
  const wide = rules.find(
    ({ selector, context }) =>
      context.length === 1 &&
      context[0] === "@media (min-width: 1100px)" &&
      selector.endsWith("> #performance .rxs-comparison"),
  );
  assert.ok(wide);
  assert.match(wide.body, /grid-template-rows: auto auto 1fr;/);
  const architectures = rules.find(
    ({ selector, context }) =>
      context[0] === "@media (min-width: 1100px)" &&
      selector.endsWith(".rxs-comparison > .rxs-processing-comparison"),
  );
  assert.match(architectures.body, /grid-row: 2 \/ span 2;/);
});

// Pass 2: the cuts between rounds are one bell, not a long walk.
test("the cuts between rounds keep the slant's runway and lose the long walk", () => {
  const atTop = (end, property) =>
    rules.find(
      ({ selector, body, context }) =>
        !context.length && selector.endsWith(end) && new RegExp(`${property}:`).test(body),
    );
  assert.match(
    atTop("> :is(#performance, #p14, #stages, #system)", "padding-top").body,
    /padding-top: calc\(clamp\(48px, 6\.2vw, 92px\) \+ var\(--ext-slant\)\);/,
  );
  assert.match(
    atTop("> :is(#performance, #p14, #system)", "padding-bottom").body,
    /padding-bottom: clamp\(56px, 7\.4vw, 108px\);/,
  );
  assert.match(
    atTop(" > .rxs-footer", "padding-top").body,
    /padding-top: calc\(clamp\(64px, 8vw, 116px\) \+ var\(--ext-slant\)\);/,
  );
});

test("12px floor, no !important, no blur, glow or blend, silent generated text", () => {
  assert.doesNotMatch(css, /font-size:\s*(?:[0-9]|1[01])(?:\.\d+)?px\b/);
  for (const [, size] of css.matchAll(/font(?:-size)?:\s*(?:\d{3}\s+)?(\d+(?:\.\d+)?)px/g))
    assert.ok(Number(size) >= 12, size);
  for (const [, min] of css.matchAll(/font(?:-size)?:\s*(?:\d{3}\s+)?clamp\((\d+(?:\.\d+)?)px/g))
    assert.ok(Number(min) >= 12, min);
  assert.doesNotMatch(
    css,
    /!important|blur\(|backdrop-filter|mix-blend-mode|filter\s*:|text-shadow:(?!\s*none)/,
  );
  for (const value of declarations(css.replace(/\n/g, " "), "box-shadow"))
    assert.doesNotMatch(value, /\d+px\s+\d+px\s+[1-9]/, value);
  for (const [, value] of css.matchAll(/(?<![\w-])content:\s*([^;]+);/g))
    assert.match(value.trim(), /^(?:""|none|"(?:ROUND|ULTRA|MIDDLE|01)" \/ "")$/, value);
  // Transitions: none here (presses keep the house spring).
  assert.doesNotMatch(css, /(?:^|;)\s*transition\s*:/m);
});

test("forced colours drop the ornaments and keep the figures; reduced transparency drops the tone", () => {
  const forced = css.slice(css.indexOf("@media (forced-colors: active)"));
  assert.ok(forced.length > 200);
  for (const ornament of [".exf-billing", ".exf-rival", ".exf-vs", "i.is-rexonance::after"])
    assert.ok(forced.slice(0, forced.indexOf("display: none")).includes(ornament), ornament);
  assert.match(forced, /background: CanvasText;/);
  assert.match(forced, /color: CanvasText;\s*background: Canvas;/);
  const reduced = css.slice(
    css.indexOf("@media (prefers-contrast: more), (prefers-reduced-transparency: reduce)"),
  );
  assert.match(reduced, /::before \{\s*background: none;/);
});

test("the component adds only silent boxes, keeps one image per form and the owner's figures", () => {
  // The billing (the poster's, and the end card's answer) and the other form
  // beyond the seam are silent.
  const billings = [
    ...component.matchAll(/<b className="exf-billing" aria-hidden="true">\s*EXTREME\s*<\/b>/g),
  ];
  assert.equal(billings.length, 2);
  const footer = component.slice(component.indexOf('<footer className="rxs-footer">'));
  assert.ok(billings[1].index > component.indexOf('<footer className="rxs-footer">'));
  assert.ok(footer.indexOf("exf-billing") < footer.indexOf("<h2>"));
  const figure = component.match(
    /<figure key=\{shownStage\} data-form=\{shownStage\}>[\s\S]*?<\/figure>/,
  )?.[0];
  assert.ok(figure);
  assert.equal((figure.match(/<img\b/g) ?? []).length, 1);
  assert.match(figure, /<span className="exf-rival" aria-hidden="true">\s*<span \/>\s*<\/span>/);
  // The VS mark sits inside the silent key; the select stays the only control.
  const key = component.match(
    /<div className="rxs-comparison-key" aria-hidden="true">[\s\S]*?<\/div>/,
  )?.[0];
  assert.ok(key);
  assert.match(key, /<b className="exf-vs">VS<\/b>/);
  // Each row knows who wins it, from the bars the component already draws.
  assert.match(
    component,
    /data-exf-win=\{metric\.currentBar >= metric\.baselineBar \? "extreme" : "rival"\}/,
  );
  // The ratio stands as the owner's figure and counts via its silent tally copy.
  assert.match(
    component,
    /<b>\s*<span className="exi-figure">\s*<span className="exi-real">\{metric\.relative\}<\/span>/,
  );
  assert.match(component, /\{activeComparison\.code\} \/ <b>\{metric\.previous\}<\/b>/);
  assert.match(component, /useEffect\(\(\) => mountExtremeFightCard\(pageRef\.current\), \[\]\);/);
  // The stage panel is reached like the other scenes (the sliver's arrival).
  assert.match(component, /data-exi-warm=\{`[^`]+`\}\s*data-exi-hit=""/);
});

// The readout's own opacity cannot reveal an ancestor that hides the whole row.
test("P14 TUNING keeps its parent visible while reusing the translate-only reveal", () => {
  const tuningRule = parse(overdrive).rules.find(({ selector }) =>
    selector.endsWith(".rxs-p14-copy .exo-read:nth-child(3)"),
  );
  assert.ok(tuningRule, "TUNING retains its dedicated entry rule");
  assert.ok(tuningRule.context.includes("@media (prefers-reduced-motion: no-preference)"));
  const selector = tuningRule.selector.replace(/\s+/g, " ");
  for (const gate of ["[data-world-effects=\"economy\"]", "[data-side-menu-open]", "[data-loading]", "[data-dialog-open]"])
    assert.ok(selector.includes(`:not(${gate})`), `missing gate ${gate}`);
  assert.match(tuningRule.body, /animation-name:\s*exo-jab-in;/);
  assert.match(tuningRule.body, /animation-range:\s*entry 36% entry 71%;/);
  const jabIn = parse(overdrive).keyframes.find(({ name }) => name === "exo-jab-in");
  assert.ok(jabIn);
  assert.doesNotMatch(jabIn.body, /opacity\s*:/);
});

test("both stage-tab names and codes fit on one line at 320px", () => {
  // The same pin covers all phone widths; 390px exposed the identical wrap.
  const narrow = css.slice(css.indexOf("@media (max-width: 560px)"));
  assert.match(narrow, /\.exs-stage-tabs\s*>\s*button\[role="tab"\]\s*>\s*small\s*\{[^}]*white-space:\s*nowrap;/);
  // Owner (2026-10-23): 不要なセカンダリラベルを削除（レイアウトで説明）: a tab holds its
  // form's name alone (the English code under it went).
  // Owner (2026-10-24): one form-slider shape (src/components/special/form-slider.tsx).
  assert.match(component, /label: EXTREME_STAGES\[key\]\.label,/);
  assert.match(slider, /<span>\{label\}<\/span>\s*<\/button>/);
  assert.doesNotMatch(component, /<small>\{EXTREME_STAGES\[key\]\.code\}<\/small>/);
});

// The later editorial reset must not undo the already pinned wide composition.
test("the later editorial sheet preserves both wide heading corners", () => {
  const editorial = parse(read("src/styles-extreme-editorial.css"));
  const wide = editorial.rules.filter(({ context }) => context.includes("@media (min-width: 1100px)"));
  assert.ok(wide.some(({ selector, body }) => selector.endsWith(".rxs-section-heading > h2") && /display:\s*grid;/.test(body)));
  assert.ok(wide.some(({ selector, body }) => selector.endsWith("h2 > br") && /display:\s*none;/.test(body)));
  assert.ok(wide.some(({ selector, body }) => selector.endsWith(".rxs-section-heading > span") && /grid-column:\s*3;/.test(body)));
});

/* ---------- The engine ---------- */

function eventTarget() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(name, callback) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(callback);
    },
    removeEventListener(name, callback) {
      listeners.get(name)?.delete(callback);
      if (!listeners.get(name)?.size) listeners.delete(name);
    },
  };
}

function element(className, attributes = {}, children = []) {
  const values = new Map(Object.entries(attributes));
  return {
    nodeType: 1,
    className,
    children,
    getAttribute: (name) => (values.has(name) ? values.get(name) : null),
    setAttribute: (name, value) => values.set(name, String(value)),
    removeAttribute: (name) => values.delete(name),
    hasAttribute: (name) => values.has(name),
    matches: (selector) => selector === `.${className}`,
    querySelector(selector) {
      return selector === ":scope > .rxs-comparison-metrics"
        ? (children.find((child) => child.className === "rxs-comparison-metrics") ?? null)
        : null;
    },
    querySelectorAll(selector) {
      return selector === ":scope > article"
        ? children.filter((child) => child.className === "article")
        : [];
    },
  };
}

const metrics = (count = 4) =>
  element(
    "rxs-comparison-metrics",
    {},
    Array.from({ length: count }, () => element("article")),
  );

function setup({ reduced = false, economy = false, loading = false } = {}) {
  const timers = new Map();
  const watchers = [];
  const observers = [];
  let serial = 0;
  let clock = 0;
  const reducedMotion = { ...eventTarget(), matches: reduced };
  const html = element("html", loading ? { "data-loading": "" } : {});
  html.dataset = { worldEffects: economy ? "economy" : "full" };
  const document = { ...eventTarget(), hidden: false, documentElement: html };
  const initial = metrics();
  const comparison = element("rxs-comparison", {}, [initial]);
  const page = {
    ownerDocument: document,
    querySelector: (selector) => (selector === ".rxs-comparison" ? comparison : null),
  };
  const environment = {
    ...eventTarget(),
    navigator: { connection: { ...eventTarget(), saveData: false, effectiveType: "4g" } },
    matchMedia: () => reducedMotion,
    setTimeout(callback, ms) {
      timers.set(++serial, { callback, at: clock + ms });
      return serial;
    },
    clearTimeout: (id) => timers.delete(id),
    MutationObserver: class {
      constructor(callback) {
        this.callback = callback;
        this.disconnected = false;
        watchers.push(this);
      }
      observe(target, options) {
        this.target = target;
        this.options = options;
      }
      disconnect() {
        this.disconnected = true;
      }
    },
    IntersectionObserver: class {
      constructor(callback, options) {
        this.callback = callback;
        this.options = options;
        this.targets = new Set();
        this.disconnected = false;
        observers.push(this);
      }
      observe(target) {
        this.targets.add(target);
      }
      unobserve(target) {
        this.targets.delete(target);
      }
      disconnect() {
        this.disconnected = true;
        this.targets.clear();
      }
    },
  };
  const live = (target) => watchers.filter((w) => !w.disconnected && w.target === target);
  const io = () => observers.filter((o) => !o.disconnected);
  return {
    environment,
    document,
    html,
    comparison,
    initial,
    reducedMotion,
    timers,
    watchers,
    observers,
    live,
    io,
    mount: () => mountExtremeFightCard(page, environment),
    reach(row) {
      for (const observer of io().filter((o) => o.targets.has(row)))
        observer.callback([{ target: row, isIntersecting: true }], observer);
    },
    rekey() {
      const rows = metrics();
      const processing = element("rxs-processing-comparison");
      const removedNodes = comparison.children.splice(
        0,
        comparison.children.length,
        rows,
        processing,
      );
      for (const watcher of live(comparison))
        watcher.callback([{ addedNodes: [rows, processing], removedNodes }]);
      return rows;
    },
    tick(ms) {
      clock += ms;
      for (const [id, timer] of [...timers])
        if (timer.at <= clock) {
          timers.delete(id);
          timer.callback();
        }
    },
  };
}

test("each row waits, clashes once when it is reached, and retires its key", () => {
  const t = setup();
  const cleanup = t.mount();
  assert.equal(t.io().length, 1);
  assert.equal(t.io()[0].options.rootMargin, "0px 0px -12% 0px");
  assert.deepEqual(t.live(t.comparison)[0].options, { childList: true });
  const [first, second] = t.initial.children;
  for (const row of t.initial.children) assert.equal(row.getAttribute("data-exf-clash"), "");
  t.reach(first);
  assert.equal(first.getAttribute("data-exf-clash"), "true");
  assert.equal(second.getAttribute("data-exf-clash"), "");
  // Unobserved after its beat: a second crossing does nothing.
  assert.equal(t.io()[0].targets.has(first), false);
  t.tick(CLASH_MS);
  assert.equal(first.getAttribute("data-exf-clash"), "done");
  cleanup();
});

test("a change of challenger arms the new rows, which clash when they are (or already are) in view", () => {
  const t = setup();
  const cleanup = t.mount();
  const rows = t.rekey();
  for (const row of rows.children) {
    assert.equal(row.getAttribute("data-exf-clash"), "");
    assert.ok(t.io()[0].targets.has(row));
  }
  t.reach(rows.children[2]);
  assert.equal(rows.children[2].getAttribute("data-exf-clash"), "true");
  assert.equal(rows.children[0].getAttribute("data-exf-clash"), "");
  cleanup();
});

test("replacing a tape releases its rows, observers and active timers before the next clash", () => {
  const t = setup();
  const cleanup = t.mount();
  const observer = t.io()[0];
  const [active, pending] = t.initial.children;
  t.reach(active);
  assert.equal(t.timers.size, 1);
  let current = t.rekey();
  assert.equal(t.timers.size, 0, "the removed row's timer is cancelled at replacement");
  assert.equal(active.getAttribute("data-exf-clash"), "done");
  assert.equal(pending.hasAttribute("data-exf-clash"), false);
  assert.deepEqual([...observer.targets], current.children);
  observer.callback([{ target: pending, isIntersecting: true }], observer);
  assert.equal(t.timers.size, 0, "a stale intersection cannot land the removed row");
  for (let index = 0; index < 50; index += 1) {
    const previous = current;
    current = t.rekey();
    assert.deepEqual([...observer.targets], current.children);
    for (const row of previous.children) assert.equal(row.hasAttribute("data-exf-clash"), false);
  }
  t.tick(CLASH_MS);
  assert.equal(t.timers.size, 0);
  cleanup();
});

test("a batched intermediate tape and callbacks after unmount cannot re-arm removed rows", () => {
  const t = setup();
  const cleanup = t.mount();
  const watcher = t.live(t.comparison)[0];
  const observer = t.io()[0];
  const intermediate = metrics();
  const final = metrics();
  t.comparison.children.splice(0, 1, final);
  watcher.callback([
    { addedNodes: [intermediate], removedNodes: [t.initial] },
    { addedNodes: [final], removedNodes: [intermediate] },
  ]);
  assert.deepEqual([...observer.targets], final.children);
  for (const row of intermediate.children) assert.equal(row.hasAttribute("data-exf-clash"), false);
  cleanup();
  watcher.callback([{ addedNodes: [final], removedNodes: [] }]);
  observer.callback([{ target: final.children[0], isIntersecting: true }], observer);
  assert.equal(t.timers.size, 0);
  for (const row of final.children) assert.equal(row.hasAttribute("data-exf-clash"), false);
});

test("the engine stands down for reduced motion, economy rendering, the load gate and a hidden page, and releases everything", () => {
  for (const options of [{ reduced: true }, { economy: true }, { loading: true }]) {
    const t = setup(options);
    const cleanup = t.mount();
    assert.equal(t.live(t.comparison).length, 0, JSON.stringify(options));
    assert.equal(t.io().length, 0, JSON.stringify(options));
    // Nothing waits: every row stands drawn.
    for (const row of t.initial.children) assert.equal(row.getAttribute("data-exf-clash"), null);
    cleanup();
  }
  const t = setup();
  const cleanup = t.mount();
  const [first, second] = t.initial.children;
  t.reach(first);
  assert.equal(first.getAttribute("data-exf-clash"), "true");
  // Hidden: the beat retires at once, waiting rows stand drawn, nothing listens.
  t.document.hidden = true;
  [...t.document.listeners.get("visibilitychange")].forEach((callback) => callback());
  assert.equal(first.getAttribute("data-exf-clash"), "done");
  assert.equal(second.getAttribute("data-exf-clash"), null);
  assert.equal(t.live(t.comparison).length, 0);
  assert.equal(t.io().length, 0);
  assert.equal(t.timers.size, 0);
  // Back: the played row stays done; the others wait again.
  t.document.hidden = false;
  [...t.document.listeners.get("visibilitychange")].forEach((callback) => callback());
  assert.equal(first.getAttribute("data-exf-clash"), "done");
  assert.equal(second.getAttribute("data-exf-clash"), "");
  assert.equal(t.live(t.comparison).length, 1);
  cleanup();
  assert.equal(
    t.watchers.every((watcher) => watcher.disconnected),
    true,
  );
  assert.equal(
    t.observers.every((observer) => observer.disconnected),
    true,
  );
  assert.equal(second.getAttribute("data-exf-clash"), null);
  assert.equal(t.document.listeners.size, 0);
  assert.equal(t.environment.listeners.size, 0);
  assert.equal(t.reducedMotion.listeners.size, 0);
  assert.equal(t.timers.size, 0);
  // A second cleanup is harmless.
  cleanup();
});
