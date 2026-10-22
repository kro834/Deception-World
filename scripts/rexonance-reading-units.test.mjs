import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(
  new URL("../src/components/rexonance-saga/rexonance-saga.tsx", import.meta.url),
  "utf8",
);
const file = ts.createSourceFile("rexonance.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = file.statements
  .filter(ts.isVariableStatement)
  .flatMap((statement) => [...statement.declarationList.declarations]);
const expression = (name) => {
  const item = declarations.find((node) => node.name.getText(file) === name);
  assert.ok(item?.initializer, `${name} exists in the real component`);
  return item.initializer.getText(file);
};
const exports = {};
const require = createRequire(import.meta.url);
runInNewContext(
  ts.transpileModule(
    `const STAGE_LEDE_UNITS = ${expression("STAGE_LEDE_UNITS")}; exports.render = ${expression("renderStageLede")};`,
    { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
  ).outputText,
  { exports, require, Fragment: require("react").Fragment },
);

test("short Japanese reading units stay intact without changing the supplied prose", () => {
  const text = "第五の犬として、一つの『終焉』へ同調し、必要部位をSA-GA OS 5.5で制御する。";
  const parts = [...exports.render(text)];
  const protectedParts = parts.filter((part) => part.type === "span");
  assert.deepEqual(
    protectedParts.map((part) => part.props.children),
    ["犬として", "『終焉』へ", "必要部位", "SA-GA OS 5.5"],
  );
  assert.ok(protectedParts.every((part) => part.props.className === "rxp-nowrap"));
  assert.equal(parts.map((part) => typeof part === "string" ? part : part.props.children).join(""), text);
  assert.match(source, /<p>\{renderStageLede\(system\.body\)\}<\/p>/);
});
