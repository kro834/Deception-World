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
const router = readFileSync(new URL("../src/router.tsx", import.meta.url), "utf8");
const riderPage = readFileSync(
  new URL("../src/components/world/rider-page.tsx", import.meta.url),
  "utf8",
);
const transitionStyles = readFileSync(
  new URL("../src/styles-route-transitions.css", import.meta.url),
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
const worldPolishStyles = readFileSync(
  new URL("../src/styles-world/21.css", import.meta.url),
  "utf8",
);
const riderReturnState = readFileSync(
  new URL("../src/components/world/rider-return-state.ts", import.meta.url),
  "utf8",
);
const reconstructedStyles = readFileSync(
  new URL("../source-parts/src/styles-world-addon.css/02.part", import.meta.url),
  "utf8",
);

test("Cipher uses the supplied dedicated thumbnail without replacing its dossier art", () => {
  assert.match(worldHome, /id: "cipher"[\s\S]*?img: "\/rider-cipher-thumbnail-20260825\.jpeg"/);
  assert.ok(
    statSync(new URL("../public/rider-cipher-thumbnail-20260825.jpeg", import.meta.url)).size > 100_000,
  );
});

test("detail routes use per-location restoration without overwriting the world scroll", () => {
  assert.match(router, /scrollRestoration:\s*true/);
  assert.match(loadGate, /useLayoutEffect\(\(\) => \{[\s\S]*?resetDetailScroll/);
  assert.match(loadGate, /router snapshots the outgoing world's position/);
  assert.match(loadGate, /holdRouteScrollMotion/);
  assert.match(loadGate, /dataset\.routeScrollSettling = "true"/);
  assert.match(loadGate, /\[90, 240\]/);
  assert.match(loadGate, /await wait\(90\);[\s\S]*?await wait\(150\)/);
  assert.match(loadGate, /document\.addEventListener\("wheel", noteInteraction/);
  assert.doesNotMatch(loadGate, /attributeFilter: \["data-loading"\]/);
  assert.doesNotMatch(loadGate, /document\.scrollingElement\?\.scrollTo/);
  assert.match(
    transitionStyles,
    /html\[data-route-scroll-settling="true"\]\s*\{[\s\S]*?scroll-behavior:\s*auto\s*!important/,
  );
  assert.doesNotMatch(loadGate, /resetDossierScroll/);
});

test("all rider dossiers return deeper without a doubled fixed-header inset", () => {
  assert.equal((riderPage.match(/hash="riders-return"/g) ?? []).length, 2);
  assert.equal((riderPage.match(/<GuardedLink/g) ?? []).length >= 2, true);
  assert.match(worldHome, /id="riders-return" className="riders-return-anchor"/);
  assert.match(worldPolishStyles, /#riders-return[\s\S]*?top:\s*clamp\(64px, 6vw, 88px\)/);
  assert.match(worldPolishStyles, /#riders-return[\s\S]*?scroll-margin-top:\s*0/);
});

test("the rider selected before opening a dossier is restored once on return", () => {
  assert.match(riderPage, /rememberRiderReturn\(rider\.id\)/);
  assert.match(worldHome, /const returnId = readRiderReturn\(\)/);
  assert.match(worldHome, /RIDERS\.findIndex\(\(rider\) => rider\.id === returnId\)/);
  assert.match(worldHome, /useState\(initialRiderTab\)/);
  assert.match(worldHome, /useRef\(riderTab\)/);
  assert.match(worldHome, /<RiderRail ref=\{riderRail\} initialIndex=\{initialRiderTab\} \/>/);
  assert.match(worldHome, /aria-selected=\{i === initialIndex\}/);
  assert.match(riderReturnState, /sessionStorage\.setItem\(RIDER_RETURN_KEY, id\)/);
  assert.match(worldHome, /useEffect\(\(\) => \{\s*clearRiderReturn\(\);\s*\}, \[\]\)/);
  assert.match(riderReturnState, /sessionStorage\.removeItem\(RIDER_RETURN_KEY\)/);
});

test("the compact mobile return control keeps an accessible name", () => {
  assert.match(riderPage, /className="manager-back" aria-label="ライダー一覧へ戻る"/);
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
  assert.match(styles, /\.ios-slide-open \.ios-slide-open-thumb \{[\s\S]*?top: 3px;[\s\S]*?bottom: 3px;[\s\S]*?height: auto/);
  assert.match(styles, /translate3d\(var\(--slide-offset, 0px\), 0, 0\)/);
  assert.doesNotMatch(styles, /\.form-pickup-plus\.ios-slide-open \{[^}]*contain:/s);
  assert.doesNotMatch(styles, /translate3d\(var\(--slide-offset[^)]*\), -50%/);
  assert.match(slideControl, /top: "3px"[\s\S]*?bottom: "3px"[\s\S]*?height: "auto"/);
  assert.match(slideControl, /transform: "translate3d\(var\(--slide-offset, 0px\), 0, 0\)"/);
  assert.match(reconstructedStyles, /top: 3px;[\s\S]*?bottom: 3px;[\s\S]*?height: auto/);
  assert.match(reconstructedStyles, /translate3d\(var\(--slide-offset, 0px\), 0, 0\)/);
  assert.doesNotMatch(reconstructedStyles, /\.form-pickup-plus\.ios-slide-open \{[^}]*contain:/s);
  assert.doesNotMatch(reconstructedStyles, /translate3d\(var\(--slide-offset[^)]*\), -50%/);
  assert.doesNotMatch(styles, /\.form-pickup-plus span \{/);
});

test("every manager archive category remounts its panel animation", () => {
  assert.match(worldHome, /key="managers" className="manager-archive-panel is-managers"/);
  assert.match(worldHome, /key="unmanaged" className="manager-archive-panel is-unmanaged"/);
  assert.match(worldHome, /key="other" className="manager-archive-panel is-other"/);
});
