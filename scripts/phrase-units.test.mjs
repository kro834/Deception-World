import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";
import { buildPhraseTerms } from "./build-phrase-terms.mjs";
import {
  LABEL_CAP,
  PROSE_CAP,
  emWidth,
  splitPhraseUnits,
} from "../src/lib/phrase-units.js";
import { phraseNode, phraseProps } from "../src/lib/phrase-children.js";
import { FIT_ATTRIBUTE, measureOverflow, overflows, watchPhraseFit } from "../src/lib/phrase-fit.js";
import { Fragment, jsx, jsxs } from "../src/lib/phrase-jsx-runtime.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const cache = new Map();
function loadData(absolute) {
  if (cache.has(absolute)) return cache.get(absolute);
  const exports = {};
  cache.set(absolute, exports);
  runInNewContext(
    ts.transpileModule(readFileSync(absolute, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    {
      exports,
      require: (specifier) =>
        loadData(resolve(dirname(absolute), specifier.endsWith(".ts") ? specifier : `${specifier}.ts`)),
    },
  );
  return exports;
}
const { SEARCH_DOCUMENTS } = loadData(resolve(root, "src/components/search/search-data.ts"));
const units = (parts) => parts?.filter((_, index) => index % 2) ?? [];
const plain = (parts, text) => (parts ? parts.filter((_, index) => !(index % 2)).join("") : text);
const strip = (html) =>
  html
    .replace(/<\/?dw-[ut]>/g, "")
    .replace(/<\/?p>/g, "")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'");

test("the committed dictionary is generated from the current site data", async () => {
  assert.equal(read("src/lib/phrase-terms.generated.js"), await buildPhraseTerms());
  assert.match(read("package.json"), /"prebuild": "node scripts\/build-phrase-terms\.mjs && /);
});

test("every rider, form and character name is held whole or at its own seams", () => {
  const names = SEARCH_DOCUMENTS.filter((document) =>
    ["people", "riders", "forms"].includes(document.category),
  ).flatMap((document) => [document.title, ...(document.aliases ?? [])]);
  assert.ok(names.length > 100, String(names.length));
  for (const name of names) {
    const parts = splitPhraseUnits(name, PROSE_CAP);
    // What is left between units is a separator or a Latin word (which a
    // browser never splits), never part of a Japanese name.
    assert.match(plain(parts, name), /^[\sA-Za-z0-9.・／/]*$/u, name);
  }
  for (const [name, expected] of [
    ["仮面ライダーレクソナンスサーガ", ["仮面ライダー", "レクソナンスサーガ"]],
    ["イリュージョンクルムサーガ", ["イリュージョンクルム", "サーガ"]],
    ["『ファーフロムコア』", ["ファーフロム", "コア"]],
    ["『KHAOS DeuX』", ["『KHAOS DeuX』"]],
    ["メタ・ウニタス", ["メタ・ウニタス"]],
    ["ファーフロム", ["ファーフロム"]],
    ["レクソナンスサーガ", ["レクソナンスサーガ"]],
    ["月城悠真", ["月城悠真"]],
  ])
    assert.deepEqual(units(splitPhraseUnits(name, PROSE_CAP)), expected, name);
});

test("brackets, Latin tokens and numbers with units are units", () => {
  const text =
    "『KHAOS DeuX』と『SA-GA OS 5.5』は372.2t、0.00021s／100m、50000〜YOPSで第2話の2026年。";
  assert.deepEqual(units(splitPhraseUnits(text, PROSE_CAP)), [
    "『KHAOS DeuX』",
    "『SA-GA OS 5.5』",
    "0.00021s／100m",
    "50000〜YOPS",
    "第2話",
    "2026年",
  ]);
  // Ordinary Japanese between the units is left to strict kinsoku.
  assert.equal(splitPhraseUnits("世界は、欺瞞でできている。", PROSE_CAP), null);
});

test("no unit is wider than its line can hold, so nothing overflows at 320px", () => {
  for (const document of SEARCH_DOCUMENTS) {
    for (const value of [document.title, document.description, document.body]) {
      if (!value) continue;
      for (const [cap, parts] of [
        [LABEL_CAP, splitPhraseUnits(value, LABEL_CAP)],
        [PROSE_CAP, splitPhraseUnits(value, PROSE_CAP)],
      ])
        for (const unit of units(parts)) assert.ok(emWidth(unit) <= cap, `${unit} > ${cap}em`);
    }
  }
});

test("the text is byte-identical: only wrappers are added", () => {
  let checked = 0;
  for (const document of SEARCH_DOCUMENTS) {
    for (const value of [document.title, document.description, document.body]) {
      if (!value) continue;
      for (const cap of [LABEL_CAP, PROSE_CAP]) {
        const parts = splitPhraseUnits(value, cap);
        if (parts) assert.equal(parts.join(""), value);
      }
      const html = renderToStaticMarkup(jsx("p", { children: value }));
      assert.equal(strip(html), value);
      checked += 1;
    }
  }
  assert.ok(checked > 300, String(checked));
});

test("the React helper wraps units in nowrap elements and leaves the rest alone", () => {
  const html = renderToStaticMarkup(
    jsxs("p", { children: ["月城悠真は", "仮面ライダーサーガ", "に変身した。"] }),
  );
  assert.equal(
    html,
    "<p><dw-t><dw-u>月城悠真</dw-u>は<dw-u>仮面ライダーサーガ</dw-u>に変身した。</dw-t></p>",
  );
  assert.equal(
    renderToStaticMarkup(jsx("b", { children: "ファーフロム" })),
    "<b><dw-u>ファーフロム</dw-u></b>",
  );
  // Slots keep their positions so React never remounts a sibling.
  const children = ["仮面", "ライダー", jsx("i", {}), "plain"];
  const next = phraseNode(children);
  assert.equal(next.length, children.length);
  assert.equal(next[1], null);
  assert.equal(next[2], children[2]);
  // Untouched where wrapping would be invalid or is someone else's job.
  for (const type of ["option", "title", "textarea", "text", "tspan", "code", "pre"]) {
    const props = { children: "仮面ライダーサーガ" };
    assert.equal(phraseProps(type, props), props, type);
  }
  for (const props of [
    { className: "name-word name-word--protected", children: "サーガ" },
    { "data-phrase": "off", children: "エクスプリーム" },
    { dangerouslySetInnerHTML: { __html: "x" } },
  ])
    assert.equal(phraseProps("span", props), props);
  const unchanged = { children: "世界は、欺瞞でできている。" };
  assert.equal(phraseProps("p", unchanged), unchanged);
});

test("the pass is wired into the build, the style sheet and the archives", () => {
  const vite = read("vite.config.ts");
  assert.match(vite, /phraseJsxRuntime\(\),\n\s+pgliteBootstrapPlugin\(\)/);
  assert.match(vite, /"react\/jsx-runtime": local\("\.\/src\/lib\/phrase-jsx-runtime\.js"\)/);
  assert.match(read("src/styles-name-words.css"), /dw-u \{\s*white-space: nowrap;\s*\}/);
  assert.doesNotMatch(read("src/styles-name-words.css"), /auto-phrase/);
  const archive = read("public/archive-name-words.generated.js");
  assert.match(archive, /function splitPhraseUnits/);
  assert.match(archive, /const PHRASE_TERMS = /);
  assert.doesNotMatch(archive, /^(?:import|export) /m);
  assert.match(read("src/components/world/reveal-text.tsx"), /splitPhraseUnits/);
});

test("a fragment in running prose gets the prose measure", () => {
  // <p><>「{text}」</></p>: the fragment is phrased as a label when it is
  // created and again at the prose measure inside the paragraph.
  const text = "レディックウォッチを渡す";
  const fragment = () => jsxs(Fragment, { children: ["「", text, "」"] });
  const label = renderToStaticMarkup(jsx("span", { children: fragment() }));
  const prose = renderToStaticMarkup(jsx("p", { children: fragment() }));
  assert.doesNotMatch(label, /<dw-u>レディックウォッチ<\/dw-u>/);
  assert.match(prose, /<dw-u>レディックウォッチ<\/dw-u>/);
  assert.equal(strip(prose), `「${text}」`);
});

test("motion that reads a block's own text still sees text inside the wrappers", () => {
  assert.match(
    read("src/lib/rexonance-choreography.js"),
    /child\.localName === "dw-t" \|\| child\.localName === "dw-u"/,
  );
  assert.match(
    read("src/lib/ring-motion.js"),
    /if \(name === "dw-t" \|\| name === "dw-u"\) return true;/,
  );
});

test("Latin, number and bracketed units are held like names", () => {
  assert.equal(
    renderToStaticMarkup(jsx("p", { children: "『SA-GA OS 5.5』と0.00021s／100mのシエル" })),
    "<p><dw-t><dw-u>『SA-GA OS 5.5』</dw-u>と<dw-u>0.00021s／100m</dw-u>の<dw-u>シエル</dw-u></dw-t></p>",
  );
});

// A fake element tree for the fit pass: a node is { display, width (offset),
// inner (clientWidth), ...style }; parent links make the ancestor chain.
function tree(chain, unitWidth) {
  const nodes = chain.map((node) => ({
    display: "block",
    overflowX: "visible",
    whiteSpace: "normal",
    textOverflow: "clip",
    writingMode: "horizontal-tb",
    paddingLeft: "0px",
    paddingRight: "0px",
    paddingTop: "0px",
    paddingBottom: "0px",
    ...node,
  }));
  const elements = nodes.map((node) => ({ node, clientWidth: node.inner ?? 0, clientHeight: 0 }));
  elements.forEach((element, index) => {
    element.parentElement = elements[index + 1] ?? null;
  });
  const unit = { node: { display: "inline" }, offsetWidth: unitWidth, offsetHeight: 0, parentElement: elements[0] };
  return { unit, style: (element) => element.node };
}
const verdict = (chain, unitWidth) => {
  const { unit, style } = tree(chain, unitWidth);
  return measureOverflow([unit], style);
};

test("fit: a unit wider than its box wraps, one that fits stays whole", () => {
  assert.equal(overflows(100, 99), false, "subpixel slack");
  assert.equal(overflows(100, 90), true);
  assert.equal(overflows(0, 90), false, "no box yet");
  assert.equal(verdict([{ inner: 85 }, {}], 118).fit.length, 1);
  assert.equal(verdict([{ inner: 130 }, {}], 118).fit.length, 0);
  // padding is not room
  assert.equal(verdict([{ inner: 130, paddingLeft: "10px", paddingRight: "10px" }, {}], 118).fit.length, 1);
  // a unit with no layout box (a closed tab) is revisited, not decided
  const hidden = verdict([{ inner: 85 }, {}], 0);
  assert.deepEqual([hidden.fit.length, hidden.pending.length], [0, 1]);
});

test("fit: lines that are meant to overflow are left alone", () => {
  assert.equal(verdict([{ inner: 40, whiteSpace: "nowrap" }, {}], 118).fit.length, 0);
  assert.equal(
    verdict([{ inner: 40, overflowX: "hidden", textOverflow: "ellipsis" }, {}], 118).fit.length,
    0,
  );
  // clipping without an ellipsis is still an overflow worth wrapping
  assert.equal(verdict([{ inner: 40, overflowX: "hidden" }, {}], 118).fit.length, 1);
});

test("fit: a flex or grid item is held to its container, a scroller is not", () => {
  // the item grew to the unit, the container is narrower
  assert.equal(verdict([{ inner: 118 }, { display: "flex", inner: 90 }], 118).fit.length, 1);
  assert.equal(verdict([{ inner: 118 }, { display: "grid", inner: 200 }], 118).fit.length, 0);
  // a horizontal scroller (carousel) may hold wide items
  assert.equal(
    verdict([{ inner: 118 }, { display: "flex", inner: 90, overflowX: "auto" }], 118).fit.length,
    0,
  );
  // a plain block ancestor is not consulted: its own box is the line
  assert.equal(verdict([{ inner: 118 }, { inner: 90 }], 118).fit.length, 0);
});

test("fit: inline wrappers are skipped to the block, vertical text uses its height", () => {
  assert.equal(verdict([{ display: "inline" }, { inner: 85 }, {}], 118).fit.length, 1);
  const vertical = tree([{ writingMode: "vertical-rl" }, {}], 0);
  vertical.unit.offsetHeight = 118;
  vertical.unit.parentElement.clientHeight = 85;
  assert.equal(measureOverflow([vertical.unit], vertical.style).fit.length, 1);
});

test("fit: the wrapping rule is plain CSS, the pass is SSR-safe and shipped to the archives", () => {
  const css = read("src/styles-name-words.css");
  const rule = css.match(/dw-u\[data-dw-fit\] \{([^}]*)\}/)?.[1] ?? "";
  assert.match(rule, /white-space:\s*normal/);
  assert.match(rule, /word-break:\s*keep-all/);
  assert.match(rule, /overflow-wrap:\s*break-word;\s*overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(css, /auto-phrase|:has\(/);
  assert.equal(FIT_ATTRIBUTE, "data-dw-fit");
  // no document here: nothing starts, nothing throws
  assert.equal(typeof watchPhraseFit(), "function");
  assert.equal(watchPhraseFit()(), undefined);
  assert.doesNotMatch(read("src/lib/phrase-fit.js"), /^(?:const|let|var)[^\n]*\b(?:document|window)\b/m);
  assert.match(read("src/routes/__root.tsx"), /useEffect\(\(\) => watchPhraseFit\(\), \[\]\)/);
  assert.match(read("src/lib/archive-name-words.js"), /watchPhraseFit\(document\)/);
  assert.match(read("scripts/build-embedded-archives.mjs"), /classic\("src\/lib\/phrase-fit\.js"\)/);
  const archive = read("public/archive-name-words.generated.js");
  assert.match(archive, /function watchPhraseFit/);
  assert.doesNotMatch(archive, /^(?:import|export) /m);
});
