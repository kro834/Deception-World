import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";

const worldHome = readFileSync(
  new URL("../src/components/world/world-home.tsx", import.meta.url),
  "utf8",
);
const loadGate = readFileSync(
  new URL("../src/components/load-gate.tsx", import.meta.url),
  "utf8",
);
const slideControl = readFileSync(
  new URL("../src/components/world/slide-open-control.tsx", import.meta.url),
  "utf8",
);
const zeusButton = readFileSync(
  new URL("../src/components/zeus-button.tsx", import.meta.url),
  "utf8",
);
const styles = readFileSync(new URL("../src/styles-world-addon.css", import.meta.url), "utf8");

test("Cipher uses the supplied dedicated thumbnail without replacing its dossier art", () => {
  assert.match(worldHome, /id: "cipher"[\s\S]*?img: "\/rider-cipher-thumbnail\.jpeg"/);
  assert.ok(
    statSync(new URL("../public/rider-cipher-thumbnail.jpeg", import.meta.url)).size > 100_000,
  );
});

test("detail routes reset to the top on every route entry", () => {
  assert.match(loadGate, /\^\\\/\(\?:riders\|managers\|characters\)\\\//);
  assert.match(loadGate, /window\.scrollTo\(\{ top: 0, left: 0, behavior: "auto" \}\)/);
  assert.match(loadGate, /requestAnimationFrame\(resetDossierScroll\)/);
});

test("Zeus ignores iOS rubber-band offsets and coalesces viewport placement", () => {
  assert.match(zeusButton, /const clampOffset =/);
  assert.match(zeusButton, /offsetTop: clampOffset\(viewport\?\.offsetTop \?\? 0, maxOffsetTop\)/);
  assert.match(zeusButton, /const placementFrame = useRef/);
  assert.match(zeusButton, /activePointer\.current != null \|\| placementFrame\.current != null/);
});

test("form sliders size their fill from the rendered Liquid Glass thumb", () => {
  assert.match(slideControl, /const thumbWidth = thumbRef\.current\?\.getBoundingClientRect\(\)\.width/);
  assert.match(slideControl, /next \+ metrics\.thumbRect\.width/);
  assert.match(styles, /--slide-thumb-size: 50px/);
  assert.match(styles, /--slide-thumb-size: 46px/);
  assert.doesNotMatch(styles, /\.form-pickup-plus span \{/);
});

test("every manager archive category remounts its panel animation", () => {
  assert.match(worldHome, /key="managers" className="manager-archive-panel is-managers"/);
  assert.match(worldHome, /key="unmanaged" className="manager-archive-panel is-unmanaged"/);
  assert.match(worldHome, /key="other" className="manager-archive-panel is-other"/);
});
