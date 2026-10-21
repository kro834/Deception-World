import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

// The /library and /search ZENITH sheet's fits (2026-10-22 review): the
// scope switch keeps the 44px floor, the hero's kind keys keep their words
// whole, and a card's plate sets its name to the window's height.
const zenith = readFileSync(new URL("../src/styles-library-zenith.css", import.meta.url), "utf8");

function rule(selector) {
  const at = zenith.indexOf(`${selector} {`);
  assert.ok(at >= 0, `rule ${selector}`);
  return zenith.slice(at, zenith.indexOf("}", at));
}

test("the scope switch's two sides keep the 44px target", () => {
  for (const [, body] of zenith.matchAll(/\.library-scope-row button \{([^}]*)\}/g)) {
    const height = /min-height:\s*(\d+)px/.exec(body);
    if (height) assert.ok(Number(height[1]) >= 44, `scope button min-height ${height[1]}px`);
  }
});

test("the hero's kind keys break only after the dot and run in one row only when they fit", () => {
  const label = rule('html[data-family="library"] .library-page .library-index-meter > button > span');
  assert.match(label, /word-break: keep-all;/);
  // The row of lamps (count beside kind) is for a card of 560px or more.
  assert.match(zenith, /\.library-index-meter \{\s*container: library-meter \/ inline-size;/);
  const row = zenith.indexOf("@container library-meter (min-width: 560px)");
  assert.ok(row > 0);
  assert.match(zenith.slice(row, row + 400), /display: inline-flex;/);
  // Touch keeps 44px keys in the row, the stacked keys are taller.
  assert.match(zenith, /min-height: var\(--library-meter-key, 40px\)/);
  assert.match(zenith, /\(pointer: coarse\) \{\s*html\[data-family="library"\] \.library-page \.library-index-meter \{\s*--library-meter-key: 44px;/);
});

test("a card's plate fits its name to the window's height from the name's run", () => {
  assert.match(
    zenith,
    /:is\(\.library-card, \.search-result-card\) > \.dxl-art\[data-plate="type"\] \{\s*container-type: size;/,
  );
  assert.match(zenith, /\(100cqh - 46px\) \* 0\.9 \/\s*\(var\(--dxl-plate-em, 4\) \+ var\(--dxl-plate-n, 4\) \* var\(--dxl-plate-ls\)\)/);
  const frame = readFileSync(new URL("../src/components/library/record-art.tsx", import.meta.url), "utf8");
  assert.match(frame, /<b style=\{plateRunStyle\(plateWords\(title\)\)\}>\{plateWords\(title\)\}<\/b>/);

  const source = ts.transpileModule(
    readFileSync(new URL("../src/lib/record-art.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module,
    exports: module.exports,
    require: (name) => {
      if (name === "./name-breaks") return { nameWords: (text) => [{ text }] };
      throw new Error(`unexpected import ${name}`);
    },
  });
  const { plateRunStyle } = module.exports;
  assert.deepEqual({ ...plateRunStyle("マキャベル") }, { "--dxl-plate-em": 5, "--dxl-plate-n": 5 });
  // Latin letters run sideways, narrower than a full-width letter.
  assert.deepEqual({ ...plateRunStyle("CODE") }, { "--dxl-plate-em": 2.48, "--dxl-plate-n": 4 });
  assert.deepEqual({ ...plateRunStyle("A B") }, { "--dxl-plate-em": 1.54, "--dxl-plate-n": 3 });
});
