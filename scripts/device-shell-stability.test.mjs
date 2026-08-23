import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const transitionStyles = readFileSync(
  new URL("../src/styles-route-transitions.css", import.meta.url),
  "utf8",
);
const worldStyles = readFileSync(new URL("../src/styles-world/18.css", import.meta.url), "utf8");
const panelStyles = readFileSync(new URL("../src/styles-world/19.css", import.meta.url), "utf8");
const announcementStyles = readFileSync(
  new URL("../src/styles-world/23.css", import.meta.url),
  "utf8",
);
const zeusButton = readFileSync(
  new URL("../src/components/zeus-button.tsx", import.meta.url),
  "utf8",
);
const slideControl = readFileSync(
  new URL("../src/components/world/slide-open-control.tsx", import.meta.url),
  "utf8",
);
const chrome = readFileSync(
  new URL("../src/components/world/world-chrome.tsx", import.meta.url),
  "utf8",
);
const worldHome = readFileSync(
  new URL("../src/components/world/world-home.tsx", import.meta.url),
  "utf8",
);
const liquid = readFileSync(new URL("../src/lib/liquid/boot.js", import.meta.url), "utf8");
const manager = readFileSync(
  new URL("../src/components/world/manager-stub.tsx", import.meta.url),
  "utf8",
);
const formArchive = readFileSync(
  new URL("../src/routes/form-archive.tsx", import.meta.url),
  "utf8",
);

test("the React side menu owns its state without a second vanilla controller", () => {
  assert.match(chrome, /data-react-controlled=\{controlled \? "true" : undefined\}/);
  assert.match(worldHome, /const \[sideMenuOpen, setSideMenuOpen\] = useState\(false\)/);
  assert.match(liquid, /panel\.dataset\.reactControlled === 'true'/);
  assert.match(chrome, /href="#story" onClick=\{controlled \? close : undefined\}/);
});

test("Liquid rails release global gesture locks when their route unmounts", () => {
  assert.match(liquid, /const dispose = \(\) => \{/);
  assert.match(liquid, /resizeObserver\.disconnect\(\)/);
  assert.match(liquid, /window\.removeEventListener\('pointerup', finish, true\)/);
  assert.match(
    liquid,
    /document\.removeEventListener\('visibilitychange', handleVisibilityChange\)/,
  );
  assert.match(liquid, /root\.__liquidDispose = dispose/);
});

test("the archive rail stays bound while iframe readiness changes", () => {
  assert.match(formArchive, /const selectArchiveRef = useRef/);
  assert.match(formArchive, /selectArchiveRef\.current = selectArchive/);
  assert.match(formArchive, /selectArchiveRef\.current\(index === 1 \? "realm" : "saga"\)/);
  assert.match(
    formArchive,
    /switcher\.addEventListener\("railselect", handleRailSelect\);[\s\S]*?\}, \[\]\);/,
  );
  assert.match(formArchive, /inert=\{!loaded \? true : undefined\}/);
  assert.match(
    transitionStyles,
    /\.form-archive-toolbar \.form-archive-switcher\[aria-busy="true"\][\s\S]*?pointer-events: none/,
  );
});

test("coarse-pointer controls preserve vertical scrolling and recover failed capture", () => {
  assert.match(styles, /\.zeus-button \{[\s\S]*?touch-action: pan-y pinch-zoom/);
  assert.match(zeusButton, /window\.visualViewport\?\.addEventListener\("resize", onResize/);
  assert.match(zeusButton, /--zeus-safe-top/);
  assert.match(zeusButton, /window\.addEventListener\("pointercancel", cancelDanglingPointer\)/);
  assert.match(slideControl, /window\.addEventListener\("pointercancel", cancelDanglingDrag\)/);
});

test("notched compact detail pages share one safe fixed-header measurement", () => {
  assert.match(
    worldStyles,
    /--detail-header-height: max\(68px, calc\(58px \+ env\(safe-area-inset-top/,
  );
  assert.match(
    worldStyles,
    /\.manager-hero,[\s\S]*?padding-top: calc\(var\(--detail-header-height\) \+ 22px\)/,
  );
  assert.match(panelStyles, /\.side-panel \{[\s\S]*?inset-block: 0;[\s\S]*?min-height: 100dvh/);
});

test("the side-menu announcement and Zeus detail image are deployment-stable", () => {
  assert.match(chrome, /お知らせ/);
  assert.match(chrome, /Who Supreme\?/);
  assert.match(chrome, /announcement-who-supreme\.jpeg/);
  assert.match(announcementStyles, /@supports not \(\(-webkit-backdrop-filter/);
  assert.match(manager, /manager-zeus-detail\.jpeg\?v=20260823-2/);
});
