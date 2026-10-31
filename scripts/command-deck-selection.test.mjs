import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
const exports = {};
runInNewContext(ts.transpileModule(readFileSync(new URL("../src/lib/command-deck-selection.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports });
test("deck selection survives a remount and rejects stale or malformed indices", () => {
  let saved;
  const storage = { getItem: () => saved, setItem: (_, value) => { saved = value; } };
  exports.saveDeckSelection(storage, { scene: 1, artwork: 2 });
  assert.equal(JSON.stringify(exports.readDeckSelection(storage, [3, 3, 3])), '{"scene":1,"artwork":2}');
  for (const invalid of ['{', 'null', '{"scene":-1,"artwork":0}', '{"scene":4,"artwork":0}', '{"scene":1,"artwork":9}', '{"scene":1.5,"artwork":0}']) {
    saved = invalid; assert.equal(exports.readDeckSelection(storage, [3, 3, 3]), null);
  }
  assert.equal(exports.readDeckSelection({ getItem() { throw Error("blocked"); } }, [3]), null);
  assert.doesNotThrow(() => exports.saveDeckSelection({ setItem() { throw Error("blocked"); } }, { scene: 0, artwork: 0 }));
});
