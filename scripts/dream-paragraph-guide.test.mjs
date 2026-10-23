import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Script, createContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as data from "../src/components/dream-chapter/dream-chapter-data.ts";
import * as extra from "../src/components/dream-chapter/dream-chapter-extra-data.ts";
import * as reader from "../src/lib/dream-reader-state.js";

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL("../src/components/dream-chapter/dream-story-navigation.tsx", import.meta.url),
  "utf8",
);
function navigation() {
  const exports = {};
  const context = createContext({
    exports,
    require(name) {
      if (name === "./dream-chapter-data") return data;
      if (name === "./dream-chapter-extra-data") return extra;
      if (name === "@/lib/dream-reader-state.js") return reader;
      if (name === "@/lib/dream-chapter-navigation.js")
        return { mountDreamChapterNavigation: () => () => {} };
      return require(name);
    },
  });
  new Script(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
  ).runInContext(context);
  return exports;
}

test("paragraph guide starts folded and links literal canonical prefixes to the existing paragraph ids", () => {
  const { DreamStoryIndex } = navigation();
  const html = renderToStaticMarkup(React.createElement(DreamStoryIndex));
  assert.match(html, /<details class="dream-reader-paragraph-guide">/);
  assert.equal((html.match(/href="#dream-case-[0-5]"/g) ?? []).length, data.DREAM_CASES.length);
  const first = data.DREAM_CASES[0];
  for (const [index, text] of first.paragraphs.entries()) {
    const prefix = Array.from(text).slice(0, 72).join("");
    assert.ok(html.includes(prefix));
    assert.ok(html.includes(`href="#dream-case-0-paragraph-${index + 1}"`));
  }
  assert.match(html, /<select[^>]*>/);
  for (const episode of data.DREAM_CASES) assert.ok(html.includes(`value="${episode.no}"`));
});

test("the index receives the existing reader controller state without a second persistence mechanism", () => {
  assert.equal((source.match(/mountDreamReader\(/g) ?? []).length, 1);
  assert.match(source, /setReader\(next\);\s*onChange\?\.\(next\)/);
  assert.match(source, /<DreamReaderSupport onChange=\{setReader\}/);
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
  assert.match(source, /reader\.bookmark\?\.caseNo === episode\.no/);
});
