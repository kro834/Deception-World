import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const gate = readFileSync(new URL("../src/components/load-gate.tsx", import.meta.url), "utf8");
const title = readFileSync(new URL("../src/components/cinematic/title-sequence.tsx", import.meta.url), "utf8");

test("only form archive and the Zeus dossier mount route transition surfaces", () => {
  assert.match(gate, /pathname === "\/form-archive" \|\| to === "\/form-archive"/);
  assert.match(gate, /const isZeusTransition = to === "\/managers\/zeus"/);
  assert.match(gate, /if \(!isArchiveTransition && !isZeusTransition\) \{\s*await navigate/);
  assert.doesNotMatch(gate, /preloadAssets/);
  assert.doesNotMatch(gate, /RIDER_CUT_IN_ROUTES/);
  assert.match(gate, /className=\{`load-gate is-sovereign-gate/);
  assert.match(gate, /SOVEREIGN ARCHIVE \/\/ RIKUEI I/);
  assert.match(gate, /className=\{`load-gate archive-route-dive/);
});

test("the restored Zeus record display has no progress bar or percentage", () => {
  const zeusBranch = gate.slice(gate.indexOf('if (variant === "zeus")'), gate.indexOf("const display"));
  assert.match(zeusBranch, /role="status"/);
  assert.doesNotMatch(zeusBranch, /role="progressbar"|load-gate-percent|load-gate-track|aria-valuenow|%/);
});

test("the title dive declares that it already covers the transition", () => {
  assert.match(gate, /transitionCovered\?: boolean/);
  assert.match(title, /transitionCovered: true/);
});
