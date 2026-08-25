import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const gate = readFileSync(new URL("../src/components/load-gate.tsx", import.meta.url), "utf8");
const title = readFileSync(
  new URL("../src/components/cinematic/title-sequence.tsx", import.meta.url),
  "utf8",
);
const transitionCss = readFileSync(
  new URL("../src/styles-route-transitions.css", import.meta.url),
  "utf8",
);

test("standard routes stay immediate while rider dossiers use scoped dives and cut-ins", () => {
  assert.match(gate, /pathname === "\/form-archive" \|\| to === "\/form-archive"/);
  assert.match(gate, /const isZeusTransition = to === "\/managers\/zeus"/);
  assert.match(
    gate,
    /if \(!isArchiveTransition && !isZeusTransition && !riderTransitionVariant\) \{[\s\S]*?await navigate\(\{ to: to as never, hash \}\);[\s\S]*?return;/,
  );
  assert.doesNotMatch(gate, /preloadAssets/);
  for (const route of ["saga", "realm", "lore", "vandal"]) {
    assert.match(gate, new RegExp(`"\\/riders\\/${route}": "${route}"`));
  }
  for (const route of ["leddic", "argenome", "over-zeztz", "cipher"]) {
    assert.match(gate, new RegExp(`"\\/riders\\/${route}": "${route}"`));
  }
  assert.match(gate, /className=\{`load-gate archive-route-dive rider-route-dive/);
  assert.match(gate, /rider-dive-vector-field/);
  assert.match(gate, /rider-dive-mark/);
  assert.match(gate, /className=\{`load-gate rider-route-cutin/);
  assert.match(gate, /leddic-motes/);
  assert.match(gate, /argenome-sigil/);
  assert.match(gate, /over-zeztz-pressure-ring/);
  assert.match(gate, /cipher-reticle/);
  assert.match(gate, /className=\{`load-gate is-sovereign-gate/);
  assert.match(gate, /SOVEREIGN ARCHIVE \/\/ RIKUEI I/);
  assert.match(gate, /className=\{`load-gate archive-route-dive/);
});

test("the first four rider dives keep distinct colors and a mobile render budget", () => {
  assert.match(
    transitionCss,
    /\.load-gate\.rider-route-dive\.is-realm-dive[^]*?--rider-dive-primary:\s*241 74 96/,
  );
  assert.match(
    transitionCss,
    /\.load-gate\.rider-route-dive\.is-lore-dive[^]*?--rider-dive-primary:\s*103 216 255/,
  );
  assert.match(
    transitionCss,
    /\.load-gate\.rider-route-dive\.is-vandal-dive[^]*?--rider-dive-primary:\s*231 26 156/,
  );
  assert.match(
    transitionCss,
    /\.load-gate\.rider-route-dive\s*\{[^]*?--rider-dive-primary:\s*36 140 255/,
  );
  assert.match(
    transitionCss,
    /@media \(max-width: 1180px\), \(any-pointer: coarse\)[^]*?\.rider-dive-vector-field/,
  );
  assert.match(
    transitionCss,
    /@media \(prefers-reduced-motion: reduce\)[^]*?\.rider-route-dive \.rider-dive-vector-field/,
  );
});

test("the restored Zeus record display has no progress bar or percentage", () => {
  const zeusBranch = gate.slice(
    gate.indexOf('if (variant === "zeus")'),
    gate.indexOf("const display", gate.indexOf('if (variant === "zeus")')),
  );
  assert.match(zeusBranch, /role="status"/);
  assert.doesNotMatch(
    zeusBranch,
    /role="progressbar"|load-gate-percent|load-gate-track|aria-valuenow|%/,
  );
});

test("the title dive declares that it already covers the transition", () => {
  assert.match(gate, /transitionCovered\?: boolean/);
  assert.match(title, /transitionCovered: true/);
});
