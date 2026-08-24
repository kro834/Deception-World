import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const gate = readFileSync(new URL("../src/components/load-gate.tsx", import.meta.url), "utf8");
const title = readFileSync(new URL("../src/components/cinematic/title-sequence.tsx", import.meta.url), "utf8");

test("only form archive navigation mounts the shared loading surface", () => {
  assert.match(gate, /pathname === "\/form-archive" \|\| to === "\/form-archive"/);
  assert.match(gate, /if \(!isArchiveTransition\) \{\s*await navigate/);
  assert.doesNotMatch(gate, /preloadAssets/);
  assert.doesNotMatch(gate, /RIDER_CUT_IN_ROUTES/);
  assert.doesNotMatch(gate, /is-sovereign-gate/);
  assert.match(gate, /className=\{`load-gate archive-route-dive/);
});

test("the title dive declares that it already covers the transition", () => {
  assert.match(gate, /transitionCovered\?: boolean/);
  assert.match(title, /transitionCovered: true/);
});
