import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const exports = {};
const source = readFileSync(
  new URL("../src/components/world/dossier-reader.tsx", import.meta.url),
  "utf8",
);
runInNewContext(
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText,
  { exports, require: createRequire(import.meta.url) },
);

test("contents render Japanese titles and original metadata with native chapter anchors", () => {
  const markup = renderToStaticMarkup(
    React.createElement(exports.DossierContents, {
      sections: [{ no: "01", title: "人物の記録。", kicker: "CHARACTER / PROFILE" }],
    }),
  );
  assert.match(markup, /href="#character-section-01"/);
  assert.match(markup, /人物の記録。/);
  assert.match(markup, /CHARACTER \/ PROFILE/);
});

test("reader never advertises optional sections that are absent", () => {
  const basic = renderToStaticMarkup(
    React.createElement(exports.DossierReader, { name: "ゼウス" }),
  );
  assert.match(basic, /href="#dossier-profile"/);
  assert.match(basic, /href="#dossier-index"/);
  assert.doesNotMatch(basic, /href="#(?:form-records|identity-records)"/);
  const full = renderToStaticMarkup(
    React.createElement(exports.DossierReader, { name: "シエル", identity: true, forms: true }),
  );
  assert.match(full, /href="#form-records"/);
  assert.match(full, /href="#identity-records"/);
});

test("names are escaped as text, not rendered as markup", () => {
  const markup = renderToStaticMarkup(
    React.createElement(exports.DossierReader, { name: "<script>alert(1)</script>" }),
  );
  assert.doesNotMatch(markup, /<script>/);
  assert.match(markup, /&lt;script&gt;/);
});
