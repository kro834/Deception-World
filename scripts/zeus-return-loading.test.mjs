import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/components/zeus-button.tsx", import.meta.url), "utf8");
const root = readFileSync(new URL("../src/routes/__root.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const gate = readFileSync(new URL("../src/components/load-gate.tsx", import.meta.url), "utf8");

test("Zeus navigation closes transient UI and uses the shared route controller", () => {
  assert.match(source, /export function ZeusButtonProvider[\s\S]*?const navigatingRef = useRef/);
  assert.match(source, /const \{ go \} = useLoadGate\(\)/);
  assert.match(source, /await go\(\{ to: "\/world", hash: "top" \}\)/);
  assert.match(source, /dialog\.close\("zeus-navigation"\)/);
  assert.doesNotMatch(source, /scrollIntoView/);
  assert.doesNotMatch(source, /behavior:\s*"smooth"/);
  assert.match(root, /<LoadGateProvider>[\s\S]*?<ZeusButtonProvider>/);
});

test("Zeus swaps only its compact character image without mounting a fullscreen loader", () => {
  assert.match(source, /const \[returnImage, setReturnImage\] = useState\(false\)/);
  assert.match(source, /data-return-loading=\{String\(returnImage\)\}/);
  assert.match(source, /src="\/zeus-button-return\.jpeg"/);
  assert.match(
    styles,
    /\.zeus-button\[data-return-loading="true"\][\s\S]*?\.zeus-button-image\.is-returning/,
  );
  assert.doesNotMatch(source, /ZeusReturnDive/);
  assert.doesNotMatch(source, /DiveVelocityCanvas/);
  assert.doesNotMatch(source, /data-zeus-return-loading/);
});

test("Zeus keeps the same outer button size while its return image is active", () => {
  assert.match(
    styles,
    /\.zeus-button\[data-navigating="true"\]\s*\{[^}]*transform:\s*translate3d\(-50%, -50%, 0\) scale\(1\)/,
  );
  assert.doesNotMatch(
    styles,
    /\.zeus-button\[data-navigating="true"\]\s*\{[^}]*scale\((?:0?\.[0-9]+|1\.[0-9]+)\)/,
  );
});

test("fullscreen route effects are limited to archive, Intelligence, Zeus, and rider dossiers", () => {
  assert.match(gate, /pathname === "\/form-archive" \|\| to === "\/form-archive"/);
  assert.match(gate, /const isIntelligenceTransition = pathname !== to && to === "\/intelligence"/);
  assert.match(gate, /const isZeusTransition = to === "\/managers\/zeus"/);
  assert.match(
    gate,
    /if \(\s*!isArchiveTransition &&\s*!isIntelligenceTransition &&\s*!isZeusTransition &&\s*!riderTransitionVariant\s*\) \{[\s\S]*?await navigate/,
  );
  assert.match(gate, /"\/riders\/saga": "saga"/);
  assert.match(gate, /"\/riders\/realm": "realm"/);
  assert.match(gate, /"\/riders\/lore": "lore"/);
  assert.match(gate, /"\/riders\/vandal": "vandal"/);
  assert.match(gate, /"\/riders\/leddic": "leddic"/);
  assert.match(gate, /"\/riders\/argenome": "argenome"/);
  assert.match(gate, /"\/riders\/over-zeztz": "over-zeztz"/);
  assert.match(gate, /"\/riders\/cipher": "cipher"/);
  assert.match(gate, /className=\{`load-gate is-sovereign-gate/);
  assert.doesNotMatch(gate, /zeus-button-return|zeus-return-dive/);
});
