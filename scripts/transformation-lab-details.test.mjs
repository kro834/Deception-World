import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import ts from "../node_modules/typescript/lib/typescript.js";
const cache = new Map();
function load(path) {
  path = resolve(path);
  if (cache.has(path)) return cache.get(path);
  const js = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", js)(
    (name) => load(resolve(dirname(path), name.endsWith(".ts") ? name : `${name}.ts`)),
    module,
    module.exports,
  );
  cache.set(path, module.exports);
  return module.exports;
}
const { LAB_PART_RECORDS } = load("src/lib/transformation-lab-details.ts");
const rex = load("src/lib/rexonance-profile.ts");
const far = load("src/components/final-stage/final-stage-data.ts");
const ic = load("src/components/illusionculum-saga/illusionculum-data.ts");
const mu = load("src/components/meta-unitas-saga/meta-unitas-data.ts");
const sourceText = {
  rexonance: rex.REXONANCE_PROFILE_TEXT,
  "far-from": JSON.stringify(far.FAR_FROM_SAGA),
  illusionculum: JSON.stringify(ic.ILLUSIONCULUM_SAGA),
  "meta-unitas": JSON.stringify(mu.META_UNITAS_SAGA),
};
test("all four forms and four selected views have nonempty verbatim published records", () => {
  assert.equal(Object.keys(LAB_PART_RECORDS).length, 4);
  for (const [rider, parts] of Object.entries(LAB_PART_RECORDS)) {
    assert.deepEqual(Object.keys(parts), ["full", "head", "reactor", "legs"]);
    for (const part of Object.values(parts)) {
      assert.ok(part.title.length > 3);
      assert.ok(part.description.length > 20);
      assert.ok(sourceText[rider].includes(part.description), `${rider}: exact source excerpt`);
      assert.doesNotMatch(part.description, /未公開|\?\?\?/);
    }
  }
});
test("mechanism source anchors exist on their public destination pages", () => {
  const pages = {
    "/riders/saga": "src/components/world/rider-page.tsx",
    "/far-from-saga": "src/components/far-from-saga/far-from-saga.tsx",
    "/illusionculum-saga": "src/components/illusionculum-saga/illusionculum-saga.tsx",
    "/meta-unitas-saga": "src/components/meta-unitas-saga/meta-unitas-saga.tsx",
  };
  for (const parts of Object.values(LAB_PART_RECORDS))
    for (const part of Object.values(parts)) {
      const [path, anchor] = part.href.split("#");
      assert.ok(pages[path]);
      assert.ok(readFileSync(pages[path], "utf8").includes(`id="${anchor}"`));
    }
});
