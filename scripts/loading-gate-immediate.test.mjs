import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const gate = readFileSync(new URL("../src/components/load-gate.tsx", import.meta.url), "utf8");
const title = readFileSync(new URL("../src/components/cinematic/title-sequence.tsx", import.meta.url), "utf8");

test("guarded navigation shows a loading surface even for small waits", () => {
  assert.match(gate, /document\.documentElement\.dataset\.loading = "true";\s*setGate\(\{ active: true, percent: latestPercent/);
  assert.doesNotMatch(gate, /const showTimer = window\.setTimeout/);
  assert.doesNotMatch(gate, /assetsWarmed\(assets\) && !cutInVariant/);
  assert.match(gate, /const minimumDuration = variant === "zeus" \? 860 : 120/);
});

test("the title dive declares that it already covers the transition", () => {
  assert.match(gate, /transitionCovered\?: boolean/);
  assert.match(title, /transitionCovered: true/);
});
