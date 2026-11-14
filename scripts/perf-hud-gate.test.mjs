import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import vm from "node:vm";

const src = new URL("../src/", import.meta.url);
const gatePath = new URL("lib/perf-hud-gate.js", src);
const gateSource = readFileSync(gatePath, "utf8");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

test("the overlay module is reached only by the gate's dynamic import", () => {
  const dir = fileURLToPath(src);
  const offenders = [];
  for (const file of walk(dir)) {
    if (file.endsWith("perf-hud.ts")) continue;
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/(?:import|export)\s[^;]*?from\s*["'][^"']*perf-hud["']|import\s*["'][^"']*perf-hud["']/g)) {
      offenders.push(`${file}: ${m[0]}`);
    }
  }
  assert.deepEqual(offenders, [], "perf-hud must never be imported statically");
  assert.match(gateSource, /import\("\.\/perf-hud"\)/);
  assert.doesNotMatch(gateSource, /^\s*import\s/m);
});

test("the always-shipped check stays tiny", () => {
  assert.ok(Buffer.byteLength(gateSource.trim()) < 300, "gate must stay under 300 bytes");
  assert.doesNotMatch(gateSource, /addEventListener|requestAnimationFrame|setInterval|PerformanceObserver/);
});

function run({ search = "", stored = null }) {
  const store = new Map(stored === null ? [] : [["dw-perf", stored]]);
  const calls = { imports: 0, listeners: 0, raf: 0 };
  const ctx = {
    location: { search },
    sessionStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
    },
    addEventListener: () => calls.listeners++,
    requestAnimationFrame: () => calls.raf++,
    // The dynamic import is rewritten to a counting stub; the real module is TS.
  };
  const code = gateSource
    .replace("export function startPerfHud", "globalThis.startPerfHud = function startPerfHud")
    .replace(/import\("\.\/perf-hud"\)/, "__imp()");
  ctx.__imp = () => {
    calls.imports++;
    return { then() {} };
  };
  ctx.globalThis = ctx;
  vm.runInNewContext(code, ctx);
  ctx.startPerfHud();
  return { calls, store };
}

test("off path: no import, no listeners, no rAF", () => {
  for (const state of [{}, { search: "?perf=0", stored: "1" }, { stored: "0" }]) {
    const { calls } = run(state);
    assert.deepEqual(calls, { imports: 0, listeners: 0, raf: 0 }, JSON.stringify(state));
  }
});

test("?perf=1 persists and imports once; ?perf=0 clears it", () => {
  const on = run({ search: "?x=1&perf=1" });
  assert.equal(on.calls.imports, 1);
  assert.equal(on.store.get("dw-perf"), "1");
  const stored = run({ stored: "1" });
  assert.equal(stored.calls.imports, 1);
  const off = run({ search: "?perf=0", stored: "1" });
  assert.equal(off.calls.imports, 0);
  assert.equal(off.store.get("dw-perf"), "0");
});

test("the overlay avoids backdrop-filter and the root only mounts the gate", () => {
  const hud = readFileSync(new URL("lib/perf-hud.ts", src), "utf8");
  assert.doesNotMatch(hud.replace(/\/\*[\s\S]*?\*\//g, ""), /backdrop-filter/);
  const root = readFileSync(new URL("routes/__root.tsx", src), "utf8");
  assert.match(root, /perf-hud-gate/);
  assert.doesNotMatch(root, /["']@\/lib\/perf-hud["']/);
});
