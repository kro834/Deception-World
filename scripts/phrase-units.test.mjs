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
