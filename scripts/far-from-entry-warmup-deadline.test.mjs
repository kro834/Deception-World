import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

test("stalled bitmap decode times out, retries, and closes a late result", async () => {
  const source = readFileSync(
    new URL("../src/lib/far-from-entry-warmup.ts", import.meta.url),
    "utf8",
  ).replace(/^import .*;\n/gm, "");
  const js = ts.transpileModule(source.replaceAll("export ", ""), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  let finishFirst;
  let attempts = 0;
  let closed = 0;
  const lateBitmap = {
    close() {
      closed++;
    },
  };
  const currentBitmap = { close() {} };
  const context = vm.createContext({
    AbortController,
    Promise,
    Map,
    Error,
    setTimeout: (fn, ms) => setTimeout(fn, ms === 6000 ? 10 : 1),
    clearTimeout,
    navigator: {},
    window: {},
    URL: { createObjectURL: () => "blob:test", revokeObjectURL() {} },
    REXONANCE_SUIT_SIZE: 1,
    REXONANCE_SUIT_UNDERSUIT: "undersuit",
    FAR_FROM_ENTRY_ASSETS: ["asset"],
    FAR_FROM_ENTRY_KIT_ASSETS: [],
    warmNaniteFlame() {},
    prepareBodyFlame() {},
    farFromEntryPlan() {},
    fetch: async () => ({ ok: true, blob: async () => ({}) }),
    createImageBitmap: () =>
      ++attempts === 1
        ? new Promise((resolve) => {
            finishFirst = resolve;
          })
        : Promise.resolve(currentBitmap),
  });
  vm.runInContext(`${js}\nglobalThis.api = { warmFarFromEntry, farFromEntrySource };`, context);
  const result = await Promise.race([
    context.api.warmFarFromEntry(),
    new Promise((_, reject) => setTimeout(() => reject(new Error("warmup did not finish")), 200)),
  ]);
  assert.equal(result, true);
  assert.equal(context.api.farFromEntrySource("asset"), currentBitmap);
  finishFirst(lateBitmap);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(closed, 1);
  assert.equal(context.api.farFromEntrySource("asset"), currentBitmap);
});
