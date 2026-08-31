import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";

const worldHome = readFileSync(
  new URL("../src/components/world/world-home.tsx", import.meta.url),
  "utf8",
);
const loadGate = readFileSync(new URL("../src/components/load-gate.tsx", import.meta.url), "utf8");
const router = readFileSync(new URL("../src/router.tsx", import.meta.url), "utf8");
const riderPage = readFileSync(
  new URL("../src/components/world/rider-page.tsx", import.meta.url),
  "utf8",
);
const worldChrome = readFileSync(
  new URL("../src/components/world/world-chrome.tsx", import.meta.url),
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
    statSync(new URL("../public/rider-cipher-thumbnail-20260825.jpeg", import.meta.url)).size >
      100_000,
  );
});

test("detail routes use per-location restoration without overwriting the world scroll", () => {
  assert.match(router, /scrollRestoration:\s*true/);
  assert.match(loadGate, /useLayoutEffect\(\(\) => \{[\s\S]*?resetDetailScroll/);
  assert.match(loadGate, /const pathnameChanged = previousPathname\.current !== pathname/);
  assert.match(loadGate, /const isDossierSectionHash = \/\^#\?character-section-\//);
  assert.match(
    loadGate,
    /DETAIL_ROUTE\.test\(pathname\) && pathnameChanged && !isDossierSectionHash/,
  );
  assert.match(loadGate, /router snapshots the outgoing world's position/);
  assert.match(loadGate, /holdRouteScrollMotion/);
  assert.match(loadGate, /dataset\.routeScrollSettling = "true"/);
  assert.match(loadGate, /\[90, 240, 480, 900, 1500\]/);
  assert.match(loadGate, /document\.addEventListener\("wheel", noteInteraction/);
  assert.match(loadGate, /document\.addEventListener\("touchmove", noteInteraction/);
  assert.equal(
    (loadGate.match(/document\.addEventListener\("pointerdown", noteInteraction, true\)/g) ?? [])
      .length,
    2,
  );
  assert.match(loadGate, /Promise\.race\(\[wait\(duration\), userScrollIntent\]\)/);
  assert.match(loadGate, /if \(!\(await waitUntilNextAlignment\(90\)\)\) return/);
  assert.doesNotMatch(loadGate, /document\.addEventListener\("touchstart", noteInteraction/);
  assert.match(
    loadGate,
    /window\.visualViewport\?\.addEventListener\("resize", alignAfterViewportChange\)/,
  );
  assert.match(loadGate, /window\.setTimeout\(stopResetting, 1800\)/);
  assert.match(loadGate, /pathname === "\/world" && \(!locationHash \|\| locationHash === "top"\)/);
  assert.doesNotMatch(loadGate, /attributeFilter: \["data-loading"\]/);
  assert.doesNotMatch(loadGate, /document\.scrollingElement\?\.scrollTo/);
  assert.match(
    transitionStyles,
    /html\[data-route-scroll-settling="true"\]\s*\{[\s\S]*?scroll-behavior:\s*auto\s*!important/,
  );
  assert.doesNotMatch(loadGate, /resetDossierScroll/);
});

test("all rider dossiers return deeper without a doubled fixed-header inset", () => {
  assert.match(riderPage, /<DossierTopbar[\s\S]*?returnHash="riders-return"/);
  assert.equal((worldChrome.match(/hash=\{returnHash\}/g) ?? []).length, 2);
  assert.match(worldHome, /id="riders-return" className="riders-return-anchor"/);
  assert.match(worldPolishStyles, /#riders-return[\s\S]*?top:\s*clamp\(64px, 6vw, 88px\)/);
  assert.match(worldPolishStyles, /#riders-return[\s\S]*?scroll-margin-top:\s*0/);
});

test("the rider selected before opening a dossier is restored once on return", () => {
  assert.match(riderPage, /rememberRiderReturn\(rider\.id\)/);
  assert.match(worldHome, /const returnId = readRiderReturn\(\)/);
  assert.match(worldHome, /RIDERS\.findIndex\(\(rider\) => rider\.id === returnId\)/);
  assert.match(worldHome, /const \[initialRiderTab, setInitialRiderTab\] = useState\(0\)/);
  assert.match(
    worldHome,
    /useLayoutEffect\(\(\) => \{[\s\S]*?setInitialRiderTab\(returnIndex\)[\s\S]*?setRiderTab\(returnIndex\)/,
  );
  assert.match(worldHome, /const \[riderTab, setRiderTab\] = useState\(0\)/);
  assert.match(worldHome, /useRef\(riderTab\)/);
  assert.match(worldHome, /<RiderRail ref=\{riderRail\} initialIndex=\{initialRiderTab\} \/>/);
  assert.match(worldHome, /aria-selected=\{i === initialIndex\}/);
  assert.match(riderReturnState, /sessionStorage\.setItem\(RIDER_RETURN_KEY, id\)/);
  assert.match(worldHome, /useEffect\(\(\) => \{\s*clearRiderReturn\(\);\s*\}, \[\]\)/);
  assert.match(riderReturnState, /sessionStorage\.removeItem\(RIDER_RETURN_KEY\)/);
});

test("the compact mobile return control keeps an accessible name", () => {
  assert.match(riderPage, /returnLabel="ライダー一覧へ戻る"/);
  assert.match(worldChrome, /className="manager-back"[\s\S]*?aria-label=\{returnAriaLabel\}/);
  assert.match(
    riderPage,
    /loading="eager"[\s\S]{0,100}?decoding="async"[\s\S]{0,100}?fetchPriority="high"/,
  );
});

test("Zeus ignores iOS rubber-band offsets and coalesces viewport placement", () => {
  assert.match(zeusButton, /const clampOffset =/);
  assert.match(zeusButton, /offsetTop: clampOffset\(viewport\?\.offsetTop \?\? 0, maxOffsetTop\)/);
  assert.match(zeusButton, /const placementFrame = useRef/);
  assert.match(zeusButton, /const placementTimer = useRef/);
  assert.match(zeusButton, /activePointer\.current != null \|\| placementFrame\.current != null/);
  assert.match(
    zeusButton,
    /window\.setTimeout\(\(\) => \{[\s\S]*?schedulePlacement\(\);[\s\S]*?\}, 72\)/,
  );
});

test("form sliders size their fill from the rendered Liquid Glass thumb", () => {
  assert.match(
    slideControl,
    /const thumbWidth = thumbRef\.current\?\.getBoundingClientRect\(\)\.width/,
  );
  assert.match(slideControl, /next \+ metrics\.thumbRect\.width/);
  assert.match(styles, /--slide-thumb-size: 50px/);
  assert.match(styles, /--slide-thumb-size: 46px/);
  assert.match(
    styles,
    /\.ios-slide-open \.ios-slide-open-thumb \{[\s\S]*?top: 3px;[\s\S]*?bottom: 3px;[\s\S]*?height: auto/,
  );
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
  assert.match(slideControl, /const isThumbTap =/);
  assert.match(slideControl, /if \(isThumbTap\) \{[\s\S]*?complete\("pointer"\)/);
  assert.match(slideControl, /プラスをタップ、または長押ししてから右へスライドして開きます/);
});

test("mobile slide controls activate quickly and open before the midpoint", () => {
  assert.match(slideControl, /const OPEN_THRESHOLD = 0\.4/);
  assert.match(slideControl, /const POINTER_INTENT_THRESHOLD = 10/);
  assert.match(slideControl, /const TAP_TOLERANCE = 12/);
  assert.match(slideControl, /const HOLD_MOVE_TOLERANCE = 28/);
  assert.match(slideControl, /const HOLD_ACTIVATION_MS = 60/);
  assert.match(slideControl, /const COMPLETE_ANIMATION_MS = 260/);
  assert.match(slideControl, /const HORIZONTAL_INTENT_RATIO = 1\.08/);
  assert.match(slideControl, /const COARSE_HIT_PADDING = 36/);
  assert.match(slideControl, /button\.dataset\.holding = "true"/);
  assert.match(slideControl, /holdTimer\.current = window\.setTimeout/);
  assert.match(slideControl, /moveToPointer\(latestPointer\.current\.x\)/);
  assert.match(slideControl, /verticalDistance >= POINTER_INTENT_THRESHOLD/);
  assert.match(slideControl, /pointerIntent\.current = "horizontal"/);
  assert.match(slideControl, /<small>HOLD \+ SLIDE<\/small>/);
  assert.match(styles, /\.ios-slide-open\[data-holding="true"\]/);
  assert.match(
    slideControl,
    /if \(ratio >= OPEN_THRESHOLD \|\| isThumbTap\) complete\("pointer"\)/,
  );
});

test("slide controls spring in response to drag speed and completion", () => {
  assert.match(slideControl, /const velocity = \(next - previous\.offset\) \/ elapsed/);
  assert.match(slideControl, /const energy = Math\.min\(1, Math\.abs\(velocity\) \/ 1\.25\)/);
  assert.match(slideControl, /--slide-thumb-scale-x/);
  assert.match(slideControl, /--slide-thumb-scale-y/);
  assert.match(slideControl, /--slide-thumb-tilt/);
  assert.match(styles, /cubic-bezier\(0\.18, 1\.42, 0\.32, 1\)/);
  assert.match(styles, /animation: iosSlideThumbDock 0\.26s/);
  assert.doesNotMatch(
    styles,
    /\.ios-slide-open\[data-dragging="true"\][\s\S]{0,180}\.ios-slide-open\[data-completing="true"\][^{]*\{[^}]*animation:\s*iosSlideThumbDock/s,
  );
  assert.match(
    styles,
    /\.ios-slide-open\[data-completing="true"\] \.ios-slide-open-thumb\s*\{[^}]*animation:\s*iosSlideThumbDock/s,
  );
  assert.match(styles, /@keyframes iosSlideThumbDock/);
  assert.match(styles, /@keyframes iosSlideFillDock/);
  assert.match(reconstructedStyles, /--slide-thumb-scale-x/);
  assert.match(reconstructedStyles, /@keyframes iosSlideThumbDock/);
  assert.match(
    styles,
    /prefers-reduced-motion:[\s\S]*?iosSlideThumbDock|prefers-reduced-motion:[\s\S]*?animation: none !important/,
  );
});

test("every manager archive category remounts its panel animation", () => {
  assert.match(
    worldHome,
    /key="managers"[\s\S]{0,120}?className="manager-archive-panel is-managers"/,
  );
  assert.match(
    worldHome,
    /key="unmanaged"[\s\S]{0,120}?className="manager-archive-panel is-unmanaged"/,
  );
  assert.match(worldHome, /key="other"[\s\S]{0,120}?className="manager-archive-panel is-other"/);
});
