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

test("covered opening navigation is selected before immediate routes while rider transitions stay scoped", () => {
  const goStart = gate.indexOf("const go = useCallback");
  const goEnd = gate.indexOf("\n\n  const api = useMemo", goStart);
  assert.notEqual(goStart, -1, "go callback must exist");
  assert.notEqual(goEnd, -1, "go callback must end before the provider API");
  const goBlock = gate.slice(goStart, goEnd);
  const coveredIndex = goBlock.search(/if\s*\([^)]*\btransitionCovered\b[^)]*\)\s*\{/);
  const directIndex = goBlock.search(
    /if \(!isArchiveTransition && !isZeusTransition && !riderTransitionVariant\) \{/,
  );
  assert.notEqual(coveredIndex, -1, "go must handle a shared transition before routing");
  assert.notEqual(directIndex, -1, "go must retain the immediate-route branch");
  assert.ok(
    coveredIndex < directIndex,
    "covered opening navigation must win before the ordinary direct branch",
  );
  assert.match(
    goBlock,
    /async\s*\(\s*\{[^}]*\btransitionCovered\b[^}]*\}\s*:\s*GoOptions/,
  );

  assert.match(gate, /pathname === "\/form-archive" \|\| to === "\/form-archive"/);
  assert.match(gate, /const isZeusTransition = to === "\/managers\/zeus"/);
  assert.match(
    gate,
    /if \(!isArchiveTransition && !isZeusTransition && !riderTransitionVariant\) \{[\s\S]*?await navigate\(\{ to: to as never, hash \}\);[\s\S]*?return;/,
  );
  const directEnd = goBlock.indexOf("\n        return;\n      }", directIndex);
  assert.notEqual(directEnd, -1, "the immediate-route branch must return after navigation");
  const directBranch = goBlock.slice(directIndex, directEnd);
  assert.match(directBranch, /await navigate\(\{ to: to as never, hash \}\)/);
  assert.match(directBranch, /preloadAssets\(assets, \(\) => undefined\)/);
  assert.match(gate, /const preloadDestination = useCallback/);
  assert.match(gate, /onTouchStart=\{preloadDestination\}/);
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

test("the form archive dive keeps its cinematic status without a numeric percentage", () => {
  const archiveBranch = gate.slice(
    gate.lastIndexOf("return (", gate.indexOf("function RiderRouteDive")),
    gate.indexOf("function RiderRouteDive"),
  );
  assert.match(archiveBranch, /role="status"/);
  assert.match(archiveBranch, /aria-label="フォームアーカイブとの間を移動中"/);
  assert.match(archiveBranch, /記録宇宙へダイブ中/);
  assert.doesNotMatch(
    archiveBranch,
    /role="progressbar"|aria-valuemin|aria-valuemax|aria-valuenow|\$\{display\}%|\d+%/,
  );
});

test("the title dive hands asset warming to the covered shared transition", () => {
  assert.match(gate, /transitionCovered\?: boolean/);
  assert.match(title, /assets:\s*WORLD_ENTER_ASSETS/);
  assert.match(title, /transitionCovered:\s*true/);
});
