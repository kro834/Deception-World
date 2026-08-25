import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const gate = readFileSync(new URL("../src/components/load-gate.tsx", import.meta.url), "utf8");
const title = readFileSync(new URL("../src/components/cinematic/title-sequence.tsx", import.meta.url), "utf8");

test("standard routes stay immediate while four dossiers use scoped cut-ins", () => {
  assert.match(gate, /pathname === "\/form-archive" \|\| to === "\/form-archive"/);
  assert.match(gate, /const isZeusTransition = to === "\/managers\/zeus"/);
  assert.match(gate, /if \(!isArchiveTransition && !isZeusTransition && !cutInVariant\) \{[\s\S]*?await navigate\(\{ to: to as never, hash \}\);[\s\S]*?return;/);
  assert.doesNotMatch(gate, /preloadAssets/);
  for (const route of ["leddic", "argenome", "over-zeztz", "cipher"]) {
    assert.match(gate, new RegExp(`"\\/riders\\/${route}": "${route}"`));
  }
  assert.match(gate, /className=\{`load-gate rider-route-cutin/);
  assert.match(gate, /leddic-motes/);
  assert.match(gate, /argenome-sigil/);
  assert.match(gate, /over-zeztz-pressure-ring/);
  assert.match(gate, /cipher-reticle/);
  assert.match(gate, /className=\{`load-gate is-sovereign-gate/);
  assert.match(gate, /SOVEREIGN ARCHIVE \/\/ RIKUEI I/);
  assert.match(gate, /className=\{`load-gate archive-route-dive/);
});

test("the restored Zeus record display has no progress bar or percentage", () => {
  const zeusBranch = gate.slice(gate.indexOf('if (variant === "zeus")'), gate.indexOf("const display", gate.indexOf('if (variant === "zeus")')));
  assert.match(zeusBranch, /role="status"/);
  assert.doesNotMatch(zeusBranch, /role="progressbar"|load-gate-percent|load-gate-track|aria-valuenow|%/);
});

test("the title dive declares that it already covers the transition", () => {
  assert.match(gate, /transitionCovered\?: boolean/);
  assert.match(title, /transitionCovered: true/);
});
