import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const gate = readFileSync(new URL("../src/components/load-gate.tsx", import.meta.url), "utf8");
const effect = gate.match(/useEffect\(\s*\(\) =>\s*([^;{}]*?scheduleMetaUnitasEntryWarmup\?\.\(\)),\s*\[pathname\],\s*\)/);
assert.ok(effect, "find the route-dependent META UNITAS idle effect");
const scheduleForPath = new Function("pathname", "scheduleMetaUnitasEntryWarmup", `return (${effect[1]});`);

test("opening and the META UNITAS page do not schedule speculative entry work", () => {
  for (const pathname of ["/", "/meta-unitas-saga"]) {
    let calls = 0;
    assert.equal(scheduleForPath(pathname, () => { calls++; }), undefined);
    assert.equal(calls, 0, pathname);
  }
});

test("leaving the opening retains destination idle preparation and its cleanup", () => {
  for (const pathname of ["/world", "/final-stage", "/far-from-saga"]) {
    let calls = 0;
    const cancel = () => {};
    assert.equal(scheduleForPath(pathname, () => { calls++; return cancel; }), cancel);
    assert.equal(calls, 1, pathname);
  }
});

test("explicit link intent and the actual META UNITAS entry keep their preparation", () => {
  assert.match(gate, /if \(to === "\/meta-unitas-saga"\) prefetchMetaUnitasEntry\?\.\(\);/);
  assert.match(gate, /if \(diveVariant === "meta-unitas" && tier === "full"\) \{[\s\S]*?void warmMetaUnitasEntry\(\);/);
});
