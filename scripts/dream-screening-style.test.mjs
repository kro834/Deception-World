import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const code = ts.transpileModule(
  readFileSync(
    new URL("../src/components/dream-chapter/dream-screening-style.ts", import.meta.url),
    "utf8",
  ),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;

function setup() {
  const links = [];
  const timers = new Map();
  let next = 0;
  const context = {
    exports: {},
    require: () => ({ default: "/assets/screening.css" }),
    document: {
      createElement: () => ({
        dataset: {},
        remove() {
          this.removed = true;
        },
      }),
      head: { append: (link) => links.push(link) },
    },
    window: {
      setTimeout: (fn) => {
        timers.set(++next, fn);
        return next;
      },
      clearTimeout: (id) => timers.delete(id),
    },
  };
  runInNewContext(code, context);
  return { prepare: context.exports.prepareScreeningStyle, links, timers };
}

test("screening styles are requested explicitly once and settle before opening", async () => {
  const h = setup();
  assert.equal(h.links.length, 0);
  const pending = h.prepare();
  assert.equal(h.prepare(), pending);
  assert.equal(h.links.length, 1);
  assert.equal(h.links[0].rel, "stylesheet");
  assert.equal(h.links[0].href, "/assets/screening.css");
  h.links[0].onload();
  await pending;
  assert.equal(h.prepare(), pending);
  assert.equal(h.timers.size, 0);
  assert.equal(h.links[0].onload, null);
  assert.equal(h.links[0].onerror, null);
});

for (const failure of ["error", "timeout"]) {
  test(`screening style ${failure} releases its listener/timer and permits retry`, async () => {
    const h = setup();
    const pending = h.prepare();
    const rejected = assert.rejects(pending, /unavailable/);
    if (failure === "error") h.links[0].onerror();
    else [...h.timers.values()][0]();
    await rejected;
    assert.equal(h.links[0].removed, true);
    assert.equal(h.links[0].onload, null);
    assert.equal(h.links[0].onerror, null);
    assert.equal(h.timers.size, 0);
    const retry = h.prepare();
    assert.equal(h.links.length, 2);
    h.links[1].onload();
    await retry;
  });
}
