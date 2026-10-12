import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../src/components/world/world-atmosphere.tsx", import.meta.url), "utf8");
const code = stripTypeScriptTypes(source.slice(source.indexOf("    const sync = () =>"), source.indexOf("    const measure = () =>")));

function environment() {
  let loading = false;
  let reads = 0;
  const frames = [];
  const context = {
    frame: 0,
    line: 80,
    tinted: null,
    regions: [{ phase: "story", element: { getBoundingClientRect() { reads++; return { top: 0, bottom: 900, height: 900 }; } } }],
    shell: { dataset: {}, querySelector: () => null },
    document: { documentElement: { hasAttribute: () => loading } },
    window: { requestAnimationFrame(fn) { frames.push(fn); return frames.length; } },
    worldChapterLine: (_element, line) => line,
    tint() {},
    untint() {},
    fadeLight() {},
  };
  runInNewContext(`${code}\nglobalThis.sync = sync; globalThis.requestSync = requestSync;`, context);
  return { context, frames, reads: () => reads, loading: value => { loading = value; } };
}

test("covered World never schedules or forces an outgoing chapter layout", () => {
  const env = environment();
  env.loading(true);
  env.context.requestSync();
  env.context.sync();
  assert.equal(env.frames.length, 0);
  assert.equal(env.reads(), 0);
});

test("a queued pre-cover callback stays quiet and normal chapter tracking resumes on release", () => {
  const env = environment();
  env.context.requestSync();
  assert.equal(env.frames.length, 1);
  env.loading(true);
  env.frames.shift()();
  assert.equal(env.reads(), 0);
  env.loading(false);
  env.context.requestSync();
  env.frames.shift()();
  assert.equal(env.reads(), 1);
  assert.equal(env.context.shell.dataset.worldPhase, "story");
});
